/**
 * FFmpeg decoder service — main-process counterpart of the old preload-side
 * ffmpeg-decoder.ts. Spawning ffprobe/ffmpeg happens here (the preload is
 * fully sandboxed); decoded RGBA frames and PCM audio are pushed to the
 * renderer via webContents.send, mirroring the mpv worker's push model.
 *
 * Renderer channels:
 *   "ffmpeg:frame" → { id, width, height, timestampMs, data }
 *   "ffmpeg:audio" → { id, data }
 */

import { ChildProcess, spawn, spawnSync } from "child_process";
import { BrowserWindow, ipcMain } from "electron";
import { createLogger } from "../util/logger";
import { isMediaAccessAllowed } from "./media-access.service";

const log = createLogger("info");

export interface FfmpegVideoMetadata {
  width: number;
  height: number;
  durationMs: number;
  frameRate: number;
  codecName: string;
  colorSpace?: string;
  colorTransfer?: string;
}

interface DecoderState {
  process: ChildProcess | null;
  metadata: FfmpegVideoMetadata | null;
  path: string | null;
  /** Partial frame bytes carried between stdout chunks. */
  frameCarry: Buffer | null;
  /** Timestamp of the next frame to emit. */
  nextFrameTimeMs: number;
  currentTimeMs: number;
  paused: boolean;
  playing: boolean;
  /** Incremented per spawn; stale pipe handlers check it. */
  procGeneration: number;
  starting: boolean;
}

const decoders = new Map<string, DecoderState>();

function getState(id: string): DecoderState {
  let state = decoders.get(id);
  if (!state) {
    state = {
      process: null,
      metadata: null,
      path: null,
      frameCarry: null,
      nextFrameTimeMs: 0,
      currentTimeMs: 0,
      paused: false,
      playing: false,
      procGeneration: 0,
      starting: false,
    };
    decoders.set(id, state);
  }
  return state;
}

function sendFrame(id: string, width: number, height: number, timestampMs: number, data: Buffer): void {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  win?.webContents.send("ffmpeg:frame", { id, width, height, timestampMs, data });
}

function sendAudio(id: string, data: Buffer): void {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  win?.webContents.send("ffmpeg:audio", { id, data });
}

function killFfmpeg(state: DecoderState): void {
  if (state.process) {
    try {
      state.process.kill("SIGKILL");
    } catch { /* ignore */ }
    state.process = null;
  }
  state.playing = false;
  state.frameCarry = null;
  // procGeneration stays monotonic so stale handlers are ignored.
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

async function ffprobe(path: string): Promise<FfmpegVideoMetadata> {
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
    probe.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(new Error("FFmpeg/ffprobe is not installed. Install the 'ffmpeg' package to enable video playback."));
      } else {
        reject(new Error(`ffprobe failed to start: ${err.message}`));
      }
    });
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

/** Cap output resolution to keep RGBA frames over IPC reasonable.
 *  Rounds to even dimensions for HW filter chroma alignment. */
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
  return { w: Math.floor(w / 2) * 2, h: Math.floor(h / 2) * 2 };
}

function startFfmpeg(id: string, path: string, seekMs: number = 0): void {
  const state = getState(id);
  const meta = state.metadata;
  if (!meta) return;

  killFfmpeg(state);
  state.starting = true;
  state.procGeneration++;
  const myGeneration = state.procGeneration;

  const out = computeOutputSize(meta.width, meta.height);
  const frameSize = out.w * out.h * 4;
  const frameDurationMs = 1000 / (meta.frameRate || 30);

  state.nextFrameTimeMs = seekMs;

  const args: string[] = ["-hide_banner", "-loglevel", "error"];

  const nvdec = getNvdecDecoder(meta.codecName);
  if (nvdec) {
    args.push("-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-c:v", nvdec);
  } else {
    args.push("-threads", "4");
  }

  if (seekMs > 0) {
    args.push("-ss", `${seekMs / 1000}`);
  }
  args.push("-re");

  const isHdr = meta.colorTransfer === "smpte2084" || meta.colorTransfer === "arib-std-b67";
  let videoFilter: string;
  if (nvdec) {
    videoFilter = isHdr
      ? `scale_cuda=${out.w}:${out.h}:format=p010,hwdownload,format=p010,tonemap=hable,format=rgba`
      : `scale_cuda=${out.w}:${out.h}:format=nv12,hwdownload,format=nv12,format=rgba`;
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
    "pipe:3",
  );

  const proc = spawn("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe", "pipe"],
  });

  state.process = proc;
  state.starting = false;
  state.playing = true;
  state.paused = false;

  proc.stderr!.on("data", (d: Buffer) => {
    const msg = d.toString("utf8").trim();
    if (msg) log.warn("ffmpeg", msg);
  });

  // Video pipe — split the raw RGBA stream into whole frames and push each
  // to the renderer. Pipe chunks are not frame-aligned, so keep a carry.
  let videoBuffered = 0;
  const MAX_VIDEO_BACKLOG = frameSize * 4;
  proc.stdout!.on("data", (chunk: Buffer) => {
    if (state.procGeneration !== myGeneration || state.paused) return;
    state.frameCarry = state.frameCarry ? Buffer.concat([state.frameCarry, chunk]) : chunk;
    videoBuffered += chunk.length;
    if (videoBuffered > MAX_VIDEO_BACKLOG) {
      // Decoder is outpacing the renderer — drop whole leading frames.
      const drop = Math.floor((videoBuffered - MAX_VIDEO_BACKLOG) / frameSize) * frameSize;
      if (drop > 0 && drop <= state.frameCarry.length) {
        state.frameCarry = state.frameCarry.subarray(drop);
        videoBuffered = state.frameCarry.length;
      }
    }
    while (state.frameCarry.length >= frameSize) {
      const frame = state.frameCarry.subarray(0, frameSize);
      state.frameCarry = state.frameCarry.subarray(frameSize);
      const ts = state.nextFrameTimeMs;
      state.nextFrameTimeMs += frameDurationMs;
      state.currentTimeMs = ts;
      sendFrame(id, out.w, out.h, ts, Buffer.from(frame));
    }
    videoBuffered = state.frameCarry.length;
  });

  proc.stdout!.on("end", () => {
    if (state.process === proc) state.playing = false;
  });

  // Audio pipe (fd 3) — forward PCM chunks for the renderer to drain.
  const audioStream = proc.stdio[3] as NodeJS.ReadableStream;
  audioStream.on("data", (chunk: Buffer) => {
    if (state.procGeneration !== myGeneration || state.paused) return;
    sendAudio(id, chunk);
  });

  proc.on("error", (err: NodeJS.ErrnoException) => {
    log.error("ffmpeg", `process error: ${err}`);
    if (state.process === proc) {
      state.playing = false;
      if (err.code === "ENOENT") {
        state.metadata = null;
      }
    }
  });

  proc.on("close", (code) => {
    if (code !== 0 && code !== null && code !== -9) {
      log.error("ffmpeg", `exited with code ${code}`);
    }
    if (state.process === proc) state.playing = false;
  });
}

export function ffmpegAvailable(): boolean {
  try {
    const res = spawnSync("ffprobe", ["-version"], { stdio: "ignore" });
    return !res.error && res.status === 0;
  } catch {
    return false;
  }
}

/** Resolve a renderer-supplied video reference to an openable path.
 *  Formerly lived in the preload; moved here for sandbox:true. */
function resolveVideoPath(path: string): string {
  if (path.startsWith("ember://remote/")) {
    throw new Error(`Unresolved remote URL passed to decoder: ${path}.`);
  }
  if (
    path &&
    !path.startsWith("/") &&
    !path.startsWith("http://") &&
    !path.startsWith("https://") &&
    !path.startsWith("file://") &&
    !path.startsWith("ember://")
  ) {
    if (existsSync(path)) return path;
    const videosDir = join(
      process.env.XDG_VIDEOS_DIR ?? join(homedir(), "Videos"),
    );
    const candidate = join(videosDir, path);
    if (existsSync(candidate)) return candidate;
    const basename = path.split("/").pop() || path;
    const found = findFileRecursive(videosDir, basename);
    if (found) return found;
    throw new Error(`Video file not found: ${path}.`);
  }
  return path;
}

export function registerFfmpegIpcHandlers(): void {
  ipcMain.handle("videos:resolve", async (_e, path: string) =>
    resolveVideoPath(path),
  );

  ipcMain.handle("ffmpeg:create", async (_e, id: string) => {
    getState(id);
  });

  ipcMain.handle("ffmpeg:open", async (_e, id: string, path: string) => {
    // Local files must be allowlisted media; remote/http streams pass through.
    if (path.startsWith("/") && !(await isMediaAccessAllowed(path))) {
      throw new Error(`ffmpeg: access denied for path: ${path}`);
    }
    const meta = await ffprobe(path);
    const state = getState(id);
    state.metadata = meta;
    state.path = path;
    return meta;
  });

  ipcMain.handle("ffmpeg:play", async (_e, id: string) => {
    const state = getState(id);
    if (state.metadata && state.path && !state.starting) {
      startFfmpeg(id, state.path, state.currentTimeMs);
    }
  });

  ipcMain.handle("ffmpeg:seek", async (_e, id: string, timestampMs: number) => {
    const state = getState(id);
    state.currentTimeMs = timestampMs;
    if (state.path && !state.starting) {
      startFfmpeg(id, state.path, timestampMs);
    }
  });

  ipcMain.handle("ffmpeg:pause", async (_e, id: string) => {
    const state = getState(id);
    state.paused = true;
    killFfmpeg(state);
  });

  ipcMain.handle("ffmpeg:resume", async (_e, id: string) => {
    const state = getState(id);
    state.paused = false;
    if (!state.process && !state.starting && state.path && state.metadata) {
      startFfmpeg(id, state.path, state.currentTimeMs);
    }
  });

  ipcMain.handle("ffmpeg:getMetadata", async (_e, id: string) => {
    return getState(id).metadata;
  });

  ipcMain.handle("ffmpeg:getCurrentTime", async (_e, id: string) => {
    return getState(id).currentTimeMs;
  });

  ipcMain.handle("ffmpeg:setCurrentTime", async (_e, id: string, timeMs: number) => {
    const state = getState(id);
    state.currentTimeMs = timeMs;
    state.nextFrameTimeMs = timeMs;
  });

  ipcMain.handle("ffmpeg:isPlaying", async (_e, id: string) => {
    return getState(id).playing;
  });

  ipcMain.handle("ffmpeg:destroy", async (_e, id: string) => {
    const state = decoders.get(id);
    if (state) {
      killFfmpeg(state);
      decoders.delete(id);
    }
  });
}

export function destroyAllFfmpegDecoders(): void {
  for (const state of decoders.values()) {
    killFfmpeg(state);
  }
  decoders.clear();
}
