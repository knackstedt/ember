import { BrowserWindow, globalShortcut, screen, app, ipcMain } from "electron";
import { join } from "path";
import { Game } from "../../shared/types";
import { IPC_CHANNELS } from "../../shared/ipc";
import { getSettings } from "./settings.service";
import { setOverlayWindow, setControllerButtonHandler } from "../input/evdev";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

let activeGame: Game | null = null;
let activeGamePid: number | null = null;
let activeGameIds = new Set<string>();
let registeredShortcut: string | null = null;
let lastToggleAt = 0;

function isWayland(): boolean {
  return (
    process.env.XDG_SESSION_TYPE === "wayland" ||
    !!process.env.WAYLAND_DISPLAY
  );
}

function pushToast(type: "info" | "success" | "error" | "progress", message: string): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("toast:push", { type, message });
  }
}

function sendState(visible: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed() || overlayWindow.webContents.isDestroyed()) {
    return;
  }
  overlayWindow.webContents.send(IPC_CHANNELS.overlay.state, {
    visible,
    game: activeGame,
  });
}

function getDisplayForOverlay() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    if (display) return display;
  }
  return screen.getPrimaryDisplay();
}

function createOverlayWindow(): BrowserWindow | null {
  if (isWayland()) {
    log.error("overlay", "In-game overlay is not supported on Wayland");
    pushToast("error", "In-game overlay is not supported on Wayland yet.");
    return null;
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const display = getDisplayForOverlay();
  const { width, height } = display.workAreaSize;

  const win = new BrowserWindow({
    width,
    height,
    x: display.workArea.x,
    y: display.workArea.y,
    fullscreen: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      webviewTag: true,
      contextIsolation: true,
      devTools: true,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(false);

  win.once("ready-to-show", () => {
    log.info("overlay", "overlay window ready to show");
  });

  win.on("closed", () => {
    overlayWindow = null;
    setOverlayWindow(null);
  });

  win.on("close", (e) => {
    // Hide instead of close so we can re-show quickly
    e.preventDefault();
    hideOverlay();
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/overlay.html"));
  }

  overlayWindow = win;
  setOverlayWindow(win);
  return win;
}

export function showOverlay(): void {
  if (!activeGameIds.size) {
    log.info("overlay", "showOverlay called but no active game");
    return;
  }

  if (isWayland()) {
    pushToast("error", "In-game overlay is not supported on Wayland yet.");
    return;
  }

  const win = createOverlayWindow();
  if (!win) return;

  if (win.isMinimized()) win.restore();
  win.show();
  win.setFullScreen(true);
  win.setAlwaysOnTop(true, "screen-saver");
  win.focus();
  sendState(true);
  log.info("overlay", "overlay shown");
}

export function hideOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    overlayWindow = null;
    return;
  }
  overlayWindow.hide();
  sendState(false);
  log.info("overlay", "overlay hidden");
}

export function toggleOverlay(): void {
  if (!activeGameIds.size) return;

  const now = Date.now();
  if (now - lastToggleAt < 250) return;
  lastToggleAt = now;

  if (isWayland()) {
    pushToast("error", "In-game overlay is not supported on Wayland yet.");
    return;
  }

  const visible = overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible();
  if (visible) {
    hideOverlay();
  } else {
    showOverlay();
  }
}

function unregisterShortcut(): void {
  if (registeredShortcut) {
    try {
      globalShortcut.unregister(registeredShortcut);
    } catch {
      // ignore
    }
    registeredShortcut = null;
  }
}

async function registerOverlayShortcut(): Promise<void> {
  const settings = await getSettings();
  const shortcut = settings.commandKeybinds?.["gaming.overlay"] ?? "F1";

  if (registeredShortcut === shortcut) return;
  unregisterShortcut();

  if (!shortcut) return;

  let accelerator = shortcut;
  accelerator = accelerator.replace(/\bMeta\b/g, "Super");

  if (globalShortcut.isRegistered(accelerator)) {
    log.warn("overlay", `Shortcut ${accelerator} is already registered by the OS`);
    return;
  }

  const registered = globalShortcut.register(accelerator, () => {
    toggleOverlay();
  });

  if (registered) {
    registeredShortcut = accelerator;
    log.info("overlay", `registered global shortcut ${accelerator}`);
  } else {
    log.warn("overlay", `failed to register global shortcut ${accelerator}`);
  }
}

function handleControllerButton(action: string): void {
  if (!activeGameIds.size) return;
  if (!action) return;
  getSettings()
    .then((settings) => {
      const mapped = settings.commandControllerMap?.["gaming.overlay"];
      if (mapped && mapped === action) {
        toggleOverlay();
      }
    })
    .catch((err) => log.warn("overlay", `failed to read controller map: ${err}`));
}

export function setOverlayGame(game: Game): void {
  activeGameIds.add(game.id);
  activeGame = game;
  void registerOverlayShortcut();
  log.info("overlay", `game tracked: ${game.title}`);
}

export function setOverlayGameProcess(gameId: string, pid: number): void {
  if (activeGame && activeGame.id === gameId) {
    activeGamePid = pid;
  }
}

export function clearOverlayGame(gameId: string): void {
  activeGameIds.delete(gameId);
  if (activeGame?.id === gameId) {
    activeGame = null;
    activeGamePid = null;
    if (activeGameIds.size > 0) {
      // keep shortcut active while other games run
      return;
    }
    unregisterShortcut();
    hideOverlay();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
    }
  }
  log.info("overlay", `game cleared: ${gameId}`);
}

export async function overlayGameStarted(gameId: string): Promise<void> {
  const settings = await getSettings();
  if (settings.overlayAutoShow ?? true) {
    showOverlay();
  }
}

export function isOverlayActive(): boolean {
  return !!overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible();
}

export function getOverlayGame(): Game | null {
  return activeGame;
}

export function initOverlayService(parent: BrowserWindow): void {
  mainWindow = parent;

  setControllerButtonHandler(handleControllerButton);

  ipcMain.handle(IPC_CHANNELS.overlay.toggle, () => {
    toggleOverlay();
  });

  ipcMain.handle(IPC_CHANNELS.overlay.show, () => {
    showOverlay();
  });

  ipcMain.handle(IPC_CHANNELS.overlay.hide, () => {
    hideOverlay();
  });

  ipcMain.handle(IPC_CHANNELS.overlay.close, () => {
    hideOverlay();
  });

  ipcMain.handle(IPC_CHANNELS.overlay.getGame, () => {
    return activeGame;
  });

  ipcMain.handle(IPC_CHANNELS.overlay.stopGame, () => {
    if (activeGamePid && activeGamePid > 0) {
      try {
        process.kill(activeGamePid, "SIGTERM");
      } catch (err) {
        log.warn("overlay", `failed to stop game process: ${err}`);
      }
    }
  });

  app.on("before-quit", () => {
    unregisterShortcut();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
    }
  });
}
