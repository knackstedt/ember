# Ember

A Home Theater PC frontend for Linux. Browse and launch games, movies, TV shows, and music from the couch with controller support.

For system dependencies (Dolphin emulator, ffmpeg, xdotool, etc.), see [`SETUP.md`](SETUP.md).

---

## Development

### Prerequisites

- **Node.js 20+** (for running `electron-vite`)
- **Bun** (package manager, dev server, build runner)

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


