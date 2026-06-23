import { join } from "path";
import { existsSync } from "fs";
import { WebGLVideoRenderer } from "./webgl-renderer";

interface VideoMetadata {
  width: number;
  height: number;
  durationMs: number;
  frameRate: number;
}

interface SubtitleTrack {
  id: number;
  title?: string;
  lang?: string;
  selected?: boolean;
  default?: boolean;
}

interface MpvDecoderState {
  decoder: any;
  ab: ArrayBuffer | null;
  abView: Uint8Array | null;
  canvasId: string | null;
  renderer: WebGLVideoRenderer | null;
  metadata: VideoMetadata | null;
  paused: boolean;
  playing: boolean;
  currentTimeMs: number;
  subtitleTracks: SubtitleTrack[];
}

const decoders = new Map<string, MpvDecoderState>();

function getState(id: string): MpvDecoderState {
  let state = decoders.get(id);
  if (!state) {
    state = {
      decoder: null,
      ab: null,
      abView: null,
      canvasId: null,
      renderer: null,
      metadata: null,
      paused: false,
      playing: false,
      currentTimeMs: 0,
      subtitleTracks: [],
    };
    decoders.set(id, state);
  }
  return state;
}

let addonCache: { VideoDecoder: any } | null | undefined = undefined;

function loadAddon(): { VideoDecoder: any } | null {
  if (addonCache !== undefined) return addonCache ?? null;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const candidates = [
    join(process.resourcesPath, `video-decoder.linux-${arch}-gnu.node`),
    join(process.cwd(), "resources", `video-decoder.linux-${arch}-gnu.node`),
    join(process.cwd(), "native", "video-decoder", "target", "release", "libvideo_decoder.so"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const m: any = { exports: {} };
      try {
        (process as any).dlopen(m, p);
        addonCache = m.exports ?? null;
        return addonCache ?? null;
      } catch (e) {
        console.warn("[mpv-decoder] dlopen failed:", e);
      }
    }
  }
  addonCache = null;
  return null;
}

function getVideoDecoder(): any | null {
  return loadAddon()?.VideoDecoder ?? null;
}

const HEADER_SIZE = 256;
const OFF_WIDTH = 24;
const OFF_HEIGHT = 28;
const OFF_READY_SLOT = 40;
const OFF_SEQUENCE = 44;

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

export const mpvVideoDecoder = {
  available(): boolean {
    return !!getVideoDecoder();
  },

  create(id: string) {
    getState(id);
  },

  async open(id: string, path: string): Promise<VideoMetadata> {
    const state = getState(id);
    const VideoDecoder = getVideoDecoder();
    if (!VideoDecoder) {
      throw new Error("Native mpv video decoder not available");
    }

    state.decoder = new VideoDecoder();
    state.decoder.open(path);

    const meta = state.decoder.getMetadata();
    state.metadata = {
      width: meta.width,
      height: meta.height,
      durationMs: meta.durationMs,
      frameRate: meta.frameRate,
    };
    state.currentTimeMs = 0;

    // Create ArrayBuffer for zero-copy frame delivery.
    const maxW = Math.max(meta.width, 4096);
    const maxH = Math.max(meta.height, 4096);
    const slotSize = maxW * maxH * 4;
    const bufSize = HEADER_SIZE + slotSize * 2;
    state.ab = new ArrayBuffer(bufSize);
    state.abView = new Uint8Array(state.ab);

    state.decoder.attachSharedBuffer(state.ab);

    // Populate subtitle tracks from mpv.
    try {
      state.subtitleTracks = state.decoder.listSubtitleTracks();
    } catch (e) {
      console.warn("[mpv-decoder] listSubtitleTracks failed:", e);
      state.subtitleTracks = [];
    }

    return state.metadata;
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

  renderNextFrame(id: string): { width: number; height: number } | null {
    const state = getState(id);
    if (!state.decoder || !state.renderer || !state.ab || !state.metadata) return null;

    if (!state.paused) {
      const meta = state.decoder.renderFrame();
      if (!meta) {
        state.playing = false;
        return null;
      }
    }

    // Read header from buffer to find ready slot and dimensions.
    const view = new DataView(state.ab);
    const readySlot = readU32(view, OFF_READY_SLOT);
    const width = readU32(view, OFF_WIDTH);
    const height = readU32(view, OFF_HEIGHT);

    if (readySlot === 0 || width === 0 || height === 0) {
      return null;
    }

    const slotIdx = readySlot - 1; // ready_slot: 1=slot0, 2=slot1
    const maxW = Math.max(state.metadata.width, 4096);
    const maxH = Math.max(state.metadata.height, 4096);
    const slotSize = maxW * maxH * 4;
    const slotOffset = HEADER_SIZE + slotIdx * slotSize;

    const frameView = new Uint8Array(state.ab, slotOffset, width * height * 4);
    state.renderer.render(frameView, width, height);

    return { width, height };
  },

  seek(id: string, timestampMs: number) {
    const state = getState(id);
    state.currentTimeMs = timestampMs;
    if (state.decoder) {
      state.decoder.seek(timestampMs);
    }
  },

  pause(id: string) {
    const state = getState(id);
    state.paused = true;
    state.playing = false;
    if (state.decoder) {
      state.decoder.setPause(true);
    }
  },

  resume(id: string) {
    const state = getState(id);
    state.paused = false;
    state.playing = true;
    if (state.decoder) {
      state.decoder.setPause(false);
    }
  },

  getMetadata(id: string): VideoMetadata | null {
    return getState(id).metadata;
  },

  setCurrentTime(id: string, timeMs: number) {
    getState(id).currentTimeMs = timeMs;
  },

  getCurrentTime(id: string): number {
    const state = getState(id);
    if (state.decoder) {
      try {
        return state.decoder.getTimePosMs();
      } catch { /* fall through */ }
    }
    return state.currentTimeMs;
  },

  destroy(id: string) {
    const state = getState(id);
    if (state.decoder) {
      try {
        state.decoder.close();
      } catch { /* ignore */ }
      state.decoder = null;
    }
    if (state.renderer) {
      state.renderer.destroy();
      state.renderer = null;
    }
    state.ab = null;
    state.abView = null;
    decoders.delete(id);
  },

  // Subtitle API
  listSubtitleTracks(id: string): SubtitleTrack[] {
    return getState(id).subtitleTracks;
  },

  selectSubtitleTrack(id: string, trackId: number) {
    const state = getState(id);
    if (!state.decoder) throw new Error("Decoder not opened");
    state.decoder.selectSubtitleTrack(trackId);
    // Update local cache
    try {
      state.subtitleTracks = state.decoder.listSubtitleTracks();
    } catch { /* ignore */ }
  },

  loadExternalSubtitle(id: string, path: string) {
    const state = getState(id);
    if (!state.decoder) throw new Error("Decoder not opened");
    state.decoder.loadExternalSubtitle(path);
    // Update local cache
    try {
      state.subtitleTracks = state.decoder.listSubtitleTracks();
    } catch { /* ignore */ }
  },
};
