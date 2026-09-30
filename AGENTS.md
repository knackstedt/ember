# Agent Notes

## Process Topology

- **Main process** (`src/main/index.ts`): windows, `ember://` protocol, IPC, services.
- **Worker threads**: `workers/db.worker.ts` (SurrealDB), `workers/game-scan.worker.ts` (scanners), `workers/plugin.worker.ts` (one per plugin).
- **Child processes**: `libretro-worker.ts` (dynarec/V8 signal-handler isolation), `mpv-worker.ts` (libmpv/libffmpeg symbol isolation — spawns system Node on purpose), `thumbnail-worker.ts`, rclone daemons.
- **Renderers**: main window, overlay window, streaming webviews, splitscreen windows. All `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false`.

## Media Access Policy

Renderer-initiated local file reads go through `src/main/services/media-access.service.ts`
— a canonical-path allowlist seeded from DB-recorded media/cover paths and
dialog selections. It gates `ember://media`, `files:read`, `ffmpeg:open`,
`mpv:open`, `flash-capture:swf`, and CHD sniffing. Use `registerAllowedPath` /
`isMediaAccessAllowed` when adding a new file-read surface.

## Shared Frame Buffer Architecture

### What it is
A modular zero-copy frame delivery pipeline using `SharedArrayBuffer` (SAB) that lets native Rust code write decoded video frames directly into renderer-visible memory. The ABI is process-agnostic and can be consumed by any renderer component.

**IMPORTANT**: `SharedArrayBuffer` cannot be shared across `child_process` boundaries (only `worker_threads` or same-process contexts). The libretro addon runs in an isolated `child_process` for V8 signal-handler safety, so the SAB cannot be used directly between the worker and the renderer. The SAB code is kept for future use when the addon runs in-process.

### Layout (ABI version 1)
All offsets are little-endian, 4-byte aligned.

```
[0x00: 0x04]  u32  magic   = 0x53464D42 ('SFMB')
[0x04: 0x08]  u32  version = 1
[0x08: 0x0C]  u32  maxWidth   (default 2048)
[0x0C: 0x10]  u32  maxHeight  (default 2048)
[0x10: 0x14]  u32  slotSize   = maxWidth * maxHeight * 4
[0x14: 0x18]  u32  slotCount  (default 2)
[0x18: 0x1C]  u32  currentWidth
[0x1C: 0x20]  u32  currentHeight
[0x20: 0x24]  u32  pitch
[0x24: 0x28]  u32  pixelFormat (3 = RGBA8888)
[0x28: 0x2C]  u32  readySlot   (atomic, 0=none, 1=slot0, 2=slot1)
[0x2C: 0x30]  u32  sequence    (atomic, increments each frame)
[0x30: 0x100] reserved
[0x100: ...]  slot 0 pixel data (RGBA8888)
[0x100+slotSize: ...]  slot 1 pixel data
```

### Files involved
- **Rust writer**: `native/libretro-frontend/src/shared_buffer.rs` (SAB layout & pixel format conversion)
- **Rust integration**: `native/libretro-frontend/src/lib.rs` (`attach_shared_buffer` napi method)
- **Rust video hook**: `native/libretro-frontend/src/video.rs` (`VideoState` can optionally publish to a SAB)
- **Renderer reader**: `src/renderer/src/shared-frame-buffer.ts` (JS-side SAB wrapper)

### Current IPC path (libretro worker)
The libretro addon runs in an isolated `child_process` (`src/main/libretro-worker.ts`) to avoid V8 signal-handler conflicts with dynarec cores. The worker is spawned with `serialization: "advanced"`, so frames travel via V8 structured clone:

1. Rust `getFrame()` converts to RGBA and returns a `Vec<u8>`
2. Worker receives it as a Node.js `Buffer` and returns it directly (no base64)
3. `process.send()` transfers it via structured clone to main process
4. `ipcMain.handle` returns to renderer
5. Renderer wraps it in a `Uint8Array` and uploads to WebGL

### Why this is modular
The SAB format is independent of libretro. If a future native module (e.g. libmpv) runs in the main process, it can use the same `SharedFrameBuffer` ABI and the renderer can consume it with zero copies.

## Video Decoder Module

### What it is
A native Rust video decoding module (`native/video-decoder/`) built on
**mpv/libmpv** (`mpv_dynamic.rs` loads libmpv at runtime; `mpv_renderer.rs`
pulls RGBA frames). There is no FFmpeg/GStreamer backend in the addon —
software `ffmpeg` subprocess decoding exists separately as the JS-level
fallback in `src/main/services/ffmpeg-decoder.service.ts`.

### Process model
`src/main/services/mpv-worker.service.ts` spawns `src/main/mpv-worker.ts` as a
child process using **system Node.js** (not `ELECTRON_RUN_AS_NODE`) because
Electron's bundled `libffmpeg.so` exports libavutil 59 symbols that heap-
corrupt libmpv's libavutil 58.

### Frame transport
- The worker allocates an `ArrayBuffer` sized to the **actual decoded
  dimensions** (`HEADER_SIZE + w*h*4*2` slots), reallocating only if the
  decoder reports a larger size. `attach_shared_buffer` re-initializes the
  slot layout from decoder metadata on each attach.
- Frame pixels travel over a dedicated binary pipe (fd 4) with a 20-byte
  `FRAM` header (`magic, idLen, width, height, frameLen`). Timestamps go over
  IPC as `frame-meta` messages and are matched with pipe data in the service.
- Frames are pushed to the renderer via `webContents.send("mpv:frame", ...)`.
- The FFmpeg fallback mirrors this push model via `ffmpeg:frame` /
  `ffmpeg:audio` events from `ffmpeg-decoder.service.ts`.

### Renderer integration
- `src/renderer/src/components/VideoPlayer/useNativeVideo.ts` — React hook managing decoder lifecycle, WebGL renderer, rAF pump.
- `src/renderer/src/components/VideoPlayer/webgl-renderer.ts` — WebGL texture renderer for RGBA frames.
- `src/renderer/src/components/VideoPlayer/VideoPlayer.tsx` — dual-mode player: `<video>` element for MP4/WebM/H.264, native decoder + WebGL for MKV/HEVC/etc.
- `src/preload/index.ts` — `videoDecoder` API; chooses mpv worker vs ffmpeg service per `mpv:available`.
- `src/preload/ffmpeg-decoder.ts` — renderer-side client (WebGL render + WebAudio drain) for the ffmpeg fallback.

### URL resolution
`videos:resolve` in the ffmpeg service resolves renderer-supplied paths in the
main process (the sandboxed preload has no fs). Absolute paths are additionally
gated by the media allowlist before decoding.

## Plugin System

Each plugin runs in a dedicated `worker_threads` isolate
(`src/main/plugins/plugin.worker.ts`), inside a `vm` context with a
permission-gated `require()` shim — no `process`, no Electron, no Node
`fs`/`child_process`/`net` unless the manifest declares the matching
`permissions` entry (`filesystem`, `network`, `subprocess`, `system`).
`src/main/plugins/host.ts` is the main-process bridge; `loader.ts` builds a
`PluginModule` proxy from the bundle's exports. See `PLUGIN-SYSTEM.md`.

## Git / Commits

- Do NOT create git commits, stage files, or suggest commit messages unless explicitly asked.
- Do NOT "wrap up" work by committing changes at the end of a session.
- Only perform git add/commit/push operations when the user directly requests them.
