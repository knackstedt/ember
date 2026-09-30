/**
 * Plugin worker thread — runs a single plugin's bundled code inside a vm
 * context within this isolate.
 *
 * Two-layer isolation:
 *  1. worker_threads gives the plugin its own V8 isolate — no shared heap
 *     with the main process, and no Electron main-process APIs.
 *  2. The vm context controls which globals the bundle can reach: a
 *     permission-gated require() shim, no `process`, no `parentPort`.
 *
 * Message protocol (parentPort):
 *   main → worker:  { type: "init", manifest, pluginsDir, code, config, isDev }
 *                   { type: "hook", id, hook, args }
 *                   { type: "ipc-invoke", id, channel, args }
 *                   { type: "shutdown" }
 *   worker → main:  { type: "ready", exports: string[] } | { type: "init-error", error }
 *                   { type: "hook-result", id, result?, error? }
 *                   { type: "ipc-result", id, result?, error? }
 *                   { type: "api", call, args }   (fire-and-forget api bridge)
 */

import { join } from "path";
import { parentPort } from "worker_threads";

interface PluginManifestLike {
  id: string;
  name?: string;
  version?: string;
  entryPoint: string;
  assetsPath?: string;
  permissions?: string[];
}

// ---------------------------------------------------------------------------
// Permission model
// ---------------------------------------------------------------------------

const ALWAYS_ALLOWED = new Set([
  "path", "events", "util", "url", "querystring", "buffer", "stream",
  "crypto", "zlib", "string_decoder", "assert", "punycode", "timers",
]);

const PERMISSION_MODULES: Record<string, string[]> = {
  filesystem: ["fs", "fs/promises"],
  network: ["net", "http", "https", "dgram", "dns", "tls"],
  subprocess: ["child_process", "worker_threads"],
  system: ["os", "v8", "process"],
};

export function permissionFor(moduleName: string): string | null {
  const bare = moduleName.replace(/^node:/, "");
  for (const [perm, mods] of Object.entries(PERMISSION_MODULES)) {
    if (mods.includes(bare)) return perm;
  }
  return null;
}

export function makeRequireShim(manifest: PluginManifestLike): (name: string) => unknown {
  const permissions = new Set(manifest.permissions ?? []);
  return (name: string) => {
    const bare = name.replace(/^node:/, "");
    if (bare === "electron") {
      throw new Error(`Plugin '${manifest.id}': require("electron") is not available; use the plugin api`);
    }
    if (ALWAYS_ALLOWED.has(bare)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(bare);
    }
    const perm = permissionFor(bare);
    if (perm && permissions.has(perm)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(bare);
    }
    if (perm) {
      throw new Error(`Plugin '${manifest.id}' requires permission '${perm}' for module '${name}'`);
    }
    // Unknown / non-builtin module — deny. Plugins should bundle deps via esbuild.
    throw new Error(`Plugin '${manifest.id}': module '${name}' is not allowed`);
  };
}

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let manifest: PluginManifestLike | null = null;
let pluginsDir = "";
let pluginDir = "";
let isDev = false;
let config: Record<string, unknown> = {};
let pluginModule: Record<string, unknown> = {};
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();

function post(msg: Record<string, unknown>): void {
  parentPort?.postMessage(msg);
}

function apiCall(call: string, args: unknown[]): void {
  post({ type: "api", call, args });
}

function buildApi(m: PluginManifestLike): Record<string, unknown> {
  const cleanAsset = (p: string) => String(p).replace(/^\/+/, "");
  return {
    manifest: m,
    registerTab: (id: string, label: string) => apiCall("registerTab", [id, label]),
    registerSettingsPanel: (id: string, label: string) => apiCall("registerSettingsPanel", [id, label]),
    registerScanner: (id: string) => apiCall("registerScanner", [id]),
    registerTheme: (theme: unknown) => apiCall("registerTheme", [theme]),
    addChipFilter: (tab: string, filter: { id?: string; label?: string }) =>
      apiCall("addChipFilter", [tab, { id: filter?.id, label: filter?.label }]),
    onIpc: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
      apiCall("onIpc", [channel]);
    },
    log: (message: string) => apiCall("log", [message]),
    getAssetUrl: (p: string) => {
      const clean = cleanAsset(p);
      return isDev ? `/plugin/${m.id}/${clean}` : `ember://plugin/${m.id}/${clean}`;
    },
    getAssetPath: (p: string) => join(pluginDir, m.assetsPath || "assets", cleanAsset(p)),
    config: {
      get: <T = unknown>(key: string, defaultValue?: T): T | undefined =>
        (key in config ? config[key] : defaultValue) as T | undefined,
      set: <T = unknown>(key: string, value: T): void => {
        config[key] = value;
        apiCall("config:set", [key, value]);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Plugin loading
// ---------------------------------------------------------------------------

function initPlugin(payload: {
  manifest: PluginManifestLike;
  pluginDir: string;
  code: string;
  config: Record<string, unknown>;
  isDev: boolean;
}): void {
  manifest = payload.manifest;
  pluginDir = payload.pluginDir;
  isDev = payload.isDev;
  config = payload.config ?? {};

  const shimRequire = makeRequireShim(manifest);
  const api = buildApi(manifest);
  const mod = { exports: {} as Record<string, unknown> };

  const sandbox: Record<string, unknown> = {
    console: {
      log: (...a: unknown[]) => apiCall("console", ["log", a.map(String)]),
      info: (...a: unknown[]) => apiCall("console", ["info", a.map(String)]),
      warn: (...a: unknown[]) => apiCall("console", ["warn", a.map(String)]),
      error: (...a: unknown[]) => apiCall("console", ["error", a.map(String)]),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    structuredClone,
    atob,
    btoa,
    performance,
    // fetch is only provided with the network permission
    fetch: (manifest.permissions ?? []).includes("network") ? fetch : undefined,
    Buffer,
    module: mod,
    exports: mod.exports,
    require: shimRequire,
    __dirname: pluginDir,
    __filename: join(pluginDir, manifest.entryPoint),
    __emberPluginApi: api,
  };

  const ctx = createContext(sandbox);
  const wrapped = `(function(require, module, exports, __dirname, __filename) {\n${payload.code}\n})`;
  const factory = runInContext(wrapped, ctx, { filename: manifest.entryPoint });
  factory(shimRequire, mod, mod.exports, pluginDir, join(pluginDir, manifest.entryPoint));

  pluginModule =
    (mod.exports as { default?: Record<string, unknown> }).default ?? mod.exports;

  const exportNames = Object.keys(pluginModule).filter(
    (k) => typeof pluginModule[k] === "function" || k === "default",
  );
  post({ type: "ready", exports: exportNames });
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

parentPort?.on("message", async (msg: {
  type: string;
  id?: number;
  hook?: string;
  channel?: string;
  args?: unknown[];
  manifest?: PluginManifestLike;
  pluginDir?: string;
  code?: string;
  config?: Record<string, unknown>;
  isDev?: boolean;
}) => {
  switch (msg.type) {
    case "init": {
      try {
        initPlugin({
          manifest: msg.manifest!,
          pluginDir: msg.pluginDir!,
          code: msg.code!,
          config: msg.config!,
          isDev: msg.isDev!,
        });
      } catch (err) {
        post({ type: "init-error", error: (err as Error)?.stack ?? String(err) });
      }
      break;
    }
    case "hook": {
      const id = msg.id!;
      const hookName = msg.hook!;
      const fn = pluginModule[hookName];
      try {
        if (typeof fn !== "function") {
          post({ type: "hook-result", id, result: undefined });
          return;
        }
        // Only hooks whose signature begins with the PluginApi get it injected.
      // onPluginUninstall/onPluginUpdate/onPluginStop/onApplicationShutdown/
      // deactivate/getComponent take their own (or no) arguments.
      const API_FIRST_HOOKS = new Set([
        "activate", "onPluginInstall", "onPluginStart", "onApplicationBoot",
        "onGameStart", "onGameStop", "onGameCrash",
      ]);
      const args = API_FIRST_HOOKS.has(hookName)
          ? [buildApi(manifest!), ...(msg.args ?? [])]
          : (msg.args ?? []);
        const result = await (fn as (...a: unknown[]) => unknown)(...args);
        post({ type: "hook-result", id, result: result === undefined ? undefined : result });
      } catch (err) {
        post({ type: "hook-result", id, error: (err as Error)?.stack ?? String(err) });
      }
      break;
    }
    case "ipc-invoke": {
      const id = msg.id!;
      const handler = ipcHandlers.get(msg.channel!);
      try {
        if (!handler) throw new Error(`No IPC handler for channel '${msg.channel}'`);
        const result = await handler(...(msg.args ?? []));
        post({ type: "ipc-result", id, result });
      } catch (err) {
        post({ type: "ipc-result", id, error: (err as Error)?.message ?? String(err) });
      }
      break;
    }
    case "shutdown": {
      process.exit(0);
      break;
    }
  }
});
