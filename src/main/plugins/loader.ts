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
import { createLogger } from "../util/logger";

const log = createLogger("info");

let PLUGINS_DIR;
try { PLUGINS_DIR = join(app.getPath("home"), ".config", "htpc", "plugins"); } catch { PLUGINS_DIR = join(process.cwd(), ".config", "htpc", "plugins"); }
let PLUGIN_BUILD_DIR;
try { PLUGIN_BUILD_DIR = join(app.getPath("userData"), "plugin-builds"); } catch { PLUGIN_BUILD_DIR = join(process.cwd(), "plugin-builds"); }

mkdirSync(PLUGINS_DIR, { recursive: true });
mkdirSync(PLUGIN_BUILD_DIR, { recursive: true });

interface BuildResult {
  code: string;
  map: string;
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
  }
  registeredPlugins.length = 0;

  if (!existsSync(PLUGINS_DIR)) return [];

  let entries: string[];
  try {
    entries = readdirSync(PLUGINS_DIR);
  } catch {
    return [];
  }

  for (const entry of entries) {
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

    if (plugin) registeredPlugins.push(plugin);
  }

  return registeredPlugins;
}
