import { app, BrowserWindow, shell, protocol, Menu } from "electron";
import path, { join } from "path";
import { readFileSync, createReadStream, statSync } from "fs";
import { initDb } from "./db";
import { registerIpcHandlers } from "./ipc";
import { initInputSystem, destroyInputSystem, setLibretroWindowGetter } from "./input/evdev";
import { getSettings } from "./services/settings.service";
import { getWindowState, saveWindowState } from "./services/window-state.service";
import { createLogger } from "./util/logger";

const log = createLogger("info");

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

if (!isDev && !app.requestSingleInstanceLock()) {
  log.info("lock", "Another instance is already running, exiting");
  app.exit(0);
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
let libretroWindow: BrowserWindow | null = null;

export function getLibretroWindow(): BrowserWindow | null {
  return libretroWindow;
}

export function createLibretroWindow(opts: {
  romPath: string;
  title: string;
  platform: string;
  gameId: string;
  shader?: string;
  corePath?: string;
}): BrowserWindow {
  if (libretroWindow && !libretroWindow.isDestroyed()) {
    libretroWindow.close();
  }

  libretroWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    backgroundColor: "#000000",
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  const query = new URLSearchParams();
  query.set("libretro", "1");
  query.set("romPath", opts.romPath);
  query.set("title", opts.title);
  query.set("platform", opts.platform);
  query.set("gameId", opts.gameId);
  if (opts.shader) query.set("shader", opts.shader);
  if (opts.corePath) query.set("corePath", opts.corePath);

  const loadUrl = isDev && process.env["ELECTRON_RENDERER_URL"]
    ? `${process.env["ELECTRON_RENDERER_URL"]}?${query.toString()}`
    : join(__dirname, "../renderer/index.html");

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    libretroWindow.loadURL(loadUrl);
  } else {
    libretroWindow.loadFile(loadUrl, { query: Object.fromEntries(query) });
  }

  libretroWindow.once("ready-to-show", () => {
    libretroWindow?.show();
    libretroWindow?.focus();
  });

  setLibretroWindowGetter(() => libretroWindow);

  libretroWindow.on("closed", () => {
    setLibretroWindowGetter(null);
    libretroWindow = null;
  });

  libretroWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("libretro", `render-process-gone: ${details.reason} (exitCode=${details.exitCode})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("libretro:crashed", { exitCode: details.exitCode, reason: details.reason });
    }
    setLibretroWindowGetter(null);
    libretroWindow = null;
  });

  return libretroWindow;
}

async function createWindow(): Promise<void> {
  await initDb();
  const settings = await getSettings();
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

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    if (winState.maximized && mainWindow && !mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (isDev) mainWindow?.webContents.openDevTools();
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    log.error("renderer", `did-fail-load: ${errorCode} — ${errorDescription}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("renderer", `render-process-gone: ${details.reason} (exitCode=${details.exitCode})`);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
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

  try {
    await initInputSystem(mainWindow);
  } catch (err) {
    log.warn(
      "input",
      `evdev init failed (user may not be in input group): ${err}`
    );
  }
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
  app.setAppUserModelId("com.htpc.app");

  protocol.handle("ember", async (request) => {
    const url = new URL(request.url);

    let filePath: string;
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
      },
    });
  });

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await destroyInputSystem();
  if (process.platform !== "darwin") app.quit();
});
