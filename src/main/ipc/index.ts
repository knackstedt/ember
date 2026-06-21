import { join, dirname, resolve } from "path";
import { readFileSync, rmSync, mkdirSync, readdirSync, existsSync, statSync } from "fs";
import { BrowserWindow, ipcMain, app, dialog, shell, session, webContents } from "electron";
import { spawn, ChildProcess } from "child_process";
import { homedir } from "os";
import { getMainWindow } from "..";
import {
  getSettings,
  setSettings,
  setSetting,
} from "../services/settings.service";
import {
  launchGame,
  launchMovie,
  launchTrack,
  startPlayTimeTracking,
  stopPlayTimeTracking,
} from "../services/launcher.service";
import {
  uninstallGame,
  uninstallMovie,
  uninstallMusic,
} from "../services/uninstall.service";
import { scanMusicFiles } from "../scanners/music.scanner";
import {
  searchCoverArt,
  downloadImage,
  embedCoverArt,
  pickCoverImage,
  loadThumbnail,
  fetchArtistThumbnail,
  regenerateThumbnail as regenerateMusicThumbnail,
} from "../services/music-cover.service";
import {
  scanMovieFiles,
  scanTvShows,
  generateMovieThumbnail,
  generateShowThumbnail,
} from "../scanners/video.scanner";
import { getDb } from "../db";
import {
  GameRepo,
  MovieRepo,
  MusicRepo,
  TVRepo,
  MappingRepo,
  AliasRepo,
  BrokenFlashRepo,
  CollectionRepo,
  RemoteSourceRepo,
  PlaylistRepo,
  escapeId,
} from "../db/repository";
import { getProtonRating } from "../services/protondb.service";
import { performGameScan } from "../services/game-scan.service";
import { loadFlashThumbnail, clearInFlight, setFlashThumbnailConcurrency } from "../services/flash-thumbnail.service";
import { loadLibretroThumbnail, isLibretroPlatform, listLocalScreenshots } from "../services/libretro-thumbnail.service";
import { searchGame } from "../services/rawg.service";
import { searchMovie, searchShow } from "../services/tmdb.service";
import {
  searchGameMetadata,
  fetchGameMetadata,
  enrichGameMetadata,
  quickMetadataLookup,
  getAvailableProviders,
  getProvidersByType,
  GameMetadata,
} from "../services/metadata";
import { listPlugins, reloadPlugins, callPluginHook } from "../plugins/loader";
import { discoverPlugins, discoverAllReleases } from "../services/plugin-discovery.service";
import {
  installPlugin,
  uninstallPlugin,
  updatePlugin,
  setPluginEnabled,
  listManagedPlugins,
} from "../services/plugin-manager.service";
import { getConnectedDevices, rescanDevice } from "../input/evdev";
import { getXdgVideosDir, getXdgMusicDir } from "../scanners/xdg";
import { getDefaultScanSources, getDefaultScanSourcesAsync } from "../scanners/defaults";
import { isOllamaAvailable, naturalLanguageToFilter, aiGroupItems } from "../services/local-ai.service";
import { AiGroup, ScanSourceId } from "../../shared/types";
import {
  getStreamingServices,
  getAllStreamingServices,
  addCustomService,
  updateService,
  deleteService,
  setServiceEnabled,
  detectDesktopApp,
} from "../services/streaming.service";
import {
  initializeAdapter,
  removeAdapter,
  authenticateAdapter,
  disconnectAdapter,
  adapterSearch,
  adapterPlay,
  adapterPause,
  adapterNext,
  adapterPrevious,
  adapterCurrentlyPlaying,
  adapterGetDevices,
  adapterGetTrack,
  adapterGetAlbum,
  adapterGetPlaylist,
  hasDeepAdapter,
} from "../services/streaming/streaming-player.service";
import {
  StreamingServiceRepo,
  StreamingFrontpageItemRepo,
} from "../db/repository";
import {
  downloadExtension,
  loadExtensionIntoSession,
  unloadExtensionFromSession,
  removeExtension,
  applyExtensionsToPartition,
  ensureDefaultExtensions,
} from "../services/extension-manager.service";
import {
  initRcloneManager,
  listRemotes,
  addRemote,
  updateRemote,
  removeRemote,
  getRemoteFileList,
  startServe,
  stopServe,
  getServePort,
  getAllServePorts,
  checkRemoteNeedsAuth,
  testRemoteConnection,
  testRemoteCredentials,
  testRemotePath,
} from "../services/rclone-manager";
import {
  queueRemoteSourceScan,
  scanAllRemoteSources,
} from "../services/remote-scan.service";
import {
  checkRemoteAvailability,
} from "../services/remote-availability.service";
import { discoverNetworkDevices } from "../services/network-discovery";
import { startOAuthFlow } from "../services/oauth-webview";
import {
  setMasterPassword,
  clearMasterPassword,
  hasMasterPassword,
  needsMasterPassword,
  needsSessionReauth,
} from "../services/credential-store.service";
import {
  registerMpvIpcHandlers,
  mpvWorkerAvailable,
} from "../services/mpv-worker.service";
import {
  Game,
  Movie,
  MusicTrack,
  TVShow,
  AppSettings,
  GameEmulatorConfig,
  StreamingService,
  StreamingExtension,
  WineRunner,
  DiscoveredPlugin,
  AudioTags,
} from "../../shared/types";
import { createLogger } from "../util/logger";
import { getDependencyVersions } from "../util/dependencies";
import {
  listAvailablePackages,
  searchPackages,
  installPackage,
  uninstallPackage,
  checkUpdates,
  setAptPassword,
  detectInstalledCores,
} from "../services/package-manager.service";
import { detectWineRunner } from "../services/wine-detection.service";
import {
  enrichTrack,
  enrichTracks,
} from "../services/music-enrichment.service";
import {
  launchItchGame,
} from "../services/itch.service";
import {
  compressGame,
  compressAllRoms,
  getToolAvailability,
  canCompress,
} from "../services/compression.service";
import { writeTags } from "../services/music-tag-writer.service";
import {
  previewReorganize,
  executeReorganize,
} from "../services/music-reorganize.service";
const log = createLogger("info");

/** Recursively search a directory for a file by exact name. */
function findFileRecursive(dir: string, targetName: string): string | null {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        if (existsSync(full) && statSync(full).isDirectory()) {
          const found = findFileRecursive(full, targetName);
          if (found) return found;
        } else if (entry === targetName) {
          return full;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore unreadable dirs
  }
  return null;
}

// ---------------------------------------------------------------------------
// Libretro worker process — isolates dynarec cores from Electron V8
// ---------------------------------------------------------------------------

let libretroWorker: ChildProcess | null = null;
let workerReqId = 0;
const workerPending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function ensureLibretroWorker(): ChildProcess {
  if (libretroWorker && !libretroWorker.killed && libretroWorker.exitCode === null) {
    return libretroWorker;
  }

  const workerScript = join(__dirname, "libretro-worker.js");
  if (!existsSync(workerScript)) {
    throw new Error(`Libretro worker not found at ${workerScript}`);
  }

  // Spawn as plain Node.js (ELECTRON_RUN_AS_NODE=1) to avoid Electron V8
  // signal-handler conflicts with dynarec cores. Use spawn() instead of fork()
  // because fork() still does Electron-specific initialization even with the env var.
  const worker = require("child_process").spawn(process.execPath, [workerScript], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  worker.on("message", (msg: any) => {
    const pending = workerPending.get(msg.id);
    if (pending) {
      workerPending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    }
  });

  const NOISY_PATTERNS = [
    /^PU region/i,
    /^PU: region/i,
    /^unknown ARM9 IO write32/i,
    /^remapping (DTCM|SWRAM)/i,
    /^SET DATAPERM/i,
    /^done resetting jit mem/i,
    /^\s*\d{8}\/\d{8}\s*$/, // standalone permission hex lines like "00000000/00000000"
    /^\s*\d{8}\/\d{8}\s+\S+$/, // lines with hex data trailing
    /^NDS SRAM: Flush requested/i,
  ];

  function shouldLogWorkerLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return !NOISY_PATTERNS.some((p) => p.test(trimmed));
  }

  worker.stdout!.on("data", (chunk: Buffer) => {
    const lines = chunk.toString("utf8").split("\n");
    for (const line of lines) {
      if (shouldLogWorkerLine(line)) {
        log.info("libretro-worker", line.trim());
      }
    }
  });

  worker.stderr!.on("data", (chunk: Buffer) => {
    const lines = chunk.toString("utf8").split("\n");
    for (const line of lines) {
      if (shouldLogWorkerLine(line)) {
        log.info("libretro-worker", line.trim());
      }
    }
  });

  worker.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    log.warn("libretro", `Worker exited code=${code} signal=${signal}`);
    const isCurrent = libretroWorker === worker;
    if (isCurrent) {
      libretroWorker = null;
      // Only clear pending requests for the currently-tracked worker.
      // If this worker was intentionally killed (e.g. after unloadAll),
      // workerPending was already cleared and a new worker may have
      // started its own requests — we must not touch those.
      for (const pending of workerPending.values()) {
        pending.reject(new Error("Libretro worker crashed"));
      }
      workerPending.clear();
    }
  });

  libretroWorker = worker;
  return worker;
}

async function destroyWorker(): Promise<void> {
  if (!libretroWorker) return;
  const dyingWorker = libretroWorker;
  libretroWorker = null;
  workerPending.clear();
  workerReqId = 0;

  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    dyingWorker.once("exit", done);

    // First try graceful disconnect (triggers worker's process.exit(0)).
    try {
      dyingWorker.disconnect();
    } catch {
      // Already disconnected.
    }

    // If the worker hasn't exited within 500 ms, force-kill it.
    // SIGKILL bypasses all signal handlers and JIT state; the kernel
    // reaps the process immediately.  This is the only reliable way to
    // terminate a dynarec core that may have corrupted its own mappings.
    setTimeout(() => {
      if (resolved) return;
      try {
        dyingWorker.kill("SIGKILL");
      } catch {
        // Already dead.
      }
      done();
    }, 500);
  });
}

export function workerCall(method: string, ...args: any[]): Promise<any> {
  const worker = ensureLibretroWorker();
  const id = ++workerReqId;
  return new Promise((resolve, reject) => {
    workerPending.set(id, { resolve, reject });
    worker.send!({ id, method, args });
  });
}

const scanLocks = {
  movies: false,
  music: false,
  tv: false,
};

const regenerateLocks = new Set<string>();

function sendToWindow(win: BrowserWindow, channel: string, ...args: any[]) {
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

export function registerIpcHandlers(window: BrowserWindow): void {
  const sendRemoteProgress = (progress: {
    scanner: string;
    current: number;
    total: number;
    status: "scanning" | "done" | "error";
    message?: string;
  }) => {
    sendToWindow(window, "scan:progress", progress);
  };

  async function markMissingMovies(
    scannedPaths: string[],
    foundMovies: { id: string; filePath?: string }[],
  ): Promise<void> {
    const foundIds = new Set(foundMovies.map((m) => m.id));
    const allMovies = await MovieRepo.list();
    const resolvedPaths = scannedPaths.map((p) => resolve(p));
    for (const movie of allMovies) {
      if (movie.sourceLocation !== "local") continue;
      if (!movie.filePath) continue;
      const isFromScannedPath = resolvedPaths.some((p) =>
        movie.filePath!.startsWith(p),
      );
      if (!isFromScannedPath) continue;
      if (!foundIds.has(movie.id) && !movie.missing) {
        await MovieRepo.setMissing(movie.id, true);
        log.info("movies:scan", `marked missing: ${movie.title}`);
      } else if (foundIds.has(movie.id) && movie.missing) {
        await MovieRepo.setMissing(movie.id, false);
        log.info("movies:scan", `restored: ${movie.title}`);
      }
    }
  }

  async function markMissingMusic(
    scannedPaths: string[],
    foundTracks: { id: string; filePath?: string }[],
  ): Promise<void> {
    const foundIds = new Set(foundTracks.map((t) => t.id));
    const allTracks = await MusicRepo.list();
    const resolvedPaths = scannedPaths.map((p) => resolve(p));
    for (const track of allTracks) {
      if (track.sourceLocation !== "local") continue;
      if (!track.filePath) continue;
      const isFromScannedPath = resolvedPaths.some((p) =>
        track.filePath!.startsWith(p),
      );
      if (!isFromScannedPath) continue;
      if (!foundIds.has(track.id) && !track.missing) {
        await MusicRepo.setMissing(track.id, true);
        log.info("music:scan", `marked missing: ${track.title}`);
      } else if (foundIds.has(track.id) && track.missing) {
        await MusicRepo.setMissing(track.id, false);
        log.info("music:scan", `restored: ${track.title}`);
      }
    }
  }

  function sendScanTrigger(types: ("games" | "movies" | "music")[]): void {
    sendToWindow(window, "scan:trigger", { types });
  }

  ipcMain.handle("devtools:is-open", () => {
    return window.webContents.isDevToolsOpened();
  });

  window.webContents.on("devtools-opened", () => {
    sendToWindow(window, "devtools:changed", true);
  });
  window.webContents.on("devtools-closed", () => {
    sendToWindow(window, "devtools:changed", false);
  });

  // Register MPV worker IPC handlers (if native addon is available).
  if (mpvWorkerAvailable()) {
    registerMpvIpcHandlers();
  }

  // Synchronous check used by preload to decide backend.
  ipcMain.on("mpv:available", (event) => {
    event.returnValue = mpvWorkerAvailable();
  });

  ipcMain.handle("settings:get", async () => {
    return await getSettings();
  });

  ipcMain.handle("settings:set", async (_e, partial: Partial<AppSettings>) => {
    await setSettings(partial);
    if ("fullscreen" in partial) {
      window.setFullScreen(partial.fullscreen ?? false);
    }
    if ("flashThumbnailConcurrency" in partial) {
      setFlashThumbnailConcurrency(partial.flashThumbnailConcurrency ?? 4);
    }
    const triggerTypes: ("games" | "movies" | "music")[] = [];
    if ("moviePaths" in partial) triggerTypes.push("movies");
    if ("musicPaths" in partial) triggerTypes.push("music");
    if ("romPaths" in partial || "gamePaths" in partial) triggerTypes.push("games");
    if (triggerTypes.length > 0) {
      // Defer so the settings save finishes and renderer can react
      setTimeout(() => sendScanTrigger(triggerTypes), 300);
    }
  });

  ipcMain.handle("app:fullscreen", (_e, value: boolean) => {
    window.setFullScreen(value);
    setSetting("fullscreen", value);
  });

  ipcMain.handle("app:quit", () => {
    app.quit();
  });

  ipcMain.handle("app:restart", () => {
    if (app.isPackaged) {
      app.relaunch();
      app.quit();
    } else {
      // In dev, electron-vite manages the process; just reload the renderer
      window.reload();
    }
  });

  ipcMain.handle("games:scan", async (_e, extraPaths?: string[]) => {
    const result = await performGameScan(window, extraPaths);
    // Also scan remote sources configured for ROMs
    void scanAllRemoteSources("rom", sendRemoteProgress);
    sendToWindow(window, "scan:background:complete", { type: "games" });
    return result;
  });

  ipcMain.handle("games:list", async () => {
    return GameRepo.list();
  });

  ipcMain.handle("games:launch", (_e, game: Game) => {
    return launchGame(game);
  });

  ipcMain.handle("libretro:launch", (_e, opts: {
    romPath: string;
    title: string;
    platform: string;
    gameId: string;
    shader?: string;
    corePath?: string;
  }) => {
    sendToWindow(window, "libretro:open", opts);
    return true;
  });

  ipcMain.handle("libretro:addon", async (_e, method: string, ...args: any[]) => {
    try {
      const result = await workerCall(method, ...args);
      if (!["getFrameBuffer", "getFrame", "setInputState", "setAnalogState"].includes(method)) {
        log.info("libretro", `worker.${method}() -> ${JSON.stringify(result).slice(0, 200)}`);
      }
      // Dynarec cores (melonDS, etc.) leak JIT pages and callback state across
      // sessions.  Re-using the same child process eventually segfaults.
      // Destroy the worker after unloadAll so every game gets a fresh process.
      if (method === "unloadAll" && libretroWorker) {
        log.info("libretro", "Destroying worker after unloadAll");
        await destroyWorker();
      }
      return result;
    } catch (err: any) {
      log.error("libretro", `Worker method ${method} failed: ${err}`);
      throw err;
    }
  });

  // ---------------------------------------------------------------------------
  // Video decoder — URL resolution for remote ember:// URLs.
  // The decoder itself runs in the renderer preload (same process as WebGL)
  // so SharedArrayBuffer can be used without IPC serialization blocks.
  // ---------------------------------------------------------------------------
  ipcMain.handle("videoDecoder:resolveUrl", async (_e, path: string) => {
    log.info("videoDecoder:resolveUrl", `resolving: ${path}`);

    // 1) ember://remote/ → http://localhost:<port>/...
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
      } catch {
        // ignore
      }
      const resolved = `http://localhost:${port}/${proxyPath.split("/").map(encodeURIComponent).join("/")}`;
      log.info("videoDecoder:resolveUrl", `ember://remote/ -> ${resolved}`);
      return resolved;
    }

    // 2) Absolute or already-resolved paths — pass through.
    if (path.startsWith("/") || path.startsWith("http://") || path.startsWith("https://") || path.startsWith("file://")) {
      log.info("videoDecoder:resolveUrl", `absolute/url path: ${path}`);
      return path;
    }

    // 3) Strip ember://media/ prefix if present (used by resolveMediaUrl for local files).
    let searchPath = path;
    if (searchPath.startsWith("ember://media/")) {
      searchPath = searchPath.slice("ember://media/".length);
    }

    // 4) If it's now an absolute path, pass through.
    if (searchPath.startsWith("/")) {
      log.info("videoDecoder:resolveUrl", `absolute after strip: ${searchPath}`);
      return searchPath;
    }

    const basename = searchPath.split("/").pop() || searchPath;

    // 5) Try local Videos directory first.
    const videosDir = getXdgVideosDir();
    const candidate = join(videosDir, searchPath);
    if (existsSync(candidate)) {
      log.info("videoDecoder:resolveUrl", `found in Videos: ${candidate}`);
      return candidate;
    }

    // 6) Search DB for movies with this basename.
    // Collect ALL matches, then prefer ones with usable paths (absolute or remote).
    try {
      const movies = await MovieRepo.list();
      log.info("videoDecoder:resolveUrl", `DB has ${movies.length} movies, searching for basename: ${basename}`);

      const matches = movies.filter((m: any) => {
        if (!m.filePath) return false;
        const movieBasename = m.filePath.split("/").pop() || m.filePath;
        return movieBasename.toLowerCase() === basename.toLowerCase();
      });

      log.info("videoDecoder:resolveUrl", `found ${matches.length} DB match(es)`);

      // Prefer remote entries (ember://remote/) first, then absolute paths, then anything else.
      const remoteMatch = matches.find((m: any) => m.filePath?.startsWith("ember://remote/"));
      const absMatch = matches.find((m: any) => m.filePath?.startsWith("/"));
      const anyMatch = matches[0];

      let match = remoteMatch || absMatch || anyMatch;

      if (match?.filePath) {
        // If the matched path is ember://remote/, resolve it to HTTP now.
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
          } catch {
            // ignore
          }
          const resolved = `http://localhost:${port}/${proxyPath.split("/").map(encodeURIComponent).join("/")}`;
          log.info("videoDecoder:resolveUrl", `DB remote match -> ${resolved}`);
          return resolved;
        }
        // Absolute path — return as-is.
        if (match.filePath.startsWith("/")) {
          log.info("videoDecoder:resolveUrl", `DB absolute match -> ${match.filePath}`);
          return match.filePath;
        }
        // Bare filename from DB — try to resolve it locally before returning.
        log.info("videoDecoder:resolveUrl", `DB bare filename match: ${match.filePath}`);
      }
    } catch (err: any) {
      log.info("videoDecoder:resolveUrl", `DB lookup error: ${err.message || String(err)}`);
    }

    // 7) Last resort: recursive search in Videos directory.
    const found = findFileRecursive(videosDir, basename);
    if (found) {
      log.info("videoDecoder:resolveUrl", `recursive search found: ${found}`);
      return found;
    }

    log.info("videoDecoder:resolveUrl", `could not resolve ${path}, returning as-is`);
    return path;
  });

  ipcMain.handle("videoDecoder:resolveSubtitlePaths", async (_e, videoPath: string) => {
    const { dirname, basename, extname, join } = await import("path");
    const { existsSync } = await import("fs");

    // Resolve ember://media/ URLs to local paths.
    let resolvedPath = videoPath;
    if (resolvedPath.startsWith("ember://media/")) {
      resolvedPath = resolvedPath.slice("ember://media/".length);
    }
    if (resolvedPath.startsWith("file://")) {
      resolvedPath = resolvedPath.slice("file://".length);
    }

    // Skip remote URLs — can't probe sidecar files.
    if (resolvedPath.startsWith("http://") || resolvedPath.startsWith("https://") || resolvedPath.startsWith("ember://remote/")) {
      return [];
    }

    // If not absolute, try to resolve via the same logic as resolveUrl.
    if (!resolvedPath.startsWith("/")) {
      const videosDir = getXdgVideosDir();
      const candidate = join(videosDir, resolvedPath);
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
      const subPath = join(dir, base + ext);
      if (existsSync(subPath)) {
        results.push(subPath);
      }
    }

    return results;
  });

  // ---------------------------------------------------------------------------
  // GPU / video decoder diagnostic helpers
  // ---------------------------------------------------------------------------

  interface PciGpuInfo {
    vendorId: number;
    deviceId: number;
    name: string;
  }

  /** lspci returns NVIDIA names like "GA102 [GeForce RTX 3090]". Prefer the
   * bracketed marketing name so the UI shows something users recognize. */
  function cleanLspciGpuName(raw: string): string {
    const bracketed = raw.match(/\[([^\]]+)\]\s*$/);
    if (bracketed) return bracketed[1].trim();
    return raw.trim();
  }

  function getLspciGpuInfo(): PciGpuInfo[] {
    const devices: PciGpuInfo[] = [];
    try {
      const { execSync } = require("child_process");
      const output = execSync("lspci -nn -mm 2>/dev/null || echo ''", {
        encoding: "utf8",
        timeout: 5000,
      });
      const lines = output.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const fields = line.match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
        if (fields.length < 3) continue;
        const cls = fields[0].slice(1, -1);
        if (!cls.includes("VGA") && !cls.includes("3D") && !cls.includes("Display")) {
          continue;
        }
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
    } catch { /* lspci unavailable or failed */ }
    return devices;
  }

  function getMpvVersion(): string | undefined {
    try {
      const { execSync } = require("child_process");
      const output = execSync("pkg-config --modversion mpv 2>/dev/null || echo ''", {
        encoding: "utf8",
        timeout: 3000,
      }).trim();
      if (output) return output;
    } catch { /* ignore */ }
    try {
      const { execSync } = require("child_process");
      const output = execSync("mpv --version 2>/dev/null || echo ''", {
        encoding: "utf8",
        timeout: 3000,
      });
      const match = output.match(/mpv\s+v?([\d.]+)/i);
      return match?.[1];
    } catch { /* ignore */ }
    return undefined;
  }

  function findLibMpv(): string | undefined {
    try {
      const { execSync } = require("child_process");
      const output = execSync("ldconfig -p 2>/dev/null || echo ''", {
        encoding: "utf8",
        timeout: 3000,
      });
      const line = output.split("\n").find((l: string) => /\blibmpv\.so\b/.test(l));
      const match = line?.match(/=>\s*(.+)$/);
      if (match) {
        const p = match[1].trim();
        if (require("fs").existsSync(p)) return p;
      }
    } catch { /* ignore */ }
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

  // ---------------------------------------------------------------------------
  // System diagnostics — hardware, software versions, installed components
  // ---------------------------------------------------------------------------
  ipcMain.handle("system:getDiagnostics", async () => {
    const os = await import("os");
    const fs = await import("fs");
    const path = await import("path");
    const { execSync } = await import("child_process");
    const electron = await import("electron");

    // App version and production dependencies from package.json
    let appVersion = "unknown";
    let dependencies: { name: string; version: string }[] = [];
    try {
      const pkgPath = path.join(__dirname, "..", "..", "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      appVersion = pkg.version ?? "unknown";
      dependencies = getDependencyVersions(pkg);
    } catch { /* ignore */ }

    // Gather video decoder backend availability. The native decoder is
    // mpv-based; the stale ffmpeg/gstreamer addon names are no longer built.
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
      { name: "libmpv", available: libmpvFound, path: libmpvPath }
    );
    const libmpvVersion = getMpvVersion();

    // Check FFmpeg codecs (if ffmpeg CLI available)
    let ffmpegCodecs: string[] = [];
    try {
      const output = execSync("ffmpeg -codecs 2>/dev/null || echo ''", { encoding: "utf8", timeout: 5000 });
      // Extract codec names from the output
      // Lines look like: " D.V.LS h264 ..."
      ffmpegCodecs = output
        .split("\n")
        .filter((line) => line.startsWith(" "))
        .map((line) => line.trim().split(/\s+/)[1])
        .filter((name) => name && name.length > 0 && name !== "=");
    } catch { /* ignore */ }

    // Check available hwaccels via ffmpeg
    let hwaccels: string[] = [];
    try {
      const output = execSync("ffmpeg -hwaccels 2>/dev/null || echo ''", { encoding: "utf8", timeout: 5000 });
      hwaccels = output
        .split("\n")
        .slice(1) // skip header
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("Hardware"));
    } catch { /* ignore */ }

    // GPU info via Electron
    let gpuInfo: any = null;
    try {
      gpuInfo = await electron.app.getGPUInfo("complete");
    } catch { /* ignore */ }

    // Electron's GPU info sometimes omits the human-readable model name on
    // Linux (deviceString/deviceDesc can be empty). Fall back to lspci names.
    if (gpuInfo?.gpuDevice?.length) {
      const lspciDevices = getLspciGpuInfo();
      for (const dev of gpuInfo.gpuDevice) {
        if (dev.deviceString && dev.deviceString.length > 1) continue;
        const match = lspciDevices.find(
          (d) => d.vendorId === dev.vendorId && d.deviceId === dev.deviceId
        );
        if (match && !/^\s*(device|unknown|unidentified)\s*$/i.test(match.name)) {
          dev.deviceDesc = cleanLspciGpuName(match.name);
        }
      }
    }

    // Display info
    const displays = electron.screen.getAllDisplays().map((d: any) => ({
      id: d.id,
      resolution: `${d.size.width}x${d.size.height}`,
      scaleFactor: d.scaleFactor,
      rotation: d.rotation,
      internal: d.internal,
      primary: d.id === electron.screen.getPrimaryDisplay().id,
    }));

    return {
      app: {
        name: "Ember",
        version: appVersion,
      },
      runtime: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
        v8: process.versions.v8,
      },
      dependencies,
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        type: os.type(),
      },
      cpu: {
        model: os.cpus()[0]?.model ?? "unknown",
        cores: os.cpus().length,
        speed: os.cpus()[0]?.speed ?? 0,
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
      },
      displays,
      gpu: gpuInfo,
      videoDecoders,
      ffmpegCodecs,
      hwaccels,
      libmpvVersion,
    };
  });

  ipcMain.handle("games:favorite", async (_e, id: string, value: boolean) => {
    await GameRepo.setFavorite(id, value);
  });

  ipcMain.handle("games:tag", async (_e, id: string, tags: string[]) => {
    await GameRepo.setTags(id, tags);
  });

  ipcMain.handle("games:hide", async (_e, id: string, value: boolean) => {
    await GameRepo.setHidden(id, value);
  });

  ipcMain.handle("games:delete", async (_e, id: string) => {
    await GameRepo.delete(id);
  });

  ipcMain.handle("games:countBySource", async (_e, source: ScanSourceId) => {
    return GameRepo.countBySource(source);
  });

  ipcMain.handle("games:deleteBySource", async (_e, source: ScanSourceId) => {
    return GameRepo.deleteBySource(source);
  });

  ipcMain.handle("games:uninstall", async (_e, game: Game) => {
    return uninstallGame(game);
  });

  ipcMain.handle("games:emulatorConfig:get", async (_e, id: string) => {
    return GameRepo.getEmulatorConfig(id);
  });

  ipcMain.handle("games:emulatorConfig:set", async (_e, id: string, config: GameEmulatorConfig) => {
    await GameRepo.setEmulatorConfig(id, config);
  });

  ipcMain.handle("games:sessionConfig:set", async (_e, id: string, config: Parameters<typeof GameRepo.setSessionConfig>[1]) => {
    await GameRepo.setSessionConfig(id, config);
  });

  ipcMain.handle("games:wineConfig:set", async (_e, id: string, config: { wineRunner?: WineRunner; wineCustomCommand?: string | null; umuCustomCommand?: string | null }) => {
    const db = getDb();
    const updates: string[] = [];
    if (config.wineRunner !== undefined) updates.push(`wineRunner = ${JSON.stringify(config.wineRunner)}`);
    if (config.wineCustomCommand !== undefined) updates.push(`wineCustomCommand = ${config.wineCustomCommand === null ? "NONE" : JSON.stringify(config.wineCustomCommand)}`);
    if (config.umuCustomCommand !== undefined) updates.push(`umuCustomCommand = ${config.umuCustomCommand === null ? "NONE" : JSON.stringify(config.umuCustomCommand)}`);
    if (updates.length > 0) {
      await db.query(`UPDATE game:⟨${id}⟩ SET ${updates.join(", ")}`);
    }
  });

  ipcMain.handle("games:playTime:start", async (_e, id: string) => {
    startPlayTimeTracking(id);
  });

  ipcMain.handle("games:playTime:stop", async (_e, id: string) => {
    stopPlayTimeTracking(id);
  });

  ipcMain.handle("games:loadThumbnail", async (_e, game: Game) => {
    if (!game.romPath) return null;
    if (game.platform === "flash") {
      const url = await loadFlashThumbnail(game);
      return url ?? null;
    }
    if (isLibretroPlatform(game.platform)) {
      const url = await loadLibretroThumbnail(game, () => {
        sendToWindow(window, "toast:push", {
          type: "info",
          message: `No emulator core installed for ${game.platform.toUpperCase()}. Install one in Settings.`,
        });
      });
      return url ?? null;
    }
    return null;
  });

  // Enhanced metadata handlers using unified metadata service
  ipcMain.handle(
    "games:metadata",
    async (_e, title: string, steamAppId?: number) => {
      // Legacy handler - kept for backwards compatibility
      const settings = await getSettings();
      const [rawg, proton] = await Promise.all([
        searchGame(title, settings.rawgApiKey),
        steamAppId ? getProtonRating(steamAppId) : Promise.resolve("unknown"),
      ]);
      return { rawg, proton };
    },
  );

  // New comprehensive metadata search using unified service
  ipcMain.handle(
    "games:metadata:search",
    async (_e, title: string, platform?: string, steamAppId?: number) => {
      console.log(`[IPC] games:metadata:search called for "${title}" (platform: ${platform}, steamAppId: ${steamAppId})`);
      try {
        const metadata = await searchGameMetadata({ title, platform, steamAppId });
        console.log(`[IPC] games:metadata:search completed for "${title}":`, metadata?.sources?.map(s => s.name) || 'no sources');
        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:search", String(err));
        console.error(`[IPC] games:metadata:search failed for "${title}":`, err);
        return null;
      }
    },
  );

  // Fetch metadata by external IDs
  ipcMain.handle(
    "games:metadata:fetch",
    async (_e, options: {
      steamAppId?: number;
      igdbId?: number;
      rawgSlug?: string;
      mobyGamesId?: number;
      theGamesDbId?: number;
      launchBoxDbId?: string;
    }) => {
      try {
        const metadata = await fetchGameMetadata(options);
        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:fetch", String(err));
        return null;
      }
    },
  );

  // Enrich existing game metadata with all available sources
  ipcMain.handle(
    "games:metadata:enrich",
    async (_e, game: { title: string; platform?: string; steamAppId?: number }) => {
      try {
        const metadata = await enrichGameMetadata(game.title, game.platform, game.steamAppId);
        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:enrich", String(err));
        return null;
      }
    },
  );

  // Quick metadata lookup (uses only fast sources)
  ipcMain.handle(
    "games:metadata:quick",
    async (_e, title: string, platform?: string) => {
      try {
        const metadata = await quickMetadataLookup(title, platform);
        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:quick", String(err));
        return null;
      }
    },
  );

  // Get list of available metadata providers
  ipcMain.handle("games:metadata:providers", () => {
    return {
      all: getAvailableProviders(),
      primary: getProvidersByType("primary"),
      retro: getProvidersByType("retro"),
      artwork: getProvidersByType("artwork"),
      video: getProvidersByType("video"),
      supplementary: getProvidersByType("supplementary"),
    };
  });

  // Fetch lazy metadata (artwork, videos, low-rate-limit sources) when viewing game details
  ipcMain.handle(
    "games:metadata:lazy",
    async (_e, options: {
      gameId: string;
      title: string;
      platform?: string;
      steamAppId?: number;
      igdbId?: number;
      rawgSlug?: string;
      theGamesDbId?: number;
      launchBoxDbId?: string;
    }) => {
      try {
        // Fetch artwork and video sources (low rate limits)
        const metadata = await searchGameMetadata(
          {
            title: options.title,
            platform: options.platform,
            steamAppId: options.steamAppId,
          },
          ["artwork", "video"] // Only fetch low-rate-limit sources
        );

        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:lazy", String(err));
        return null;
      }
    },
  );

  // Fetch achievements for a game (lazy loading)
  ipcMain.handle(
    "games:metadata:achievements",
    async (_e, options: {
      gameId: string;
      consoleId?: number;
      steamAppId?: number;
      retroAchievementsGameId?: number;
    }) => {
      try {
        // Fetch from RetroAchievements if console ID provided
        if (options.consoleId && options.retroAchievementsGameId) {
          // This would call the RetroAchievements provider directly
          // For now, return empty
          return { achievements: [], count: 0 };
        }

        // Fetch from Steam API if Steam App ID provided
        if (options.steamAppId) {
          const settings = await getSettings();
          if (settings.steamApiKey) {
            const { SteamWebAPIProvider } = await import("../services/metadata/index.js");
            if (!SteamWebAPIProvider.fetch) {
              return { achievements: [], count: 0 };
            }
            const metadata = await SteamWebAPIProvider.fetch(
              { steamAppId: options.steamAppId },
              settings.steamApiKey
            );
            return {
              achievements: metadata?.achievements || [],
              count: metadata?.achievementCount || 0,
            };
          }
        }

        return { achievements: [], count: 0 };
      } catch (err) {
        log.error("ipc:games:metadata:achievements", String(err));
        return { achievements: [], count: 0 };
      }
    },
  );

  // Fetch artwork specifically (lazy loading for detail view)
  ipcMain.handle(
    "games:metadata:artwork",
    async (_e, options: {
      gameId: string;
      steamAppId?: number;
      theGamesDbId?: number;
      title?: string;
    }) => {
      try {
        const artworkSources: ("artwork")[] = ["artwork"];

        // Fetch from SteamGridDB and Fanart.tv
        const metadata = await fetchGameMetadata(
          {
            steamAppId: options.steamAppId,
            theGamesDbId: options.theGamesDbId,
          },
          artworkSources
        );

        return {
          coverUrl: metadata?.coverUrl,
          bannerUrl: metadata?.bannerUrl,
          iconUrl: metadata?.iconUrl,
          screenshots: metadata?.screenshots,
        };
      } catch (err) {
        log.error("ipc:games:metadata:artwork", String(err));
        return null;
      }
    },
  );

  // List locally-captured screenshots for a game (libretro numbered frames)
  ipcMain.handle("games:localScreenshots", async (_e, gameId: string) => {
    try {
      return listLocalScreenshots(gameId);
    } catch (err) {
      log.error("ipc:games:localScreenshots", String(err));
      return [];
    }
  });

  // Fetch videos specifically (lazy loading for detail view)
  ipcMain.handle(
    "games:metadata:videos",
    async (_e, options: {
      gameId: string;
      title: string;
    }) => {
      try {
        const videoSources: ("video")[] = ["video"];

        // Fetch from YouTube
        const metadata = await searchGameMetadata(
          { title: options.title },
          videoSources
        );

        return metadata?.videos || [];
      } catch (err) {
        log.error("ipc:games:metadata:videos", String(err));
        return [];
      }
    },
  );

  // Fetch Proton rating specifically (lazy loading for detail view)
  ipcMain.handle(
    "games:metadata:proton",
    async (_e, steamAppId: number) => {
      try {
        if (!steamAppId) return "unknown";
        const rating = await getProtonRating(steamAppId);
        return rating;
      } catch (err) {
        log.error("ipc:games:metadata:proton", String(err));
        return "unknown";
      }
    },
  );

  ipcMain.handle("games:regenerateThumbnail", async (_e, game: Game) => {
    log.info("ipc:games:regenerateThumbnail", `called for ${game.id} ${game.platform}`);
    if (regenerateLocks.has(game.id)) {
      log.info("ipc:games:regenerateThumbnail", `already regenerating ${game.id}`);
      return null;
    }
    regenerateLocks.add(game.id);
    try {
      if (game.platform === "flash" && game.romPath) {
        const { join } = await import("path");
        const { existsSync, unlinkSync } = await import("fs");
        const coverRoot = join(app.getPath("userData"), "covers", "flash");
        const screenshotDir = join(coverRoot, "screenshots");
        const generatedDir = join(coverRoot, "generated");
        const id = game.id;
        for (const ext of [".png", ".jpg", ".webp"]) {
          const p = join(screenshotDir, `${id}${ext}`);
          if (existsSync(p)) {
            try {
              unlinkSync(p);
              log.info("ipc:games:regenerateThumbnail", `deleted ${p}`);
            } catch {}
          }
        }
        const svg = join(generatedDir, `${id}.svg`);
        if (existsSync(svg)) {
          try {
            unlinkSync(svg);
            log.info("ipc:games:regenerateThumbnail", `deleted ${svg}`);
          } catch {}
        }
        const brokenSvg = join(generatedDir, `${id}-broken.svg`);
        if (existsSync(brokenSvg)) {
          try {
            unlinkSync(brokenSvg);
            log.info("ipc:games:regenerateThumbnail", `deleted ${brokenSvg}`);
          } catch {}
        }
        try {
          await BrokenFlashRepo.delete(id);
          log.info("ipc:games:regenerateThumbnail", `cleared broken record for ${id}`);
        } catch {}
        try {
          await GameRepo.setCorrupt(id, false);
          log.info("ipc:games:regenerateThumbnail", `cleared corrupt for ${id}`);
        } catch {}
        clearInFlight(id);
        log.info("ipc:games:regenerateThumbnail", `cleared inFlight for ${id}`);
        const url = await loadFlashThumbnail(game);
        log.info("ipc:games:regenerateThumbnail", `loadFlashThumbnail returned ${url}`);
        return url ?? null;
      }
      if (isLibretroPlatform(game.platform) && game.romPath) {
        const { join } = await import("path");
        const { existsSync, unlinkSync } = await import("fs");
        const coverRoot = join(app.getPath("userData"), "covers", "libretro");
        const screenshotDir = join(coverRoot, "screenshots");
        const generatedDir = join(coverRoot, "generated");
        const id = game.id;
        for (const ext of [".png", ".jpg", ".webp"]) {
          const p = join(screenshotDir, `${id}${ext}`);
          if (existsSync(p)) {
            try {
              unlinkSync(p);
              log.info("ipc:games:regenerateThumbnail", `deleted libretro ${p}`);
            } catch {}
          }
        }
        // Delete numbered screenshots
        for (let i = 0; i < 20; i++) {
          const p = join(screenshotDir, `${id}_${i}.png`);
          if (existsSync(p)) {
            try {
              unlinkSync(p);
              log.info("ipc:games:regenerateThumbnail", `deleted libretro ${p}`);
            } catch {}
          } else {
            break;
          }
        }
        const svg = join(generatedDir, `${id}.svg`);
        if (existsSync(svg)) {
          try {
            unlinkSync(svg);
            log.info("ipc:games:regenerateThumbnail", `deleted libretro ${svg}`);
          } catch {}
        }
        const brokenSvg = join(generatedDir, `${id}-broken.svg`);
        if (existsSync(brokenSvg)) {
          try {
            unlinkSync(brokenSvg);
            log.info("ipc:games:regenerateThumbnail", `deleted libretro ${brokenSvg}`);
          } catch {}
        }
        try {
          await GameRepo.setCorrupt(id, false);
          log.info("ipc:games:regenerateThumbnail", `cleared corrupt for ${id}`);
        } catch {}
        const url = await loadLibretroThumbnail(game);
        log.info("ipc:games:regenerateThumbnail", `loadLibretroThumbnail returned ${url}`);
        return url ?? null;
      }
      const settings = await getSettings();
      const rawg = await searchGame(game.title, settings.rawgApiKey);
      if (rawg?.background_image) {
        const db = getDb();
        await db.query(`UPDATE game:⟨${game.id}⟩ SET coverUrl = $url`, {
          url: rawg.background_image,
        });
        return rawg.background_image;
      }
      return null;
    } finally {
      regenerateLocks.delete(game.id);
    }
  });

  ipcMain.handle("games:compress", async (_e, game: Game) => {
    return compressGame(game);
  });

  ipcMain.handle("games:compressAll", async (_e) => {
    const result = await compressAllRoms((current, total, title) => {
      sendToWindow(window, "compression:progress", { current, total, title });
    });
    return result;
  });

  ipcMain.handle("games:compression:tools", async () => {
    return getToolAvailability();
  });

  ipcMain.handle("games:compression:canCompress", async (_e, game: Game) => {
    return canCompress(game);
  });

  ipcMain.handle("movies:scan", async (_e, extraPaths?: string[]) => {
    if (scanLocks.movies) return [];
    scanLocks.movies = true;
    sendToWindow(window, "scan:progress", {
      scanner: "movies",
      current: 0,
      total: 0,
      status: "scanning",
    });
    const movies = await scanMovieFiles(extraPaths, (current, total) => {
      sendToWindow(window, "scan:progress", {
        scanner: "movies",
        current,
        total,
        status: "scanning",
      });
    }).finally(() => {
      scanLocks.movies = false;
    });
    const db = getDb();
    for (const movie of movies) {
      // Defensive: strip any field not in the schema to prevent SCHEMAFULL rejects
      const {
        id,
        title,
        filePath,
        coverUrl,
        backdropUrl,
        description,
        genres,
        releaseYear,
        director,
        runtime,
        resolution,
        codec,
        tmdbId,
        isFavorite,
        tags,
        rating,
        hidden,
        sourceLocation,
        remoteSourceId,
      } = movie as any;
      const clean = {
        id,
        title,
        filePath,
        coverUrl,
        backdropUrl,
        description,
        genres,
        releaseYear,
        director,
        runtime,
        resolution,
        codec,
        tmdbId,
        isFavorite,
        tags,
        rating,
        hidden,
        sourceLocation,
        remoteSourceId,
      };
      const defined: any = {};
      for (const [k, v] of Object.entries(clean)) {
        if (v !== undefined) defined[k] = v;
      }
      if (defined.isFavorite === undefined) defined.isFavorite = false;
      if (defined.tags === undefined) defined.tags = [];
      if (defined.hidden === undefined) defined.hidden = false;
      if (defined.sourceLocation === undefined) defined.sourceLocation = "local";
      // Preserve existing playback progress and lastPlayed
      const existing = await db.query<[{ watchProgress?: number; lastPlayed?: number }[]]>(
        `SELECT watchProgress, lastPlayed FROM movie:⟨${defined.id}⟩`,
      );
      const existingRecord = existing[0]?.[0];
      if (
        existingRecord?.watchProgress !== undefined &&
        existingRecord?.watchProgress !== null
      ) {
        defined.watchProgress = existingRecord.watchProgress;
      }
      if (
        existingRecord?.lastPlayed !== undefined &&
        existingRecord?.lastPlayed !== null
      ) {
        defined.lastPlayed = existingRecord.lastPlayed;
      }
      // Ensure found movies are not marked missing
      defined.missing = false;
      await db.query(`UPSERT movie:⟨${defined.id}⟩ CONTENT $movie`, {
        movie: defined,
      });
    }

    // Mark any local movies from scanned paths that were not found as missing
    const allScannedPaths = [getXdgVideosDir(), ...(extraPaths ?? [])].map((p) => resolve(p)).filter(existsSync);
    await markMissingMovies(allScannedPaths, movies);

    sendToWindow(window, "scan:progress", {
      scanner: "movies",
      current: movies.length,
      total: movies.length,
      status: "done",
    });
    // Also scan remote sources configured for movies
    void scanAllRemoteSources("movie", sendRemoteProgress);
    sendToWindow(window, "scan:background:complete", { type: "movies" });
    return movies;
  });

  ipcMain.handle("movies:list", async () => {
    const movies = await MovieRepo.list();
    log.debug(
      "movies:list",
      `returning ${movies.length} movies, coverUrl samples: ${JSON.stringify(
        movies.slice(0, 3).map((m) => ({ title: m.title, coverUrl: m.coverUrl })),
      )}`,
    );
    const thumbRoot = join(app.getPath("userData"), "thumbnails").replace(
      /\\/g,
      "/",
    );
    return movies.map((m) => {
      const normalized = { ...m };
      if (!normalized.coverUrl?.startsWith("file://")) return normalized;
      const pathPart = normalized.coverUrl.slice("file://".length);
      if (!pathPart.startsWith(thumbRoot)) return normalized;
      const rel = pathPart.slice(thumbRoot.length + 1).replace(/\\/g, "/");
      return { ...normalized, coverUrl: `ember://thumbnails/${rel}` };
    });
  });

  ipcMain.handle("movies:launch", (_e, movie: Movie) => {
    launchMovie(movie);
  });

  ipcMain.handle("movies:favorite", async (_e, id: string, value: boolean) => {
    await MovieRepo.setFavorite(id, value);
  });

  ipcMain.handle("movies:tag", async (_e, id: string, tags: string[]) => {
    await MovieRepo.setTags(id, tags);
  });

  ipcMain.handle("movies:hide", async (_e, id: string, value: boolean) => {
    await MovieRepo.setHidden(id, value);
  });

  ipcMain.handle("movies:delete", async (_e, id: string) => {
    await MovieRepo.delete(id);
  });

  ipcMain.handle("movies:uninstall", async (_e, movie: Movie) => {
    return uninstallMovie(movie);
  });

  ipcMain.handle(
    "movies:progress:set",
    async (_e, id: string, progress: number | null) => {
      const idStr = typeof id === "string" ? id : String(id);
      const now = Date.now();
      await MovieRepo.setProgress(idStr, progress ?? null);
      // Also update lastPlayed via repo if needed; currently setProgress handles it
      // We keep lastPlayed update here for backward compat
      const db = getDb();
      await db.query(`UPDATE movie:⟨${idStr}⟩ SET lastPlayed = $now`, { now });
    },
  );

  // Synchronous variant used in renderer beforeunload to guarantee delivery
  ipcMain.on("movies:progress:set:sync", (event, id: string, progress: number | null) => {
    const idStr = typeof id === "string" ? id : String(id);
    const db = getDb();
    if (progress === null) {
      db.query(`UPDATE movie:⟨${escapeId(idStr)}⟩ SET watchProgress = none`).catch(() => {});
    } else {
      db.query(`UPDATE movie:⟨${escapeId(idStr)}⟩ SET watchProgress = $progress`, { progress }).catch(() => {});
    }
    // Update lastPlayed too
    db.query(`UPDATE movie:⟨${escapeId(idStr)}⟩ SET lastPlayed = $now`, { now: Date.now() }).catch(() => {});
    event.returnValue = true;
  });

  ipcMain.handle("movies:metadata", async (_e, title: string) => {
    const settings = await getSettings();
    return await searchMovie(title, settings.tmdbApiKey);
  });

  ipcMain.handle("movies:regenerateThumbnail", async (_e, movie: Movie) => {
    const { join } = await import("path");
    const { existsSync, unlinkSync } = await import("fs");
    const dest = join(
      app.getPath("userData"),
      "thumbnails",
      "movies",
      `${movie.id}.jpg`,
    );
    if (existsSync(dest)) {
      try {
        unlinkSync(dest);
      } catch {}
    }
    const coverUrl = await generateMovieThumbnail(movie.filePath, movie.id);
    if (coverUrl) {
      await MovieRepo.setCoverUrl(movie.id, coverUrl);
    }
    return coverUrl ?? null;
  });

  ipcMain.handle("music:scan", async (_e, extraPaths?: string[]) => {
    if (scanLocks.music) return [];
    scanLocks.music = true;
    sendToWindow(window, "scan:progress", {
      scanner: "music",
      current: 0,
      total: 0,
      status: "scanning",
    });
    const tracks = await scanMusicFiles(extraPaths).finally(() => {
      scanLocks.music = false;
    });
    log.debug("music:scan", `inserting ${tracks.length} tracks into DB...`);
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (i % 100 === 0)
        log.debug("music:scan", `db insert ${i + 1}/${tracks.length}`);
      await MusicRepo.upsert({ ...track, missing: false });
    }
    log.debug("music:scan", "DB insert done");

    // Mark any local tracks from scanned paths that were not found as missing
    const allScannedPaths = [getXdgMusicDir(), ...(extraPaths ?? [])].filter(existsSync);
    await markMissingMusic(allScannedPaths, tracks);

    sendToWindow(window, "scan:progress", {
      scanner: "music",
      current: tracks.length,
      total: tracks.length,
      status: "done",
    });
    // Also scan remote sources configured for music
    void scanAllRemoteSources("music", sendRemoteProgress);
    sendToWindow(window, "scan:background:complete", { type: "music" });
    return tracks;
  });

  ipcMain.handle("music:list", async () => {
    const db = getDb();
    const result = await db.query<[MusicTrack[]]>(
      "SELECT * FROM music_track ORDER BY artist, album, trackNumber ASC",
    );
    const tracks = (result[0] ?? []) as MusicTrack[];
    const coverRoot = join(app.getPath("userData"), "covers", "music").replace(
      /\\/g,
      "/",
    );
    return tracks.map((t) => {
      const id =
        typeof t.id === "string" ? t.id : ((t.id as any)?.id ?? String(t.id));
      const normalized = { ...t, id };
      if (!normalized.albumArtUrl?.startsWith("file://")) return normalized;
      const pathPart = normalized.albumArtUrl.slice("file://".length);
      if (!pathPart.startsWith(coverRoot)) return normalized;
      const rel = pathPart.slice(coverRoot.length + 1).replace(/\\/g, "/");
      return { ...normalized, albumArtUrl: `ember://covers/music/${rel}` };
    });
  });

  ipcMain.handle("music:launch", (_e, track: MusicTrack) => {
    launchTrack(track);
  });

  ipcMain.handle("music:favorite", async (_e, id: string, value: boolean) => {
    await MusicRepo.setFavorite(id, value);
  });

  ipcMain.handle("music:tag", async (_e, id: string, tags: string[]) => {
    await MusicRepo.setTags(id, tags);
  });

  ipcMain.handle("music:writeTags", async (_e, filePath: string, tags: AudioTags) => {
    return writeTags(filePath, tags);
  });

  ipcMain.handle("music:hide", async (_e, id: string, value: boolean) => {
    await MusicRepo.setHidden(id, value);
  });

  ipcMain.handle("music:delete", async (_e, id: string) => {
    await MusicRepo.delete(id);
  });

  ipcMain.handle("music:uninstall", async (_e, track: MusicTrack) => {
    return uninstallMusic(track);
  });

  ipcMain.handle("music:searchCoverArt", async (_e, track: MusicTrack) => {
    const imageUrl = await searchCoverArt(
      track.artist ?? "",
      track.album ?? "",
    );
    if (!imageUrl) return null;
    const imageBuffer = await downloadImage(imageUrl);
    if (!imageBuffer) return null;
    const result = await embedCoverArt(track, imageBuffer);
    return result ?? null;
  });

  ipcMain.handle("music:pickCoverImage", async (_e, track: MusicTrack) => {
    const result = await pickCoverImage(track);
    return result ?? null;
  });

  ipcMain.handle("music:loadThumbnail", async (_e, track: MusicTrack) => {
    const url = await loadThumbnail(track);
    return url ?? null;
  });

  ipcMain.handle("music:regenerateThumbnail", async (_e, track: MusicTrack) => {
    const url = await regenerateMusicThumbnail(track);
    return url ?? null;
  });

  ipcMain.handle("music:artistThumbnail", async (_e, artist: string) => {
    const url = await fetchArtistThumbnail(artist);
    return url ?? null;
  });

  ipcMain.handle("music:enrich", async (_e, track: MusicTrack) => {
    const settings = await getSettings();
    const result = await enrichTrack(track, {
      tadbApiKey: settings.theaudiodbApiKey,
    });
    if (Object.keys(result.updates).length > 0) {
      const db = getDb();
      const id =
        typeof track.id === "string"
          ? track.id
          : (track.id as any)?.id ?? String(track.id);
      const setClauses = Object.entries(result.updates)
        .map(([key]) => `${key} = $updates.${key}`)
        .join(", ");
      await db.query(
        `UPDATE music_track:⟨${id}⟩ SET ${setClauses}`,
        { updates: result.updates },
      );
    }
    return result;
  });

  ipcMain.handle("music:enrichBatch", async (_e, tracks: MusicTrack[]) => {
    const settings = await getSettings();
    const results = await enrichTracks(tracks, {
      tadbApiKey: settings.theaudiodbApiKey,
      onProgress: (current, total) => {
        sendToWindow(window, "scan:progress", {
          scanner: "music-enrich",
          current,
          total,
          status: current === total ? "done" : "scanning",
        });
      },
    });

    // Persist all enrichment updates to DB
    const db = getDb();
    for (const [trackId, result] of results) {
      if (Object.keys(result.updates).length > 0) {
        try {
          const setClauses = Object.entries(result.updates)
            .map(([key]) => `${key} = $updates.${key}`)
            .join(", ");
          await db.query(
            `UPDATE music_track:⟨${trackId}⟩ SET ${setClauses}`,
            { updates: result.updates },
          );
        } catch (err) {
          log.error("music:enrichBatch", `DB update failed for ${trackId}: ${err}`);
        }
      }
    }

    // Convert Map to serializable object
    const serialized: Record<string, { updates: Partial<MusicTrack>; coverArtUrl?: string; artistImageUrl?: string }> = {};
    for (const [id, result] of results) {
      serialized[id] = result;
    }
    return serialized;
  });

  ipcMain.handle("music:lastPlayed", async (_e, id: string, timestamp: number) => {
    await MusicRepo.setLastPlayed(id, timestamp);
  });

  ipcMain.handle("music:reorganizePreview", async (_e, pattern: string) => {
    const settings = await getSettings();
    const musicPaths = [getXdgMusicDir(), ...(settings.musicPaths ?? [])].filter(existsSync);
    return previewReorganize(pattern, musicPaths);
  });

  ipcMain.handle("music:reorganize", async (_e, pattern: string) => {
    const settings = await getSettings();
    const musicPaths = [getXdgMusicDir(), ...(settings.musicPaths ?? [])].filter(existsSync);
    const result = await executeReorganize(pattern, musicPaths);

    // Notify renderer about moved files so it can update the music player queue
    if (result.moves.length > 0) {
      sendToWindow(window, "music:filesMoved", { moves: result.moves });
    }

    return result;
  });

  ipcMain.handle("tv:scan", async (_e, extraPaths?: string[]) => {
    if (scanLocks.tv) return [];
    scanLocks.tv = true;
    sendToWindow(window, "scan:progress", {
      scanner: "tv",
      current: 0,
      total: 0,
      status: "scanning",
    });
    const shows = await scanTvShows(extraPaths).finally(() => {
      scanLocks.tv = false;
    });
    for (const show of shows) {
      await TVRepo.upsert(show);
    }
    sendToWindow(window, "scan:progress", {
      scanner: "tv",
      current: shows.length,
      total: shows.length,
      status: "done",
    });
    return shows;
  });

  ipcMain.handle("tv:list", async () => {
    return TVRepo.list();
  });

  ipcMain.handle("tv:launch", (_e, filePath: string) => {
    launchMovie({ id: "", title: "", filePath } as Movie);
  });

  ipcMain.handle("tv:favorite", async (_e, id: string, value: boolean) => {
    await TVRepo.setFavorite(id, value);
  });

  ipcMain.handle("tv:tag", async (_e, id: string, tags: string[]) => {
    await TVRepo.setTags(id, tags);
  });

  ipcMain.handle("tv:hide", async (_e, id: string, value: boolean) => {
    await TVRepo.setHidden(id, value);
  });

  ipcMain.handle("tv:metadata", async (_e, title: string) => {
    const settings = await getSettings();
    return await searchShow(title, settings.tmdbApiKey);
  });

  ipcMain.handle("tv:regenerateThumbnail", async (_e, show: TVShow) => {
    const { join } = await import("path");
    const { existsSync, unlinkSync } = await import("fs");
    const dest = join(
      app.getPath("userData"),
      "thumbnails",
      "tv",
      `${show.id}.jpg`,
    );
    if (existsSync(dest)) {
      try {
        unlinkSync(dest);
      } catch {}
    }
    const episodes =
      show.seasons?.flatMap((s) =>
        s.episodes.map((ep) => ({
          season: s.seasonNumber,
          ep: ep.episodeNumber,
          path: ep.filePath,
        })),
      ) ?? [];
    const coverUrl = await generateShowThumbnail(show.dirPath, episodes, show.id);
    if (coverUrl) {
      await TVRepo.setCoverUrl(show.id, coverUrl);
    }
    return coverUrl ?? null;
  });

  ipcMain.handle("input:devices", async () => {
    return await getConnectedDevices();
  });

  ipcMain.handle("input:mappings:get", async (_e, deviceId: string) => {
    return MappingRepo.get(deviceId);
  });

  ipcMain.handle(
    "input:mappings:set",
    async (_e, deviceId: string, inputCode: string, action: string) => {
      await MappingRepo.set(deviceId, inputCode, action);
    },
  );

  ipcMain.handle("input:mappings:reset", async (_e, deviceId: string) => {
    await MappingRepo.reset(deviceId);
  });

  ipcMain.handle("input:alias:get", async (_e, deviceId: string) => {
    return AliasRepo.get(deviceId);
  });

  ipcMain.handle("input:alias:set", async (_e, deviceId: string, alias: string) => {
    await AliasRepo.set(deviceId, alias);
  });

  ipcMain.handle("input:alias:remove", async (_e, deviceId: string) => {
    await AliasRepo.remove(deviceId);
  });

  ipcMain.handle("input:device:reconnect", async (_e, deviceId: string) => {
    rescanDevice(deviceId);
  });

  ipcMain.handle("plugins:list", async () => {
    return await listPlugins();
  });

  ipcMain.handle("plugins:reload", async () => {
    return await reloadPlugins();
  });

  ipcMain.handle("plugins:discover", async () => {
    return await discoverPlugins();
  });

  ipcMain.handle("plugins:discover-all", async () => {
    return await discoverAllReleases();
  });

  ipcMain.handle("plugins:managed-list", async () => {
    return await listManagedPlugins();
  });

  ipcMain.handle("plugins:install", async (_e, plugin: DiscoveredPlugin) => {
    await installPlugin(plugin);
    return true;
  });

  ipcMain.handle("plugins:uninstall", async (_e, id: string) => {
    await uninstallPlugin(id);
    return true;
  });

  ipcMain.handle("plugins:update", async (_e, plugin: DiscoveredPlugin) => {
    await updatePlugin(plugin);
    return true;
  });

  ipcMain.handle("plugins:set-enabled", async (_e, id: string, enabled: boolean) => {
    await setPluginEnabled(id, enabled);
    return true;
  });

  ipcMain.handle("plugins:launch-game", async (_e, game: Game) => {
    const result = await callPluginHook<{ type: string; url?: string; pluginId: string }>("onGameStart", game);
    return result ?? null;
  });

  ipcMain.handle("app:xdg-defaults", async () => {
    const sources = await getDefaultScanSourcesAsync();
    log.info("app:xdg-defaults", `Returning sources: ${JSON.stringify(sources)}`);
    return {
      videosDir: getXdgVideosDir(),
      musicDir: getXdgMusicDir(),
      ...sources,
    };
  });

  ipcMain.handle("db:wipe-thumbnails", async () => {
    const userData = app.getPath("userData");
    const cacheDirs = [
      join(userData, "covers", "flash", "screenshots"),
      join(userData, "covers", "flash", "generated"),
      join(userData, "covers", "libretro", "screenshots"),
      join(userData, "covers", "libretro", "generated"),
      join(userData, "covers", "music"),
      join(userData, "covers", "artists"),
      join(userData, "thumbnails", "movies"),
      join(userData, "thumbnails", "tv"),
    ];
    for (const dir of cacheDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        log.warn("db:wipe-thumbnails", `failed to clear cache dir: ${dir} ${err}`);
      }
    }
    return true;
  });

  ipcMain.handle("db:clear", async () => {
    const db = getDb();
    await db.query(`
      DELETE FROM game;
      DELETE FROM movie;
      DELETE FROM music_track;
      DELETE FROM tv_show;
      DELETE FROM controller_mapping;
    `);

    const userData = app.getPath("userData");
    const cacheDirs = [
      join(userData, "covers", "flash", "screenshots"),
      join(userData, "covers", "flash", "generated"),
      join(userData, "covers", "libretro", "screenshots"),
      join(userData, "covers", "libretro", "generated"),
      join(userData, "covers", "music"),
      join(userData, "covers", "artists"),
      join(userData, "thumbnails", "movies"),
      join(userData, "thumbnails", "tv"),
    ];
    for (const dir of cacheDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        log.warn("db:clear", `failed to clear cache dir: ${dir} ${err}`);
      }
    }

    return true;
  });

  ipcMain.handle("db:clear-all", async () => {
    const db = getDb();
    await db.query(`
      DELETE FROM game;
      DELETE FROM movie;
      DELETE FROM music_track;
      DELETE FROM tv_show;
      DELETE FROM controller_mapping;
      DELETE FROM broken_flash_game;
      DELETE FROM game_config;
      DELETE FROM collection;
      DELETE FROM collection_item;
      DELETE FROM streaming_service;
      DELETE FROM setting;
    `);

    const userData = app.getPath("userData");
    const cacheDirs = [
      join(userData, "covers", "flash", "screenshots"),
      join(userData, "covers", "flash", "generated"),
      join(userData, "covers", "libretro", "screenshots"),
      join(userData, "covers", "libretro", "generated"),
      join(userData, "covers", "music"),
      join(userData, "covers", "artists"),
      join(userData, "thumbnails", "movies"),
      join(userData, "thumbnails", "tv"),
    ];
    for (const dir of cacheDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        log.warn("db:clear-all", `failed to clear cache dir: ${dir} ${err}`);
      }
    }

    const windowStatePath = join(userData, "window-state.json");
    try {
      rmSync(windowStatePath, { force: true });
    } catch (err) {
      log.warn("db:clear-all", `failed to remove window-state.json: ${err}`);
    }

    return true;
  });

  ipcMain.handle("db:delete-missing", async () => {
    const [games, movies, music] = await Promise.all([
      GameRepo.deleteMissing(),
      MovieRepo.deleteMissing(),
      MusicRepo.deleteMissing(),
    ]);
    log.info("db:delete-missing", `deleted ${games} games, ${movies} movies, ${music} tracks`);
    return { games, movies, music };
  });

  ipcMain.handle("db:list-corrupt", async () => {
    const [games, movies, music] = await Promise.all([
      GameRepo.listCorrupt(),
      MovieRepo.listCorrupt(),
      MusicRepo.listCorrupt(),
    ]);
    log.info("db:list-corrupt", `${games.length} games, ${movies.length} movies, ${music.length} tracks`);
    return { games, movies, music };
  });

  ipcMain.handle("db:delete-corrupt", async () => {
    const [games, movies, music] = await Promise.all([
      GameRepo.deleteCorrupt(),
      MovieRepo.deleteCorrupt(),
      MusicRepo.deleteCorrupt(),
    ]);
    log.info("db:delete-corrupt", `deleted ${games} games, ${movies} movies, ${music} tracks`);
    return { games, movies, music };
  });

  ipcMain.handle("dialog:open-directory", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle("dialog:open-file", async (_e, opts?: { filters?: Electron.FileFilter[]; title?: string }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: opts?.title ?? "Select File",
      properties: ["openFile"],
      filters: opts?.filters ?? [{ name: "All Files", extensions: ["*"] }],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle("shell:openPath", async (_e, path: string) => {
    return shell.openPath(path);
  });

  ipcMain.handle("shell:showItemInFolder", async (_e, path: string) => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle("files:read", async (_e, filePath: string) => {
    try {
      return readFileSync(filePath);
    } catch (err) {
      log.warn("files:read", `failed: ${filePath} ${err}`);
      return null;
    }
  });

  ipcMain.handle("flash-filters:list", async () => {
    const dir = join(app.getPath("userData"), "flash-filters");
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir);
    const glslFiles = entries.filter((f) => f.endsWith(".glsl"));
    return glslFiles.map((name) => {
      const content = readFileSync(join(dir, name), "utf-8");
      return { id: name.replace(".glsl", ""), name: name.replace(".glsl", ""), content };
    });
  });

  ipcMain.handle("flash-filters:open-dir", async () => {
    const dir = join(app.getPath("userData"), "flash-filters");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
  });

  /* ------------------------------------------------------------------ */
  /*  Collections                                                        */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("collections:list", async () => {
    return CollectionRepo.list();
  });

  ipcMain.handle("collections:get", async (_e, id: string) => {
    return CollectionRepo.get(id);
  });

  ipcMain.handle("collections:create", async (_e, collection: import("../../shared/types").Collection) => {
    await CollectionRepo.create(collection);
  });

  ipcMain.handle("collections:update", async (_e, collection: import("../../shared/types").Collection) => {
    await CollectionRepo.update(collection);
  });

  ipcMain.handle("collections:delete", async (_e, id: string) => {
    await CollectionRepo.delete(id);
  });

  ipcMain.handle("collections:items:list", async (_e, collectionId: string) => {
    return CollectionRepo.listItems(collectionId);
  });

  ipcMain.handle("collections:items:add", async (_e, item: import("../../shared/types").CollectionItem) => {
    await CollectionRepo.addItem(item);
  });

  ipcMain.handle("collections:items:remove", async (_e, collectionId: string, itemId: string) => {
    await CollectionRepo.removeItem(collectionId, itemId);
  });

  ipcMain.handle("collections:smart:evaluate", async (_e, itemType: string, filter: import("../../shared/types").SmartFilterGroup) => {
    return CollectionRepo.evaluateSmartFilter(itemType, filter);
  });

  /* ------------------------------------------------------------------ */
  /*  Playlists                                                          */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("playlist:list", async () => {
    return PlaylistRepo.list();
  });

  ipcMain.handle("playlist:create", async (_e, playlist: import("../../shared/types").Playlist) => {
    await PlaylistRepo.create(playlist);
    return playlist;
  });

  ipcMain.handle("playlist:update", async (_e, id: string, data: Partial<import("../../shared/types").Playlist>) => {
    const existing = await PlaylistRepo.get(id);
    if (!existing) throw new Error(`Playlist not found: ${id}`);
    const updated = { ...existing, ...data, updatedAt: Date.now() };
    await PlaylistRepo.update(updated);
    return updated;
  });

  ipcMain.handle("playlist:delete", async (_e, id: string) => {
    await PlaylistRepo.delete(id);
  });

  ipcMain.handle("playlist:addTracks", async (_e, id: string, trackIds: string[]) => {
    await PlaylistRepo.addTracks(id, trackIds);
    return PlaylistRepo.get(id);
  });

  ipcMain.handle("playlist:removeTracks", async (_e, id: string, trackIds: string[]) => {
    await PlaylistRepo.removeTracks(id, trackIds);
    return PlaylistRepo.get(id);
  });

  ipcMain.handle("playlist:reorder", async (_e, id: string, trackIds: string[]) => {
    await PlaylistRepo.reorder(id, trackIds);
    return PlaylistRepo.get(id);
  });

  /* ------------------------------------------------------------------ */
  /*  Streaming Services                                                 */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("streaming:list", async (_e, category?: string) => {
    if (category) return getStreamingServices(category);
    return getAllStreamingServices();
  });

  ipcMain.handle("streaming:add", async (_e, service: Omit<StreamingService, "isBuiltin" | "sortOrder">) => {
    return addCustomService(service);
  });

  ipcMain.handle("streaming:update", async (_e, service: StreamingService) => {
    return updateService(service);
  });

  ipcMain.handle("streaming:delete", async (_e, id: string) => {
    return deleteService(id);
  });

  ipcMain.handle("streaming:setEnabled", async (_e, id: string, enabled: boolean) => {
    return setServiceEnabled(id, enabled);
  });

  ipcMain.handle("streaming:detectDesktopApp", async (_e, command: string) => {
    return detectDesktopApp(command);
  });

  ipcMain.handle("streaming:launch", async (_e, service: StreamingService) => {
    const desktopAvailable = service.desktopApp
      ? detectDesktopApp(service.desktopApp)
      : false;

    if (desktopAvailable && service.desktopApp) {
      const { spawn } = await import("child_process");
      const args = service.desktopAppArgs ?? [];
      const proc = spawn(service.desktopApp, args, {
        detached: true,
        stdio: "ignore",
      });
      proc.on("error", (err) => {
        log.error("streaming:launch", `Failed to launch ${service.desktopApp}: ${err}`);
      });
      proc.unref();
    } else {
      await shell.openExternal(service.url);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Streaming Frontpage Items                                          */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("streaming:frontpage:report", async (_e, serviceId: string, items: import("../../shared/types").StreamingFrontpageItem[]) => {
    await StreamingFrontpageItemRepo.replaceForService(serviceId, items);
    return { success: true, count: items.length };
  });

  ipcMain.handle("streaming:frontpage:list", async (_e, serviceId: string) => {
    return StreamingFrontpageItemRepo.listByService(serviceId);
  });

  ipcMain.handle("streaming:frontpage:listAll", async () => {
    return StreamingFrontpageItemRepo.listAll();
  });

  ipcMain.handle("streaming:frontpage:clear", async (_e, maxAgeMs?: number) => {
    await StreamingFrontpageItemRepo.clearOld(maxAgeMs ?? 7 * 24 * 60 * 60 * 1000);
    return { success: true };
  });

  ipcMain.handle("streaming:usage:start", async (_e, id: string) => {
    await StreamingServiceRepo.setLastPlayed(id, Date.now());
    return { success: true };
  });

  ipcMain.handle("streaming:usage:stop", async (_e, id: string, seconds: number) => {
    await StreamingServiceRepo.addPlayTime(id, seconds);
    return { success: true };
  });

  /* ------------------------------------------------------------------ */
  /*  Streaming Adapter Framework (deep integration)                       */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("streaming:adapter:authenticate", async (_e, serviceId: string) => {
    return authenticateAdapter(serviceId);
  });

  ipcMain.handle("streaming:adapter:disconnect", async (_e, serviceId: string) => {
    await disconnectAdapter(serviceId);
    return { success: true };
  });

  ipcMain.handle("streaming:adapter:search", async (_e, serviceId: string, query: string, types?: ("track" | "album" | "artist" | "playlist")[]) => {
    return adapterSearch(serviceId, query, types);
  });

  ipcMain.handle("streaming:adapter:play", async (_e, serviceId: string, uri?: string) => {
    await adapterPlay(serviceId, uri);
    return { success: true };
  });

  ipcMain.handle("streaming:adapter:pause", async (_e, serviceId: string) => {
    await adapterPause(serviceId);
    return { success: true };
  });

  ipcMain.handle("streaming:adapter:next", async (_e, serviceId: string) => {
    await adapterNext(serviceId);
    return { success: true };
  });

  ipcMain.handle("streaming:adapter:previous", async (_e, serviceId: string) => {
    await adapterPrevious(serviceId);
    return { success: true };
  });

  ipcMain.handle("streaming:adapter:currentlyPlaying", async (_e, serviceId: string) => {
    return adapterCurrentlyPlaying(serviceId);
  });

  ipcMain.handle("streaming:adapter:getDevices", async (_e, serviceId: string) => {
    return adapterGetDevices(serviceId);
  });

  ipcMain.handle("streaming:adapter:getTrack", async (_e, serviceId: string, id: string) => {
    return adapterGetTrack(serviceId, id);
  });

  ipcMain.handle("streaming:adapter:getAlbum", async (_e, serviceId: string, id: string) => {
    return adapterGetAlbum(serviceId, id);
  });

  ipcMain.handle("streaming:adapter:getPlaylist", async (_e, serviceId: string, id: string) => {
    return adapterGetPlaylist(serviceId, id);
  });

  /* ------------------------------------------------------------------ */
  /*  Streaming Media Key Injection (to active webview)                  */
  /* ------------------------------------------------------------------ */

  ipcMain.on("streaming:mediaKeys", (_e, action: "play" | "pause" | "next" | "previous") => {
    // Send to all webview preloads. Each webview's preload dispatches the key
    // event to its page. In the future we could target only the active webview.
    for (const wc of webContents.getAllWebContents()) {
      if (wc.getType() === "webview") {
        wc.send("streaming:mediaKeys", action);
      }
    }
  });

  ipcMain.handle("app:getPreloadPath", async (_e, name: string) => {
    return join(__dirname, "../preload", `${name}.js`);
  });

  /* ------------------------------------------------------------------ */
  /*  Streaming Extension Manager                                        */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("streaming:extensions:ensureDefaults", async () => {
    return ensureDefaultExtensions();
  });

  ipcMain.handle("streaming:extensions:download", async (_e, extId: string, url: string, version: string) => {
    return downloadExtension(url, extId, version);
  });

  ipcMain.handle("streaming:extensions:load", async (_e, extId: string, partition: string) => {
    return loadExtensionIntoSession(extId, partition);
  });

  ipcMain.handle("streaming:extensions:unload", async (_e, extId: string, partition: string) => {
    return unloadExtensionFromSession(extId, partition);
  });

  ipcMain.handle("streaming:extensions:remove", async (_e, extId: string) => {
    return removeExtension(extId);
  });

  ipcMain.handle("streaming:extensions:apply", async (_e, partition: string, extensions: StreamingExtension[]) => {
    return applyExtensionsToPartition(partition, extensions);
  });

  /* ------------------------------------------------------------------ */
  /*  Local AI (Ollama)                                                  */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("localAi:available", async () => {
    return isOllamaAvailable();
  });

  ipcMain.handle("localAi:nlToFilter", async (_e, query: string, itemType: string) => {
    return naturalLanguageToFilter(query, itemType);
  });

  ipcMain.handle("localAi:groupItems", async (_e, items: Array<{
    id: string;
    title: string;
    genres?: string[];
    tags?: string[];
    description?: string;
    platform?: string;
    artist?: string;
    album?: string;
    genre?: string;
  }>, groupCount: number) => {
    return aiGroupItems(items, groupCount);
  });

  /* ------------------------------------------------------------------ */
  /*  Package Manager (Libretro cores, emulators, dependencies)         */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("packages:list", async () => {
    return listAvailablePackages();
  });

  ipcMain.handle("packages:search", async (_e, query: string) => {
    return searchPackages(query);
  });

  ipcMain.handle("packages:install", async (_e, packageId: string) => {
    return installPackage(packageId, window);
  });

  ipcMain.handle("packages:uninstall", async (_e, packageId: string) => {
    return uninstallPackage(packageId, window);
  });

  ipcMain.handle("packages:update", async () => {
    return checkUpdates(window);
  });

  ipcMain.handle("packages:setAptPassword", async (_e, password: string) => {
    return setAptPassword(password);
  });

  ipcMain.handle("packages:detectCores", async () => {
    return detectInstalledCores();
  });

  ipcMain.handle("packages:detectWineRunner", async () => {
    return detectWineRunner();
  });

  /* ------------------------------------------------------------------ */
  /*  Emulator Configuration                                             */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("dolphin:openSettings", async () => {
    const { spawn } = await import("child_process");
    const { existsSync } = await import("fs");
    const { homedir } = await import("os");
    const { join } = await import("path");

    // Try to detect Dolphin installation and open its settings
    const dolphinPaths = [
      "/usr/bin/dolphin-emu",
      "/var/lib/flatpak/exports/bin/org.DolphinEmu.dolphin-emu",
    ];

    for (const path of dolphinPaths) {
      if (existsSync(path)) {
        if (path.includes("flatpak")) {
          spawn("flatpak", ["run", "org.DolphinEmu.dolphin-emu", "--settings"], {
            detached: true,
            stdio: "ignore",
          }).unref();
        } else {
          spawn(path, ["--settings"], {
            detached: true,
            stdio: "ignore",
          }).unref();
        }
        return true;
      }
    }
    return false;
  });

  ipcMain.handle("dolphin:openConfig", async () => {
    const { homedir } = await import("os");
    const { join } = await import("path");
    const { existsSync } = await import("fs");

    const configPaths = [
      join(homedir(), ".local/share/dolphin-emu"),
      join(homedir(), ".var/app/org.DolphinEmu.dolphin-emu/config/dolphin-emu"),
    ];

    for (const path of configPaths) {
      if (existsSync(path)) {
        shell.openPath(path);
        return true;
      }
    }
    return false;
  });

  ipcMain.handle("controller:openMapping", async () => {
    // For now, this will navigate to the Input tab in settings
    // In the future, this could open a dedicated controller mapping UI
    return true;
  });

  ipcMain.handle("controller:resetMappings", async () => {
    const db = getDb();
    await db.query("DELETE FROM controller_mapping");
    return true;
  });

  /* ------------------------------------------------------------------ */
  /*  Store / itch.io                                                    */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("store:itch:launch", async (_e, game: Game) => {
    return launchItchGame(game);
  });

  ipcMain.handle("store:providers:list", async () => {
    return [
      { id: "itch", name: "itch.io", url: "https://itch.io", icon: "itch-io" },
    ];
  });

  /* ------------------------------------------------------------------ */
  /*  Download interception — redirect itch.io downloads to Games dir   */
  /* ------------------------------------------------------------------ */

  let cachedGamePaths: string[] = [];
  (async () => {
    try {
      const s = await getSettings();
      cachedGamePaths = s.gamePaths ?? [];
    } catch {
      // ignore
    }
  })();

  ipcMain.on("store:gamePaths:cache", (_e, paths: string[]) => {
    cachedGamePaths = paths;
  });

  session.defaultSession.on("will-download", (_event, item, _webContents) => {
    const url = item.getURL();
    const filename = item.getFilename();
    const isItchDownload =
      url.includes("itch.io") ||
      url.includes("itch.zone") ||
      url.includes("hwcdn.net") ||
      url.includes("amazonaws.com") ||
      filename.endsWith(".zip") ||
      filename.endsWith(".tar.gz") ||
      filename.endsWith(".tar.bz2") ||
      filename.endsWith(".rar") ||
      filename.endsWith(".7z");

    if (isItchDownload) {
      const basePath = cachedGamePaths[0] ?? join(homedir(), "Games");
      const itchDir = join(basePath, "itch");
      try {
        if (!existsSync(itchDir)) {
          mkdirSync(itchDir, { recursive: true });
        }
      } catch {
        // ignore mkdir failure
      }
      item.setSavePath(join(itchDir, filename));
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Remote Sources (rclone)                                            */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("rclone:list", async () => {
    return listRemotes();
  });

  ipcMain.handle("rclone:add", async (_e, source: Omit<import("../../shared/types").RemoteSource, "id">, creds: Record<string, string | undefined>) => {
    const added = await addRemote(source, creds);
    // Queue media scan for the newly added source
    queueRemoteSourceScan(added, sendRemoteProgress);
    return added;
  });

  ipcMain.handle("rclone:update", async (_e, source: import("../../shared/types").RemoteSource, creds?: Record<string, string | undefined>) => {
    return updateRemote(source, creds);
  });

  ipcMain.handle("rclone:remove", async (_e, id: string) => {
    return removeRemote(id);
  });

  ipcMain.handle("rclone:listFiles", async (_e, source: import("../../shared/types").RemoteSource, path: string) => {
    return getRemoteFileList(source, path);
  });

  ipcMain.handle("rclone:startServe", async (_e, source: import("../../shared/types").RemoteSource) => {
    return startServe(source);
  });

  ipcMain.handle("rclone:stopServe", async (_e, id: string) => {
    return stopServe(id);
  });

  ipcMain.handle("rclone:getServePort", async (_e, id: string) => {
    return await getServePort(id);
  });

  ipcMain.handle("rclone:getAllServePorts", async () => {
    const ports = await getAllServePorts();
    return Object.fromEntries(ports);
  });

  ipcMain.handle("rclone:checkAuth", async (_e, source: import("../../shared/types").RemoteSource) => {
    return checkRemoteNeedsAuth(source);
  });

  ipcMain.handle("rclone:testConnection", async (_e, source: import("../../shared/types").RemoteSource) => {
    return testRemoteConnection(source);
  });

  ipcMain.handle("rclone:testCredentials", async (_e, source: import("../../shared/types").RemoteSource) => {
    return testRemoteCredentials(source);
  });

  ipcMain.handle("rclone:testPath", async (_e, source: import("../../shared/types").RemoteSource) => {
    return testRemotePath(source);
  });

  ipcMain.handle("remote:checkAvailability", async () => {
    await checkRemoteAvailability();
    return true;
  });

  ipcMain.handle("remote:deleteMissing", async (_e, type: "movie" | "music" | "game") => {
    switch (type) {
      case "movie":
        return MovieRepo.deleteMissing();
      case "music":
        return MusicRepo.deleteMissing();
      case "game":
        return GameRepo.deleteMissing();
      default:
        return 0;
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Network Discovery                                                  */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("network:discover", async () => {
    return discoverNetworkDevices();
  });

  /* ------------------------------------------------------------------ */
  /*  OAuth (internal webview)                                          */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("oauth:start", async (_e, authUrl: string, redirectPatterns: string[]) => {
    return startOAuthFlow(authUrl, redirectPatterns);
  });

  /* ------------------------------------------------------------------ */
  /*  Credential Store                                                   */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("credentials:setMasterPassword", async (_e, password: string) => {
    return setMasterPassword(password);
  });

  ipcMain.handle("credentials:clearMasterPassword", async () => {
    return clearMasterPassword();
  });

  ipcMain.handle("credentials:hasMasterPassword", async () => {
    return hasMasterPassword();
  });

  ipcMain.handle("credentials:needsMasterPassword", async (_e, sources: import("../../shared/types").RemoteSource[]) => {
    return needsMasterPassword(sources);
  });

  ipcMain.handle("credentials:needsSessionReauth", async (_e, sources: import("../../shared/types").RemoteSource[]) => {
    return needsSessionReauth(sources);
  });
}
