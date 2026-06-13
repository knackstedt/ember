import { spawn, ChildProcess } from "child_process";
import { WebGLVideoRenderer } from "./webgl-renderer";

export interface VideoMetadata {
  width: number;
  height: number;
  durationMs: number;
  frameRate: number;
  codecName: string;
}

interface FfmpegDecoderState {
  process: ChildProcess | null;
  metadata: VideoMetadata | null;
  path: string | null;
  canvasId: string | null;
  renderer: WebGLVideoRenderer | null;
  frameChunks: Buffer[];
  frameBufferTotal: number;
  currentTimeMs: number;
  paused: boolean;
  playing: boolean;
  pumpHandle: number | null;
  lastFrameTime: number;
  renderedCount: number;
}

const decoders = new Map<string, FfmpegDecoderState>();

function getState(id: string): FfmpegDecoderState {
  let state = decoders.get(id);
  if (!state) {
    state = {
      process: null,
      metadata: null,
      path: null,
      canvasId: null,
      renderer: null,
      frameChunks: [],
      frameBufferTotal: 0,
      currentTimeMs: 0,
      paused: false,
      playing: false,
      pumpHandle: null,
      lastFrameTime: 0,
      renderedCount: 0,
    };
    decoders.set(id, state);
  }
  return state;
}

function killFfmpeg(state: FfmpegDecoderState) {
  if (state.process) {
    try {
      state.process.kill("SIGKILL");
    } catch { /* ignore */ }
    state.process = null;
  }
  if (state.pumpHandle !== null) {
    cancelAnimationFrame(state.pumpHandle);
    state.pumpHandle = null;
  }
  state.playing = false;
  state.frameChunks = [];
  state.frameBufferTotal = 0;
}

function getNvdecDecoder(codecName: string): string | null {
  const lower = codecName.toLowerCase();
  if (lower === "hevc" || lower === "h265") return "hevc_cuvid";
  if (lower === "h264" || lower === "avc") return "h264_cuvid";
  if (lower === "av1") return "av1_cuvid";
  if (lower === "vp9") return "vp9_cuvid";
  if (lower === "mpeg2") return "mpeg2_cuvid";
  if (lower === "mpeg4") return "mpeg4_cuvid";
  if (lower === "vc1") return "vc1_cuvid";
  return null;
}

async function ffprobe(path: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const probe = spawn("ffprobe", [
      "-v", "error",
      "-probesize", "32",
      "-analyzeduration", "0",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,r_frame_rate,duration,codec_name",
      "-of", "json",
      path,
    ]);

    let stdout = "";
    let stderr = "";
    probe.stdout.on("data", (d) => { stdout += d; });
    probe.stderr.on("data", (d) => { stderr += d; });
    probe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}: ${stderr}`));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        const stream = data.streams?.[0];
        if (!stream) {
          reject(new Error("ffprobe: no video stream"));
          return;
        }
        const fpsParts = (stream.r_frame_rate || "30/1").split("/");
        const fps = parseInt(fpsParts[0], 10) / parseInt(fpsParts[1] || "1", 10);
        resolve({
          width: stream.width || 1920,
          height: stream.height || 1080,
          durationMs: Math.round((parseFloat(stream.duration) || 0) * 1000),
          frameRate: fps || 30,
          codecName: stream.codec_name || "unknown",
        });
      } catch (e) {
        reject(new Error(`ffprobe parse error: ${e}`));
      }
    });
  });
}

/** Cap output resolution to avoid huge RGBA frames over the pipe. */
function computeOutputSize(metaWidth: number, metaHeight: number): { w: number; h: number } {
  const MAX_W = 1920;
  if (metaWidth <= MAX_W) return { w: metaWidth, h: metaHeight };
  const scale = MAX_W / metaWidth;
  return { w: MAX_W, h: Math.round(metaHeight * scale) };
}

function startFfmpeg(id: string, path: string, seekMs: number = 0) {
  const state = getState(id);
  const meta = state.metadata;
  if (!meta) return;

  killFfmpeg(state);

  const out = computeOutputSize(meta.width, meta.height);

  const args = [
    "-hide_banner",
    "-loglevel", "error",
  ];

  const nvdec = getNvdecDecoder(meta.codecName);
  if (nvdec) {
    args.push("-hwaccel", "cuda", "-c:v", nvdec);
  } else {
    args.push("-threads", "4");
  }

  if (seekMs > 0) {
    args.push("-ss", `${seekMs / 1000}`);
  }

  // HDR tone-mapping: PQ BT.2020 → gamma BT.709 so colors look correct on SDR.
  const isHdr = meta.codecName === "hevc" && (meta.width >= 1920 || meta.height >= 1080);
  const colorspace = isHdr
    ? `zscale=t=linear,tonemap=hable,zscale=t=bt709:m=bt709,scale=${out.w}:${out.h}:flags=fast_bilinear,format=pix_fmts=rgba`
    : `scale=${out.w}:${out.h}:flags=fast_bilinear,format=pix_fmts=rgba`;

  args.push(
    "-i", path,
    "-vf", colorspace,
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-an", "-sn", "-dn",
    "-vsync", "cfr",
    "-r", `${meta.frameRate}`,
    "pipe:1"
  );

  const proc = spawn("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  state.process = proc;
  state.playing = true;
  state.paused = false;

  proc.stderr.on("data", (d: Buffer) => {
    const msg = d.toString("utf8").trim();
    if (msg) console.error("[ffmpeg-decoder] stderr:", msg);
  });

  proc.stdout.on("data", (chunk: Buffer) => {
    if (state.paused) return;
    state.frameChunks.push(chunk);
    state.frameBufferTotal += chunk.length;
    // Do NOT pump here — let the timer in useNativeVideo pace playback.
  });

  proc.stdout.on("end", () => {
    state.playing = false;
  });

  proc.on("error", (err) => {
    console.error("[ffmpeg-decoder] process error:", err);
    state.playing = false;
  });

  proc.on("close", (code) => {
    if (code !== 0 && code !== null && code !== -9) {
      console.error(`[ffmpeg-decoder] exited with code ${code}`);
    }
    state.playing = false;
  });
}

function pumpFrames(id: string) {
  const state = getState(id);
  if (!state.renderer || !state.metadata) return;

  const out = computeOutputSize(state.metadata.width, state.metadata.height);
  const frameSize = out.w * out.h * 4;
  if (frameSize <= 0) return;

  // Render at most ONE frame per pump call so playback is paced by
  // the caller (setTimeout at frame-rate intervals).
  if (state.frameBufferTotal < frameSize) return;

  const needed = frameSize;
  let gathered = 0;
  const usedChunks: Buffer[] = [];
  const keepChunks: Buffer[] = [];
  let keepTotal = 0;

  for (const chunk of state.frameChunks) {
    if (gathered < needed) {
      const take = Math.min(chunk.length, needed - gathered);
      usedChunks.push(chunk.subarray(0, take));
      gathered += take;
      if (take < chunk.length) {
        const remainder = chunk.subarray(take);
        keepChunks.push(remainder);
        keepTotal += remainder.length;
      }
    } else {
      keepChunks.push(chunk);
      keepTotal += chunk.length;
    }
  }

  const frameData = Buffer.concat(usedChunks);
  state.renderer.render(
    new Uint8Array(frameData.buffer, frameData.byteOffset, frameData.byteLength),
    out.w,
    out.h
  );
  state.frameChunks = keepChunks;
  state.frameBufferTotal = keepTotal;
  state.lastFrameTime = performance.now();
}

export const ffmpegVideoDecoder = {
  create(id: string) {
    getState(id);
  },

  async open(id: string, path: string): Promise<VideoMetadata> {
    const meta = await ffprobe(path);
    const state = getState(id);
    state.metadata = meta;
    state.path = path;
    return meta;
  },

  attachCanvas(id: string, canvasId: string) {
    const state = getState(id);
    let canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) {
      for (let i = 0; i < 20; i++) {
        canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
        if (canvas) break;
        const start = Date.now();
        while (Date.now() - start < 5) { /* spin */ }
      }
    }
    if (!canvas) throw new Error(`Canvas #${canvasId} not found`);
    state.canvasId = canvasId;
    state.renderer = new WebGLVideoRenderer(canvas);
    return true;
  },

  resizeCanvas(id: string, width: number, height: number) {
    const state = getState(id);
    if (state.renderer) state.renderer.resize(width, height);
  },

  play(id: string, path: string) {
    const state = getState(id);
    if (!state.metadata) return;
    startFfmpeg(id, path, state.currentTimeMs);
  },

  renderNextFrame(id: string): { width: number; height: number } | null {
    const state = getState(id);
    if (!state.metadata || !state.renderer) return null;
    if (!state.process && state.path && !state.paused) {
      startFfmpeg(id, state.path, state.currentTimeMs);
    }
    pumpFrames(id);
    return state.playing ? { width: state.metadata.width, height: state.metadata.height } : null;
  },

  seek(id: string, _path: string, timestampMs: number) {
    const state = getState(id);
    state.currentTimeMs = timestampMs;
    if (state.process && state.path) {
      startFfmpeg(id, state.path, timestampMs);
    }
  },

  pause(id: string) {
    const state = getState(id);
    state.paused = true;
  },

  resume(id: string) {
    const state = getState(id);
    state.paused = false;
    if (!state.process && state.path && state.metadata) {
      startFfmpeg(id, state.path, state.currentTimeMs);
    }
  },

  getMetadata(id: string): VideoMetadata | null {
    return getState(id).metadata;
  },

  destroy(id: string) {
    const state = getState(id);
    killFfmpeg(state);
    if (state.renderer) {
      state.renderer.destroy();
      state.renderer = null;
    }
    decoders.delete(id);
  },
};
