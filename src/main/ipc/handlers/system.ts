import { execSync } from "child_process";
import { app, ipcMain } from "electron";
import { existsSync as fsExists, join } from "fs";
import { findFileRecursive } from "../../../shared/file-utils";
import { MovieRepo, RemoteSourceRepo } from "../../db/repository";
import { getXdgVideosDir } from "../../scanners/xdg";
import {
    aiGroupItems,
    isOllamaAvailable,
    naturalLanguageToFilter,
} from "../../services/local-ai.service";
import { getServePort } from "../../services/rclone-manager";
import {
    checkForUpdates,
    downloadAndInstallVersion,
    downloadUpdate,
    fetchReleases,
    getUpdaterState,
    installUpdate,
    rollbackToPrevious,
    scheduleChecks,
} from "../../services/updater.service";
import { createLogger } from "../../util/logger";
import type { IpcContext } from "../types";

const log = createLogger("info");

interface PciGpuInfo {
  vendorId: number;
  deviceId: number;
  name: string;
}

function cleanLspciGpuName(raw: string): string {
  const bracketed = raw.match(/\[([^\]]+)\]\s*$/);
  if (bracketed) return bracketed[1].trim();
  return raw.trim();
}

function getLspciGpuInfo(): PciGpuInfo[] {
  const devices: PciGpuInfo[] = [];
  try {
    const output = execSync("lspci -nn -mm 2>/dev/null || echo ''", { encoding: "utf8", timeout: 5000 });
    const lines = output.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      const fields = line.match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
      if (fields.length < 3) continue;
      const cls = fields[0].slice(1, -1);
      if (!cls.includes("VGA") && !cls.includes("3D") && !cls.includes("Display")) continue;
      const vendorField = fields[1].slice(1, -1);
      const deviceField = fields[2].slice(1, -1);
      const vendorMatch = vendorField.match(/\[([0-9a-fA-F]{4})\]\s*$/);
      const deviceMatch = deviceField.match(/\[([0-9a-fA-F]{4})\]\s*$/);
      if (!vendorMatch || !deviceMatch) continue;
      const vendorId = parseInt(vendorMatch[1], 16);
      const deviceId = parseInt(deviceMatch[1], 16);
      const name = deviceField.replace(/\s*\[[0-9a-fA-F]{4}\]\s*$/, "").trim();
      if (!Number.isNaN(vendorId) && !Number.isNaN(deviceId) && name) {
        devices.push({ vendorId, deviceId, name });
      }
    }
  } catch {}
  return devices;
}

function getMpvVersion(): string | undefined {
  try {
    const output = execSync("pkg-config --modversion mpv 2>/dev/null || echo ''", { encoding: "utf8", timeout: 3000 }).trim();
    if (output) return output;
  } catch {}
  try {
    const output = execSync("mpv --version 2>/dev/null || echo ''", { encoding: "utf8", timeout: 3000 });
    const match = output.match(/mpv\s+v?([\d.]+)/i);
    return match?.[1];
  } catch {}
  return undefined;
}

function findLibMpv(): string | undefined {
  try {
    const output = execSync("ldconfig -p 2>/dev/null || echo ''", { encoding: "utf8", timeout: 3000 });
    const line = output.split("\n").find((l: string) => /\blibmpv\.so\b/.test(l));
    const match = line?.match(/=>\s*(.+)$/);
    if (match) {
      const p = match[1].trim();
      if (require("fs").existsSync(p)) return p;
    }
  } catch {}
  const fs = require("fs");
  const candidates = [
    "/usr/lib/libmpv.so.2",
    "/usr/lib64/libmpv.so.2",
    "/usr/lib/x86_64-linux-gnu/libmpv.so.2",
    "/usr/lib/aarch64-linux-gnu/libmpv.so.2",
    "/usr/local/lib/libmpv.so.2",
    "/usr/lib/libmpv.so.1",
    "/usr/lib64/libmpv.so.1",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function detectInstallMechanism(): string {
  if (!app.isPackaged) return "Development";
  if (process.env.FLATPAK_ID || fsExists("/.flatpak-info")) return "Flatpak";
  if (process.env.APPIMAGE) return "AppImage";
  if (process.env.SNAP) return "Snap";
  const exePath = process.execPath;
  try { execSync(`dpkg -S "${exePath}"`, { stdio: "pipe", timeout: 5000 }); return "deb"; } catch {}
  try { execSync(`rpm -qf "${exePath}"`, { stdio: "pipe", timeout: 5000 }); return "rpm"; } catch {}
  if (exePath.startsWith("/usr/") || exePath.startsWith("/opt/")) return "System Install";
  return "tar.gz";
}

function getDependencyVersions(pkg: any): { name: string; version: string }[] {
  const deps: { name: string; version: string }[] = [];
  const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  for (const section of sections) {
    if (pkg[section]) {
      for (const [name, version] of Object.entries(pkg[section])) {
        deps.push({ name, version: version as string });
      }
    }
  }
  return deps;
}

export function registerSystemHandlers(ctx: IpcContext): void {
  const { window } = ctx;

  // Video decoder URL resolution
  ipcMain.handle("videoDecoder:resolveUrl", async (_e, path: string) => {
    log.info("videoDecoder:resolveUrl", `resolving: ${path}`);

    if (path.startsWith("ember://remote/")) {
      const url = new URL(path);
      const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const sourceId = segments[0];
      const remotePath = segments.slice(1).join("/");
      const port = await getServePort(sourceId);
      if (!port) throw new Error(`Remote source ${sourceId} is not serving`);
      let proxyPath = remotePath;
      try {
        const sources = await RemoteSourceRepo.list();
        const source = sources.find((s: any) => s.id === sourceId);
        const basePath = (source?.remotePath || "/").replace(/^\//, "");
        if (basePath && proxyPath.toLowerCase().startsWith(basePath.toLowerCase() + "/")) {
          proxyPath = proxyPath.slice(basePath.length + 1);
        } else if (basePath && proxyPath.toLowerCase() === basePath.toLowerCase()) {
          proxyPath = "";
        }
      } catch {}
      const resolved = `http://localhost:${port}/${proxyPath.split("/").map(encodeURIComponent).join("/")}`;
      log.info("videoDecoder:resolveUrl", `ember://remote/ -> ${resolved}`);
      return resolved;
    }

    if (path.startsWith("/") || path.startsWith("http://") || path.startsWith("https://") || path.startsWith("file://")) {
      log.info("videoDecoder:resolveUrl", `absolute/url path: ${path}`);
      return path;
    }

    let searchPath = path;
    if (searchPath.startsWith("ember://media/")) {
      searchPath = searchPath.slice("ember://media/".length);
    }
    if (searchPath.startsWith("/")) {
      log.info("videoDecoder:resolveUrl", `absolute after strip: ${searchPath}`);
      return searchPath;
    }

    const basename = searchPath.split("/").pop() || searchPath;
    const videosDir = getXdgVideosDir();
    const candidate = join(videosDir, searchPath);
    if (fsExists(candidate)) {
      log.info("videoDecoder:resolveUrl", `found in Videos: ${candidate}`);
      return candidate;
    }

    try {
      const movies = await MovieRepo.list();
      log.info("videoDecoder:resolveUrl", `DB has ${movies.length} movies, searching for basename: ${basename}`);
      const matches = movies.filter((m: any) => {
        if (!m.filePath) return false;
        const movieBasename = m.filePath.split("/").pop() || m.filePath;
        return movieBasename.toLowerCase() === basename.toLowerCase();
      });
      log.info("videoDecoder:resolveUrl", `found ${matches.length} DB match(es)`);
      const remoteMatch = matches.find((m: any) => m.filePath?.startsWith("ember://remote/"));
      const absMatch = matches.find((m: any) => m.filePath?.startsWith("/"));
      const anyMatch = matches[0];
      let match = remoteMatch || absMatch || anyMatch;

      if (match?.filePath) {
        if (match.filePath.startsWith("ember://remote/")) {
          const url = new URL(match.filePath);
          const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
          const sourceId = segments[0];
          const remotePath = segments.slice(1).join("/");
          const port = await getServePort(sourceId);
          if (!port) throw new Error(`Remote source ${sourceId} is not serving`);
          let proxyPath = remotePath;
          try {
            const sources = await RemoteSourceRepo.list();
            const source = sources.find((s: any) => s.id === sourceId);
            const basePath = (source?.remotePath || "/").replace(/^\//, "");
            if (basePath && proxyPath.toLowerCase().startsWith(basePath.toLowerCase() + "/")) {
              proxyPath = proxyPath.slice(basePath.length + 1);
            } else if (basePath && proxyPath.toLowerCase() === basePath.toLowerCase()) {
              proxyPath = "";
            }
          } catch {}
          const resolved = `http://localhost:${port}/${proxyPath.split("/").map(encodeURIComponent).join("/")}`;
          log.info("videoDecoder:resolveUrl", `DB remote match -> ${resolved}`);
          return resolved;
        }
        if (match.filePath.startsWith("/")) {
          log.info("videoDecoder:resolveUrl", `DB absolute match -> ${match.filePath}`);
          return match.filePath;
        }
        log.info("videoDecoder:resolveUrl", `DB bare filename match: ${match.filePath}`);
      }
    } catch (err: any) {
      log.info("videoDecoder:resolveUrl", `DB lookup error: ${err.message || String(err)}`);
    }

    const found = findFileRecursive(videosDir, basename);
    if (found) {
      log.info("videoDecoder:resolveUrl", `recursive search found: ${found}`);
      return found;
    }

    log.info("videoDecoder:resolveUrl", `could not resolve ${path}, returning as-is`);
    return path;
  });

  // Subtitle path resolution
  ipcMain.handle("videoDecoder:resolveSubtitlePaths", async (_e, videoPath: string) => {
    const { dirname, basename, extname, join: pathJoin } = await import("path");
    const { existsSync } = await import("fs");

    let resolvedPath = videoPath;
    if (resolvedPath.startsWith("ember://media/")) {
      resolvedPath = resolvedPath.slice("ember://media/".length);
    }
    if (resolvedPath.startsWith("file://")) {
      resolvedPath = resolvedPath.slice("file://".length);
    }

    if (resolvedPath.startsWith("http://") || resolvedPath.startsWith("https://") || resolvedPath.startsWith("ember://remote/")) {
      return [];
    }

    if (!resolvedPath.startsWith("/")) {
      const videosDir = getXdgVideosDir();
      const candidate = pathJoin(videosDir, resolvedPath);
      if (existsSync(candidate)) {
        resolvedPath = candidate;
      } else {
        const base = basename(resolvedPath);
        const found = findFileRecursive(videosDir, base);
        if (found) {
          resolvedPath = found;
        } else {
          return [];
        }
      }
    }

    const dir = dirname(resolvedPath);
    const base = basename(resolvedPath, extname(resolvedPath));
    const extensions = [".srt", ".ass", ".vtt", ".sub", ".ssa"];
    const results: string[] = [];
    for (const ext of extensions) {
      const subPath = pathJoin(dir, base + ext);
      if (existsSync(subPath)) results.push(subPath);
    }
    return results;
  });

  // System diagnostics
  ipcMain.handle("system:getDiagnostics", async () => {
    const os = await import("os");
    const fs = await import("fs");
    const path = await import("path");
    const electron = await import("electron");

    let appVersion = "unknown";
    let dependencies: { name: string; version: string }[] = [];
    try {
      const pkgPath = path.join(__dirname, "..", "..", "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      appVersion = pkg.version ?? "unknown";
      dependencies = getDependencyVersions(pkg);
    } catch {}

    const videoDecoders: { name: string; available: boolean; path?: string }[] = [];
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const addonName = `video-decoder.linux-${arch}-gnu.node`;
    const decoderCandidates = [
      path.join(process.resourcesPath, addonName),
      path.join(__dirname, "..", "..", "resources", addonName),
    ];
    let decoderFound = false;
    let decoderPath: string | undefined;
    for (const p of decoderCandidates) {
      if (fs.existsSync(p)) {
        decoderFound = true;
        decoderPath = p;
        break;
      }
    }
    const libmpvPath = findLibMpv();
    const libmpvFound = !!libmpvPath;
    videoDecoders.push(
      { name: "mpv native decoder", available: decoderFound, path: decoderPath },
      { name: "libmpv", available: libmpvFound, path: libmpvPath },
    );
    const libmpvVersion = getMpvVersion();

    let ffmpegCodecs: string[] = [];
    try {
      const output = execSync("ffmpeg -codecs 2>/dev/null || echo ''", { encoding: "utf8", timeout: 5000 });
      ffmpegCodecs = output.split("\n").filter((line) => line.startsWith(" ")).map((line) => line.trim().split(/\s+/)[1]).filter((name) => name && name.length > 0 && name !== "=");
    } catch {}

    let hwaccels: string[] = [];
    try {
      const output = execSync("ffmpeg -hwaccels 2>/dev/null || echo ''", { encoding: "utf8", timeout: 5000 });
      hwaccels = output.split("\n").slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith("Hardware"));
    } catch {}

    let gpuInfo: any = null;
    try { gpuInfo = await electron.app.getGPUInfo("complete"); } catch {}

    if (gpuInfo?.gpuDevice?.length) {
      const lspciDevices = getLspciGpuInfo();
      for (const dev of gpuInfo.gpuDevice) {
        if (dev.deviceString && dev.deviceString.length > 1) continue;
        const match = lspciDevices.find((d) => d.vendorId === dev.vendorId && d.deviceId === dev.deviceId);
        if (match && !/^\s*(device|unknown|unidentified)\s*$/i.test(match.name)) {
          dev.deviceDesc = cleanLspciGpuName(match.name);
        }
      }
    }

    const displays = electron.screen.getAllDisplays().map((d: any) => ({
      id: d.id,
      resolution: `${d.size.width}x${d.size.height}`,
      scaleFactor: d.scaleFactor,
      rotation: d.rotation,
      internal: d.internal,
      primary: d.id === electron.screen.getPrimaryDisplay().id,
    }));

    return {
      app: { name: "Ember", version: appVersion, installMechanism: detectInstallMechanism() },
      runtime: { electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome, v8: process.versions.v8 },
      dependencies,
      os: { platform: os.platform(), release: os.release(), arch: os.arch(), hostname: os.hostname(), type: os.type() },
      cpu: { model: os.cpus()[0]?.model ?? "unknown", cores: os.cpus().length, speed: os.cpus()[0]?.speed ?? 0 },
      memory: { total: os.totalmem(), free: os.freemem() },
      displays,
      gpu: gpuInfo,
      videoDecoders,
      ffmpegCodecs,
      hwaccels,
      libmpvVersion,
    };
  });

  // Local AI
  ipcMain.handle("localAi:available", async () => isOllamaAvailable());
  ipcMain.handle("localAi:nlToFilter", async (_e, query: string, itemType: string) => naturalLanguageToFilter(query, itemType));
  ipcMain.handle("localAi:groupItems", async (_e, items: Array<{
    id: string; title: string; genres?: string[]; tags?: string[];
    description?: string; platform?: string; artist?: string; album?: string; genre?: string;
  }>, groupCount: number) => aiGroupItems(items, groupCount));

  // Updater
  ipcMain.handle("updater:state", async () => getUpdaterState());
  ipcMain.handle("updater:check", async () => checkForUpdates());
  ipcMain.handle("updater:download", async () => downloadUpdate());
  ipcMain.handle("updater:install", async () => installUpdate());
  ipcMain.handle("updater:rollback", async () => rollbackToPrevious());
  ipcMain.handle("updater:releases", async () => fetchReleases());
  ipcMain.handle("updater:pin", async (_e, versionTag: string) => downloadAndInstallVersion(versionTag));
  ipcMain.handle("updater:schedule", async () => scheduleChecks());
}
