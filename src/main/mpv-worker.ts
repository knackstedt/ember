/**
 * MPV video decoder worker child process.
 *
 * Runs in an isolated Node.js process (ELECTRON_RUN_AS_NODE=1) to avoid
 * GPU/Vulkan conflicts with Chromium's renderer.  Loads the native
 * video-decoder addon, drives mpv, and streams RGBA frames back to the
 * parent via Node.js IPC.
 */

import { join } from "path";
import { existsSync } from "fs";

const arch = process.arch === "arm64" ? "arm64" : "x64";
const addonName = `video-decoder.linux-${arch}-gnu.node`;

function findAddon(): string | null {
  const candidates = [
    join(__dirname, "..", "..", "resources", addonName),
    join(__dirname, "..", "renderer", addonName),
    join(__dirname, addonName),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

const addonPath = findAddon();
if (!addonPath) {
  console.error(JSON.stringify({ error: `Video decoder native addon not found (${addonName})` }));
  process.exit(1);
}

const NativeAddon = require(addonPath);

// ---------------------------------------------------------------------------
// Per-decoder state
// ---------------------------------------------------------------------------

interface DecoderState {
  decoder: any;
  ab: ArrayBuffer;
  abView: Uint8Array;
  path: string | null;
  metadata: { width: number; height: number; frameRate: number; durationMs: number } | null;
  playing: boolean;
  paused: boolean;
  pumpTimer: ReturnType<typeof setTimeout> | null;
  pumpGeneration: number;
  currentTimeMs: number;
  lastFrameTime: number;
}

const decoders = new Map<string, DecoderState>();

const HEADER_SIZE = 256;
const OFF_SLOT_SIZE = 16;
const OFF_WIDTH = 24;
const OFF_HEIGHT = 28;
const OFF_READY_SLOT = 40;

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function createState(id: string): DecoderState {
  const decoder = new NativeAddon.VideoDecoder();
  const ab = new ArrayBuffer(HEADER_SIZE + 4096 * 4096 * 4 * 2);
  return {
    decoder,
    ab,
    abView: new Uint8Array(ab),
    path: null,
    metadata: null,
    playing: false,
    paused: false,
    pumpTimer: null,
    pumpGeneration: 0,
    currentTimeMs: 0,
    lastFrameTime: 0,
  };
}

// ---------------------------------------------------------------------------
// Frame pump
// ---------------------------------------------------------------------------

function startPump(decoderId: string) {
  const state = decoders.get(decoderId);
  if (!state || !state.metadata) return;
  if (state.paused) return;

  state.playing = true;
  state.pumpGeneration++;
  const myGen = state.pumpGeneration;

  const frameInterval = 1000 / (state.metadata.frameRate || 30);

  function tick() {
    const s = decoders.get(decoderId);
    if (!s || s.pumpGeneration !== myGen || s.paused) return;

    try {
      const meta = s.decoder.renderFrame();
      if (!meta) {
        s.playing = false;
        process.send!({ type: "event", decoderId, event: "end-file" });
        return;
      }

      const view = new DataView(s.ab);
      const readySlot = readU32(view, OFF_READY_SLOT);
      const width = readU32(view, OFF_WIDTH);
      const height = readU32(view, OFF_HEIGHT);

      if (readySlot === 0 || width === 0 || height === 0) {
        scheduleNext();
        return;
      }

      const slotIdx = readySlot - 1;
      const slotSize = readU32(view, OFF_SLOT_SIZE);
      const slotOffset = HEADER_SIZE + slotIdx * slotSize;
      const frameLen = width * height * 4;

      if (slotOffset + frameLen > s.ab.byteLength) {
        scheduleNext();
        return;
      }

      // Copy the frame slice into a standalone Buffer so V8 serialization
      // doesn't try to send the entire underlying ArrayBuffer.
      const frameBuf = Buffer.allocUnsafe(frameLen);
      frameBuf.set(new Uint8Array(s.ab, slotOffset, frameLen));

      s.lastFrameTime = performance.now();
      try {
        s.currentTimeMs = s.decoder.getTimePosMs() ?? s.currentTimeMs;
      } catch { /* ignore */ }

      process.send!({
        type: "frame",
        decoderId,
        width,
        height,
        data: frameBuf,
        timestampMs: s.currentTimeMs,
      });
    } catch (err: any) {
      process.send!({ type: "event", decoderId, event: "error", message: err?.message ?? String(err) });
      return;
    }

    scheduleNext();
  }

  function scheduleNext() {
    const s = decoders.get(decoderId);
    if (!s || s.pumpGeneration !== myGen || s.paused) return;
    s.pumpTimer = setTimeout(tick, frameInterval);
  }

  tick();
}

function stopPump(decoderId: string) {
  const state = decoders.get(decoderId);
  if (!state) return;
  state.pumpGeneration++;
  state.playing = false;
  if (state.pumpTimer) {
    clearTimeout(state.pumpTimer);
    state.pumpTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function handleCommand(req: any) {
  const { decoderId, reqId, cmd, args } = req;
  if (!cmd) return;

  try {
    let result: any;

    switch (cmd) {
      case "create": {
        if (!decoders.has(decoderId)) {
          const state = createState(decoderId);
          decoders.set(decoderId, state);
        }
        result = true;
        break;
      }

      case "open": {
        const path = args[0] as string;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.decoder.open(path);
        const meta = state.decoder.getMetadata();
        state.metadata = {
          width: meta.width,
          height: meta.height,
          frameRate: meta.frameRate,
          durationMs: meta.durationMs,
        };
        state.path = path;
        state.currentTimeMs = 0;

        // Recreate ArrayBuffer sized for this video.
        const maxW = Math.max(meta.width, 4096);
        const maxH = Math.max(meta.height, 4096);
        const bufSize = HEADER_SIZE + maxW * maxH * 4 * 2;
        state.ab = new ArrayBuffer(bufSize);
        state.abView = new Uint8Array(state.ab);
        state.decoder.attachSharedBuffer(state.ab);

        result = meta;
        break;
      }

      case "close": {
        const state = decoders.get(decoderId);
        if (state) {
          stopPump(decoderId);
          try {
            state.decoder.close();
          } catch { /* ignore */ }
          decoders.delete(decoderId);
        }
        result = true;
        break;
      }

      case "play": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.paused = false;
        state.decoder.setPause(false);
        startPump(decoderId);
        result = true;
        break;
      }

      case "pause": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.paused = true;
        state.decoder.setPause(true);
        stopPump(decoderId);
        result = true;
        break;
      }

      case "seek": {
        const ms = args[0] as number;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.currentTimeMs = ms;
        state.decoder.seek(ms);
        if (state.paused) {
          try {
            const meta = state.decoder.renderFrame();
            if (meta) {
              const view = new DataView(state.ab);
              const readySlot = readU32(view, OFF_READY_SLOT);
              const width = readU32(view, OFF_WIDTH);
              const height = readU32(view, OFF_HEIGHT);
              if (readySlot > 0 && width > 0 && height > 0) {
                const slotIdx = readySlot - 1;
                const slotSize = readU32(view, OFF_SLOT_SIZE);
                const slotOffset = HEADER_SIZE + slotIdx * slotSize;
                const frameLen = width * height * 4;
                if (slotOffset + frameLen <= state.ab.byteLength) {
                  const frameBuf = Buffer.alloc(frameLen);
                  const frameView = new Uint8Array(state.ab, slotOffset, frameLen);
                  frameBuf.set(frameView);
                  process.send!({
                    type: "frame",
                    decoderId,
                    width,
                    height,
                    data: frameBuf,
                    timestampMs: ms,
                  });
                }
              }
            }
          } catch { /* ignore */ }
        }
        result = true;
        break;
      }

      case "getMetadata": {
        const state = decoders.get(decoderId);
        if (!state || !state.metadata) throw new Error("Decoder not opened");
        result = state.metadata;
        break;
      }

      case "getTimePosMs": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        result = state.decoder.getTimePosMs?.() ?? state.currentTimeMs;
        break;
      }

      case "setCurrentTime": {
        const ms = args[0] as number;
        const state = decoders.get(decoderId);
        if (state) state.currentTimeMs = ms;
        result = true;
        break;
      }

      case "setRenderSize": {
        const width = args[0] as number;
        const height = args[1] as number;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.decoder.setRenderSize(width, height);
        result = true;
        break;
      }

      case "listSubtitleTracks": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        result = state.decoder.listSubtitleTracks();
        break;
      }

      case "selectSubtitleTrack": {
        const trackId = args[0] as number;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.decoder.selectSubtitleTrack(trackId);
        result = true;
        break;
      }

      case "loadExternalSubtitle": {
        const path = args[0] as string;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.decoder.loadExternalSubtitle(path);
        result = true;
        break;
      }

      case "listAudioTracks": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        result = state.decoder.listAudioTracks();
        break;
      }

      case "selectAudioTrack": {
        const trackId = args[0] as number;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.decoder.selectAudioTrack(trackId);
        result = true;
        break;
      }

      case "getVolume": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        result = state.decoder.getVolume();
        break;
      }

      case "setVolume": {
        const vol = args[0] as number;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.decoder.setVolume(vol);
        result = true;
        break;
      }

      case "getMute": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        result = state.decoder.getMute();
        break;
      }

      case "setMute": {
        const mute = args[0] as boolean;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.decoder.setMute(mute);
        result = true;
        break;
      }

      case "getSpeed": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        result = state.decoder.getSpeed();
        break;
      }

      case "setSpeed": {
        const speed = args[0] as number;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.decoder.setSpeed(speed);
        result = true;
        break;
      }

      case "listChapters": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        result = state.decoder.listChapters();
        break;
      }

      case "getChapter": {
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        result = state.decoder.getChapter();
        break;
      }

      case "setChapter": {
        const idx = args[0] as number;
        const state = decoders.get(decoderId);
        if (!state) throw new Error("Decoder not created");
        state.decoder.setChapter(idx);
        result = true;
        break;
      }

      default:
        process.send!({ reqId, type: "response", error: `Unknown command: ${cmd}` });
        return;
    }

    process.send!({ reqId, type: "response", result });
  } catch (err: any) {
    process.send!({ reqId, type: "response", error: err?.message ?? String(err) });
  }
}

process.on("message", (req: any) => {
  if (req.type === "cmd") {
    handleCommand(req);
  }
});

process.on("disconnect", () => {
  for (const [id, state] of decoders) {
    stopPump(id);
    try {
      state.decoder.close();
    } catch { /* ignore */ }
  }
  decoders.clear();
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});
