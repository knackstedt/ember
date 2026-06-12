---
title: Installation
description: Install Ember and its system dependencies on Linux.
---

Ember requires a few system-level dependencies beyond the app itself. This guide covers everything needed to get up and running.

## Quick install by distro

### Debian / Ubuntu

```bash
sudo apt update
sudo apt install xdg-utils ffmpeg xdotool wine
sudo usermod -aG input $USER

# Then install Dolphin (pick one):
flatpak install flathub org.DolphinEmu.dolphin-emu
# OR
sudo apt install dolphin-emu
```

### Fedora

```bash
sudo dnf install xdg-utils ffmpeg xdotool wine
sudo usermod -aG input $USER

# Then install Dolphin (pick one):
flatpak install flathub org.DolphinEmu.dolphin-emu
# OR
sudo dnf install dolphin-emu
```

### Arch

```bash
sudo pacman -S xdg-utils ffmpeg xdotool wine
sudo usermod -aG input $USER

# Then install Dolphin (pick one):
flatpak install flathub org.DolphinEmu.dolphin-emu
# OR
sudo pacman -S dolphin-emu
```

:::caution[Input group]
After running `usermod -aG input`, **log out and back in** for the controller access change to take effect.
:::

## Installing Ember

Download the latest release for your platform from the [Releases page](https://github.com/apophis/htpc/releases).

| Format | Install method |
|--------|--------------|
| `.AppImage` | Download, `chmod +x`, and run |
| `.deb` | `sudo apt install ./ember-*.deb` |
| `.rpm` | `sudo rpm -i ember-*.rpm` |
| `.tar.gz` | Extract and run the binary inside |
| Flatpak | `flatpak install --user ember.flatpak` |

## Optional sources

These are only needed if you want Ember to auto-discover titles from the respective launcher.

| Launcher | Install |
|----------|---------|
| **Steam** | Install from [store.steampowered.com](https://store.steampowered.com/about/) |
| **Heroic** | `flatpak install flathub com.heroicgameslauncher.hgl` |
| **Lutris** | `sudo apt install lutris` (Debian) / `sudo dnf install lutris` (Fedora) / `sudo pacman -S lutris` (Arch) |
