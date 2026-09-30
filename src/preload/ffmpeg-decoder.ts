/**
 * Renderer-side ffmpeg decoder — thin client over the main-process
 * ffmpeg-decoder.service. Under sandbox:true the preload cannot spawn
 * processes; the main service pushes decoded RGBA frames ("ffmpeg:frame")
 * and PCM audio ("ffmpeg:audio") which this module renders/drains.
 */

import { ipcRenderer } from "electron";
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
  metadata: VideoMetadata | null;
  path: string | null;
  canvasId: string | null;
  renderer: WebGLVideoRenderer | null;
  latestFrame: { width: number; height: number; timestampMs: number } | null;
  paused: boolean;
  /** Frames older than this are dropped (post-pause pipeline flush). */
  pauseThreshold: number | null;
  // Audio drain buffer
  audioChunks: Uint8Array[];
  audioBufferTotal: number;
  audioCtx: AudioContext | null;
  audioNode: ScriptProcessorNode | null;
}

const decoders = new Map<string, FfmpegDecoderState>();

const MAX_AUDIO_BYTES = 48000 * 2 * 2 * 4; // ~4 seconds stereo s16le

function getState(id: string): FfmpegDecoderState {
  let state = decoders.get(id);
  if (!state) {
    state = {
      metadata: null,
      path: null,
      canvasId: null,
      renderer: null,
      latestFrame: null,
      paused: false,
      pauseThreshold: null,
      audioChunks: [],
      audioBufferTotal: 0,
      audioCtx: null,
      audioNode: null,
    };
    decoders.set(id, state);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Frame/audio event plumbing — registered once, only in the main frame
// (subframes must not receive privileged API traffic).
// ---------------------------------------------------------------------------

let listenersInstalled = false;

function ensureListeners(): void {
  if (listenersInstalled || window.self !== window.top) return;
  listenersInstalled = true;

  ipcRenderer.on(
    "ffmpeg:frame",
    (_e, payload: { id: string; width: number; height: number; timestampMs: number; data: Uint8Array }) => {
      const state = decoders.get(payload.id);
      if (!state || !state.renderer) return;
      const threshold = state.pauseThreshold;
      if (threshold !== null && payload.timestampMs < threshold - 100) return;
      const data =
        payload.data instanceof Uint8Array
          ? payload.data
          : new Uint8Array(payload.data as ArrayLike<number>);
      const expected = payload.width * payload.height * 4;
      if (data.length !== expected) return;
      state.renderer.render(data, payload.width, payload.height);
      state.latestFrame = {
        width: payload.width,
        height: payload.height,
        timestampMs: payload.timestampMs,
      };
    },
  );

  ipcRenderer.on(
    "ffmpeg:audio",
    (_e, payload: { id: string; data: Uint8Array }) => {
      const state = decoders.get(payload.id);
      if (!state || state.paused) return;
      const chunk =
        payload.data instanceof Uint8Array
          ? payload.data
          : new Uint8Array(payload.data as ArrayLike<number>);
      state.audioChunks.push(chunk);
      state.audioBufferTotal += chunk.length;
      while (state.audioBufferTotal > MAX_AUDIO_BYTES && state.audioChunks.length > 0) {
        const dropped = state.audioChunks.shift()!;
        state.audioBufferTotal -= dropped.length;
      }
      ensureAudioPlayback(state);
    },
  );
}

/** Create/resume the Web Audio context and ScriptProcessorNode. */
function ensureAudioPlayback(state: FfmpegDecoderState): void {
  if (!state.audioCtx) {
    const ctx = new AudioContext({ sampleRate: 48000 });
    state.audioCtx = ctx;
    const node = ctx.createScriptProcessor(4096, 0, 2);
    node.onaudioprocess = (e) => {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const samplesNeeded = outL.length;
      const bytesNeeded = samplesNeeded * 4; // 2 channels x 2 bytes (s16le)

      const pcm: Uint8Array[] = [];
      let gathered = 0;
      const keep: Uint8Array[] = [];
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

      const pcmBuf = new Uint8Array(gathered);
      let off = 0;
      for (const part of pcm) {
        pcmBuf.set(part, off);
        off += part.length;
      }
      const view = new Int16Array(pcmBuf.buffer, 0, pcmBuf.length / 2);
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

export const ffmpegVideoDecoder = {
  create(id: string) {
    ensureListeners();
    getState(id);
    void ipcRenderer.invoke("ffmpeg:create", id);
  },

  async open(id: string, path: string): Promise<VideoMetadata> {
    ensureListeners();
    const meta = (await ipcRenderer.invoke("ffmpeg:open", id, path)) as VideoMetadata;
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

  play(id: string, _path: string) {
    const state = getState(id);
    state.paused = false;
    state.pauseThreshold = null;
    void ipcRenderer.invoke("ffmpeg:play", id);
    ensureAudioPlayback(state);
  },

  renderNextFrame(id: string): { width: number; height: number } | null {
    const state = getState(id);
    // Frames render on arrival ("ffmpeg:frame"); the rAF pump just needs
    // non-null dims to stay alive.
    return state.latestFrame
      ? { width: state.latestFrame.width, height: state.latestFrame.height }
      : { width: 1, height: 1 };
  },

  seek(id: string, timestampMs: number) {
    const state = getState(id);
    // Frames at/after the new position are allowed through (seek unpauses
    // in the main process, matching the previous behavior).
    if (state.pauseThreshold !== null) {
      state.pauseThreshold = timestampMs;
    }
    void ipcRenderer.invoke("ffmpeg:seek", id, timestampMs);
  },

  pause(id: string) {
    const state = getState(id);
    state.paused = true;
    state.pauseThreshold = Number.MAX_SAFE_INTEGER;
    void ipcRenderer.invoke("ffmpeg:pause", id);
    if (state.audioCtx && state.audioCtx.state === "running") {
      state.audioCtx.suspend().catch(() => {});
    }
  },

  resume(id: string) {
    const state = getState(id);
    state.paused = false;
    state.pauseThreshold = null;
    void ipcRenderer.invoke("ffmpeg:resume", id);
    ensureAudioPlayback(state);
  },

  getMetadata(id: string): Promise<VideoMetadata | null> {
    return ipcRenderer.invoke("ffmpeg:getMetadata", id);
  },

  setCurrentTime(id: string, timeMs: number) {
    void ipcRenderer.invoke("ffmpeg:setCurrentTime", id, timeMs);
  },

  async getCurrentTime(id: string): Promise<number> {
    return ipcRenderer.invoke("ffmpeg:getCurrentTime", id);
  },

  destroy(id: string) {
    const state = decoders.get(id);
    if (state) {
      if (state.audioCtx) {
        state.audioCtx.close().catch(() => {});
      }
      if (state.renderer) {
        state.renderer.destroy();
      }
      decoders.delete(id);
    }
    void ipcRenderer.invoke("ffmpeg:destroy", id);
  },
};
