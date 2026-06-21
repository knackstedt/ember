import { app, BrowserWindow, shell, protocol, Menu, powerMonitor } from "electron";
import { EventEmitter } from "events";
import path, { join } from "path";
import { readFileSync, createReadStream, statSync, lstatSync, readlinkSync, unlinkSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { initDb } from "./db";
import { registerIpcHandlers } from "./ipc";
import { initInputSystem, destroyInputSystem, clearFailureCooldowns, triggerRescan } from "./input/evdev";
import { getSettings, setSetting } from "./services/settings.service";
import type { TabId } from "../shared/types";
import { setFlashThumbnailConcurrency } from "./services/flash-thumbnail.service";
import { getWindowState, saveWindowState } from "./services/window-state.service";
import { createLogger } from "./util/logger";
import { getXdgVideosDir } from "./scanners/xdg";
import { MovieRepo, RemoteSourceRepo } from "./db/repository";
import { getServePort } from "./services/rclone-manager";
import { startRemoteAvailabilityWorker, stopRemoteAvailabilityWorker } from "./services/remote-availability.service";
import { bootPlugins, shutdownPlugins } from "./plugins/loader";

// Suppress MaxListenersExceededWarning from Electron internals (webviews, extensions)
EventEmitter.defaultMaxListeners = 30;

const log = createLogger("info");

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

let errorDialogOpen = false;

function showErrorDialog(title: string, detail: string): void {
  if (errorDialogOpen) return;
  errorDialogOpen = true;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title.replace(/</g, "&lt;")}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #111;
      color: #ff6b6b;
      font-family: monospace;
      overflow: hidden;
    }
    .container {
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
      height: 100%;
      gap: 1rem;
    }
    h1 {
      margin: 0;
      font-size: 1rem;
      color: #ff6b6b;
    }
    pre {
      flex: 1;
      margin: 0;
      padding: 1rem;
      background: #1a1a1a;
      border-radius: 8px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.8rem;
      line-height: 1.4;
      user-select: text;
      -webkit-user-select: text;
      cursor: text;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
    }
    button {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 6px;
      background: #ff6b6b;
      color: #fff;
      font-family: monospace;
      font-size: 0.85rem;
      cursor: pointer;
    }
    button.secondary {
      background: #333;
      color: #ccc;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title.replace(/</g, "&lt;")}</h1>
    <pre id="detail">${detail.replace(/</g, "&lt;")}</pre>
    <div class="actions">
      <button class="secondary" onclick="window.close()">Close</button>
      <button onclick="copyText()">Copy</button>
    </div>
  </div>
  <script>
    function copyText() {
      const pre = document.getElementById('detail');
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(pre);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('copy');
      selection.removeAllRanges();
    }
  </script>
</body>
</html>`;

  const win = new BrowserWindow({
    width: 720,
    height: 480,
    title: title,
    backgroundColor: "#111111",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      devTools: false,
    },
  });

  win.loadURL(`data:text/html,${encodeURIComponent(html)}`);
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  win.on("closed", () => {
    errorDialogOpen = false;
  });
}

process.on("uncaughtException", (err) => {
  log.error("main", `uncaughtException: ${err.stack ?? err.message}`);
  showErrorDialog("Uncaught Exception", err.stack ?? err.message);
});

process.on("unhandledRejection", (reason) => {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  log.error("main", `unhandledRejection: ${detail}`);
  showErrorDialog("Unhandled Rejection", detail);
});

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killOldInstance(pid: number) {
  try {
    process.kill(pid, "SIGTERM");
    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (!isProcessRunning(pid)) return;
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone
    }
  } catch {
    // Already gone
  }
}

function clearStaleSingletonLock() {
  try {
    const userData = app.getPath("userData");
    const singletonLock = path.join(userData, "SingletonLock");

    const stats = lstatSync(singletonLock);
    if (!stats.isSymbolicLink()) return;

    const target = readlinkSync(singletonLock);
    try {
      statSync(target);
    } catch {
      unlinkSync(singletonLock);
      log.info("lock", "Removed stale SingletonLock");
    }
  } catch {
    // No SingletonLock or not a symlink — nothing to do.
  }
}

function acquireInstanceLock(): boolean {
  try {
    const userData = app.getPath("userData");
    const pidFile = path.join(userData, "ember.pid");

    // Ensure userData directory exists (fresh install or wiped profile)
    try { mkdirSync(userData, { recursive: true }); } catch {}

    if (existsSync(pidFile)) {
      const oldPid = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
      if (!isNaN(oldPid) && oldPid !== process.pid && isProcessRunning(oldPid)) {
        log.info("lock", `Killing existing instance (PID ${oldPid})`);
        killOldInstance(oldPid);
      }
    }

    writeFileSync(pidFile, String(process.pid));
    return true;
  } catch (err) {
    log.error("lock", `Failed to acquire instance lock: ${err}`);
    return false;
  }
}

function releaseInstanceLock() {
  try {
    const pidFile = path.join(app.getPath("userData"), "ember.pid");
    if (existsSync(pidFile)) {
      const pid = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
      if (pid === process.pid) {
        unlinkSync(pidFile);
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

if (!isDev) {
  if (!acquireInstanceLock()) {
    log.info("lock", "Failed to acquire instance lock, exiting");
    app.exit(0);
  }

  // Clean up any stale Electron SingletonLock left by a crashed previous run.
  clearStaleSingletonLock();

  app.on("quit", releaseInstanceLock);
  app.on("before-quit", releaseInstanceLock);
}

if (isDev) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
} else {
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-accelerated-video-decode");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch(
    "enable-features",
    "VaapiVideoDecoder,VaapiVideoEncoder",
  );
}

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function findFileRecursive(dir: string, targetName: string): string | null {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
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

async function createWindow(): Promise<void> {
  await initDb();

  // Migration: fix movies that were stored with bare filenames instead of
  // absolute paths. Prepend the XDG Videos directory if the file exists there.
  try {
    const movies = await MovieRepo.list();
    const videosDir = getXdgVideosDir();
    for (const movie of movies) {
      if (
        movie.filePath &&
        !movie.filePath.startsWith("/") &&
        !movie.filePath.startsWith("ember://")
      ) {
        const candidate = join(videosDir, movie.filePath);
        if (existsSync(candidate)) {
          await MovieRepo.upsert({ ...movie, filePath: candidate });
          log.info("migration", `fixed relative filePath for ${movie.title}: ${candidate}`);
        } else {
          // Try a recursive search in the Videos directory for the basename.
          const basename = movie.filePath.split("/").pop() || movie.filePath;
          const found = findFileRecursive(videosDir, basename);
          if (found) {
            await MovieRepo.upsert({ ...movie, filePath: found });
            log.info("migration", `fixed relative filePath (recursive) for ${movie.title}: ${found}`);
          } else {
            log.warn("migration", `could not resolve relative filePath for ${movie.title}: ${movie.filePath}`);
          }
        }
      }
    }
  } catch (err) {
    log.warn("migration", `failed to fix relative filePaths: ${err}`);
  }

  const settings = await getSettings();
  setFlashThumbnailConcurrency(settings.flashThumbnailConcurrency ?? 4);

  // Migration: rename tv-shows tab to streaming in user settings
  try {
    if ((settings.defaultTab as string) === "tv-shows") {
      await setSetting("defaultTab", "streaming");
    }
    if ((settings.disabledTabs as string[] | undefined)?.includes("tv-shows")) {
      await setSetting(
        "disabledTabs",
        (settings.disabledTabs as string[]).map((t) => (t === "tv-shows" ? "streaming" : t)) as TabId[],
      );
    }
  } catch (err) {
    log.warn("migration", `failed to migrate tab settings: ${err}`);
  }

  const winState = getWindowState();
  log.info("window-state", `creating window with ${JSON.stringify(winState)}`);

  mainWindow = new BrowserWindow({
    width: winState.width,
    height: winState.height,
    x: winState.x,
    y: winState.y,
    show: false,
    fullscreen: settings.fullscreen ?? false,
    backgroundColor: "#000000",
    frame: !settings.fullscreen,
    titleBarStyle: settings.fullscreen ? "hidden" : "default",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  // Remove the default application menu so its accelerators don't intercept
  // renderer-level shortcuts (especially on Linux where Ctrl+Fn combos are
  // commonly grabbed by the default menu or WM before reaching the page).
  Menu.setApplicationMenu(null);

  const persistBounds = () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getNormalBounds();
    saveWindowState({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: mainWindow.isMaximized(),
    });
  };

  mainWindow.on("resize", persistBounds);
  mainWindow.on("move", persistBounds);
  mainWindow.on("close", persistBounds);

  const tryOpenDevTools = (source: string) => {
    if (!isDev) {
      log.info("devtools", `skipping (${source}): isDev=false (isPackaged=${app.isPackaged}, NODE_ENV=${process.env.NODE_ENV ?? "undefined"})`);
      return;
    }
    if (!mainWindow) {
      log.warn("devtools", `skipped (${source}): mainWindow is null`);
      return;
    }
    if (mainWindow.webContents.isDevToolsOpened()) {
      log.info("devtools", `already open (${source})`);
      return;
    }
    try {
      mainWindow.webContents.openDevTools();
      log.info("devtools", `opened via ${source}`);
    } catch (err) {
      log.warn("devtools", `openDevTools failed (${source}): ${err}`);
    }
  };

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    if (winState.maximized && mainWindow && !mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
    tryOpenDevTools("ready-to-show");
  });

  mainWindow.webContents.on("dom-ready", () => {
    tryOpenDevTools("dom-ready");
  });

  mainWindow.webContents.on("did-finish-load", () => {
    setTimeout(() => tryOpenDevTools("did-finish-load"), 500);
  });

  // Retry a few times in case earlier attempts raced with renderer init
  let devToolsRetries = 0;
  const devToolsInterval = setInterval(() => {
    if (!mainWindow || mainWindow.webContents.isDevToolsOpened() || devToolsRetries >= 10) {
      clearInterval(devToolsInterval);
      return;
    }
    devToolsRetries++;
    tryOpenDevTools(`retry-${devToolsRetries}`);
  }, 300);

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    log.error("renderer", `did-fail-load: ${errorCode} — ${errorDescription}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("renderer", `render-process-gone: ${details.reason} (exitCode=${details.exitCode})`);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    // Suppress harmless Chromium ResizeObserver warnings that flood the logs
    // during zoom or rapid layout changes (virtua, framer-motion, etc.).
    if (message.includes("ResizeObserver loop completed with undelivered notifications")) {
      return;
    }
    const labels = ["debug","info", "warn", "error"];
    const moduleStr = sourceId ? `${sourceId}:${line}` : `line:${line}`;
    (log[labels[level] as "info"])(moduleStr, message);
  });

  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools();
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  registerIpcHandlers(mainWindow);

  try {
    await bootPlugins();
  } catch (err) {
    log.warn("plugins", `Failed to boot plugins: ${err}`);
  }

  const loadUrl = isDev && process.env["ELECTRON_RENDERER_URL"]
    ? process.env["ELECTRON_RENDERER_URL"]
    : join(__dirname, "../renderer/index.html");
  log.info("window", `loading renderer from: ${loadUrl}`);
  log.info("window", `preload path: ${join(__dirname, "../preload/index.js")}`);

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    await mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Initialise the input system in the background so the renderer can become
  // interactive immediately. The scan itself is now async/yielding so it does
  // not block the main process event loop.
  initInputSystem(mainWindow).catch((err) => {
    log.warn(
      "input",
      `evdev init failed (user may not be in input group): ${err}`
    );
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "ember",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

app.whenReady().then(async () => {
  app.setAppUserModelId("com.ember.app");

  protocol.handle("ember", async (request) => {
    const url = new URL(request.url);
    let filePath: string;

    // Remote source proxy: ember://remote/<sourceId>/<path...>
    if (url.hostname === "remote") {
      const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const sourceId = segments[0];
      const remotePath = segments.slice(1).join("/");
      if (!sourceId) {
        return new Response("Bad Request", { status: 400 });
      }

      const port = await getServePort(sourceId);
      if (!port) {
        log.error("ember:protocol", `no serve available for ${sourceId}`);
        return new Response("Remote source not serving", { status: 503 });
      }

      // Look up the source's remotePath so we can strip it from the URL.
      // rclone serve is rooted at source.remotePath, so the HTTP path
      // must be relative to that root.
      let proxyPath = remotePath;
      try {
        const sources = await RemoteSourceRepo.list();
        const source = sources.find((s) => s.id === sourceId);
        const basePath = (source?.remotePath || "/").replace(/^\//, ""); // e.g. "TV"
        if (basePath && proxyPath.toLowerCase().startsWith(basePath.toLowerCase() + "/")) {
          proxyPath = proxyPath.slice(basePath.length + 1); // strip "TV/"
        } else if (basePath && proxyPath.toLowerCase() === basePath.toLowerCase()) {
          proxyPath = "";
        }
      } catch (err) {
        log.warn("ember:protocol", `failed to look up source ${sourceId}: ${err}`);
      }

      const proxyUrl = `http://localhost:${port}/${proxyPath.split("/").map(encodeURIComponent).join("/")}`;
      log.info("ember:protocol", `proxy ${request.url} -> ${proxyUrl} (method=${request.method})`);
      try {
        // Forward range requests and other headers for video streaming
        const headers = new Headers();
        const forwarded: string[] = [];
        for (const [key, value] of request.headers.entries()) {
          headers.set(key, value);
          forwarded.push(`${key}: ${value}`);
        }
        log.debug("ember:protocol", `forwarding headers: ${forwarded.join(", ")}`);
        const response = await fetch(proxyUrl, {
          method: request.method,
          headers,
          signal: AbortSignal.timeout(30000),
        });
        const respHeaders = new Headers(response.headers);
        const respHeaderLog: string[] = [];
        response.headers.forEach((v, k) => respHeaderLog.push(`${k}: ${v}`));
        log.info("ember:protocol", `response ${response.status} for ${proxyUrl}, headers=[${respHeaderLog.join(", ")}]`);
        if (!response.ok) {
          log.warn("ember:protocol", `proxy returned ${response.status} for ${proxyUrl}`);
        }
        // Ensure video files have a proper Content-Type so the browser demuxer works
        const contentType = respHeaders.get("content-type");
        const ext = proxyPath.split("/").pop()?.toLowerCase();
        const FALLBACK_TYPES: Record<string, string> = {
          ".mkv": "video/x-matroska",
          ".mp4": "video/mp4",
          ".m4v": "video/mp4",
          ".webm": "video/webm",
          ".avi": "video/x-msvideo",
          ".mov": "video/quicktime",
          ".wmv": "video/x-ms-wmv",
          ".ts": "video/mp2t",
          ".m2ts": "video/mp2t",
        };
        if (!contentType || contentType.includes("text/plain") || contentType.includes("application/octet-stream")) {
          if (ext && FALLBACK_TYPES[ext]) {
            log.info("ember:protocol", `overriding Content-Type ${contentType} -> ${FALLBACK_TYPES[ext]} for ${ext}`);
            respHeaders.set("content-type", FALLBACK_TYPES[ext]);
          }
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: respHeaders,
        });
      } catch (err) {
        log.error("ember:protocol", `proxy fetch failed for ${proxyUrl}: ${err}`);
        return new Response("Remote unavailable", { status: 504 });
      }
    }

    // Plugin asset serving: ember://plugin/<id>/<path>
    if (url.hostname === "plugin") {
      const segments = url.pathname.split("/").filter(Boolean);
      const pluginId = segments[0];
      const assetPath = segments.slice(1).join("/");
      if (!pluginId) {
        return new Response("Bad Request", { status: 400 });
      }
      const pluginDir = join(app.getPath("home") || process.cwd(), ".config", "htpc", "plugins", pluginId);
      filePath = join(pluginDir, "assets", assetPath);
      if (!filePath || filePath.includes("..")) {
        return new Response("Forbidden", { status: 403 });
      }
      let stats;
      try {
        stats = statSync(filePath);
      } catch {
        return new Response("Not Found", { status: 404 });
      }
      const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
      let contentType = "application/octet-stream";
      if (ext === ".html" || ext === ".htm") contentType = "text/html";
      else if (ext === ".js" || ext === ".mjs") contentType = "application/javascript";
      else if (ext === ".css") contentType = "text/css";
      else if (ext === ".json") contentType = "application/json";
      else if (ext === ".wasm") contentType = "application/wasm";
      else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      else if (ext === ".png") contentType = "image/png";
      else if (ext === ".svg") contentType = "image/svg+xml";
      else if (ext === ".webp") contentType = "image/webp";
      else if (ext === ".gif") contentType = "image/gif";
      else if (ext === ".ico") contentType = "image/x-icon";
      else if (ext === ".mp3") contentType = "audio/mpeg";
      else if (ext === ".ogg") contentType = "audio/ogg";
      else if (ext === ".wav") contentType = "audio/wav";
      else if (ext === ".bin") contentType = "application/octet-stream";
      else if (ext === ".data") contentType = "application/octet-stream";
      const range = request.headers.get("Range") || "";
      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : stats.size - 1;
          const length = end - start + 1;
          const stream = createReadStream(filePath, { start, end });
          return new Response(stream as any, {
            status: 206,
            headers: {
              "Content-Type": contentType,
              "Content-Length": String(length),
              "Accept-Ranges": "bytes",
              "Content-Range": `bytes ${start}-${end}/${stats.size}`,
              "Cache-Control": "no-store, must-revalidate",
            },
          });
        }
      }
      const stream = createReadStream(filePath);
      return new Response(stream as any, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(stats.size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store, must-revalidate",
        },
      });
    }

    if (url.hostname === "media") {
      filePath = decodeURIComponent(url.pathname.slice(1));
    } else if (url.hostname === "thumbnails" || url.hostname === "covers") {
      let rel = decodeURIComponent(url.hostname + url.pathname);
      if (rel.startsWith("/")) rel = rel.slice(1);
      filePath = join(app.getPath("userData"), rel);
    } else {
      filePath = decodeURIComponent(url.pathname);
    }

    if (!filePath || filePath.includes("..")) {
      return new Response("Forbidden", { status: 403 });
    }

    let stats;
    try {
      stats = statSync(filePath);
    } catch {
      return new Response("Not Found", { status: 404 });
    }

    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
    let contentType = "application/octet-stream";
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".svg") contentType = "image/svg+xml";
    else if (ext === ".webp") contentType = "image/webp";
    else if (ext === ".swf") contentType = "application/x-shockwave-flash";
    else if (ext === ".mp3") contentType = "audio/mpeg";
    else if (ext === ".flac") contentType = "audio/flac";
    else if (ext === ".ogg") contentType = "audio/ogg";
    else if (ext === ".wav") contentType = "audio/wav";
    else if (ext === ".m4a" || ext === ".aac") contentType = "audio/aac";
    else if (ext === ".opus") contentType = "audio/opus";
    else if (ext === ".wma") contentType = "audio/x-ms-wma";
    else if (ext === ".mp4" || ext === ".m4v") contentType = "video/mp4";
    else if (ext === ".webm") contentType = "video/webm";
    else if (ext === ".mkv") contentType = "video/x-matroska";
    else if (ext === ".mov") contentType = "video/quicktime";
    else if (ext === ".avi") contentType = "video/x-msvideo";
    else if (ext === ".ogv") contentType = "video/ogg";
    else if (ext === ".ts") contentType = "video/mp2t";
    else if (ext === ".vtt") contentType = "text/vtt";
    else if (ext === ".srt") contentType = "text/plain";

    const range = request.headers.get("Range") || "";
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : stats.size - 1;
        const length = end - start + 1;
        const stream = createReadStream(filePath, { start, end });
        return new Response(stream as any, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(length),
            "Content-Range": `bytes ${start}-${end}/${stats.size}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store, must-revalidate",
          },
        });
      }
    }

    const stream = createReadStream(filePath);
    return new Response(stream as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stats.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  });

  await createWindow();

  // Trigger background scans after the window is ready so the renderer
  // can show cached data immediately and refresh when scans complete.
  setTimeout(() => {
    const win = getMainWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send("scan:trigger", { types: ["games", "movies", "music"] });
    }
  }, 2000);

  startRemoteAvailabilityWorker();

  powerMonitor.on("resume", () => {
    clearFailureCooldowns();
    triggerRescan();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async (e) => {
  stopRemoteAvailabilityWorker();
  // Give renderers a brief moment to fire any pending beforeunload / IPC saves
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    e.preventDefault();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send("app:save-state");
      }
    }
    try {
      await shutdownPlugins();
    } catch (err) {
      log.warn("plugins", `Shutdown error: ${err}`);
    }
    setTimeout(() => {
      app.quit();
    }, 300);
  }
});

app.on("window-all-closed", async () => {
  stopRemoteAvailabilityWorker();
  await destroyInputSystem();
  try {
    await shutdownPlugins();
  } catch (err) {
    log.warn("plugins", `Shutdown error: ${err}`);
  }
  if (process.platform !== "darwin") app.quit();
});
