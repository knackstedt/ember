import { BrowserWindow, globalShortcut, screen, app, ipcMain } from "electron";
import { join } from "path";
import { execFile } from "child_process";
import { readFileSync } from "fs";
import { promisify } from "util";
import { Game } from "../../shared/types";
import { IPC_CHANNELS } from "../../shared/ipc";
import { getSettings } from "./settings.service";
import { setOverlayWindow, setControllerButtonHandler } from "../input/evdev";
import { createLogger } from "../util/logger";
import { getDescendantPids, getSiblingPids } from "../util/process-tree";
import { grabOverlayInputs, ungrabOverlayInputs, setToggleOverlayCallback, getWindowGeometryX11, isWindowFocusedX11, isWindowViewableX11, isWindowActiveX11, refocusWindowX11, getX11WindowId } from "./x11-input-grab.service";

const log = createLogger("info");
const execFileAsync = promisify(execFile);

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let pinnedOnlyMode = false;

let activeGame: Game | null = null;
let activeGamePid: number | null = null;
let activeGameIds = new Set<string>();
let registeredShortcut: string | null = null;
let registeredPauseShortcut: string | null = null;
let lastToggleAt = 0;
let paused = false;
let geometryInterval: NodeJS.Timeout | null = null;
let cachedGameWindowId: number | null = null;
let cachedGameBounds: Electron.Rectangle | null = null;
let loggedWindowDiscovery = false;
let cachedGameFocused = true;
let cachedGameViewable = true;
let lastVisibilityCheck = 0;
let splitscreenWindows: BrowserWindow[] = [];

function isWayland(): boolean {
  return (
    process.env.XDG_SESSION_TYPE === "wayland" ||
    !!process.env.WAYLAND_DISPLAY
  );
}

function refocusGameWindow(): void {
  if (process.platform !== "linux") return;
  if (!cachedGameWindowId) return;
  const wid = cachedGameWindowId;
  void refocusWindowX11(wid)
    .then((ok) => {
      if (ok) log.info("overlay", `refocused game window ${wid}`);
      else log.warn("overlay", `failed to refocus game window ${wid}`);
    })
    .catch((err) => log.warn("overlay", `failed to refocus game window: ${err}`));
}

function pushToast(type: "info" | "success" | "error" | "progress", message: string): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("toast:push", { type, message });
  }
}

function sendState(visible: boolean, pinnedVisible = false): void {
  if (!overlayWindow || overlayWindow.isDestroyed() || overlayWindow.webContents.isDestroyed()) {
    return;
  }
  overlayWindow.webContents.send(IPC_CHANNELS.overlay.state, {
    visible,
    pinnedVisible,
    game: activeGame,
  });
}

async function hasPinnedCharts(): Promise<boolean> {
  try {
    const settings = await getSettings();
    const cfg = settings.overlayChartsConfig;
    if (!cfg) return false;
    return cfg.charts.some((c) => c.enabled && c.pinned);
  } catch {
    return false;
  }
}

async function getWindowGeometry(wid: number): Promise<Electron.Rectangle | null> {
  // Try xdotool first
  try {
    const { stdout: geo } = await execFileAsync("xdotool", ["getwindowgeometry", String(wid)]);
    const posMatch = geo.match(/Position:\s*(\d+),(\d+)/);
    const sizeMatch = geo.match(/Geometry:\s*(\d+)x(\d+)/);
    if (posMatch && sizeMatch) {
      return {
        x: parseInt(posMatch[1], 10),
        y: parseInt(posMatch[2], 10),
        width: parseInt(sizeMatch[1], 10),
        height: parseInt(sizeMatch[2], 10),
      };
    }
  } catch {
    // fall through to xwininfo
  }

  // Fallback to xwininfo
  try {
    const { stdout: geo } = await execFileAsync("xwininfo", ["-id", String(wid)]);
    const xMatch = geo.match(/Absolute upper-left X:\s*(\d+)/);
    const yMatch = geo.match(/Absolute upper-left Y:\s*(\d+)/);
    const widthMatch = geo.match(/Width:\s*(\d+)/);
    const heightMatch = geo.match(/Height:\s*(\d+)/);
    if (xMatch && yMatch && widthMatch && heightMatch) {
      return {
        x: parseInt(xMatch[1], 10),
        y: parseInt(yMatch[1], 10),
        width: parseInt(widthMatch[1], 10),
        height: parseInt(heightMatch[1], 10),
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function getWindowPid(wid: number): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("xprop", ["-id", String(wid), "_NET_WM_PID"]);
    const pidMatch = stdout.match(/_NET_WM_PID\(CARDINAL\)\s*=\s*(\d+)/);
    if (pidMatch) return parseInt(pidMatch[1], 10);
  } catch {
    // ignore
  }
  return null;
}

async function getWindowTitle(wid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("xprop", ["-id", String(wid), "_NET_WM_NAME", "WM_NAME"]);
    const netMatch = stdout.match(/_NET_WM_NAME\([^)]*\)\s*=\s*"([^"]*)"/);
    if (netMatch && netMatch[1]) return netMatch[1];
    const wmMatch = stdout.match(/WM_NAME\([^)]*\)\s*=\s*"([^"]*)"/);
    if (wmMatch && wmMatch[1]) return wmMatch[1];
  } catch {
    // ignore
  }
  return null;
}

async function getWindowClass(wid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("xprop", ["-id", String(wid), "WM_CLASS"]);
    const match = stdout.match(/WM_CLASS\(STRING\)\s*=\s*"([^"]*)",\s*"([^"]*)"/);
    if (match) return `${match[1]} ${match[2]}`;
  } catch {
    // ignore
  }
  return null;
}

async function findGameWindowBounds(): Promise<Electron.Rectangle | null> {
  if (!activeGamePid || activeGamePid <= 0) return null;

  // Fast path: cached window ID via X11 query
  if (cachedGameWindowId) {
    const bounds = await getWindowGeometryX11(cachedGameWindowId);
    if (bounds) {
      cachedGameBounds = bounds;
      return bounds;
    }
    cachedGameWindowId = null;
    cachedGameBounds = null;
  }

  const pids = new Set([activeGamePid, ...getDescendantPids(activeGamePid), ...getSiblingPids(activeGamePid)]);

  // Direct PID search via xdotool
  for (const pid of pids) {
    try {
      const { stdout } = await execFileAsync("xdotool", ["search", "--pid", String(pid)]);
      const ids = stdout
        .split("\n")
        .map((line) => parseInt(line.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      if (ids.length === 0) continue;
      const wid = ids[0];
      const bounds = await getWindowGeometry(wid);
      if (bounds) {
        cachedGameWindowId = wid;
        cachedGameBounds = bounds;
        if (!loggedWindowDiscovery) {
          log.info("overlay", `found game window via pid ${pid}: ${bounds.width}x${bounds.height} at ${bounds.x},${bounds.y}`);
          loggedWindowDiscovery = true;
        }
        return bounds;
      }
    } catch {
      // try next pid
    }
  }

  // Fallback: scan all top-level windows and check their PID via xprop
  try {
    const { stdout: rootStdout } = await execFileAsync("xprop", ["-root", "_NET_CLIENT_LIST"]);
    const match = rootStdout.match(/window id # (0x[0-9a-fA-F]+(?:,\s*0x[0-9a-fA-F]+)*)/);
    if (match) {
      const ids = match[1].split(", ");
      for (const idHex of ids) {
        const wid = parseInt(idHex.trim(), 16);
        if (Number.isNaN(wid)) continue;
        const pid = await getWindowPid(wid);
        if (pid && pids.has(pid)) {
          const bounds = await getWindowGeometry(wid);
          if (bounds) {
            cachedGameWindowId = wid;
            cachedGameBounds = bounds;
            if (!loggedWindowDiscovery) {
              log.info("overlay", `found game window via xprop scan (pid ${pid}): ${bounds.width}x${bounds.height} at ${bounds.x},${bounds.y}`);
              loggedWindowDiscovery = true;
            }
            return bounds;
          }
        }
      }
    }
  } catch (err) {
    log.warn("overlay", `xprop window scan failed: ${err}`);
  }

  // Fallback: match visible window by title/class
  if (activeGame?.title) {
    try {
      const { stdout: rootStdout } = await execFileAsync("xprop", ["-root", "_NET_CLIENT_LIST"]);
      const match = rootStdout.match(/window id # (0x[0-9a-fA-F]+(?:,\s*0x[0-9a-fA-F]+)*)/);
      if (match) {
        const title = activeGame.title.toLowerCase();
        const ids = match[1].split(", ");
        for (const idHex of ids) {
          const wid = parseInt(idHex.trim(), 16);
          if (Number.isNaN(wid)) continue;
          const winTitle = await getWindowTitle(wid);
          const winClass = await getWindowClass(wid);
          const haystack = `${winTitle ?? ""} ${winClass ?? ""}`.toLowerCase();
          if (haystack.includes(title)) {
            const bounds = await getWindowGeometry(wid);
            if (bounds) {
              cachedGameWindowId = wid;
              cachedGameBounds = bounds;
              if (!loggedWindowDiscovery) {
                log.info("overlay", `found game window via title/class match "${winTitle ?? winClass}": ${bounds.width}x${bounds.height} at ${bounds.x},${bounds.y}`);
                loggedWindowDiscovery = true;
              }
              return bounds;
            }
          }
        }
      }
    } catch (err) {
      log.warn("overlay", `title match failed: ${err}`);
    }
  }

  return null;
}

async function getDisplayForOverlay() {
  if (activeGamePid && activeGamePid > 0) {
    const bounds = await findGameWindowBounds();
    if (bounds) {
      const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
      if (display) {
        log.info("overlay", `using game display ${display.id} at ${display.bounds.x},${display.bounds.y}`);
        return display;
      }
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    if (display) {
      log.info("overlay", `using Ember display ${display.id}`);
      return display;
    }
  }
  return screen.getPrimaryDisplay();
}

async function createOverlayWindow(): Promise<BrowserWindow | null> {
  if (isWayland()) {
    log.error("overlay", "In-game overlay is not supported on Wayland");
    pushToast("error", "In-game overlay is not supported on Wayland yet.");
    return null;
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  const win = new BrowserWindow({
    width,
    height,
    x: display.workArea.x,
    y: display.workArea.y,
    title: "Ember Overlay",
    fullscreen: false,
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
    hideOverlay("window-close");
  });

  win.on("hide", () => {
    // Ensure we leave fullscreen so the next show can re-enter cleanly on the right display
    if (win.isFullScreen()) {
      win.setFullScreen(false);
    }
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

function isNearFullscreen(bounds: Electron.Rectangle, display: Electron.Display): boolean {
  const workArea = display.workArea;
  return (
    Math.abs(bounds.x - workArea.x) < 16 &&
    Math.abs(bounds.y - workArea.y) < 16 &&
    Math.abs(bounds.width - workArea.width) < 16 &&
    Math.abs(bounds.height - workArea.height) < 16
  );
}

function startGeometryTracking(): void {
  stopGeometryTracking();
  lastVisibilityCheck = Date.now();
  geometryInterval = setInterval(async () => {
    if (!overlayWindow || overlayWindow.isDestroyed() || !activeGamePid) return;
    if (!cachedGameWindowId) return;

    // When overlay is active (not pinned-only), always stay on top.
    // In pinned-only mode, only stay on top when the game has focus.
    if (!pinnedOnlyMode) {
      overlayWindow.setAlwaysOnTop(true, "screen-saver");

      // Periodically check if the game window is minimized or another window
      // stole focus.  If so, hide the overlay so it's not floating over the
      // wrong window or over an empty desktop.
      const now = Date.now();
      if (now - lastVisibilityCheck > 500) {
        lastVisibilityCheck = now;
        const viewable = await isWindowViewableX11(cachedGameWindowId);
        if (!viewable) {
          log.info("overlay", "game window no longer viewable, hiding overlay");
          hideOverlay("game-window-hidden");
          return;
        }
        const gameFocused = await isWindowFocusedX11(cachedGameWindowId);
        if (!gameFocused) {
          // The overlay window itself may have focus (keyboard grab) — that's fine.
          const overlayWid = getX11WindowId(overlayWindow);
          if (overlayWid !== null) {
            const overlayFocused = await isWindowFocusedX11(overlayWid);
            if (!overlayFocused) {
              log.info("overlay", "focus lost to another window, hiding overlay");
              hideOverlay("focus-lost");
              return;
            }
          }
        }
      }
    } else {
      const now = Date.now();
      if (now - lastVisibilityCheck < 500) {
        // Skip the expensive xprop check on every tick — only check every 500ms
      } else {
        lastVisibilityCheck = now;
        const overlayWid = getX11WindowId(overlayWindow);
        const active = await isWindowActiveX11(cachedGameWindowId, overlayWid ?? undefined);
        const viewable = await isWindowViewableX11(cachedGameWindowId);
        const shouldShow = viewable && active;
        if (shouldShow !== (cachedGameViewable && cachedGameFocused)) {
          cachedGameFocused = active;
          cachedGameViewable = viewable;
          if (shouldShow) {
            overlayWindow.setAlwaysOnTop(true, "screen-saver");
            if (!overlayWindow.isVisible()) {
              overlayWindow.show();
              log.info("overlay", "pinned overlay re-shown (game window active)");
            }
          } else {
            overlayWindow.setAlwaysOnTop(false);
            if (overlayWindow.isVisible()) {
              overlayWindow.hide();
              log.info("overlay", "pinned overlay hidden (game window inactive or minimized)");
            }
          }
        }
      }
    }

    const bounds = await getWindowGeometryX11(cachedGameWindowId);
    if (!bounds) {
      cachedGameWindowId = null;
      cachedGameBounds = null;
      return;
    }
    cachedGameBounds = bounds;
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const currentBounds = overlayWindow.getBounds();
    const dx = Math.abs(currentBounds.x - bounds.x);
    const dy = Math.abs(currentBounds.y - bounds.y);
    const dw = Math.abs(currentBounds.width - bounds.width);
    const dh = Math.abs(currentBounds.height - bounds.height);
    if (dx < 2 && dy < 2 && dw < 2 && dh < 2) return;
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }) ?? screen.getPrimaryDisplay();
    const useFullscreen = isNearFullscreen(bounds, display);
    if (overlayWindow.isFullScreen() !== useFullscreen) {
      overlayWindow.setFullScreen(useFullscreen);
    }
    if (!useFullscreen) {
      overlayWindow.setBounds(bounds, false);
    }
  }, 16);
}

function stopGeometryTracking(): void {
  if (geometryInterval) {
    clearInterval(geometryInterval);
    geometryInterval = null;
  }
}

export async function showOverlay(): Promise<void> {
  if (!activeGameIds.size) {
    log.info("overlay", "showOverlay called but no active game");
    return;
  }

  if (isWayland()) {
    pushToast("error", "In-game overlay is not supported on Wayland yet.");
    return;
  }

  // If we're in pinned-only mode, just transition to full overlay
  if (pinnedOnlyMode && overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    pinnedOnlyMode = false;
    overlayWindow.setFocusable(true);
    overlayWindow.setIgnoreMouseEvents(false);
    sendState(true);
    void grabOverlayInputs(overlayWindow);
    startGeometryTracking();
    log.info("overlay", "overlay shown from pinned-only mode");
    return;
  }

  const win = await createOverlayWindow();
  if (!win) return;

  let targetDisplay: Electron.Display;
  let targetBounds: Electron.Rectangle;
  let useFullscreen = false;

  // Check for splitscreen BrowserWindow bounds first
  const ssBounds = getFocusedSplitscreenBounds();
  if (ssBounds) {
    targetDisplay = screen.getDisplayNearestPoint({ x: ssBounds.x, y: ssBounds.y }) ?? screen.getPrimaryDisplay();
    targetBounds = { ...ssBounds };
    useFullscreen = isNearFullscreen(ssBounds, targetDisplay);
    log.info(
      "overlay",
      `targeting splitscreen window ${ssBounds.width}x${ssBounds.height} at ${ssBounds.x},${ssBounds.y} (fullscreen=${useFullscreen})`,
    );
  } else {
    const gameBounds = await findGameWindowBounds();
    if (gameBounds) {
      targetDisplay = screen.getDisplayNearestPoint({ x: gameBounds.x, y: gameBounds.y }) ?? screen.getPrimaryDisplay();
      targetBounds = { ...gameBounds };
      useFullscreen = isNearFullscreen(gameBounds, targetDisplay);
      log.info(
        "overlay",
        `targeting game window ${gameBounds.width}x${gameBounds.height} at ${gameBounds.x},${gameBounds.y} (fullscreen=${useFullscreen})`,
      );
    } else {
      targetDisplay = await getDisplayForOverlay();
      targetBounds = {
        x: targetDisplay.workArea.x,
        y: targetDisplay.workArea.y,
        width: targetDisplay.workAreaSize.width,
        height: targetDisplay.workAreaSize.height,
      };
      useFullscreen = true;
      log.info("overlay", `targeting display ${targetDisplay.id} ${targetBounds.width}x${targetBounds.height}`);
    }
  }

  const currentBounds = win.getBounds();
  const needsMove =
    currentBounds.x !== targetBounds.x ||
    currentBounds.y !== targetBounds.y ||
    currentBounds.width !== targetBounds.width ||
    currentBounds.height !== targetBounds.height;

  if (win.isFullScreen() !== useFullscreen) {
    win.setFullScreen(useFullscreen);
  }
  if (!useFullscreen && needsMove) {
    win.setBounds(targetBounds, false);
  }
  if (win.isMinimized()) win.restore();
  win.setFocusable(true);
  win.show();
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (!useFullscreen) {
    win.setBounds(targetBounds, false);
  }
  pinnedOnlyMode = false;
  win.setIgnoreMouseEvents(false);
  sendState(true);
  void grabOverlayInputs(win);
  startGeometryTracking();
  log.info(
    "overlay",
    `overlay shown on display ${targetDisplay.id} ${targetBounds.width}x${targetBounds.height} fullscreen=${useFullscreen}`,
  );
}

export function hideOverlay(reason = "unknown"): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    overlayWindow = null;
    void ungrabOverlayInputs();
    refocusGameWindow();
    log.info("overlay", `overlay hidden (${reason})`);
    return;
  }
  void ungrabOverlayInputs();
  stopGeometryTracking();
  // Check if we should stay visible for pinned charts
  void hasPinnedCharts().then((hasPinned) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      overlayWindow = null;
      return;
    }
    if (hasPinned) {
      pinnedOnlyMode = true;
      overlayWindow!.setFocusable(false);
      overlayWindow!.setIgnoreMouseEvents(true, { forward: true });
      sendState(false, true);
      refocusGameWindow();
      log.info("overlay", `overlay switched to pinned-only mode (${reason})`);
    } else {
      pinnedOnlyMode = false;
      overlayWindow!.setFocusable(false);
      overlayWindow!.hide();
      sendState(false);
      refocusGameWindow();
      log.info("overlay", `overlay hidden (${reason})`);
    }
  });
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
  log.info("overlay", `toggleOverlay called, currently visible=${visible ?? false}, pinnedOnly=${pinnedOnlyMode}`);
  if (visible && !pinnedOnlyMode) {
    hideOverlay("toggle");
  } else {
    void showOverlay();
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

function unregisterPauseShortcut(): void {
  if (registeredPauseShortcut) {
    try {
      globalShortcut.unregister(registeredPauseShortcut);
    } catch {
      // ignore
    }
    registeredPauseShortcut = null;
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

  try {
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
  } catch (err) {
    log.warn("overlay", `invalid overlay shortcut ${accelerator}: ${err}`);
  }
}

async function registerPauseShortcut(): Promise<void> {
  const settings = await getSettings();
  const shortcut = settings.commandKeybinds?.["gaming.pause"] ?? "MediaPlayPause";

  if (registeredPauseShortcut === shortcut) return;
  unregisterPauseShortcut();

  if (!shortcut) return;

  let accelerator = shortcut;
  accelerator = accelerator.replace(/\bMeta\b/g, "Super");

  try {
    if (globalShortcut.isRegistered(accelerator)) {
      log.warn("overlay", `Pause shortcut ${accelerator} is already registered by the OS`);
      return;
    }

    const registered = globalShortcut.register(accelerator, () => {
      togglePauseOverlayGame();
    });

    if (registered) {
      registeredPauseShortcut = accelerator;
      log.info("overlay", `registered pause shortcut ${accelerator}`);
    } else {
      log.warn("overlay", `failed to register pause shortcut ${accelerator}`);
    }
  } catch (err) {
    log.warn("overlay", `invalid pause shortcut ${accelerator}: ${err}`);
  }
}

function handleControllerButton(action: string): void {
  if (!activeGameIds.size) return;
  if (!action) return;
  getSettings()
    .then((settings) => {
      const overlayMapped = settings.commandControllerMap?.["gaming.overlay"];
      if (overlayMapped && overlayMapped === action) {
        toggleOverlay();
        return;
      }
      const pauseMapped = settings.commandControllerMap?.["gaming.pause"];
      if (pauseMapped && pauseMapped === action) {
        togglePauseOverlayGame();
      }
    })
    .catch((err) => log.warn("overlay", `failed to read controller map: ${err}`));
}

export function setOverlayGame(game: Game): void {
  activeGameIds.add(game.id);
  activeGame = game;
  cachedGameWindowId = null;
  cachedGameBounds = null;
  loggedWindowDiscovery = false;
  void registerOverlayShortcut();
  void registerPauseShortcut();
  log.info("overlay", `game tracked: ${game.title}`);
}

export function setOverlayGameProcess(gameId: string, pid: number): void {
  if (activeGame && activeGame.id === gameId) {
    activeGamePid = pid;
    cachedGameWindowId = null;
    cachedGameBounds = null;
    loggedWindowDiscovery = false;
    // If there are pinned charts, create the overlay window in pinned-only mode
    // so they appear immediately without the user having to open the overlay first
    void initPinnedOnlyIfNeeded();
  }
}

async function initPinnedOnlyIfNeeded(): Promise<void> {
  if (pinnedOnlyMode) return;
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) return;
  const hasPinned = await hasPinnedCharts();
  if (!hasPinned) return;
  const win = await createOverlayWindow();
  if (!win || win.isDestroyed()) return;
  pinnedOnlyMode = true;
  win.setFocusable(false);
  win.setIgnoreMouseEvents(true, { forward: true });

  // Target the game window geometry (same logic as showOverlay)
  // Retry for up to 10 seconds to wait for the game window to appear
  let targetBounds: Electron.Rectangle | null = null;
  let useFullscreen = false;
  let gameBounds: Electron.Rectangle | null = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    gameBounds = await findGameWindowBounds();
    if (gameBounds) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (gameBounds) {
    const display = screen.getDisplayNearestPoint({ x: gameBounds.x, y: gameBounds.y }) ?? screen.getPrimaryDisplay();
    targetBounds = { ...gameBounds };
    useFullscreen = isNearFullscreen(gameBounds, display);
    log.info(
      "overlay",
      `pinned-only targeting game window ${gameBounds.width}x${gameBounds.height} at ${gameBounds.x},${gameBounds.y} (fullscreen=${useFullscreen})`,
    );
  } else {
    const display = await getDisplayForOverlay();
    targetBounds = {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workAreaSize.width,
      height: display.workAreaSize.height,
    };
    useFullscreen = true;
    log.info("overlay", `pinned-only targeting display ${display.id} ${targetBounds.width}x${targetBounds.height}`);
  }

  if (win.isFullScreen() !== useFullscreen) {
    win.setFullScreen(useFullscreen);
  }
  if (!useFullscreen && targetBounds) {
    win.setBounds(targetBounds, false);
  }
  win.show();
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (!useFullscreen && targetBounds) {
    win.setBounds(targetBounds, false);
  }
  refocusGameWindow();
  startGeometryTracking();
  // Send state after the renderer has loaded so the onState listener is ready
  const sendPinnedState = () => { sendState(false, true); };
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", sendPinnedState);
  } else {
    sendPinnedState();
  }
  log.info("overlay", "pinned-only mode initialized on game start");
}

export function pauseOverlayGame(): void {
  if (!activeGamePid || activeGamePid <= 0 || paused) return;
  const descendants = getDescendantPids(activeGamePid);
  // Stop children first, then parent, so they can't respawn while parent is stopped
  for (const pid of descendants) {
    try {
      process.kill(pid, "SIGSTOP");
    } catch (err) {
      log.warn("overlay", `failed to SIGSTOP child ${pid}: ${err}`);
    }
  }
  try {
    process.kill(activeGamePid, "SIGSTOP");
    paused = true;
    pushToast("info", "Game paused");
    log.info("overlay", `paused game ${activeGamePid}`);
  } catch (err) {
    log.warn("overlay", `failed to pause game ${activeGamePid}: ${err}`);
  }
}

export function resumeOverlayGame(): void {
  if (!activeGamePid || activeGamePid <= 0 || !paused) return;
  const descendants = getDescendantPids(activeGamePid);
  // Resume parent first, then children
  try {
    process.kill(activeGamePid, "SIGCONT");
  } catch (err) {
    log.warn("overlay", `failed to SIGCONT game ${activeGamePid}: ${err}`);
  }
  for (const pid of descendants) {
    try {
      process.kill(pid, "SIGCONT");
    } catch (err) {
      log.warn("overlay", `failed to SIGCONT child ${pid}: ${err}`);
    }
  }
  paused = false;
  pushToast("success", "Game resumed");
  log.info("overlay", `resumed game ${activeGamePid}`);
}

export function togglePauseOverlayGame(): void {
  if (paused) {
    resumeOverlayGame();
  } else {
    pauseOverlayGame();
  }
}

export function isOverlayGamePaused(): boolean {
  return paused;
}

export function clearOverlayGame(gameId: string): void {
  activeGameIds.delete(gameId);
  if (activeGame?.id === gameId) {
    activeGame = null;
    activeGamePid = null;
    paused = false;
    cachedGameWindowId = null;
    cachedGameBounds = null;
    loggedWindowDiscovery = false;
    splitscreenWindows = [];
    if (activeGameIds.size > 0) {
      // keep shortcut active while other games run
      return;
    }
    unregisterShortcut();
    unregisterPauseShortcut();
    pinnedOnlyMode = false;
    hideOverlay("game-cleared");
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
    }
  }
  log.info("overlay", `game cleared: ${gameId}`);
}

export function setSplitscreenWindows(wins: BrowserWindow[]): void {
  splitscreenWindows = wins.filter((w) => !w.isDestroyed());
}

function getFocusedSplitscreenBounds(): Electron.Rectangle | null {
  for (const win of splitscreenWindows) {
    if (win.isDestroyed()) continue;
    if (win.isFocused()) {
      return win.getBounds();
    }
  }
  // If none focused, use the first available
  for (const win of splitscreenWindows) {
    if (!win.isDestroyed()) {
      return win.getBounds();
    }
  }
  return null;
}

export async function overlayGameStarted(gameId: string): Promise<void> {
  const settings = await getSettings();
  if (settings.overlayAutoShow ?? false) {
    await showOverlay();
  }
}

export function isOverlayActive(): boolean {
  return !!overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible();
}

interface ProcessStats {
  cpuPercent: number;
  memMB: number;
  diskReadKBps: number;
  diskWriteKBps: number;
  netRxKBps: number;
  netTxKBps: number;
  processCount: number;
  gpuPercent: number;
  gpuMemUsedMB: number;
  gpuMemTotalMB: number;
}

let prevCpuTime = 0;
let prevProcCpuTime = 0;
let prevDiskRead = 0;
let prevDiskWrite = 0;
let prevNetRx = 0;
let prevNetTx = 0;
let prevStatsTime = 0;

function readGpuStats(): { gpuPercent: number; gpuMemUsedMB: number; gpuMemTotalMB: number } {
  // Try NVIDIA first
  try {
    const { execSync } = require("child_process");
    const out = execSync(
      "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null",
      { encoding: "utf-8", timeout: 2000 }
    ).trim();
    const parts = out.split(/[,\n]/).map((s: string) => parseInt(s.trim(), 10));
    if (parts.length >= 3 && !Number.isNaN(parts[0])) {
      return {
        gpuPercent: parts[0] || 0,
        gpuMemUsedMB: parts[1] || 0,
        gpuMemTotalMB: parts[2] || 0,
      };
    }
  } catch { /* nvidia-smi not available */ }

  // Try AMD/Intel via sysfs
  try {
    const { readdirSync } = require("fs");
    const cards = readdirSync("/sys/class/drm").filter((d: string) => /^card[0-9]+$/.test(d));
    for (const card of cards) {
      const base = `/sys/class/drm/${card}/device`;
      let gpuPercent = 0;
      let gpuMemUsedMB = 0;
      let gpuMemTotalMB = 0;
      try {
        gpuPercent = parseInt(readFileSync(`${base}/gpu_busy_percent`, "utf-8").trim(), 10) || 0;
      } catch { /* not all cards have this */ }
      try {
        const vramUsed = parseInt(readFileSync(`${base}/mem_info_vram_used`, "utf-8").trim(), 10) || 0;
        const vramTotal = parseInt(readFileSync(`${base}/mem_info_vram_total`, "utf-8").trim(), 10) || 0;
        gpuMemUsedMB = Math.round(vramUsed / 1024 / 1024);
        gpuMemTotalMB = Math.round(vramTotal / 1024 / 1024);
      } catch { /* ignore */ }
      if (gpuPercent > 0 || gpuMemTotalMB > 0) {
        return { gpuPercent, gpuMemUsedMB, gpuMemTotalMB };
      }
    }
  } catch { /* sysfs not available */ }

  return { gpuPercent: 0, gpuMemUsedMB: 0, gpuMemTotalMB: 0 };
}

function getGameProcessStats(): ProcessStats {
  const result: ProcessStats = {
    cpuPercent: 0,
    memMB: 0,
    diskReadKBps: 0,
    diskWriteKBps: 0,
    netRxKBps: 0,
    netTxKBps: 0,
    processCount: 0,
    gpuPercent: 0,
    gpuMemUsedMB: 0,
    gpuMemTotalMB: 0,
  };
  if (!activeGamePid || activeGamePid <= 0) return result;

  const pids = [activeGamePid, ...getDescendantPids(activeGamePid)];
  result.processCount = pids.length;

  let totalProcCpuTime = 0;
  let totalMemKB = 0;
  let totalDiskRead = 0;
  let totalDiskWrite = 0;

  for (const pid of pids) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
      const fields = stat.split(/\s+/);
      // utime = field 13, stime = field 14 (1-indexed in /proc docs, 0-indexed: 12, 13)
      const utime = parseInt(fields[12], 10) || 0;
      const stime = parseInt(fields[13], 10) || 0;
      totalProcCpuTime += utime + stime;
    } catch { /* process exited */ }

    try {
      const status = readFileSync(`/proc/${pid}/status`, "utf-8");
      const vmRssMatch = status.match(/VmRSS:\s*(\d+)\s*kB/);
      if (vmRssMatch) totalMemKB += parseInt(vmRssMatch[1], 10);
    } catch { /* ignore */ }

    try {
      const io = readFileSync(`/proc/${pid}/io`, "utf-8");
      const readMatch = io.match(/read_bytes:\s*(\d+)/);
      const writeMatch = io.match(/write_bytes:\s*(\d+)/);
      if (readMatch) totalDiskRead += parseInt(readMatch[1], 10);
      if (writeMatch) totalDiskWrite += parseInt(writeMatch[1], 10);
    } catch { /* not available or permission denied */ }
  }

  // System-wide CPU time
  let totalCpuTime = 0;
  try {
    const cpuLine = readFileSync("/proc/stat", "utf-8").split("\n")[0];
    const cpuFields = cpuLine.split(/\s+/).slice(1).map(Number);
    totalCpuTime = cpuFields.reduce((a, b) => a + b, 0);
  } catch { /* ignore */ }

  // Network stats from /proc/net/dev
  let totalNetRx = 0;
  let totalNetTx = 0;
  try {
    const netDev = readFileSync("/proc/net/dev", "utf-8");
    for (const line of netDev.split("\n").slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const iface = parts[0].replace(":", "");
      if (iface === "lo") continue;
      totalNetRx += parseInt(parts[1], 10) || 0;
      totalNetTx += parseInt(parts[9], 10) || 0;
    }
  } catch { /* ignore */ }

  const now = Date.now();
  const dt = prevStatsTime > 0 ? (now - prevStatsTime) / 1000 : 0;

  if (dt > 0 && prevStatsTime > 0) {
    const cpuDelta = totalProcCpuTime - prevProcCpuTime;
    const sysCpuDelta = totalCpuTime - prevCpuTime;
    const cpuCores = require("os").cpus().length;
    if (sysCpuDelta > 0) {
      result.cpuPercent = Math.min(100 * cpuCores, (cpuDelta / sysCpuDelta) * 100 * cpuCores);
    }
    result.diskReadKBps = Math.max(0, (totalDiskRead - prevDiskRead) / 1024 / dt);
    result.diskWriteKBps = Math.max(0, (totalDiskWrite - prevDiskWrite) / 1024 / dt);
    result.netRxKBps = Math.max(0, (totalNetRx - prevNetRx) / 1024 / dt);
    result.netTxKBps = Math.max(0, (totalNetTx - prevNetTx) / 1024 / dt);
  }

  result.memMB = totalMemKB / 1024;

  // GPU stats (system-wide, not per-process, but useful for gaming overlay)
  const gpu = readGpuStats();
  result.gpuPercent = gpu.gpuPercent;
  result.gpuMemUsedMB = gpu.gpuMemUsedMB;
  result.gpuMemTotalMB = gpu.gpuMemTotalMB;

  prevCpuTime = totalCpuTime;
  prevProcCpuTime = totalProcCpuTime;
  prevDiskRead = totalDiskRead;
  prevDiskWrite = totalDiskWrite;
  prevNetRx = totalNetRx;
  prevNetTx = totalNetTx;
  prevStatsTime = now;

  return result;
}

export function getOverlayGame(): Game | null {
  return activeGame;
}

export function initOverlayService(parent: BrowserWindow): void {
  mainWindow = parent;

  setControllerButtonHandler(handleControllerButton);
  setToggleOverlayCallback(toggleOverlay);

  ipcMain.handle(IPC_CHANNELS.overlay.toggle, () => {
    toggleOverlay();
  });

  ipcMain.handle(IPC_CHANNELS.overlay.show, () => {
    void showOverlay();
  });

  ipcMain.handle(IPC_CHANNELS.overlay.hide, () => {
    hideOverlay("ipc-hide");
  });

  ipcMain.handle(IPC_CHANNELS.overlay.close, () => {
    hideOverlay("ipc-close");
  });

  ipcMain.handle(IPC_CHANNELS.overlay.getGame, () => {
    return activeGame;
  });

  ipcMain.handle(IPC_CHANNELS.overlay.getState, () => {
    const visible = !!(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible() && !pinnedOnlyMode);
    return { visible, pinnedVisible: pinnedOnlyMode, game: activeGame };
  });

  ipcMain.handle(IPC_CHANNELS.overlay.stopGame, async () => {
    if (!activeGamePid || activeGamePid <= 0) return;

    const pid = activeGamePid;

    // Gather the full process tree: descendants first (bottom-up so they
    // can't be respawned by the parent), then the parent PID itself.
    const descendants = getDescendantPids(pid);
    const allPids = [...descendants, pid];

    // Phase 1: SIGTERM everything gracefully
    for (const p of allPids) {
      try {
        process.kill(p, "SIGTERM");
      } catch {
        // already dead or inaccessible
      }
    }
    log.info("overlay", `stopGame: SIGTERM sent to ${allPids.length} processes (tree of ${pid})`);

    // Phase 2: escalate to SIGKILL after 2s for any survivors
    setTimeout(() => {
      for (const p of allPids) {
        try {
          process.kill(p, 0); // check if still alive
        } catch {
          continue; // process is gone
        }
        try {
          process.kill(p, "SIGKILL");
          log.info("overlay", `SIGKILL escalated for pid ${p}`);
        } catch {
          // race: exited between check and kill
        }
      }
    }, 2000);

    // Wait for the root PID to actually exit (poll every 200ms, max 5s)
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0); // still alive
      } catch {
        break; // process is gone
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  ipcMain.handle(IPC_CHANNELS.overlay.pauseGame, () => {
    togglePauseOverlayGame();
  });

  ipcMain.handle(IPC_CHANNELS.overlay.resumeGame, () => {
    resumeOverlayGame();
  });

  ipcMain.handle(IPC_CHANNELS.overlay.isPaused, () => {
    return isOverlayGamePaused();
  });

  ipcMain.handle(IPC_CHANNELS.overlay.processStats, () => {
    return getGameProcessStats();
  });

  app.on("before-quit", () => {
    unregisterShortcut();
    unregisterPauseShortcut();
    void ungrabOverlayInputs();
    hideOverlay("app-quit");
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
    }
  });
}
