import { spawn, ChildProcess } from "child_process";
import { WebGLVideoRenderer, computeRenderSize } from "./webgl-renderer";

export interface VideoMetadata {
  width: number;
  height: number;
  durationMs: number;
  frameRate: number;
  codecName: string;
  colorSpace?: string;
  colorTransfer?: string;
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
  /** Incremented on every startFfmpeg; stdout handler ignores stale process data. */
  procGeneration: number;
  /** True while startFfmpeg is running; prevents re-entrant spawns. */
  starting: boolean;
  // Audio
  audioChunks: Buffer[];
  audioBufferTotal: number;
  audioCtx: AudioContext | null;
  audioNode: ScriptProcessorNode | null;
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
      procGeneration: 0,
      starting: false,
      audioChunks: [],
      audioBufferTotal: 0,
      audioCtx: null,
      audioNode: null,
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
  state.playing = false;
  state.frameChunks = [];
  state.frameBufferTotal = 0;
  state.audioChunks = [];
  state.audioBufferTotal = 0;
  // Do NOT reset procGeneration here — it must stay monotonic
  // so stale process data handlers from a killed process are ignored.
  state.starting = false;
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
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,r_frame_rate,duration,codec_name,color_space,color_transfer",
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
          colorSpace: stream.color_space,
          colorTransfer: stream.color_transfer,
        });
      } catch (e) {
        reject(new Error(`ffprobe parse error: ${e}`));
      }
    });
  });
}

/** Cap output resolution to avoid huge RGBA frames over the pipe.
 *  Round to even dimensions because CUDA/NVENC filters require chroma-aligned sizes.
 */
function computeOutputSize(metaWidth: number, metaHeight: number): { w: number; h: number } {
  const MAX_W = 1920;
  let w: number;
  let h: number;
  if (metaWidth <= MAX_W) {
    w = metaWidth;
    h = metaHeight;
  } else {
    const scale = MAX_W / metaWidth;
    w = MAX_W;
    h = Math.round(metaHeight * scale);
  }
  // scale_cuda and other HW filters require even width/height.
  return { w: Math.floor(w / 2) * 2, h: Math.floor(h / 2) * 2 };
}

/** Create/resume the Web Audio context and ScriptProcessorNode. */
function ensureAudioPlayback(state: FfmpegDecoderState) {
  if (!state.audioCtx) {
    const ctx = new AudioContext({ sampleRate: 48000 });
    state.audioCtx = ctx;
    const node = ctx.createScriptProcessor(4096, 0, 2);
    node.onaudioprocess = (e) => {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const samplesNeeded = outL.length;
      const bytesNeeded = samplesNeeded * 4; // 2 channels x 2 bytes (s16le)

      const pcm: Buffer[] = [];
      let gathered = 0;
      const keep: Buffer[] = [];
      let keepTotal = 0;
      for (const chunk of state.audioChunks) {
        if (gathered < bytesNeeded) {
          const take = Math.min(chunk.length, bytesNeeded - gathered);
          pcm.push(chunk.subarray(0, take));
          gathered += take;
          if (take < chunk.length) {
            const remainder = chunk.subarray(take);
            keep.push(remainder);
            keepTotal += remainder.length;
          }
        } else {
          keep.push(chunk);
          keepTotal += chunk.length;
        }
      }
      state.audioChunks = keep;
      state.audioBufferTotal = keepTotal;

      const pcmBuf = Buffer.concat(pcm);
      const view = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, pcmBuf.byteLength / 2);
      const sampleCount = Math.min(samplesNeeded, view.length / 2);
      for (let i = 0; i < sampleCount; i++) {
        outL[i] = view[i * 2] / 32768;
        outR[i] = view[i * 2 + 1] / 32768;
      }
      for (let i = sampleCount; i < samplesNeeded; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
    };
    node.connect(ctx.destination);
    state.audioNode = node;
  }
  if (state.audioCtx.state === "suspended") {
    state.audioCtx.resume().catch(() => {});
  }
}

function startFfmpeg(id: string, path: string, seekMs: number = 0) {
  const state = getState(id);
  const meta = state.metadata;
  if (!meta) return;

  killFfmpeg(state);
  state.starting = true;
  state.procGeneration++;
  const myGeneration = state.procGeneration;

  const out = computeOutputSize(meta.width, meta.height);
  const frameSize = out.w * out.h * 4;
  const MAX_BUFFER_FRAMES = 8;
  const MAX_BUFFER_BYTES = frameSize * MAX_BUFFER_FRAMES;
  const MAX_AUDIO_BYTES = 48000 * 2 * 2 * 4; // ~4 seconds of stereo s16le

  const args: string[] = [
    "-hide_banner",
    "-loglevel", "error",
  ];

  const nvdec = getNvdecDecoder(meta.codecName);
  if (nvdec) {
    // Keep frames in GPU memory so scale_cuda can resize and download directly.
    args.push("-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-c:v", nvdec);
  } else {
    args.push("-threads", "4");
  }

  if (seekMs > 0) {
    args.push("-ss", `${seekMs / 1000}`);
  }
  // Pace input reading at native frame rate so output arrives ~1x real-time.
  args.push("-re");

  // HDR tone-mapping: PQ BT.2020 -> gamma BT.709 so colors look correct on SDR.
  const isHdr = meta.colorTransfer === "smpte2084" || meta.colorTransfer === "arib-std-b67";
  let videoFilter: string;
  if (nvdec) {
    if (isHdr) {
      // Decode + scale to 10-bit on GPU, download, then tonemap and convert to RGBA.
      videoFilter = `scale_cuda=${out.w}:${out.h}:format=p010,hwdownload,format=p010,tonemap=hable,format=rgba`;
    } else {
      // Decode + scale to NV12 on GPU, download, then convert to RGBA.
      videoFilter = `scale_cuda=${out.w}:${out.h}:format=nv12,hwdownload,format=nv12,format=rgba`;
    }
  } else {
    videoFilter = isHdr
      ? `scale=${out.w}:${out.h}:flags=fast_bilinear,format=p010,tonemap=hable,format=rgba`
      : `scale=${out.w}:${out.h}:flags=fast_bilinear,format=pix_fmts=rgba`;
  }

  args.push(
    "-i", path,
    "-map", "0:v",
    "-vf", videoFilter,
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-vsync", "cfr",
    "-r", `${meta.frameRate}`,
    "pipe:1",
    "-map", "0:a",
    "-vn",
    "-f", "s16le",
    "-ac", "2",
    "-ar", "48000",
    "pipe:3"
  );

  const proc = spawn("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe", "pipe"],
  });

  state.process = proc;
  state.starting = false;
  state.playing = true;
  state.paused = false;

  ensureAudioPlayback(state);

  proc.stderr!.on("data", (d: Buffer) => {
    const msg = d.toString("utf8").trim();
    if (msg) console.error("[ffmpeg-decoder] stderr:", msg);
  });

  // Video pipe (fd 1 -> proc.stdout)
  proc.stdout!.on("data", (chunk: Buffer) => {
    if (state.procGeneration !== myGeneration) return;
    if (state.paused) return;
    state.frameChunks.push(chunk);
    state.frameBufferTotal += chunk.length;
    if (state.frameBufferTotal > MAX_BUFFER_BYTES) {
      const excessBytes = state.frameBufferTotal - MAX_BUFFER_BYTES;
      const framesToDrop = Math.ceil(excessBytes / frameSize);
      let bytesToDrop = framesToDrop * frameSize;
      const newChunks: Buffer[] = [];
      for (const c of state.frameChunks) {
        if (bytesToDrop > 0) {
          if (c.length <= bytesToDrop) {
            bytesToDrop -= c.length;
          } else {
            newChunks.push(c.subarray(bytesToDrop));
            bytesToDrop = 0;
          }
        } else {
          newChunks.push(c);
        }
      }
      state.frameChunks = newChunks;
      state.frameBufferTotal = newChunks.reduce((sum, c) => sum + c.length, 0);
    }
    // Do NOT render here — RAF in useNativeVideo is the sole renderer.
    // This avoids jitter from irregular OS pipe chunk delivery timing.
  });

  proc.stdout!.on("end", () => {
    if (state.process === proc) state.playing = false;
  });

  // Audio pipe (fd 3 -> proc.stdio[3])
  const audioStream = proc.stdio[3] as NodeJS.ReadableStream;
  audioStream.on("data", (chunk: Buffer) => {
    if (state.procGeneration !== myGeneration) return;
    state.audioChunks.push(chunk);
    state.audioBufferTotal += chunk.length;
    while (state.audioBufferTotal > MAX_AUDIO_BYTES && state.audioChunks.length > 0) {
      const dropped = state.audioChunks.shift()!;
      state.audioBufferTotal -= dropped.length;
    }
  });

  proc.on("error", (err) => {
    console.error("[ffmpeg-decoder] process error:", err);
    if (state.process === proc) state.playing = false;
  });

  proc.on("close", (code) => {
    if (code !== 0 && code !== null && code !== -9) {
      console.error(`[ffmpeg-decoder] exited with code ${code}`);
    }
    if (state.process === proc) state.playing = false;
  });
}

function pumpOneFrame(id: string) {
  const state = getState(id);
  if (!state.renderer || !state.metadata) return;

  const out = computeOutputSize(state.metadata.width, state.metadata.height);
  const frameSize = out.w * out.h * 4;
  if (frameSize <= 0) return;

  if (state.frameBufferTotal < frameSize) return;

  let gathered = 0;
  const usedChunks: Buffer[] = [];
  const keepChunks: Buffer[] = [];
  let keepTotal = 0;

  for (const chunk of state.frameChunks) {
    if (gathered < frameSize) {
      const take = Math.min(chunk.length, frameSize - gathered);
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
    if (state.renderer) {
      const { width: pixelW, height: pixelH } = computeRenderSize(width, height);
      state.renderer.resize(pixelW, pixelH);
    }
  },

  play(id: string, path: string) {
    const state = getState(id);
    if (!state.metadata) return;
    startFfmpeg(id, path, state.currentTimeMs);
  },

  renderNextFrame(id: string): { width: number; height: number } | null {
    const state = getState(id);
    if (!state.metadata || !state.renderer) return null;
    if (!state.process && !state.starting && state.path && !state.paused) {
      startFfmpeg(id, state.path, state.currentTimeMs);
    }
    pumpOneFrame(id);
    return state.playing ? { width: state.metadata.width, height: state.metadata.height } : null;
  },

  seek(id: string, timestampMs: number) {
    const state = getState(id);
    state.currentTimeMs = timestampMs;
    if (state.path && !state.starting) {
      startFfmpeg(id, state.path, timestampMs);
    }
  },

  pause(id: string) {
    const state = getState(id);
    state.paused = true;
    killFfmpeg(state);
    if (state.audioCtx && state.audioCtx.state === "running") {
      state.audioCtx.suspend().catch(() => {});
    }
  },

  resume(id: string) {
    const state = getState(id);
    state.paused = false;
    if (!state.process && !state.starting && state.path && state.metadata) {
      startFfmpeg(id, state.path, state.currentTimeMs);
    }
    ensureAudioPlayback(state);
  },

  getMetadata(id: string): VideoMetadata | null {
    return getState(id).metadata;
  },

  setCurrentTime(id: string, timeMs: number) {
    getState(id).currentTimeMs = timeMs;
  },

  getCurrentTime(id: string): number {
    return getState(id).currentTimeMs;
  },

  destroy(id: string) {
    const state = getState(id);
    killFfmpeg(state);
    if (state.audioCtx) {
      state.audioCtx.close().catch(() => {});
      state.audioCtx = null;
    }
    state.audioNode = null;
    if (state.renderer) {
      state.renderer.destroy();
      state.renderer = null;
    }
    decoders.delete(id);
  },
};
