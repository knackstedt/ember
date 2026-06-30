import { app, session } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, createWriteStream, rmSync, readdirSync, statSync, writeFileSync, readFileSync, renameSync, cpSync } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { spawn } from "child_process";
import { StreamingExtension } from "../../shared/types";
import { getSettings, setSettings } from "./settings.service";
import { createLogger } from "../util/logger";

const log = createLogger("info");

export interface ExtensionInstallResult {
  success: boolean;
  error?: string;
  extension?: StreamingExtension;
}

function getExtensionsDir(): string {
  const dir = join(app.getPath("userData"), "extensions");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getExtensionPath(extId: string): string {
  return join(getExtensionsDir(), sanitizeId(extId));
}

function getVersionFilePath(extId: string): string {
  return join(getExtensionPath(extId), ".ember-version");
}

function runUnzip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("unzip", ["-o", zipPath, "-d", destDir]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d; });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip exited ${code}: ${stderr}`));
    });
    proc.on("error", (err) => reject(err));
  });
}

export async function downloadExtension(
  url: string,
  extId: string,
  version: string,
): Promise<ExtensionInstallResult> {
  try {
    const extDir = getExtensionPath(extId);
    const zipPath = join(extDir, "download.zip");

    if (existsSync(extDir)) {
      rmSync(extDir, { recursive: true, force: true });
    }
    mkdirSync(extDir, { recursive: true });

    log.info("extension:download", `Downloading ${extId} from ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error("No response body");
    }

    await pipeline(Readable.fromWeb(body as any), createWriteStream(zipPath));

    log.info("extension:download", `Extracting ${extId}`);
    await runUnzip(zipPath, extDir);

    // Some extensions zip with an intermediate folder; flatten if needed
    const entries = readdirSync(extDir);
    const folders = entries.filter((e) => {
      const p = join(extDir, e);
      return statSync(p).isDirectory() && e !== "__MACOSX";
    });
    if (folders.length === 1) {
      const nested = join(extDir, folders[0]);
      const nestedEntries = readdirSync(nested);
      if (nestedEntries.includes("manifest.json")) {
        // Move contents up one level
        for (const entry of nestedEntries) {
          const src = join(nested, entry);
          const dest = join(extDir, entry);
          if (!existsSync(dest)) {
            try {
              renameSync(src, dest);
            } catch {
              cpSync(src, dest, { recursive: true });
              rmSync(src, { recursive: true, force: true });
            }
          }
        }
        // Remove the now-empty nested folder
        try {
          rmSync(nested, { recursive: true, force: true });
        } catch {}
      }
    }

    // Validate manifest exists
    const manifestPath = join(extDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error("Extension manifest.json not found after extraction");
    }

    // Write version marker
    writeFileSync(getVersionFilePath(extId), version, "utf8");

    // Clean up zip
    try {
      rmSync(zipPath, { force: true });
    } catch {}

    log.info("extension:install", `Installed ${extId} v${version}`);

    return {
      success: true,
      extension: {
        id: extId,
        name: extId,
        sourceUrl: url,
        version,
        installedVersion: version,
        installPath: extDir,
        enabled: true,
      },
    };
  } catch (err: any) {
    log.error("extension:install", `Failed to install ${extId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function loadExtensionIntoSession(
  extId: string,
  partition: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const extPath = getExtensionPath(extId);
    if (!existsSync(extPath)) {
      return { success: false, error: "Extension not installed" };
    }

    const sess = session.fromPartition(partition);
    if (!sess) {
      return { success: false, error: "Session not found" };
    }

    // Unload first if already loaded (Electron keeps track by path)
    try {
      await sess.removeExtension?.(extId);
    } catch {
      // Extension may not be loaded yet
    }

    const result = await sess.loadExtension(extPath, { allowFileAccess: true });
    log.info("extension:load", `Loaded ${result.name} (${extId}) into ${partition}`);
    return { success: true };
  } catch (err: any) {
    log.error("extension:load", `Failed to load ${extId} into ${partition}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function unloadExtensionFromSession(
  extId: string,
  partition: string,
): Promise<void> {
  try {
    const sess = session.fromPartition(partition);
    await sess.removeExtension?.(extId);
  } catch {
    // Ignore
  }
}

export async function getInstalledExtensionVersion(extId: string): Promise<string | null> {
  try {
    const path = getVersionFilePath(extId);
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

export async function removeExtension(extId: string): Promise<void> {
  const extPath = getExtensionPath(extId);
  if (existsSync(extPath)) {
    rmSync(extPath, { recursive: true, force: true });
  }
}

export async function applyExtensionsToPartition(
  partition: string,
  extensions: StreamingExtension[],
): Promise<void> {
  for (const ext of extensions) {
    if (!ext.enabled || !ext.installPath) continue;
    if (ext.serviceIds && ext.serviceIds.length > 0) {
      const serviceId = partition.replace("persist:streaming-", "");
      if (!ext.serviceIds.includes(serviceId)) continue;
    }
    await loadExtensionIntoSession(ext.id, partition);
  }
}

export async function ensureDefaultExtensions(): Promise<void> {
  const settings = await getSettings();
  const existing = settings.streamingExtensions ?? [];
  const defaults: Omit<StreamingExtension, "installedVersion" | "installPath">[] = [
    {
      id: "youtube-auto-hd",
      name: "YouTube Auto HD + FPS",
      sourceUrl: "https://github.com/avi12/youtube-auto-hd/releases/download/1.17.3/youtube-auto-hd-fps-1.17.3-chrome.zip",
      version: "1.17.3",
      enabled: true,
      serviceIds: ["youtube"],
    },
    {
      id: "sponsorblock",
      name: "SponsorBlock",
      sourceUrl: "https://github.com/ajayyy/SponsorBlock/releases/download/6.1.5/ChromeExtension.zip",
      version: "6.1.5",
      enabled: true,
      serviceIds: ["youtube"],
    },
  ];

  let changed = false;
  const next = [...existing];

  for (const def of defaults) {
    const idx = next.findIndex((e) => e.id === def.id);
    if (idx === -1) {
      next.push({ ...def, installedVersion: undefined, installPath: undefined });
      changed = true;
    }
  }

  if (changed) {
    try {
      await setSettings({ streamingExtensions: next });
    } catch (err: any) {
      log.warn("extension:ensureDefaults", `Failed to save defaults: ${String(err?.message ?? err)}`);
    }
  }
}
