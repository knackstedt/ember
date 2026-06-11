# Agent Notes

## Shared Frame Buffer Architecture

### What it is
A modular zero-copy frame delivery pipeline using `SharedArrayBuffer` (SAB) that lets native Rust code write decoded video frames directly into renderer-visible memory. The ABI is process-agnostic and can be consumed by any renderer component.

**IMPORTANT**: `SharedArrayBuffer` cannot be shared across `child_process` boundaries (only `worker_threads` or same-process contexts). The libretro addon runs in an isolated `child_process` for V8 signal-handler safety, so the SAB cannot be used directly between the worker and the renderer. The SAB code is kept for future use when the addon runs in-process (e.g. libmpv in the main process).

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
The libretro addon runs in an isolated `child_process` (`src/main/libretro-worker.ts`) to avoid V8 signal-handler conflicts with dynarec cores. Because `child_process` IPC does not share memory, frames travel via Node.js structured clone:

1. Rust `getFrame()` converts to RGBA and returns a `Vec<u8>`
2. Worker receives it as a Node.js `Buffer` (no `Array.from` serialization)
3. `process.send()` copies via structured clone to main process
4. `ipcMain.handle` returns to renderer
5. Renderer creates `Uint8Array` and uploads to WebGL

This is 3 copies total (Rust conversion + 2 IPC hops), but avoids the catastrophic `Array.from()` JSON-serialization path that previously converted every byte to a JSON number.

### Why this is modular
The SAB format is independent of libretro. If a future native module (e.g. libmpv) runs in the main process, it can use the same `SharedFrameBuffer` ABI and the renderer can consume it with zero copies.

### Build verification
- Rust: `cd native/libretro-frontend && cargo check` (passes)
- TypeScript: `npx tsc --noEmit` (passes)

## Video Decoder Module

### What it is
A dual-backend native Rust video decoding module (`native/video-decoder/`) with zero-copy frame delivery into a `SharedArrayBuffer`.

### Backends
- **FFmpeg** (preferred): uses `ffmpeg-next` crate. Tries hardware-accelerated NVDEC decoders (`h264_cuvid`, `hevc_cuvid`, etc.) before falling back to software decode.
- **GStreamer** (fallback): uses `gstreamer`/`gstreamer-app` crates with an `uridecodebin → videoconvert → appsink` pipeline.

Backend selection happens at runtime in `decoder.rs::VideoDecoderState::open()`:
1. Try FFmpeg first.
2. If it fails, try GStreamer.
3. Return the name of the backend that succeeded (`ffmpeg`, `ffmpeg-nvdec`, or `gstreamer`).

### Why two separate `.node` files
FFmpeg and GStreamer link against different C libraries. If both were linked into the same `.node`, missing runtime libraries would prevent the addon from loading at all. By building two variants (`video-decoder-ffmpeg.node`, `video-decoder-gstreamer.node`) and trying them at runtime, the app gracefully degrades if only one set of libraries is present.

### Build
Two separate cargo builds with different `CARGO_TARGET_DIR` and `--features`:
- `CARGO_TARGET_DIR=target/ffmpeg cargo build --release --features ffmpeg`
- `CARGO_TARGET_DIR=target/gstreamer cargo build --release --features gstreamer`

Both produce `libvideo_decoder.so` which is renamed to `.node` and copied into `resources/`.

### Renderer integration
- `src/renderer/src/components/VideoPlayer/useNativeVideo.ts` — React hook that manages decoder lifecycle, SharedArrayBuffer, WebGL renderer, and rAF frame pump.
- `src/renderer/src/components/VideoPlayer/webgl-renderer.ts` — WebGL texture renderer for RGBA frames (zero-copy from SAB).
- `src/renderer/src/components/VideoPlayer/VideoPlayer.tsx` — Dual-mode player: uses `<video>` element for MP4/WebM/H.264, and the native decoder + WebGL canvas for MKV/HEVC/etc.
- `src/main/services/video-decoder.service.ts` — Main-process service that loads the correct `.node` backend at runtime.
- `src/main/ipc/index.ts` — IPC handlers bridge renderer → main process → Rust decoder.

### URL resolution
`ember://media/<path>` is resolved to a local filesystem path before being passed to FFmpeg.
`ember://remote/<sourceId>/<path>` is resolved to `http://localhost:<port>/<path>` (same proxy logic as the protocol handler).

### Build verification (when dev libraries are installed)
- Rust: `cd native/video-decoder && cargo check --features ffmpeg` (requires `libavcodec-dev`, `libavformat-dev`, `libavutil-dev`, `libswscale-dev`)
- Rust: `cd native/video-decoder && cargo check --features gstreamer` (requires `libgstreamer1.0-dev`, `libgstreamer-plugins-base1.0-dev`)
- TypeScript: `npx tsc --noEmit` (passes)
