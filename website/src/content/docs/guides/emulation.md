---
title: GameCube & Wii Emulation
description: Configure Dolphin for launching ROMs from Ember.
---

Ember launches GameCube and Wii ROMs through [Dolphin Emulator](https://dolphin-emu.org/). It supports both Flatpak and native installations.

## Installing Dolphin

### Flatpak (recommended)

```bash
flatpak install flathub org.DolphinEmu.dolphin-emu
```

This keeps Dolphin sandboxed and automatically updated.

### Native package

**Debian / Ubuntu**
```bash
sudo apt install dolphin-emu
```

**Fedora**
```bash
sudo dnf install dolphin-emu
```

**Arch**
```bash
sudo pacman -S dolphin-emu
```

## Auto-fullscreen setup

The Flatpak Dolphin build does **not** expose a `--fullscreen` CLI flag. To get fullscreen launches:

1. Open Dolphin manually once:
   ```bash
   flatpak run org.DolphinEmu.dolphin-emu
   ```
2. Go to **Options → Interface → Start in Fullscreen**
3. Close Dolphin

After that, Ember's batch-mode launches will boot straight into fullscreen.

## xdotool (X11 only)

After launching a game, Ember polls for the Dolphin window and sends `Alt+Return` to auto-fullscreen it. This only works on **X11**.

```bash
# Debian / Ubuntu
sudo apt install xdotool

# Fedora
sudo dnf install xdotool

# Arch
sudo pacman -S xdotool
```

## How it works

1. Ember detects the ROM type by file extension (`.iso`, `.gcm`, `.wbfs`, etc.)
2. It checks for the Flatpak Dolphin first; if missing, falls back to the native `dolphin-emu` binary
3. Launches with `-b` (batch mode) to suppress the GUI
4. On X11, polls for the window and sends the fullscreen keystroke
