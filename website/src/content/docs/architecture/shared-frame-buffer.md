---
title: Shared Frame Buffer
description: How Ember delivers decoded video frames with zero-copy.
---

Ember uses a modular zero-copy frame delivery pipeline that lets native Rust code write decoded video frames directly into renderer-visible memory.

## Layout (ABI version 1)

All offsets are little-endian, 4-byte aligned.

| Offset | Type | Field | Value |
|--------|------|-------|-------|
| `0x00` | `u32` | magic | `0x53464D42` ('SFMB') |
| `0x04` | `u32` | version | `1` |
| `0x08` | `u32` | maxWidth | `2048` (default) |
| `0x0C` | `u32` | maxHeight | `2048` (default) |
| `0x10` | `u32` | slotSize | `maxWidth * maxHeight * 4` |
| `0x14` | `u32` | slotCount | `2` (default) |
| `0x18` | `u32` | currentWidth | |
| `0x1C` | `u32` | currentHeight | |
| `0x20` | `u32` | pitch | |
| `0x24` | `u32` | pixelFormat | `3` = RGBA8888 |
| `0x28` | `u32` | readySlot | atomic, `0`=none, `1`=slot0, `2`=slot1 |
| `0x2C` | `u32` | sequence | atomic, increments each frame |
| `0x30` | — | reserved | up to `0x100` |
| `0x100` | bytes | slot 0 | RGBA8888 pixel data |
| `0x100+slotSize` | bytes | slot 1 | RGBA8888 pixel data |

## Why this matters

Traditional video pipelines copy frames multiple times between decoder, CPU, and GPU. The Shared Frame Buffer ABI eliminates these copies by:

1. Rust writes decoded RGBA pixels directly into a `SharedArrayBuffer`
2. The renderer reads the same memory without copying
3. WebGL uploads the buffer as a texture

## Current IPC path

Because `SharedArrayBuffer` cannot cross `child_process` boundaries, the libretro addon (which runs in an isolated process for V8 signal-handler safety) uses Node.js structured clone:

1. Rust `getFrame()` converts to RGBA and returns a `Vec<u8>`
2. Worker receives it as a `Buffer`
3. `process.send()` copies via structured clone to the main process
4. `ipcMain.handle` returns to the renderer
5. Renderer creates `Uint8Array` and uploads to WebGL

This is 3 copies total, but avoids the catastrophic JSON-serialization path that previously converted every byte to a JSON number.

## Future use

When a future native module (e.g. libmpv) runs in the main process, it can use the same `SharedFrameBuffer` ABI and the renderer can consume it with zero copies.
