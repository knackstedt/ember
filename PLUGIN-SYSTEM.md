# Plugin System

Ember plugins are TypeScript/JavaScript bundles installed under
`~/.config/htpc/plugins/<id>/` (a `manifest.json` + `entryPoint`). They are
compiled at runtime with esbuild (CJS bundle) and executed in an isolated
worker thread — **never** in the main process.

## Execution model

```
main process                     worker_threads
─────────────                    ──────────────────────────
loader.ts                        plugin.worker.ts
  esbuild bundle  ──init──►        vm.createContext({
  PluginHost                        require: permission-gated shim,
  (message bridge)                  console/setTimeout/Buffer/...,
                                 })
                                 factory(require, module, exports)
```

- Each enabled plugin gets its own `PluginHost` + `Worker`. A crash or timeout
  in plugin code cannot take down the main process.
- The `vm` context exposes only a curated global set. `require` resolves only
  whitelisted pure modules (`path`, `events`, `util`, `url`, `buffer`,
  `stream`, `crypto`, `zlib`, ...) plus modules gated behind manifest
  permissions. `require("electron")` always fails.
- The old `getComponent` slot API is unsupported under isolation (functions
  cannot cross the worker boundary); plugins should use `onIpc` + their own
  UI surfaces instead.

## Manifest

```jsonc
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "entryPoint": "index.ts",
  "assetsPath": "assets",          // optional, default "assets"
  "hooks": ["onPluginStart", "onGameStart"],
  "permissions": ["network"],      // optional — see below
  "platforms": ["psx"],
  "type": "game-provider"          // or "theme"
}
```

### Permissions

| permission    | unlocks `require()` of                                  |
|---------------|---------------------------------------------------------|
| `filesystem`  | `fs`, `fs/promises`                                     |
| `network`     | `net`, `http`, `https`, `dgram`, `dns`, `tls`, `fetch`  |
| `subprocess`  | `child_process`, `worker_threads`                       |
| `system`      | `os`, `v8`, `process`                                   |

Everything else (non-builtin modules) is denied — plugins should bundle their
dependencies with esbuild (the loader's own build does this automatically).

## Plugin API (`api`)

Hooks receiving the api as first argument: `activate`, `onPluginInstall`,
`onPluginStart`, `onApplicationBoot`, `onGameStart`, `onGameStop`,
`onGameCrash`. (`onPluginUninstall`, `onPluginUpdate`, `onPluginStop`,
`onApplicationShutdown`, `deactivate` receive no api.)

```ts
api.manifest                          // this plugin's manifest
api.getAssetUrl(rel)                  // ember://plugin/<id>/<rel> (prod) or /plugin/<id>/<rel> (dev)
api.getAssetPath(rel)                 // absolute path inside the plugin dir
api.log(msg)                          // main-process log
api.config.get(key, fallback)         // persisted per-plugin config (config.json)
api.config.set(key, value)            // async write-through
api.registerTheme({ id, name, cssUrl, configSchema? })
api.onIpc(channel, handler)           // registers "plugin:<id>:<channel>" ipcMain.handle
api.registerTab / registerSettingsPanel / registerScanner / addChipFilter
                                      // declared extension points (currently stubs)
```

## Lifecycle

`reloadPlugins()` → deactivate → onPluginStop → worker terminate → re-scan
`PLUGINS_DIR` → compile → `init` → `activate` → `onPluginStart`.
`shutdownPlugins()` does the same teardown on app exit. `unloadPlugin(id)`
stops a single plugin. Enabled/disabled state persists in
`.<id>.state.json`.

## Serving plugin assets

`ember://plugin/<id>/<relpath>` serves files from
`~/.config/htpc/plugins/<id>/<assetsPath>/`. The protocol handler canonicalizes
the path and rejects traversal outside that assets root.

## Security notes

- Plugin `<iframe>`s do **not** get `window.htpc` — the preload only exposes
  the privileged API in the main frame.
- `onIpc` handlers are namespaced (`plugin:<id>:*`) and proxied through the
  worker bridge, so they cannot collide with core channels.
- A plugin that throws inside a hook produces an async rejection routed back
  through the bridge; the plugin is marked errored and disabled, but the app
  keeps running.
