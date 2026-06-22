import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { getMainWindow } from "..";
import { getSettings } from "./settings.service";
import { createLogger } from "../util/logger";
import { join } from "path";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  copyFileSync,
  renameSync,
  createWriteStream,
  statSync,
  readdirSync,
} from "fs";
import { spawn } from "child_process";

const log = createLogger("info");

const UPDATE_STATE_FILE = join(app.getPath("userData"), "updater-state.json");
const BACKUP_DIR = join(app.getPath("userData"), "app-backups");
const SHUTDOWN_MARKER = join(app.getPath("userData"), ".clean-shutdown");
const UPDATE_MARKER = join(app.getPath("userData"), ".update-applied");
const RELEASES_API =
  "https://api.github.com/repos/knackstedt/ember/releases?per_page=100";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error"
  | "rollback";

export interface UpdaterState {
  status: UpdaterStatus;
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  error?: string;
  lastChecked?: number;
  downloadSpeed?: number;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

let state: UpdaterState = {
  status: "idle",
  currentVersion: app.getVersion(),
};

let checkTimer: NodeJS.Timeout | null = null;
let isAppImage = false;

function saveState() {
  try {
    writeFileSync(UPDATE_STATE_FILE, JSON.stringify(state));
  } catch (e) {
    log.warn("updater", `Failed to save state: ${e}`);
  }
}

function loadState(): Partial<UpdaterState> {
  try {
    if (existsSync(UPDATE_STATE_FILE)) {
      return JSON.parse(readFileSync(UPDATE_STATE_FILE, "utf8"));
    }
  } catch {
    // ignore
  }
  return {};
}

export function getUpdaterState(): UpdaterState {
  return { ...state };
}

function emitState() {
  saveState();
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("updater:state", state);
  }
}

function emitProgress(percent: number, speed?: number) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("updater:progress", { percent, speed });
  }
}

function getPackageFormat(): "appimage" | "deb" | "rpm" | "tar.gz" | "unknown" {
  if (process.env.APPIMAGE) return "appimage";
  const exe = app.getPath("exe");
  if (exe.includes(".AppImage")) return "appimage";
  try {
    const { execPath } = process;
    if (execPath.includes("/usr/share/")) {
      try {
        const out = require("child_process").execSync("dpkg -S " + execPath, {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        });
        if (out.includes("ember")) return "deb";
      } catch {}
      try {
        const out = require("child_process").execSync("rpm -qf " + execPath, {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        });
        if (out.includes("ember")) return "rpm";
      } catch {}
    }
  } catch {}
  return "unknown";
}

function getArchitecture(): "x64" | "arm64" {
  return process.arch === "arm64" ? "arm64" : "x64";
}

function getAssetSuffix(): string {
  const fmt = getPackageFormat();
  const arch = getArchitecture();
  switch (fmt) {
    case "appimage":
      return `-${arch}.AppImage`;
    case "deb":
      return `-${arch}.deb`;
    case "rpm":
      return `-${arch}.rpm`;
    case "tar.gz":
      return `-${arch}.tar.gz`;
    default:
      return `-${arch}.AppImage`;
  }
}

export async function backupCurrentVersion(): Promise<boolean> {
  const fmt = getPackageFormat();
  if (fmt === "appimage" && process.env.APPIMAGE) {
    const src = process.env.APPIMAGE;
    const version = app.getVersion();
    mkdirSync(BACKUP_DIR, { recursive: true });
    const dest = join(BACKUP_DIR, `ember-${version}${getAssetSuffix()}`);
    try {
      copyFileSync(src, dest);
      log.info("updater", `Backed up current AppImage to ${dest}`);
      return true;
    } catch (e) {
      log.error("updater", `Failed to backup AppImage: ${e}`);
      return false;
    }
  }
  return true;
}

export async function rollbackToPrevious(): Promise<{
  success: boolean;
  error?: string;
}> {
  const fmt = getPackageFormat();

  if (fmt === "appimage") {
    const backups = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".AppImage"))
      .map((f) => ({
        name: f,
        path: join(BACKUP_DIR, f),
        mtime: statSync(join(BACKUP_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (backups.length === 0) {
      return {
        success: false,
        error:
          "No backup found. Try downloading the previous version manually.",
      };
    }

    const latestBackup = backups[0].path;
    const currentPath = process.env.APPIMAGE;
    if (!currentPath) {
      return { success: false, error: "Cannot determine current AppImage path" };
    }

    try {
      const tmpPath = currentPath + ".rollback";
      copyFileSync(latestBackup, tmpPath);
      renameSync(tmpPath, currentPath);
      try {
        require("child_process").execSync(`chmod +x "${currentPath}"`);
      } catch {}
      log.info("updater", `Rolled back to backup: ${latestBackup}`);

      state.status = "rollback";
      emitState();

      app.relaunch();
      app.quit();
      return { success: true };
    } catch (e) {
      log.error("updater", `Rollback failed: ${e}`);
      return { success: false, error: String(e) };
    }
  }

  return {
    success: false,
    error: "Rollback for deb/rpm/tar.gz requires manual package reinstallation.",
  };
}

export async function fetchReleases(): Promise<GitHubRelease[]> {
  const res = await fetch(RELEASES_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Ember-Updater",
    },
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  return (await res.json()) as GitHubRelease[];
}

async function downloadWithProgress(
  url: string,
  dest: string,
  totalSize: number,
  onProgress: (pct: number) => void,
): Promise<void> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "Ember-Updater",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const file = createWriteStream(dest);
  let downloaded = 0;
  let lastPct = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    file.write(chunk);
    downloaded += chunk.length;
    const pct = Math.round((downloaded / totalSize) * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      onProgress(pct);
    }
  }

  file.end();
  await new Promise<void>((resolve, reject) => {
    file.on("finish", resolve);
    file.on("error", reject);
  });
}

export async function downloadAndInstallVersion(
  versionTag: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const releases = await fetchReleases();
    const release = releases.find((r) => r.tag_name === versionTag);
    if (!release)
      return { success: false, error: `Version ${versionTag} not found` };

    const suffix = getAssetSuffix();
    const asset = release.assets.find((a) => a.name.endsWith(suffix));
    if (!asset)
      return {
        success: false,
        error: `No asset found for suffix "${suffix}" in ${versionTag}`,
      };

    await backupCurrentVersion();

    const downloadPath = join(app.getPath("temp"), asset.name);

    state.status = "downloading";
    state.availableVersion = versionTag.replace(/^v/, "");
    state.progress = 0;
    emitState();

    await downloadWithProgress(
      asset.browser_download_url,
      downloadPath,
      asset.size,
      (pct) => {
        state.progress = pct;
        emitState();
        emitProgress(pct);
      },
    );

    state.status = "installing";
    emitState();

    const fmt = getPackageFormat();
    if (fmt === "appimage") {
      const currentPath = process.env.APPIMAGE;
      if (!currentPath) {
        unlinkSync(downloadPath);
        return { success: false, error: "Cannot determine current AppImage path" };
      }
      copyFileSync(downloadPath, currentPath + ".new");
      renameSync(currentPath + ".new", currentPath);
      try {
        require("child_process").execSync(`chmod +x "${currentPath}"`);
      } catch {}
      unlinkSync(downloadPath);

      log.info("updater", `Installed ${versionTag} to ${currentPath}`);

      writeUpdateMarker(versionTag.replace(/^v/, ""));
      app.relaunch();
      app.quit();
      return { success: true };
    } else if (fmt === "deb") {
      return new Promise((resolve) => {
        const cmd = spawn("pkexec", ["dpkg", "-i", downloadPath], {
          detached: true,
        });
        cmd.on("close", (code) => {
          try {
            unlinkSync(downloadPath);
          } catch {}
          if (code === 0) {
            writeUpdateMarker(versionTag.replace(/^v/, ""));
            app.relaunch();
            app.quit();
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `dpkg exited with code ${code}` });
          }
        });
      });
    } else if (fmt === "rpm") {
      return new Promise((resolve) => {
        const cmd = spawn("pkexec", ["rpm", "-Uvh", downloadPath], {
          detached: true,
        });
        cmd.on("close", (code) => {
          try {
            unlinkSync(downloadPath);
          } catch {}
          if (code === 0) {
            writeUpdateMarker(versionTag.replace(/^v/, ""));
            app.relaunch();
            app.quit();
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `rpm exited with code ${code}` });
          }
        });
      });
    }

    unlinkSync(downloadPath);
    return { success: false, error: "Unsupported package format" };
  } catch (e) {
    state.status = "error";
    state.error = String(e);
    emitState();
    return { success: false, error: String(e) };
  }
}

/* ------------------------------------------------------------------ */
/*  Crash detection after update                                       */
/* ------------------------------------------------------------------ */

export function markCleanShutdown() {
  try {
    writeFileSync(SHUTDOWN_MARKER, Date.now().toString());
  } catch {
    // ignore
  }
}

export function checkPostUpdateCrash(): boolean {
  try {
    if (existsSync(UPDATE_MARKER)) {
      if (!existsSync(SHUTDOWN_MARKER)) {
        log.warn("updater", "Detected crash after update, offering rollback");
        return true;
      }
      unlinkSync(UPDATE_MARKER);
      unlinkSync(SHUTDOWN_MARKER);
    }
  } catch {
    // ignore
  }
  return false;
}

export function clearUpdateMarker() {
  try {
    if (existsSync(UPDATE_MARKER)) unlinkSync(UPDATE_MARKER);
    if (existsSync(SHUTDOWN_MARKER)) unlinkSync(SHUTDOWN_MARKER);
  } catch {
    // ignore
  }
}

function writeUpdateMarker(version: string) {
  try {
    writeFileSync(
      UPDATE_MARKER,
      JSON.stringify({ version, updatedAt: Date.now() }),
    );
    if (existsSync(SHUTDOWN_MARKER)) unlinkSync(SHUTDOWN_MARKER);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/*  Auto-updater events                                                  */
/* ------------------------------------------------------------------ */

export function initUpdater() {
  const loaded = loadState();
  if (loaded.status) state.status = loaded.status;
  if (loaded.lastChecked) state.lastChecked = loaded.lastChecked;

  isAppImage = getPackageFormat() === "appimage";

  if (!isAppImage) {
    log.info("updater", `Package format: ${getPackageFormat()} — autoUpdater only supports AppImage on Linux`);
    // Still schedule manual checks for non-AppImage formats
    scheduleChecks();
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    state.status = "checking";
    emitState();
  });

  autoUpdater.on("update-available", (info) => {
    state.status = "available";
    state.availableVersion = info.version;
    state.lastChecked = Date.now();
    emitState();

    getSettings().then((settings) => {
      const pinned = settings.updatePinnedVersion;
      if (pinned && info.version !== pinned) {
        log.info(
          "updater",
          `Update ${info.version} available but pinned to ${pinned}, ignoring`,
        );
        state.status = "idle";
        emitState();
        return;
      }

      const autoDownload = settings.updateAutoDownload ?? true;
      if (autoDownload) {
        log.info("updater", `Auto-downloading update ${info.version}`);
        autoUpdater.downloadUpdate().catch((e) => {
          log.error("updater", `Auto-download failed: ${e}`);
        });
      }
    });
  });

  autoUpdater.on("update-not-available", () => {
    state.status = "idle";
    state.lastChecked = Date.now();
    emitState();
  });

  autoUpdater.on("download-progress", (progress: any) => {
    state.status = "downloading";
    state.progress = Math.round(progress.percent);
    state.downloadSpeed = progress.bytesPerSecond;
    emitState();
    emitProgress(Math.round(progress.percent), progress.bytesPerSecond);
  });

  autoUpdater.on("update-downloaded", (info) => {
    state.status = "downloaded";
    state.availableVersion = info.version;
    emitState();

    getSettings().then((settings) => {
      const autoInstall = settings.updateAutoInstall ?? false;
      if (autoInstall) {
        log.info("updater", `Auto-installing update ${info.version}`);
        writeUpdateMarker(info.version);
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on("error", (err) => {
    state.status = "error";
    state.error = err.message;
    emitState();
    log.error("updater", `Updater error: ${err.message}`);
  });

  scheduleChecks();
}

export async function checkForUpdates(): Promise<void> {
  if (state.status === "checking" || state.status === "downloading") {
    log.info("updater", "Already checking/downloading, skipping");
    return;
  }

  if (!isAppImage) {
    // Manual check for non-AppImage: just list releases and compare
    try {
      state.status = "checking";
      emitState();
      const releases = await fetchReleases();
      const latest = releases[0];
      if (!latest) {
        state.status = "idle";
        emitState();
        return;
      }
      const latestVersion = latest.tag_name.replace(/^v/, "");
      if (latestVersion !== app.getVersion()) {
        state.status = "available";
        state.availableVersion = latestVersion;
        state.lastChecked = Date.now();
      } else {
        state.status = "idle";
        state.lastChecked = Date.now();
      }
      emitState();
    } catch (e) {
      state.status = "error";
      state.error = String(e);
      emitState();
    }
    return;
  }

  try {
    state.status = "checking";
    emitState();
    await autoUpdater.checkForUpdates();
  } catch (e) {
    state.status = "error";
    state.error = String(e);
    emitState();
    log.error("updater", `Check failed: ${e}`);
  }
}

export async function downloadUpdate(): Promise<void> {
  if (!isAppImage) {
    log.warn("updater", "Download only supported for AppImage");
    return;
  }
  if (state.status !== "available") {
    log.warn("updater", "No update available to download");
    return;
  }
  try {
    await backupCurrentVersion();
    await autoUpdater.downloadUpdate();
  } catch (e) {
    state.status = "error";
    state.error = String(e);
    emitState();
    log.error("updater", `Download failed: ${e}`);
  }
}

export async function installUpdate(): Promise<void> {
  if (!isAppImage) {
    log.warn("updater", "Install only supported for AppImage");
    return;
  }
  if (state.status !== "downloaded") {
    log.warn("updater", "No update downloaded to install");
    return;
  }
  try {
    writeUpdateMarker(state.availableVersion ?? "");
    autoUpdater.quitAndInstall(false, true);
  } catch (e) {
    state.status = "error";
    state.error = String(e);
    emitState();
    log.error("updater", `Install failed: ${e}`);
  }
}

export function scheduleChecks() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }

  getSettings().then((settings) => {
    const freq = settings.updateCheckFrequency ?? "week";
    if (freq === "off") return;

    const intervalMs =
      freq === "day" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

    const lastChecked = state.lastChecked ?? 0;
    const now = Date.now();
    if (!lastChecked || now - lastChecked > intervalMs) {
      log.info("updater", "Periodic check overdue, checking now");
      checkForUpdates();
    }

    checkTimer = setInterval(() => {
      log.info("updater", "Running periodic update check");
      checkForUpdates();
    }, intervalMs);
  });
}
