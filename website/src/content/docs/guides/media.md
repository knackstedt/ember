---
title: Media Setup
description: Configure movies, TV shows, and music libraries.
---

Ember can scan and play your local media collection. This guide covers how to organize your files and what formats are supported.

## Supported formats

| Type | Formats |
|------|---------|
| **Video** | MKV, MP4, AVI, MOV, WebM, H.264, HEVC/H.265, AV1 |
| **Audio** | MP3, FLAC, OGG, WAV, AAC, OPUS |
| **Subtitles** | SRT, ASS, SSA (embedded or external) |

## Video playback

Ember uses a dual-backend native video decoder with zero-copy frame delivery:

1. **FFmpeg** (preferred) — tries hardware-accelerated NVDEC decoders first (`h264_cuvid`, `hevc_cuvid`), then falls back to software decode
2. **GStreamer** (fallback) — `uridecodebin → videoconvert → appsink` pipeline

For MP4, WebM, and H.264, Ember falls back to the browser's built-in `<video>` element for maximum efficiency. For MKV, HEVC, and other advanced formats, the native decoder + WebGL renderer is used.

## Organizing your library

### Movies

Place movie files in a single folder or use subfolders:

```
Movies/
  The Matrix (1999).mkv
  Inception (2010).mp4
```

### TV Shows

Use season folders for proper episode detection:

```
TV Shows/
  Breaking Bad/
    Season 01/
      Breaking Bad - S01E01.mkv
      Breaking Bad - S01E02.mkv
```

### Music

```
Music/
  Artist Name/
    Album Name/
      01 - Track Title.flac
```

## Thumbnails & metadata

Ember uses `ffmpeg` / `ffprobe` to:

- Extract video metadata (duration, resolution, codec)
- Generate thumbnail screenshots
- Extract embedded cover art from video files

Make sure `ffmpeg` is installed. See [Installation](/htpc/getting-started/installation/) for distro-specific commands.
