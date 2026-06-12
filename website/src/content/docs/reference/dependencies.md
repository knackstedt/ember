---
title: System Dependencies
description: Complete list of system dependencies for Ember.
---

This page lists all system-level dependencies required to build and run Ember.

## Required for all users

| Dependency | Purpose | Install |
|------------|---------|---------|
| `xdg-utils` | Open files with default handlers | `apt`/`dnf`/`pacman` |
| `ffmpeg` | Thumbnails, metadata, cover art | `apt`/`dnf`/`pacman` |
| `input` group | Controller device access | `usermod -aG input $USER` |

## Required for emulation

| Dependency | Purpose | Install |
|------------|---------|---------|
| `dolphin-emu` | GameCube / Wii emulation | Flatpak or native package |
| `xdotool` | Auto-fullscreen Dolphin (X11 only) | `apt`/`dnf`/`pacman` |

## Required for Windows games

| Dependency | Purpose | Install |
|------------|---------|---------|
| `wine` | Run Windows `.exe` games | `apt`/`dnf`/`pacman` |

## Optional game sources

| Dependency | Purpose | Install |
|------------|---------|---------|
| Steam | Launch Steam games | [store.steampowered.com](https://store.steampowered.com/about/) |
| Heroic | Epic / GOG launcher | `flatpak install flathub com.heroicgameslauncher.hgl` |
| Lutris | Game library | `apt`/`dnf`/`pacman` |

## Build dependencies

| Dependency | Purpose |
|------------|---------|
| Node.js 20+ | Electron app runtime |
| Bun | Package manager, dev server |
| Rust + cargo | Native addons |
| flatpak-builder | Flatpak packaging |
| gcc-aarch64-linux-gnu | ARM64 cross-compilation |
| libasound2-dev | ALSA audio (Rust) |
| rpm | RPM package generation |
