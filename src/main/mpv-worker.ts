/**
 * MPV video decoder worker child process.
 *
 * Runs in an isolated Node.js process (ELECTRON_RUN_AS_NODE=1) to avoid
 * GPU/Vulkan conflicts with Chromium's renderer.  Loads the native
 * video-decoder addon, drives mpv, and streams RGBA frames back to the
 * parent via Node.js IPC.
 */

import { existsSync } from "fs";
import { Socket } from "net";
import { join } from "path";

const arch = process.arch === "arm64" ? "arm64" : "x64";
const addonName = `video-decoder.linux-${arch}-gnu.node`;

// fd 4 is the dedicated binary frame pipe (stdio[4] in the parent).
const framePipe = new Socket({ fd: 4, writable: true, readable: false });
const FRAME_MAGIC = 0x4652414d;
const FRAME_HEADER_SIZE = 20;

function writeFrameToPipe(decoderId: string, width: number, height: number, frameData: Uint8Array) {
  const idBuf = Buffer.from(decoderId, "utf8");
  const header = Buffer.allocUnsafe(FRAME_HEADER_SIZE);
  header.writeUInt32LE(FRAME_MAGIC, 0);
  header.writeUInt32LE(idBuf.length, 4);
  header.writeUInt32LE(width, 8);
  header.writeUInt32LE(height, 12);
  header.writeUInt32LE(frameData.byteLength, 16);
  framePipe.write(header);
  framePipe.write(idBuf);
  // Writing a Uint8Array view over the shared buffer avoids the per-frame
  // allocUnsafe+copy — the socket copies straight to the kernel.
  framePipe.write(frameData);
}

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
  // Placeholder only — the real buffer is allocated on "open" once the
  // video's actual dimensions are known (a 640x480 clip doesn't need 128MB).
  const ab = new ArrayBuffer(HEADER_SIZE);
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

    const tickStart = performance.now();
    let width = 0;
    let height = 0;

    try {
      const meta = s.decoder.renderFrame();
      if (!meta) {
        s.playing = false;
        process.send!({ type: "event", decoderId, event: "end-file" });
        return;
      }

      const view = new DataView(s.ab);
      const readySlot = readU32(view, OFF_READY_SLOT);
      width = readU32(view, OFF_WIDTH);
      height = readU32(view, OFF_HEIGHT);

      if (readySlot === 0 || width === 0 || height === 0) {
        scheduleNext(Math.max(0, frameInterval - (performance.now() - tickStart)));
        return;
      }

      const slotIdx = readySlot - 1;
      const slotSize = readU32(view, OFF_SLOT_SIZE);
      const slotOffset = HEADER_SIZE + slotIdx * slotSize;
      const frameLen = width * height * 4;

      if (slotOffset + frameLen > s.ab.byteLength) {
        // Frame doesn't fit (e.g. mid-stream resolution change) — grow the
        // shared buffer and re-attach so the next render uses the new layout.
        growBufferForFrame(s, width, height);
        scheduleNext(Math.max(0, frameInterval - (performance.now() - tickStart)));
        return;
      }

      // Send frame metadata (timestamp) via IPC, and pixel data via the
      // binary pipe (fd 4). This avoids V8 structured clone version
      // mismatches between Electron and system Node.
      s.lastFrameTime = performance.now();
      try {
        s.currentTimeMs = s.decoder.getTimePosMs() ?? s.currentTimeMs;
      } catch { /* ignore */ }

      process.send!({
        type: "frame-meta",
        decoderId,
        timestampMs: s.currentTimeMs,
      });
      writeFrameToPipe(decoderId, width, height, new Uint8Array(s.ab, slotOffset, frameLen));

      const delay = Math.max(0, frameInterval - (performance.now() - tickStart));
      scheduleNext(delay);
    } catch (err: any) {
      process.send!({ type: "event", decoderId, event: "error", message: err?.message ?? String(err) });
      return;
    }
  }

  function scheduleNext(delay: number) {
    const s = decoders.get(decoderId);
    if (!s || s.pumpGeneration !== myGen || s.paused) return;
    s.pumpTimer = setTimeout(tick, delay);
  }

  tick();
}

const MAX_SAB_BYTES = 1024 * 1024 * 1024; // 1GB sanity cap

function growBufferForFrame(s: DecoderState, width: number, height: number): void {
  const needed = HEADER_SIZE + width * height * 4 * 2;
  if (needed <= s.ab.byteLength || needed > MAX_SAB_BYTES) return;
  try {
    const ab = new ArrayBuffer(needed);
    s.ab = ab;
    s.abView = new Uint8Array(ab);
    s.decoder.attachSharedBuffer(ab);
    console.log(`[mpv-worker] decoder buffer grew to ${(needed / 1024 / 1024).toFixed(1)}MB for ${width}x${height}`);
  } catch (err) {
    console.error(`[mpv-worker] failed to grow shared buffer: ${err}`);
  }
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

        // Size the shared buffer for the actual video dimensions
        // (2 slots of w*h*4). The native side re-inits the slot layout from
        // the stream metadata on attach.
        const w = Math.max(meta.width, 1);
        const h = Math.max(meta.height, 1);
        const bufSize = HEADER_SIZE + w * h * 4 * 2;
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
            for (let attempt = 0; attempt < 2; attempt++) {
              const meta = state.decoder.renderFrame();
              if (!meta) break;
              const view = new DataView(state.ab);
              const readySlot = readU32(view, OFF_READY_SLOT);
              const width = readU32(view, OFF_WIDTH);
              const height = readU32(view, OFF_HEIGHT);
              if (!(readySlot > 0 && width > 0 && height > 0)) break;
              const slotIdx = readySlot - 1;
              const slotSize = readU32(view, OFF_SLOT_SIZE);
              const slotOffset = HEADER_SIZE + slotIdx * slotSize;
              const frameLen = width * height * 4;
              if (slotOffset + frameLen > state.ab.byteLength) {
                // Grow and retry once so the seeked frame isn't dropped.
                growBufferForFrame(state, width, height);
                continue;
              }
              process.send!({
                type: "frame-meta",
                decoderId,
                timestampMs: ms,
              });
              writeFrameToPipe(decoderId, width, height, new Uint8Array(state.ab, slotOffset, frameLen));
              break;
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
    const msg = err?.message ?? String(err);
    process.send!({ reqId, type: "response", error: msg });
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
