# Security Model

Ember is a local-first media frontend, but it renders untrusted content
(third-party plugins, remote streams, scraped metadata, injected webviews).
This document describes the trust boundaries and where new code must plug in.

## Renderer sandboxing

Every `BrowserWindow` runs with:

```ts
sandbox: true, contextIsolation: true, nodeIntegration: false
```

- The preload (`src/preload/index.ts`) exposes a single `window.htpc` API via
  `contextBridge`, and **only in the main frame** — `window.self ===
  window.top` is checked before exposure so plugin `<iframe>`s and webviews
  do not inherit the privileged surface.
- The preload holds no Node capabilities: no `fs`, `child_process`, `dlopen`,
  or `process.env`. Anything that needs the filesystem or a subprocess is an
  `ipcRenderer.invoke` call into a main-process handler.
- Streaming/Store `<webview>`s carry their own restrictive
  `webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"` and
  dedicated preloads (`streaming-preload.ts`, `splitscreen-preload.ts`,
  `flash-capture-preload.ts`).

## Media allowlist

`src/main/services/media-access.service.ts` maintains a set of canonical
(realpath-resolved) filesystem paths the renderer is allowed to read:

- seeded from DB-recorded media paths (ROMs, videos, covers, thumbnails),
- extended when the user picks a file/dir via a dialog (`registerAllowedPath`),
- sibling/cache paths handled explicitly (scaled-cover cache, subtitle lookup).

Gated consumers:

| Surface                    | Check                                    |
|----------------------------|------------------------------------------|
| `ember://media/<path>`     | allowlist before stat/stream             |
| `files:read`               | allowlist before `readFile`              |
| `ffmpeg:open` / `mpv:open` | absolute paths gated; `http(s)://` pass  |
| `flash-capture:swf`        | allowlist before `readFileSync`          |
| `libretro:detectChdPlatform` | allowlist before header sniff          |
| `themes:getCss`            | resolved path must stay inside theme dir |

When adding any IPC handler or protocol host that returns file contents,
route it through `isMediaAccessAllowed` / `resolveEmberLocalPath` (in
`src/main/util/ember-protocol.ts`) rather than open-coding a path check —
substring `".."` checks are not sufficient.

## Process isolation

- **libretro** runs in a `child_process` (dynarec cores install V8-conflicting
  signal handlers). IPC uses `serialization: "advanced"` — Buffers cross
  without base64.
- **mpv** runs in a `child_process` spawned with *system* Node (Electron's
  bundled libffmpeg.so conflicts with libmpv). Frames travel over a binary fd
  pipe, control over IPC.
- **plugins** each run in a `worker_threads` isolate + `vm` context with a
  permission-gated `require` shim (see PLUGIN-SYSTEM.md).

## Input validation rules

- Never interpolate renderer-supplied strings into shell commands.
- Renderer-supplied absolute paths must pass the media allowlist before any
  filesystem access that returns data (or spawns a decoder that streams data
  back).
- `shell:openExternal` only accepts `http(s):`/`mailto:` URLs.
- Plugin IPC channels are always prefixed `plugin:<id>:` by the host — plugin
  code cannot register arbitrary channel names.

## Known limitations

- The media allowlist is policy, not a hard sandbox — a compromised main
  process is still full Node. The worker/vm isolation bounds plugin blast
  radius, not a hostile main.
- `webSecurity: false` remains on the hidden flash-capture window (needed for
  `file://` Ruffle assets under a `data:` page). It loads only app-generated
  HTML, has `nodeIntegration` off, and is sandboxed.
- `ipcRenderer.sendSync` is used once (`mpv:available`) at preload init.
