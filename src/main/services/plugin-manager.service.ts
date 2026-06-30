import { join } from "path";
import { existsSync, mkdirSync, createWriteStream, rmSync, readdirSync, readFileSync, writeFileSync, renameSync, cpSync } from "fs";
import { spawnSync } from "child_process";
import { app } from "electron";
import { DiscoveredPlugin } from "../../shared/types";
import { createLogger } from "../util/logger";
import {
  getInstalledPlugin,
  registerInstalledPlugin,
  unregisterInstalledPlugin,
} from "../plugins/plugin-registry";
import { reloadPlugins, unloadPlugin } from "../plugins/loader";

const log = createLogger("info");

let PLUGINS_DIR: string;
try { PLUGINS_DIR = join(app.getPath("home"), ".config", "htpc", "plugins"); } catch { PLUGINS_DIR = join(process.cwd(), ".config", "htpc", "plugins"); }

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getPluginDir(id: string): string {
  return join(PLUGINS_DIR, sanitizeId(id));
}

function getPluginStatePath(id: string): string {
  return join(PLUGINS_DIR, `.${sanitizeId(id)}.state.json`);
}

interface PluginState {
  enabled: boolean;
  installedAt: string;
}

function readPluginState(id: string): PluginState | null {
  const path = getPluginStatePath(id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writePluginState(id: string, state: PluginState): void {
  writeFileSync(getPluginStatePath(id), JSON.stringify(state, null, 2));
}

function detectCompression(url: string): "gzip" | "zstd" | "zip" | "unknown" {
  const lower = url.toLowerCase();
  if (lower.endsWith(".tar.zst") || lower.endsWith(".tar.zstd")) return "zstd";
  if (lower.endsWith(".tar.gz")) return "gzip";
  if (lower.endsWith(".zip")) return "zip";
  return "unknown";
}

function buildExtractArgs(archivePath: string): string[] {
  const comp = detectCompression(archivePath);
  switch (comp) {
    case "zstd":
      return ["--zstd", "-xf", archivePath];
    case "gzip":
      return ["-xzf", archivePath];
    case "zip":
      return []; // Handled separately
    default:
      return ["-xf", archivePath];
  }
}

async function installDevPlugin(plugin: DiscoveredPlugin): Promise<void> {
  if (!plugin.devPath) throw new Error("devPath is required for dev plugin install");

  const pluginDir = getPluginDir(plugin.id);

  log.info("plugin-manager", `Installing dev plugin ${plugin.id} from ${plugin.devPath}`);

  // Remove existing installation
  if (existsSync(pluginDir)) {
    rmSync(pluginDir, { recursive: true, force: true });
  }

  // Copy from dev directory
  cpSync(plugin.devPath, pluginDir, { recursive: true, force: true });

  // Write state
  writePluginState(plugin.id, { enabled: true, installedAt: new Date().toISOString() });

  // Reload plugins
  await reloadPlugins();

  log.info("plugin-manager", `Installed dev plugin ${plugin.id}`);
}

export async function installPlugin(
  plugin: DiscoveredPlugin,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  if (plugin.devPath) {
    return installDevPlugin(plugin);
  }

  const pluginDir = getPluginDir(plugin.id);
  const tempDir = join(PLUGINS_DIR, `.tmp-${plugin.id}-${Date.now()}`);

  log.info("plugin-manager", `Installing ${plugin.id} v${plugin.version} from ${plugin.downloadUrl}`);

  const comp = detectCompression(plugin.downloadUrl);
  const ext = comp === "zip" ? ".zip" : comp === "zstd" ? ".tar.zst" : ".tar.gz";
  const archivePath = join(tempDir, `archive${ext}`);
  mkdirSync(tempDir, { recursive: true });

  // Download
  const response = await fetch(plugin.downloadUrl, {
    headers: { "User-Agent": "Ember-HTPC/0.1.0" },
  });
  if (!response.ok) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  let downloaded = 0;

  const body = response.body;
  if (!body) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error("Download response has no body");
  }

  const fileStream = createWriteStream(archivePath);
  const reader = body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      downloaded += value.length;
      onProgress?.(downloaded, total);
    }
    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });
  } catch (err) {
    fileStream.destroy();
    rmSync(tempDir, { recursive: true, force: true });
    throw err;
  }

  // Extract
  const extractDir = join(tempDir, "extracted");
  mkdirSync(extractDir, { recursive: true });

  if (comp === "zip") {
    const unzipResult = spawnSync("unzip", ["-o", archivePath, "-d", extractDir], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    if (unzipResult.status !== 0) {
      const err = unzipResult.stderr?.toString() || "unknown unzip error";
      log.error("plugin-manager", `Extract failed: ${err}`);
      rmSync(tempDir, { recursive: true, force: true });
      throw new Error(`Extract failed: ${err}`);
    }
  } else {
    const tarArgs = buildExtractArgs(archivePath);
    const tarResult = spawnSync("tar", [...tarArgs, "-C", extractDir], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    if (tarResult.status !== 0) {
      const err = tarResult.stderr?.toString() || "unknown tar error";
      log.error("plugin-manager", `Extract failed: ${err}`);
      rmSync(tempDir, { recursive: true, force: true });
      throw new Error(`Extract failed: ${err}`);
    }
  }

  // Find the actual plugin directory (may be nested)
  let sourceDir = extractDir;
  const entries = readdirSync(extractDir);
  if (entries.length === 1 && existsSync(join(extractDir, entries[0], "manifest.json"))) {
    sourceDir = join(extractDir, entries[0]);
  }

  // Remove existing installation
  if (existsSync(pluginDir)) {
    rmSync(pluginDir, { recursive: true, force: true });
  }

  // Move to final location
  renameSync(sourceDir, pluginDir);
  rmSync(tempDir, { recursive: true, force: true });

  // Write state
  writePluginState(plugin.id, { enabled: true, installedAt: new Date().toISOString() });

  // Reload plugins
  await reloadPlugins();

  log.info("plugin-manager", `Installed ${plugin.id} v${plugin.version}`);
}

export async function uninstallPlugin(id: string): Promise<void> {
  const pluginDir = getPluginDir(id);
  const installed = getInstalledPlugin(id);

  // Call uninstall hook if plugin is active
  if (installed?.module?.onPluginUninstall) {
    try {
      await installed.module.onPluginUninstall();
    } catch (err) {
      log.warn("plugin-manager", `onPluginUninstall hook failed for ${id}: ${err}`);
    }
  }

  await unloadPlugin(id);

  if (existsSync(pluginDir)) {
    rmSync(pluginDir, { recursive: true, force: true });
  }

  const statePath = getPluginStatePath(id);
  if (existsSync(statePath)) {
    rmSync(statePath);
  }

  unregisterInstalledPlugin(id);
  log.info("plugin-manager", `Uninstalled ${id}`);
}

export async function updatePlugin(
  plugin: DiscoveredPlugin,
): Promise<void> {
  log.info("plugin-manager", `Updating ${plugin.id} to v${plugin.version}`);
  await installPlugin(plugin);

  const installed = getInstalledPlugin(plugin.id);
  if (installed?.module?.onPluginUpdate) {
    try {
      await installed.module.onPluginUpdate(plugin.installedVersion ?? "0.0.0");
    } catch (err) {
      log.warn("plugin-manager", `onPluginUpdate hook failed for ${plugin.id}: ${err}`);
    }
  }
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  const state = readPluginState(id) ?? { enabled, installedAt: new Date().toISOString() };
  state.enabled = enabled;
  writePluginState(id, state);

  if (enabled) {
    await reloadPlugins();
  } else {
    await unloadPlugin(id);
  }
}

export function isPluginEnabled(id: string): boolean {
  return readPluginState(id)?.enabled ?? true;
}

function getBundledPluginsDir(): string {
  if (process.resourcesPath) {
    return join(process.resourcesPath, "plugins");
  }
  return join(process.cwd(), "plugins");
}

export async function installBundledPlugins(): Promise<void> {
  const bundledDir = getBundledPluginsDir();
  if (!existsSync(bundledDir)) {
    log.info("plugin-manager", "No bundled plugins directory found");
    return;
  }

  let installed = 0;
  for (const entry of readdirSync(bundledDir)) {
    const manifestPath = join(bundledDir, entry, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    let manifest: { id?: string; version?: string };
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      continue;
    }

    const pluginId = manifest.id ?? entry;
    const pluginDir = getPluginDir(pluginId);

    if (existsSync(pluginDir)) {
      continue;
    }

    log.info("plugin-manager", `Installing bundled plugin ${pluginId}`);
    cpSync(join(bundledDir, entry), pluginDir, { recursive: true, force: true });
    writePluginState(pluginId, { enabled: true, installedAt: new Date().toISOString() });
    installed++;
  }

  if (installed > 0) {
    log.info("plugin-manager", `Installed ${installed} bundled plugin(s)`);
  }
}

export async function listManagedPlugins(): Promise<DiscoveredPlugin[]> {
  if (!existsSync(PLUGINS_DIR)) return [];

  const results: DiscoveredPlugin[] = [];
  for (const entry of readdirSync(PLUGINS_DIR)) {
    if (entry.startsWith(".")) continue;
    const manifestPath = join(PLUGINS_DIR, entry, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const state = readPluginState(entry);
      results.push({
        id: manifest.id ?? entry,
        name: manifest.name ?? entry,
        displayName: manifest.displayName ?? manifest.name ?? entry,
        version: manifest.version ?? "0.0.0",
        description: manifest.description,
        author: manifest.author,
        sourceUrl: manifest.sourceUrl,
        downloadUrl: "",
        installed: true,
        installedVersion: manifest.version,
        enabled: state?.enabled ?? true,
      });
    } catch {
      /* ignore invalid manifests */
    }
  }
  return results;
}
