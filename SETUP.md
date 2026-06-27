# Ember — Linux Setup Guide

This document covers all system-level dependencies required to build and run Ember on Linux, organized by what each dependency is used for and how to install it on your distribution.

For development-specific setup (installing Bun, running the dev server, building from source), see `README.md`.

---

## Input (Gamepads / Controllers)

### `input` group membership
Ember reads controller events directly from `/dev/input/event*` using a pure Node.js binary reader. Your user must be a member of the `input` group to access these device nodes without root.

**All distros:**
```bash
sudo usermod -aG input $USER
# Log out and back in for the change to take effect
```

---

## Game Launching

### `xdg-utils` (provides `xdg-open`)
Used to open Steam games, movies, music tracks, and TV episodes with the system's default application handler.

- **Debian / Ubuntu**
  ```bash
  sudo apt install xdg-utils
  ```
- **Fedora**
  ```bash
  sudo dnf install xdg-utils
  ```
- **Arch**
  ```bash
  sudo pacman -S xdg-utils
  ```

### `dolphin-emu` — GameCube / Wii emulation
Required to launch GameCube and Wii ROMs. Ember supports two installation methods:

1. **Flatpak** (recommended — keeps the emulator sandboxed and up to date)
   ```bash
   flatpak install flathub org.DolphinEmu.dolphin-emu
   ```
2. **Native package** (fallback)
   - **Debian / Ubuntu**
     ```bash
     sudo apt install dolphin-emu
     ```
   - **Fedora**
     ```bash
     sudo dnf install dolphin-emu
     ```
   - **Arch**
     ```bash
     sudo pacman -S dolphin-emu
     ```

> **Note:** The Flatpak version is checked first. If it is installed, Ember will use it automatically; otherwise it falls back to the native binary.

### `xdotool`
After launching a GameCube / Wii game, Ember polls for the Dolphin window and sends `Alt+Return` to auto-fullscreen it. This only works on **X11**.

- **Debian / Ubuntu**
  ```bash
  sudo apt install xdotool
  ```
- **Fedora**
  ```bash
  sudo dnf install xdotool
  ```
- **Arch**
  ```bash
  sudo pacman -S xdotool
  ```

### `wine`
Used to run Windows `.exe` games discovered by the Windows game scanner (e.g. Heroic backups, manual installs in `~/Games`).

- **Debian / Ubuntu**
  ```bash
  sudo apt install wine
  ```
- **Fedora**
  ```bash
  sudo dnf install wine
  ```
- **Arch**
  ```bash
  sudo pacman -S wine
  ```

### Steam (optional)
Not a strict dependency, but required if you want to launch Steam games via `steam://rungameid/...` URLs.

- **Debian / Ubuntu** — install from [https://store.steampowered.com/about/](https://store.steampowered.com/about/)
- **Fedora** — `sudo dnf install steam`
- **Arch** — `sudo pacman -S steam`

---

## Media Thumbnails & Metadata

### `ffmpeg` (includes `ffprobe`)
Required for the movie and TV show scanner to:
- Extract video metadata (duration, resolution, codec)
- Generate thumbnail screenshots
- Extract embedded cover art from video files

- **Debian / Ubuntu**
  ```bash
  sudo apt install ffmpeg
  ```
- **Fedora**
  ```bash
  sudo dnf install ffmpeg
  ```
- **Arch**
  ```bash
  sudo pacman -S ffmpeg
  ```

---

## Optional Game Sources

These are only needed if you want Ember to auto-discover games from the respective launcher.

### Heroic Games Launcher
Epic / GOG launcher. Ember reads its library JSON files directly.

- **Flatpak:** `flatpak install flathub com.heroicgameslauncher.hgl`
- **Native:** see [Heroic's official install guide](https://heroicgameslauncher.com/)

### Lutris
Ember reads `~/.local/share/lutris/games/*.json` to discover Lutris-installed titles.

- **Debian / Ubuntu** — `sudo apt install lutris`
- **Fedora** — `sudo dnf install lutris`
- **Arch** — `sudo pacman -S lutris`

---

## Shader Injection (Optional)

Ember can inject post-processing shaders (CRT, bloom, edge-detect, etc.) into games via two mechanisms:

- **GL Hook** (`libember_gl_hook.so`) — LD_PRELOAD-based OpenGL/EGL interception for native Linux OpenGL games
- **Vulkan Layer** (`VkLayer_ember_shader.so`) — Vulkan instance layer for native Vulkan games

Both are built automatically by `bun scripts/build-native.ts` (called during `postinstall`, `predev`, `prebuild`, and `predist`). If the required headers are missing, the builds are skipped silently — shader injection simply won't be available.

### C/C++ Compiler
Required to build the GL hook and Vulkan layer.

- **Debian / Ubuntu** — `sudo apt install gcc g++`
- **Fedora** — `sudo dnf install gcc gcc-c++`
- **Arch** — `sudo pacman -S gcc`

### OpenGL / EGL Development Headers
Required for the GL hook (OpenGL shader injection for native Linux games like MewnBase, Chronicon).

- **Debian / Ubuntu**
  ```bash
  sudo apt install libgl-dev libegl-dev
  ```
- **Fedora**
  ```bash
  sudo dnf install mesa-libGL-devel mesa-libEGL-devel
  ```
- **Arch**
  ```bash
  sudo pacman -S mesa libglvnd
  ```

### Vulkan Development Headers
Required for the Vulkan layer (shader injection for Vulkan games).

- **Debian / Ubuntu**
  ```bash
  sudo apt install libvulkan-dev
  ```
- **Fedora**
  ```bash
  sudo dnf install vulkan-headers vulkan-loader-devel
  ```
- **Arch**
  ```bash
  sudo pacman -S vulkan-headers vulkan-icd-loader
  ```

### Shader Compiler (optional)
Only needed if modifying the Vulkan layer's built-in shaders. Pre-compiled SPIR-V headers are committed to the repo, so this is not required for normal builds.

- **Debian / Ubuntu** — `sudo apt install glslang-tools xxd`
- **Fedora** — `sudo dnf install glslang vim-common`
- **Arch** — `sudo pacman -S glslang vim`

---

## Quick Install — All Required Dependencies

Copy and paste the block for your distro:

### Debian / Ubuntu
```bash
sudo apt update
sudo apt install xdg-utils ffmpeg xdotool wine gcc g++ libgl-dev libegl-dev libvulkan-dev
sudo usermod -aG input $USER
# Then install bun: curl -fsSL https://bun.sh/install | bash
# Then install Dolphin (pick one):
#   flatpak install flathub org.DolphinEmu.dolphin-emu
#   sudo apt install dolphin-emu
```

### Fedora
```bash
sudo dnf install xdg-utils ffmpeg xdotool wine gcc gcc-c++ mesa-libGL-devel mesa-libEGL-devel vulkan-headers vulkan-loader-devel
sudo usermod -aG input $USER
# Then install bun: curl -fsSL https://bun.sh/install | bash
# Then install Dolphin (pick one):
#   flatpak install flathub org.DolphinEmu.dolphin-emu
#   sudo dnf install dolphin-emu
```

### Arch
```bash
sudo pacman -S xdg-utils ffmpeg xdotool wine gcc mesa libglvnd vulkan-headers vulkan-icd-loader
sudo usermod -aG input $USER
# Then install bun: yay -S bun-bin  (or curl install)
# Then install Dolphin (pick one):
#   flatpak install flathub org.DolphinEmu.dolphin-emu
#   sudo pacman -S dolphin-emu
```

---

## Post-Install: Dolphin Fullscreen

The Flatpak Dolphin build does **not** expose a `--fullscreen` CLI flag. To get fullscreen launches:

1. Open Dolphin manually once:
   ```bash
   flatpak run org.DolphinEmu.dolphin-emu
   ```
2. Go to **Options → Interface → Start in Fullscreen**
3. Close Dolphin

After that, Ember's `-b` (batch mode) launches will boot straight into fullscreen.

---

Once dependencies are installed, see `README.md` for build and run instructions.
