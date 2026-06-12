---
title: Video Decoder
description: Dual-backend native video decoding in Ember.
---

Ember's video decoder is a dual-backend native Rust module with zero-copy frame delivery into a `SharedArrayBuffer`.

## Backends

### FFmpeg (preferred)

Uses the `ffmpeg-next` crate. Tries hardware-accelerated NVDEC decoders first:

- `h264_cuvid`
- `hevc_cuvid`
- `av1_cuvid`

If hardware decode is unavailable, it falls back to software decode.

### GStreamer (fallback)

Uses `gstreamer` / `gstreamer-app` crates with a pipeline:

```
uridecodebin → videoconvert → appsink
```

## Why two separate `.node` files

FFmpeg and GStreamer link against different C libraries. If both were linked into the same `.node`, missing runtime libraries would prevent the addon from loading at all.

By building two variants and trying them at runtime, Ember gracefully degrades if only one set of libraries is present:

- `video-decoder-ffmpeg.node`
- `video-decoder-gstreamer.node`

## Renderer integration

| Component | Purpose |
|-----------|---------|
| `useNativeVideo.ts` | React hook managing decoder lifecycle, SAB, WebGL renderer, and rAF frame pump |
| `webgl-renderer.ts` | WebGL texture renderer for RGBA frames |
| `VideoPlayer.tsx` | Dual-mode player: `<video>` element for MP4/WebM/H.264, native decoder + WebGL canvas for MKV/HEVC |
| `video-decoder.service.ts` | Main-process service that loads the correct `.node` backend at runtime |
| `ipc/index.ts` | IPC handlers bridging renderer → main → Rust decoder |

## URL resolution

Before passing URLs to FFmpeg, Ember resolves them:

- `ember://media/<path>` → local filesystem path
- `ember://remote/<sourceId>/<path>` → `http://localhost:<port>/<path>`
