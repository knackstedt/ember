---
title: Introduction
description: What Ember is and what it can do.
---

Ember is a **Home Theater PC (HTPC) frontend for Linux**. It brings your games, movies, TV shows, and music into a single, controller-friendly interface designed for the living room.

## What you can do with Ember

- **Browse and launch games** from Steam, Heroic Games Launcher, Lutris, and your local ROM library.
- **Play movies and TV shows** with hardware-accelerated decoding for HEVC, H.264, and more.
- **Listen to music** through your system default player.
- **Navigate everything with a gamepad** — no keyboard or mouse required.

## Supported content

| Type | Sources | Notes |
|------|---------|-------|
| **Games** | Steam, Heroic, Lutris, local ROMs, Windows `.exe` | GameCube / Wii via Dolphin |
| **Movies** | Local files (MKV, MP4, etc.) | Hardware decode via FFmpeg or GStreamer |
| **TV Shows** | Local files | Season / episode detection |
| **Music** | Local files | Launches with system handler |

## Platform support

Ember is built for **Linux** and distributed as:

- `.AppImage` — run without installing
- `.deb` — Debian / Ubuntu
- `.rpm` — Fedora / openSUSE
- `.tar.gz` — universal archive
- **Flatpak** — sandboxed, universal

Both **x86_64** and **ARM64** builds are available.

## Built with

- **Electron** + **React** — cross-platform UI
- **Rust** — native video decoding, libretro frontend, and controller input
- **Tailwind CSS** — consistent, modern styling
- **WebGL** — zero-copy video frame rendering
