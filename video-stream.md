Yeah, this is a very clean fit for the same architecture you already have with libretro. The pattern maps almost 1:1.

## The Core Idea

Instead of a full video player living in the Chromium renderer, you drop a native Rust module that wraps **libmpv** (mpv's embeddable C library), decodes frames into a shared buffer, and pumps them to a canvas via `putImageData` — exactly what you're doing with libretro cores.

---

## Why libmpv Specifically

- Handles literally every codec (H.264, HEVC, AV1, VP9, even old stuff like RealMedia/WMV) via ffmpeg under the hood
- Has a proper software render API (`MPV_RENDER_API_TYPE_SW`) that writes decoded RGBA/YUV frames directly into a caller-owned buffer
- Audio output goes through ALSA/PipeWire natively — mpv handles it, no sync plumbing on your end
- Seeking, subtitles, HDR tone-mapping, hardware decode (`--hwdec=vaapi`) all come free
- The `libmpv` Rust crate exists (`mpv` on crates.io) or you can raw FFI it — it's a thin C API

---

## Frame Delivery Pipeline

Same as libretro:

```
libmpv render callback
  → write RGBA frame to SharedArrayBuffer / shared mem
  → postMessage notification to renderer
  → canvas.putImageData() or texImage2D()
```

For the render API specifically:

```rust
// Rust side — simplified
let params = &[
    mpv_render_param { type_: MPV_RENDER_PARAM_SW_SIZE, data: &[width, height] },
    mpv_render_param { type_: MPV_RENDER_PARAM_SW_FORMAT, data: b"rgb0\0".as_ptr() },
    mpv_render_param { type_: MPV_RENDER_PARAM_SW_STRIDE, data: &(width * 4) },
    mpv_render_param { type_: MPV_RENDER_PARAM_SW_POINTER, data: frame_buffer.as_mut_ptr() },
];
mpv_render_context_render(ctx, params.as_ptr());
// frame_buffer is now a raw RGBA frame → ship it
```

---

## Performance Notes

- 1080p @ 60fps is ~248 MB/s of raw RGBA. Shared memory + `putImageData` is fine for this, same as a libretro core running at native res
- If you want to squeeze more out, keep frames as **YUV** and do the conversion on the GPU with a WebGL shader (standard trick video players use) — cuts the data rate by ~2.5x and offloads the chroma conversion
- Hardware decode (`--hwdec=vaapi`) does the heavy lifting on the CPU side, libmpv just copies the output frame

---

## What You Don't Have to Worry About

- **Audio sync** — mpv owns the audio clock and handles A/V sync internally. You just render the frames it hands you
- **Codec support** — completely decoupled from Chromium's GStreamer/ffmpeg build
- **Container formats** — MKV, MP4, AVI, ISO, whatever — all handled by libmpv's demuxer

---

## The One Difference vs. Libretro

Libretro cores run on a fixed emulation tick, so frame timing is predictable. Video playback has variable frame timing (23.976fps, VFR content, etc.), so you'll want to use mpv's **render update callback** (`mpv_render_context_set_update_callback`) rather than a fixed-interval poll. It fires when a new frame is actually ready to display.

---

## Dependency Concern

`libmpv` will need to be present on the user's system or bundled. On Linux it's almost always available (`libmpv.so.2` via distro packages), but for Flatpak/AppImage distribution you'd need to either bundle it or declare it as a platform dependency. Given you're targeting Linux-first HTPC, system libmpv is probably fine — most people who'd run Ember already have mpv installed.

Honestly it's a minimal extension of what you already built. The libretro module gives you the shared-frame architecture for free.