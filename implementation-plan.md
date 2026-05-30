# HTPC Electron Application — Full Scaffold

Build a GPU-accelerated, plugin-extensible HTPC application with Electron + React + TypeScript, covering gaming, movies, music, TV shows, casting, and controller management with a flushed-out scaffold and well-defined stubs for complex subsystems.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Build system | `electron-vite` | Vite-native, fastest HMR, built-in preload bundling |
| Renderer | React 18 + TypeScript | ReactBits compatibility, ecosystem |
| Styling | Tailwind CSS + CSS custom properties | Theme switching via `data-theme` attribute |
| Virtual scrolling | `virtua` | Lightest modern scroller, ResizeObserver-based, native grid support, better perf than react-window |
| Animations | Framer Motion + ReactBits | GPU-composited transitions, reactive backgrounds |
| State | Zustand | Minimal, performant, no boilerplate |
| DB | `@surrealdb/node` embedded (SurrealKV) | File-backed, no separate server, graph queries for tags/relations |
| Input | `evdev` (main process, `/dev/input/eventX`) | Reads raw kernel events — works even when a game process has window focus; single provider covers gamepads, keyboard, Wiimote (bluez HID) |
| Game metadata | RAWG (no key) + ProtonDB (open) | Open-access |
| Music metadata | MusicBrainz REST (no key) + AcoustID fingerprinting | Fully open, no registration |
| Movie/TV metadata | TMDB (free key) + ffprobe for technical | Best coverage; free key = open in practice |
| Package manager | `bun` | Fast installs, built-in TS runner |

---

## GPU Acceleration Flags & Techniques

- Electron launch flags: `--enable-gpu-rasterization`, `--enable-zero-copy`, `--enable-accelerated-video-decode`, `--ignore-gpu-blocklist`
- CSS: `will-change: transform` + `transform: translateZ(0)` on all scrollable containers and cards
- `contain: layout style paint` on grid cells
- `requestAnimationFrame`-driven scroll physics (elastic overscroll)
- WebGL backgrounds via ReactBits (Aurora, Particles, StarField) per-theme
- `OffscreenCanvas` in a Web Worker for thumbnail processing
- Framer Motion `layoutId`-based shared element transitions between grid → detail view

---

## Theme System

Themes are CSS custom property sets toggled via `data-theme="..."` on `<html>`. Bundled themes:

- `dark-oled` — black bg, high contrast accent
- `glassmorphism` — frosted glass panels, blur backdrops
- `neon-cyberpunk` — neon glow, scanlines, grid overlays
- `terminal-tui` — monospace, ASCII borders, CRT phosphor
- `custom` — user-defined property overrides in settings

Each theme exports a `ThemeConfig` (background component, CSS vars, optional WebGL layer).

---

## Project Structure

```
htpc/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json (+ tsconfig.node.json, tsconfig.web.json)
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # BrowserWindow creation, GPU flags
│   │   ├── ipc/                 # IPC handler registry
│   │   │   ├── index.ts
│   │   │   ├── media.ipc.ts
│   │   │   ├── games.ipc.ts
│   │   │   ├── plugins.ipc.ts
│   │   │   └── input.ipc.ts
│   │   ├── scanners/
│   │   │   ├── steam.scanner.ts      # appmanifest_*.acf + grid images
│   │   │   ├── dolphin.scanner.ts    # ROM dirs + cover art
│   │   │   ├── desktop.scanner.ts    # .desktop files, Games category
│   │   │   ├── music.scanner.ts      # XDG Music + music-metadata
│   │   │   ├── video.scanner.ts      # XDG Videos + ffprobe
│   │   │   └── xdg.ts               # XDG base dir resolution
│   │   ├── services/
│   │   │   ├── rawg.service.ts       # RAWG game metadata
│   │   │   ├── tmdb.service.ts       # TMDB movies/TV
│   │   │   ├── protondb.service.ts   # ProtonDB compat ratings
│   │   │   ├── casting.service.ts    # castv2-receiver scaffold
│   │   │   └── launcher.service.ts   # spawn game/app processes
│   │   ├── plugins/
│   │   │   ├── loader.ts            # esbuild compile + source maps
│   │   │   ├── registry.ts          # loaded plugin manifest
│   │   │   └── api.ts               # plugin API surface (typed)
│   │   ├── input/
│   │   │   ├── wiimote.ts           # node-hid Wiimote handling
│   │   │   └── mapping.store.ts     # button → action map (SQLite)
│   │   └── db/
│   │       ├── index.ts             # better-sqlite3 init
│   │       └── schema.ts            # migrations
│   ├── preload/
│   │   └── index.ts                 # contextBridge — typed HTPC API
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx                  # Tab router + theme provider
│       ├── themes/
│       │   ├── index.ts             # ThemeConfig type + registry
│       │   ├── dark-oled.ts
│       │   ├── glassmorphism.ts
│       │   ├── neon-cyberpunk.ts
│       │   └── terminal-tui.ts
│       ├── components/
│       │   ├── VirtualGrid/         # TanStack Virtual grid wrapper
│       │   ├── MediaCard/           # Cover + metadata card
│       │   ├── ChipFilters/         # Filter chip row
│       │   ├── OnScreenKeyboard/    # Gamepad-triggered OSK
│       │   ├── FocusManager/        # Spatial focus navigation
│       │   ├── DetailPanel/         # Slide-in media detail view
│       │   └── ThemeBackground/     # Per-theme WebGL/CSS bg layer
│       ├── tabs/
│       │   ├── Gaming/
│       │   │   ├── index.tsx        # Sub-tab shell
│       │   │   ├── AllGames.tsx
│       │   │   ├── Steam.tsx
│       │   │   ├── GOG.tsx
│       │   │   ├── Lutris.tsx
│       │   │   ├── Heroic.tsx
│       │   │   ├── Dolphin.tsx      # GC + Wii sub-tabs
│       │   │   ├── Emulators.tsx    # NES/SNES/GB/GBA stubs
│       │   │   ├── Flash.tsx        # Ruffle webview
│       │   │   └── CouchCoop.tsx    # Multi-player filter view
│       │   ├── Movies/
│       │   │   ├── index.tsx
│       │   │   ├── Local.tsx
│       │   │   └── Streaming.tsx    # Placeholder cards
│       │   ├── Music/
│       │   │   ├── index.tsx
│       │   │   ├── Local.tsx
│       │   │   └── Streaming.tsx
│       │   ├── TVShows/
│       │   │   ├── index.tsx
│       │   │   └── Local.tsx
│       │   ├── Settings/
│       │   │   └── index.tsx        # Paths, theme, APIs, plugins
│       │   └── Controllers/
│       │       └── index.tsx        # Detection + button mapping UI
│       ├── store/
│       │   ├── media.store.ts       # Zustand — movies, music, TV
│       │   ├── games.store.ts       # Zustand — all game sources
│       │   ├── settings.store.ts
│       │   └── input.store.ts       # Active controller state
│       └── plugins/
│           ├── PluginSlot.tsx       # Mount point for plugin components
│           └── hooks.ts             # usePlugin(), usePluginSlot()
├── plugins/                         # Bundled example plugin (TypeScript)
│   └── example-plugin/
│       ├── index.ts
│       └── manifest.json
└── resources/
    └── icon.png
```

---

## Implementation Phases

### Phase 1 — Project Bootstrap
- `electron-vite` + React 18 + TypeScript scaffold
- `bun` workspace, all dependencies wired
- Tailwind + CSS custom properties, all 4 themes defined
- IPC bridge (`contextBridge`) typed API
- SurrealDB embedded (SurrealKV) schema: `media`, `game`, `favorite`, `tag`, `setting`, `controller_mapping` tables with graph relations (e.g. `game -> tag`, `media -> favorite`)
- GPU acceleration flags in main process
- Window mode: **windowed by default** (dev-friendly); `fullscreen` setting in SurrealDB persists user preference and is applied on next launch

### Phase 2 — Core UI Shell
- App tab bar (Gaming, Movies, Music, TV Shows, Settings, Controllers)
- `VirtualGrid` wrapping `virtua` `VGrid` component
- `MediaCard` (cover image, title, subtitle, badge, favorite star)
- `ChipFilters` (single-select chip row, animated underline)
- `FocusManager` (spatial D-pad nav, wraps VirtualGrid)
- `ThemeBackground` (per-theme WebGL/CSS animated layer via ReactBits)
- Theme switcher in Settings

### Phase 3 — Input System
- `evdev` in main process reads `/dev/input/eventX` raw kernel events — single provider for gamepads, keyboard, Wiimote (via bluez HID), unaffected by external game process focus
- Device type identified by VID/PID + axis/button topology (Xbox / PS1/2/4/5 / GC / Wii mappings)
- Main process emits normalized `InputEvent` IPC messages to renderer (~60fps)
- `OnScreenKeyboard` triggered on any `<input>` focus when last event source was non-keyboard
- Controllers tab: visual controller diagram + button rebinding UI per detected device
- Flash game controller → keyboard mapping (configurable per `.swf`)
- **Note**: evdev requires user in `input` group; README will document

### Phase 4 — Game Scanners
- **Steam**: parse `~/.steam/steam/steamapps/appmanifest_*.acf`, fetch grid art from `~/.steam/steam/userdata/.../config/grid/`
- **Dolphin**: scan configured ROM dirs, match CRC to cover DB (stub)
- **.desktop**: XDG apps dirs, `Categories=Game`, verify `Exec` target exists
- **Heroic/GOG/Lutris**: parse their JSON game library files
- RAWG metadata fetch + SurrealDB cache (debounced, offline-first)
- ProtonDB rating fetch for non-native titles

### Phase 5 — Gaming Tab UI
- Sub-tabs: All | Steam | GOG | Lutris | Heroic | Dolphin | Emulators | Flash | Couch-Coop
- Chip filters (platform, player count, genre, ProtonDB rating)
- Game detail panel: description, screenshots, ProtonDB rating, launch button
- Dolphin launcher: `dolphin-emu --exec=<path>` with per-game config override DB
- Ruffle: `<webview>` loading Ruffle WASM + `.swf` — isolated renderer
- Emulator stubs: `EmulatorCore` interface defined, RetroArch CLI launcher placeholder
- AI upscaling: `AIUpscaleConfig` interface defined, stub hook in launcher

### Phase 6 — Movies Tab
- `ffprobe` metadata extraction (title, duration, resolution, codec)
- TMDB API (free key required — user configures in Settings) + SurrealDB cache
- Local grid view with genre/year/director chips
- Streaming section: placeholder cards (Netflix, Prime, Disney+, Hulu) opening URLs
- Favorites + custom tags

### Phase 7 — Music Tab
- `music-metadata` extraction (ID3, FLAC, OGG tags) + album art extraction
- MusicBrainz REST API for artist/release enrichment (no key needed)
- AcoustID fingerprinting for untagged files (`chromaprint` CLI + AcoustID open API)
- Artist / Album / Genre / Year chip filters
- Streaming placeholders (Spotify, Apple Music, YouTube Music)
- Favorites + custom tags

### Phase 8 — TV Shows Tab
- Folder-structure detection (`Show/Season X/episode.mkv`)
- TMDB series + episode metadata (same free key as movies)
- Genre/year chip filters
- Episode list view under show detail panel

### Phase 9 — Plugin System
- Plugin discovery: `~/.config/htpc/plugins/*/manifest.json` OR single `.ts` files
- `esbuild` compile at load time, full source map output
- Error boundary wraps each plugin; stack traces de-minified via `source-map` package
- Plugin API: register tab, register settings panel, register IPC handler, register media scanner, add chip filter, add context menu item
- `PluginSlot` components in every major UI location
- Example plugin bundled in repo (`plugins/example-plugin/`)

### Phase 10 — Chromecast Receiver Scaffold
- `castv2-receiver` or `@koush/multicast-dns` mDNS advertisement
- Device presents as Chromecast on local network
- Stub media session handler (video/audio/image)
- Note in UI: "Cast Sender support planned for future release"

### Phase 11 — Settings Tab
- XDG path overrides (movies, music, games, ROMs)
- Theme selection with live preview
- API key fields (RAWG, TMDB — optional, improves rate limits)
- Controller polling rate
- Plugin manager (enable/disable, reload)
- Startup options (fullscreen, default tab)

---

## Key Dependencies

```json
{
  "electron": "^30",
  "electron-vite": "^2",
  "react": "^18",
  "virtua": "^0.38",
  "framer-motion": "^11",
  "zustand": "^4",
  "@surrealdb/node": "^1",
  "music-metadata": "^10",
  "node-evdev": "^2",
  "esbuild": "^0.21",
  "source-map": "^0.7",
  "tailwindcss": "^3",
  "typescript": "^5"
}
```

> Package manager: **bun**. Run `bun install`, `bun run dev`, etc.

---

## Stubs / Future Work (Explicitly Marked in Code)

- `// STUB: RetroArch libretro core embedding` — NES/SNES/GB/GBA
- `// STUB: AI upscaling pipeline (waifu2x / Real-ESRGAN integration)`
- `// STUB: Dolphin cover art CRC database`
- `// STUB: Chromecast sender mode`
- `// STUB: Curated flash game library`
- `// STUB: Per-game Dolphin config database`
