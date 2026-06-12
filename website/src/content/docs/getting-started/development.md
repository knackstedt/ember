---
title: Development
description: Build Ember from source.
---

This guide covers building Ember from source for development or packaging.

## Prerequisites

- **Node.js 20+**
- **Bun** (package manager)
- **Rust** + **cargo** + **rustup**
- **flatpak-builder** (for Flatpak builds)

### Install Bun

**Debian / Ubuntu / Fedora**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Arch**
```bash
yay -S bun-bin
# or
paru -S bun-bin
```

### Cross-compilation setup (optional)

For ARM64 builds from an x86_64 machine:

```bash
# Add ARM64 architecture
sudo dpkg --add-architecture arm64

# Add ARM64 repositories (replace `noble` with your Ubuntu version)
cat <<EOF | sudo tee /etc/apt/sources.list.d/ubuntu-ports-arm64.list
deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble main restricted universe multiverse
deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble-updates main restricted universe multiverse
deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble-security main restricted universe multiverse
EOF

sudo apt update
sudo apt install gcc-aarch64-linux-gnu libc6-dev-arm64-cross flatpak-builder rpm libasound2-dev:arm64

# Rust target
rustup target add aarch64-unknown-linux-gnu
```

## Install dependencies

```bash
bun install
```

## Development server

```bash
bun run dev
```

This starts the Electron app with hot reload for both the main and renderer processes.

## Build for production

```bash
bun run build
```

## Build distribution packages

Builds all configured Linux targets for both x64 and arm64:

```bash
bun run dist
```

Build a specific target:

```bash
bun run dist --linux deb
bun run dist --linux flatpak
bun run dist --linux AppImage
```

:::note[RPM builds]
`.rpm` requires `rpmbuild`. On Debian/Ubuntu: `sudo apt install rpm`.
:::
