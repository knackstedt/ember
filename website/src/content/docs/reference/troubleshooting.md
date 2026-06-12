---
title: Troubleshooting
description: Common issues and how to fix them.
---

## Controller not working

**Symptom:** Controller is connected but Ember does not respond to input.

1. Check that your user is in the `input` group:
   ```bash
   groups $USER
   ```
   If `input` is missing:
   ```bash
   sudo usermod -aG input $USER
   ```
   Then **log out and back in**.

2. Verify the controller is visible to the system:
   ```bash
   ls /dev/input/event*
   ```

3. Some Bluetooth controllers need to be paired in "gamepad mode" (not keyboard/mouse mode).

## Dolphin does not launch fullscreen

**Symptom:** Dolphin opens in windowed mode.

1. Open Dolphin manually once:
   ```bash
   flatpak run org.DolphinEmu.dolphin-emu
   ```
2. Go to **Options → Interface → Start in Fullscreen**
3. Close Dolphin

This setting is saved in Dolphin's config and will apply to all future launches.

## Video thumbnails not generating

**Symptom:** Movie and TV show covers are blank.

1. Verify `ffmpeg` is installed:
   ```bash
   ffmpeg -version
   ```
2. Check that Ember has read access to your media directories.

## Native video decoder not loading

**Symptom:** MKV / HEVC files do not play.

1. Check that `libavcodec` and related libraries are installed:
   ```bash
   # Debian / Ubuntu
   sudo apt install libavcodec-dev libavformat-dev libavutil-dev libswscale-dev
   ```
2. If you are on a system without FFmpeg libraries, Ember will try the GStreamer backend automatically. Ensure GStreamer is installed:
   ```bash
   # Debian / Ubuntu
   sudo apt install libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev
   ```

## AppImage will not run

**Symptom:** Double-clicking the AppImage does nothing.

1. Make it executable:
   ```bash
   chmod +x ember-*.AppImage
   ```
2. Run from terminal to see errors:
   ```bash
   ./ember-*.AppImage
   ```
3. Some distributions require FUSE for AppImage. If missing:
   ```bash
   # Debian / Ubuntu
   sudo apt install libfuse2
   ```
