# Ember

A Home Theater PC frontend for Linux. Browse and launch games, movies, TV shows, and music from the couch with controller support.

> **Alpha Software**: This application is in an early alpha state. Expect breaking changes, incomplete features, and bugs. Nothing is guaranteed to work — use at your own risk.

For system dependencies (Dolphin emulator, ffmpeg, xdotool, etc.), see [`SETUP.md`](SETUP.md).

---

## Development

### Prerequisites

- **flatpak-builder** (for building Flatpak packages)
- **rust** (for building native dependencies)
- **cargo** (Rust package manager)
- **rustup** (Rust toolchain manager)
- **Node.js 20+** (for running `electron-vite`)
- **Bun** (package manager, dev server, build runner)

#### Debian/Ubuntu
```bash
sudo dpkg --add-architecture arm64
```

Configure apt for multi-arch support
```bash
# Quick sed pass to add arch=amd64 where not already present
sudo sed -i 's/^deb \(https\?:\/\/\)/deb [arch=amd64] \1/' /etc/apt/sources.list
sudo sed -i 's/^deb \(https\?:\/\/\)/deb [arch=amd64] \1/' /etc/apt/sources.list.d/*.list
```

Add ARM64 repositories for cross-compilation
Replace `noble` with your Ubuntu version (e.g., `jammy`, `focal`, `bionic`)
```bash
cat <<EOF | sudo tee /etc/apt/sources.list.d/ubuntu-ports-arm64.list
deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble main restricted universe multiverse
deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble-updates main restricted universe multiverse
deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports noble-security main restricted universe multiverse
EOF
```

Install cross-compilation tools
```bash
sudo apt update
sudo apt install gcc-aarch64-linux-gnu libc6-dev-arm64-cross flatpak-builder rpm libasound2-dev:arm64 gcc-aarch64-linux-gnu
```

### Additional setup for cross-compilation

```bash
# Install the Rust target for ARM64
rustup target add aarch64-unknown-linux-gnu

# Add arm64 architecture to dpkg
sudo dpkg --add-architecture arm64

# Update apt and install arm64 ALSA libraries (required for Rust cross-compilation)
sudo apt update
sudo apt install libasound2-dev:arm64

# Install Flatpak runtimes for both architectures
flatpak install flathub org.freedesktop.Platform/x86_64/23.08 org.freedesktop.Sdk/x86_64/23.08 org.electronjs.Electron2.BaseApp/x86_64/23.08
flatpak install flathub org.freedesktop.Platform/aarch64/23.08 org.freedesktop.Sdk/aarch64/23.08 org.electronjs.Electron2.BaseApp/aarch64/23.08
```

### Install Bun

- **Debian / Ubuntu / Fedora**
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Arch**
  ```bash
  yay -S bun-bin
  # or
  paru -S bun-bin
  ```

### Install dependencies

```bash
bun install
```

### Run in development (hot reload)

```bash
bun run dev
```

### Build for production

```bash
bun run build
```

### Preview production build

```bash
bun run preview
```

### Build distribution packages

Builds all configured Linux targets (AppImage, deb, rpm, tar.gz, flatpak) for both x64 and arm64:

```bash
bun run dist
```

To build a specific target:

```bash
bun run dist --linux deb
bun run dist --linux flatpak
bun run dist --linux AppImage
```

**Notes:**
- `.rpm` requires `rpmbuild` (`sudo apt install rpm` on Debian/Ubuntu)
- ARM64 cross-compilation of the Rust native addon requires `rustup target add aarch64-unknown-linux-gnu` and a cross-compilation sysroot for `alsa-sys`. The build script will skip the ARM64 native addon if cross-compilation is not set up; the Electron app itself will still build for ARM64.
- Flatpak builds require both `x86_64` and `aarch64` runtimes to be installed (see **Additional setup for cross-compilation** above).


