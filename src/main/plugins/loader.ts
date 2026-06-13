import { existsSync, readdirSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { app } from "electron";
import * as esbuild from "esbuild";
import { SourceMapConsumer } from "source-map";
import { PluginManifest } from "../../shared/types";
import {
  registeredPlugins,
  RegisteredPlugin,
  createPluginApi,
  PluginModule,
} from "./api";
import {
  registerInstalledPlugin,
  unregisterInstalledPlugin,
  setPluginActive,
  setPluginInactive,
  clearRegistry,
} from "./plugin-registry";
import { createLogger } from "../util/logger";

const log = createLogger("info");

let PLUGINS_DIR: string;
try { PLUGINS_DIR = join(app.getPath("home"), ".config", "htpc", "plugins"); } catch { PLUGINS_DIR = join(process.cwd(), ".config", "htpc", "plugins"); }
let PLUGIN_BUILD_DIR: string;
try { PLUGIN_BUILD_DIR = join(app.getPath("userData"), "plugin-builds"); } catch { PLUGIN_BUILD_DIR = join(process.cwd(), "plugin-builds"); }

mkdirSync(PLUGINS_DIR, { recursive: true });
mkdirSync(PLUGIN_BUILD_DIR, { recursive: true });

(global as any).__PLUGINS_DIR__ = PLUGINS_DIR;

interface BuildResult {
  code: string;
  map: string;
}

interface PluginState {
  enabled: boolean;
  installedAt: string;
}

function readPluginState(id: string): PluginState | null {
  const path = join(PLUGINS_DIR, `.${id}.state.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

async function compilePlugin(entryPoint: string): Promise<BuildResult> {
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "cjs",
    sourcemap: "inline",
    write: false,
    external: ["electron", "esbuild"],
  });

  const output = result.outputFiles[0];
  return {
    code: output.text,
    map: "",
  };
}

async function resolveSourceMappedStack(
  err: Error,
  map: string,
): Promise<string> {
  if (!map || !err.stack) return err.stack ?? String(err);
  try {
    const consumer = await new SourceMapConsumer(map);
    const lines = err.stack.split("\n");
    const resolved = lines.map((line) => {
      const match = line.match(/at\s+(.+):(\d+):(\d+)/);
      if (!match) return line;
      const [, , lineNum, colNum] = match;
      const pos = consumer.originalPositionFor({
        line: parseInt(lineNum),
        column: parseInt(colNum),
      });
      if (pos.source) {
        return line.replace(
          `${lineNum}:${colNum}`,
          `${pos.line}:${pos.column} [${pos.source}]`,
        );
      }
      return line;
    });
    consumer.destroy();
    return resolved.join("\n");
  } catch {
    return err.stack ?? String(err);
  }
}

async function loadPluginFromDir(
  pluginDir: string,
): Promise<RegisteredPlugin | null> {
  const manifestPath = join(pluginDir, "manifest.json");
  if (!existsSync(manifestPath)) return null;

  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    log.error("plugins", `Failed to read manifest at ${manifestPath}: ${err}`);
    return null;
  }

  const state = readPluginState(manifest.id);
  if (state && !state.enabled) {
    log.info("plugins", `Plugin ${manifest.id} is disabled, skipping`);
    return {
      manifest,
      module: {},
      enabled: false,
    };
  }

  const entryPath = join(pluginDir, manifest.entryPoint);
  if (!existsSync(entryPath)) {
    log.error("plugins", `Entry point not found: ${entryPath}`);
    return null;
  }

  let buildResult: BuildResult;
  try {
    buildResult = await compilePlugin(entryPath);
  } catch (err) {
    return {
      manifest,
      module: {},
      enabled: false,
      error: `Compile error: ${err}`,
    };
  }

  let pluginModule: PluginModule = {};
  let errorMsg: string | undefined;

  try {
    const fn = new Function(
      "require",
      "module",
      "exports",
      "__dirname",
      "__filename",
      buildResult.code,
    );
    const mod = { exports: {} as PluginModule };
    fn(require, mod, mod.exports, pluginDir, entryPath);
    pluginModule =
      (mod.exports as unknown as { default?: PluginModule }).default ??
      mod.exports;
  } catch (err) {
    const resolved = await resolveSourceMappedStack(
      err as Error,
      buildResult.map,
    );
    errorMsg = resolved;
    log.error("plugins", `Runtime error in ${manifest.id}:\n${resolved}`);
  }

  const plugin: RegisteredPlugin = {
    manifest,
    module: pluginModule,
    enabled: !errorMsg,
    error: errorMsg,
  };

  registerInstalledPlugin(plugin);

  if (!errorMsg && pluginModule.activate) {
    try {
      pluginModule.activate(createPluginApi(manifest));
    } catch (err) {
      const resolved = await resolveSourceMappedStack(
        err as Error,
        buildResult.map,
      );
      plugin.enabled = false;
      plugin.error = `Activation error:\n${resolved}`;
    }
  }

  // Call onPluginStart if available
  if (!errorMsg && pluginModule.onPluginStart) {
    try {
      await pluginModule.onPluginStart(createPluginApi(manifest));
      setPluginActive(manifest.id, plugin);
    } catch (err) {
      const resolved = await resolveSourceMappedStack(
        err as Error,
        buildResult.map,
      );
      plugin.enabled = false;
      plugin.error = `onPluginStart error:\n${resolved}`;
    }
  }

  return plugin;
}

export async function listPlugins(): Promise<RegisteredPlugin[]> {
  return registeredPlugins;
}

export async function reloadPlugins(): Promise<RegisteredPlugin[]> {
  for (const plugin of registeredPlugins) {
    if (plugin.module.deactivate) {
      try {
        plugin.module.deactivate();
      } catch {
        /* */
      }
    }
    if (plugin.module.onPluginStop) {
      try {
        await plugin.module.onPluginStop();
      } catch {
        /* */
      }
    }
    setPluginInactive(plugin.manifest.id);
  }
  registeredPlugins.length = 0;
  clearRegistry();

  if (!existsSync(PLUGINS_DIR)) return [];

  let entries: string[];
  try {
    entries = readdirSync(PLUGINS_DIR);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const fullPath = join(PLUGINS_DIR, entry);
    let plugin: RegisteredPlugin | null = null;

    if (entry.endsWith(".ts")) {
      const singleManifest: PluginManifest = {
        id: entry.replace(".ts", ""),
        name: entry.replace(".ts", ""),
        version: "0.0.0",
        entryPoint: entry,
      };
      plugin = await loadPluginFromDir(PLUGINS_DIR);
      if (plugin) plugin.manifest = singleManifest;
    } else if (existsSync(join(fullPath, "manifest.json"))) {
      plugin = await loadPluginFromDir(fullPath);
    }

    if (plugin) {
      registeredPlugins.push(plugin);
    }
  }

  return registeredPlugins;
}

export async function unloadPlugin(id: string): Promise<void> {
  const idx = registeredPlugins.findIndex((p) => p.manifest.id === id);
  if (idx >= 0) {
    const plugin = registeredPlugins[idx];
    if (plugin.module.onPluginStop) {
      try {
        await plugin.module.onPluginStop();
      } catch {
        /* */
      }
    }
    if (plugin.module.deactivate) {
      try {
        plugin.module.deactivate();
      } catch {
        /* */
      }
    }
    setPluginInactive(id);
    registeredPlugins.splice(idx, 1);
  }
  unregisterInstalledPlugin(id);
}

export async function callPluginHook<T>(
  hookName: keyof PluginModule,
  ...args: unknown[]
): Promise<T | undefined> {
  for (const plugin of registeredPlugins) {
    if (!plugin.enabled) continue;
    const hook = plugin.module[hookName] as (...args: unknown[]) => Promise<T | undefined> | T | undefined;
    if (typeof hook === "function") {
      try {
        const result = await hook(createPluginApi(plugin.manifest), ...args);
        if (result !== null && result !== undefined) {
          return result;
        }
      } catch (err) {
        log.error("plugins", `Hook ${String(hookName)} failed in ${plugin.manifest.id}: ${err}`);
      }
    }
  }
  return undefined;
}

export async function bootPlugins(): Promise<void> {
  await reloadPlugins();
  for (const plugin of registeredPlugins) {
    if (!plugin.enabled) continue;
    if (plugin.module.onApplicationBoot) {
      try {
        await plugin.module.onApplicationBoot(createPluginApi(plugin.manifest));
      } catch (err) {
        log.error("plugins", `onApplicationBoot failed in ${plugin.manifest.id}: ${err}`);
      }
    }
  }
}

export async function shutdownPlugins(): Promise<void> {
  for (const plugin of registeredPlugins) {
    if (!plugin.enabled) continue;
    if (plugin.module.onApplicationShutdown) {
      try {
        await plugin.module.onApplicationShutdown();
      } catch {
        /* ignore */
      }
    }
    if (plugin.module.deactivate) {
      try {
        plugin.module.deactivate();
      } catch {
        /* ignore */
      }
    }
  }
  registeredPlugins.length = 0;
  clearRegistry();
}
