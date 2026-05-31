import { app, BrowserWindow, shell, protocol } from "electron";
import { join } from "path";
import { readFileSync } from "fs";
import { initDb } from "./db";
import { registerIpcHandlers } from "./ipc";
import { initInputSystem, destroyInputSystem } from "./input/evdev";
import { getSettings } from "./services/settings.service";

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

if (!isDev && !app.requestSingleInstanceLock()) {
  console.log("[lock] Another instance is already running, exiting");
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

async function createWindow(): Promise<void> {
  await initDb();
  const settings = await getSettings();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
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

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (isDev) mainWindow?.webContents.openDevTools();
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
    await initInputSystem(mainWindow);
  } catch (err) {
    console.warn(
      "[input] evdev init failed (user may not be in input group):",
      err,
    );
  }

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "htpc-thumb",
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

  protocol.handle("htpc-thumb", async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.hostname + url.pathname);
    if (pathname.startsWith("/")) pathname = pathname.slice(1);
    if (pathname.includes("..")) {
      return new Response("Forbidden", { status: 403 });
    }
    const filePath = join(app.getPath("userData"), pathname);
    try {
      const data = readFileSync(filePath);
      const ext = pathname.toLowerCase().slice(pathname.lastIndexOf("."));
      let contentType = "application/octet-stream";
      if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      else if (ext === ".png") contentType = "image/png";
      else if (ext === ".svg") contentType = "image/svg+xml";
      else if (ext === ".webp") contentType = "image/webp";
      return new Response(new Uint8Array(data), {
        headers: { "Content-Type": contentType },
      });
    } catch {
      console.warn("[protocol] file not found:", filePath);
      return new Response("Not Found", { status: 404 });
    }
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
