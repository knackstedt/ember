import { spawn, ChildProcess } from "child_process";
import { BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { Game } from "../../shared/types";
import {
  SplitscreenInstanceConfig,
  SplitscreenInstanceType,
  SplitscreenInstanceState,
  SplitscreenSlot,
} from "../../shared/splitscreen-types";
import { createLogger } from "../util/logger";
import { launchGame } from "./launcher.service";
import { positionWindow, waitForGameWindow } from "./splitscreen-window.service";
import { routeAudioStream } from "./splitscreen-audio.service";
import { setOverlayGame, clearOverlayGame, toggleOverlay, setSplitscreenWindows } from "./overlay.service";

const log = createLogger("info");

export interface InstanceLaunchResult {
  windowId: number | null;
  pid: number | null;
  browserWindowId: string | null;
}

const activeBrowserWindows = new Map<number, BrowserWindow>();
const activeProcesses = new Map<number, ChildProcess>();
let overlayGameRegistered = false;
let overlayGameId: string | null = null;
let overlayIpcInitialized = false;

function ensureOverlayIpc(): void {
  if (overlayIpcInitialized) return;
  overlayIpcInitialized = true;

  ipcMain.on("splitscreen:toggle-overlay", () => {
    toggleOverlay();
  });

  ipcMain.on("splitscreen:exit", () => {
    // Import dynamically to avoid circular dependency
    import("./splitscreen.service").then(({ stopSession }) => {
      stopSession().catch((err) => log.error("splitscreen-instance", `Failed to stop session: ${err}`));
    });
  });

  ipcMain.handle("splitscreen:get-slot", (event) => {
    for (const [slotIdx, win] of activeBrowserWindows) {
      if (win.webContents === event.sender) return slotIdx;
    }
    return -1;
  });
}

function updateSplitscreenWindows(): void {
  setSplitscreenWindows(Array.from(activeBrowserWindows.values()));
}

function generateId(): string {
  return `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function launchInstance(
  config: SplitscreenInstanceConfig,
  slot: SplitscreenSlot,
  onProgress?: (step: string, detail?: string) => void,
): Promise<InstanceLaunchResult> {
  const progress = (step: string, detail?: string) => {
    log.info("splitscreen-instance", `Slot ${slot.index}: ${step}${detail ? ` — ${detail}` : ""}`);
    onProgress?.(step, detail);
  };

  switch (config.instanceType) {
    case "native":
      return launchNativeInstance(config, slot, progress);
    case "flash":
      return launchFlashInstance(config, slot, progress);
    case "libretro":
      return launchLibretroInstance(config, slot, progress);
    case "video":
      return launchVideoInstance(config, slot, progress);
    default:
      throw new Error(`Unknown instance type: ${config.instanceType}`);
  }
}

async function launchNativeInstance(
  config: SplitscreenInstanceConfig,
  slot: SplitscreenSlot,
  progress: (step: string, detail?: string) => void,
): Promise<InstanceLaunchResult> {
  const game = config.game;
  progress("Launching game");

  // For native games, we use the existing launcher but need to capture the PID
  // The launcher handles Steam, Wine, Dolphin, etc.
  // We add PULSE_SINK to the environment for audio routing

  // Launch the game (this is async but returns quickly for external games)
  await launchGame(game);

  // Try to find the game window via xdotool
  // Since we don't have direct PID access from launchGame, we use a different approach:
  // Wait for a new window to appear and position it
  progress("Waiting for game window");
  // We need to find the window. Since launchGame doesn't return the PID directly,
  // we use a fallback: search for recently created windows
  // In a full implementation, we'd modify launchGame to return the PID

  // For now, return a placeholder. The session orchestrator will handle window detection.
  return {
    windowId: null,
    pid: null,
    browserWindowId: null,
  };
}

async function launchFlashInstance(
  config: SplitscreenInstanceConfig,
  slot: SplitscreenSlot,
  progress: (step: string, detail?: string) => void,
): Promise<InstanceLaunchResult> {
  const game = config.game;
  const swfPath = game.romPath ?? game.execPath;
  if (!swfPath) {
    throw new Error(`No SWF path for Flash game: ${game.title}`);
  }

  progress("Creating Flash player window");

  const winId = generateId();
  const win = new BrowserWindow({
    width: slot.width,
    height: slot.height,
    x: slot.x,
    y: slot.y,
    frame: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/splitscreen-preload.js"),
    },
  });

  activeBrowserWindows.set(slot.index, win);
  updateSplitscreenWindows();

  // Register the game with the overlay service so F1 works
  if (!overlayGameRegistered) {
    setOverlayGame(game);
    overlayGameId = game.id;
    overlayGameRegistered = true;
  }
  ensureOverlayIpc();

  // Handle F1 key to toggle overlay from within the BrowserWindow
  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F1" && input.type === "keyDown") {
      event.preventDefault();
      toggleOverlay();
    }
    // Escape exits splitscreen if overlay is not visible
    if (input.key === "Escape" && input.type === "keyDown") {
      event.preventDefault();
      import("./splitscreen.service").then(({ stopSession }) => {
        stopSession().catch((err) => log.error("splitscreen-instance", `Failed to stop session: ${err}`));
      });
    }
  });

  // Load a standalone Flash player page
  const flashUrl = `ember://splitscreen/flash.html?swf=${encodeURIComponent(swfPath)}&slot=${slot.index}`;
  await win.loadURL(flashUrl);

  progress("Flash player ready");

  // Route audio if a sink is assigned
  if (config.audioSinkId && win.webContents.getProcessId()) {
    const pid = win.webContents.getProcessId();
    setTimeout(() => routeAudioStream(pid, config.audioSinkId!).catch((err) => {
      log.warn("splitscreen-instance", `Failed to route audio for Flash instance: ${err}`);
    }), 2000);
  }

  return {
    windowId: null,
    pid: win.webContents.getProcessId() || null,
    browserWindowId: winId,
  };
}

async function launchLibretroInstance(
  config: SplitscreenInstanceConfig,
  slot: SplitscreenSlot,
  progress: (step: string, detail?: string) => void,
): Promise<InstanceLaunchResult> {
  const game = config.game;
  const romPath = game.romPath ?? game.compressedRomPath;
  if (!romPath) {
    throw new Error(`No ROM path for libretro game: ${game.title}`);
  }

  progress("Creating libretro player window");

  const winId = generateId();
  const win = new BrowserWindow({
    width: slot.width,
    height: slot.height,
    x: slot.x,
    y: slot.y,
    frame: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/splitscreen-preload.js"),
    },
  });

  activeBrowserWindows.set(slot.index, win);
  updateSplitscreenWindows();

  if (!overlayGameRegistered) {
    setOverlayGame(game);
    overlayGameId = game.id;
    overlayGameRegistered = true;
  }
  ensureOverlayIpc();

  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F1" && input.type === "keyDown") {
      event.preventDefault();
      toggleOverlay();
    }
    if (input.key === "Escape" && input.type === "keyDown") {
      event.preventDefault();
      import("./splitscreen.service").then(({ stopSession }) => {
        stopSession().catch((err) => log.error("splitscreen-instance", `Failed to stop session: ${err}`));
      });
    }
  });

  // Load a standalone libretro player page
  const libretroUrl = `ember://splitscreen/libretro.html?rom=${encodeURIComponent(romPath)}&title=${encodeURIComponent(game.title)}&platform=${game.platform}&gameId=${game.id}&slot=${slot.index}${config.corePath ? `&core=${encodeURIComponent(config.corePath)}` : ""}`;
  await win.loadURL(libretroUrl);

  progress("Libretro player ready");

  // Route audio if a sink is assigned
  if (config.audioSinkId && win.webContents.getProcessId()) {
    const pid = win.webContents.getProcessId();
    setTimeout(() => routeAudioStream(pid, config.audioSinkId!).catch((err) => {
      log.warn("splitscreen-instance", `Failed to route audio for libretro instance: ${err}`);
    }), 2000);
  }

  return {
    windowId: null,
    pid: win.webContents.getProcessId() || null,
    browserWindowId: winId,
  };
}

async function launchVideoInstance(
  config: SplitscreenInstanceConfig,
  slot: SplitscreenSlot,
  progress: (step: string, detail?: string) => void,
): Promise<InstanceLaunchResult> {
  const game = config.game;
  const videoPath = game.romPath ?? game.execPath;
  if (!videoPath) {
    throw new Error(`No video path for video instance: ${game.title}`);
  }

  progress("Creating video player window");

  const winId = generateId();
  const win = new BrowserWindow({
    width: slot.width,
    height: slot.height,
    x: slot.x,
    y: slot.y,
    frame: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/splitscreen-preload.js"),
    },
  });

  activeBrowserWindows.set(slot.index, win);
  updateSplitscreenWindows();

  if (!overlayGameRegistered) {
    setOverlayGame(game);
    overlayGameId = game.id;
    overlayGameRegistered = true;
  }
  ensureOverlayIpc();

  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F1" && input.type === "keyDown") {
      event.preventDefault();
      toggleOverlay();
    }
    if (input.key === "Escape" && input.type === "keyDown") {
      event.preventDefault();
      import("./splitscreen.service").then(({ stopSession }) => {
        stopSession().catch((err) => log.error("splitscreen-instance", `Failed to stop session: ${err}`));
      });
    }
  });

  // Load a standalone video player page
  const videoUrl = `ember://splitscreen/video.html?src=${encodeURIComponent(videoPath)}&title=${encodeURIComponent(game.title)}&slot=${slot.index}`;
  await win.loadURL(videoUrl);

  progress("Video player ready");

  // Route audio if a sink is assigned
  if (config.audioSinkId && win.webContents.getProcessId()) {
    const pid = win.webContents.getProcessId();
    setTimeout(() => routeAudioStream(pid, config.audioSinkId!).catch((err) => {
      log.warn("splitscreen-instance", `Failed to route audio for video instance: ${err}`);
    }), 2000);
  }

  return {
    windowId: null,
    pid: win.webContents.getProcessId() || null,
    browserWindowId: winId,
  };
}

export async function stopInstance(instance: SplitscreenInstanceState): Promise<void> {
  if (instance.browserWindowId) {
    // It's a BrowserWindow instance
    // Find the window by slot index
    const win = activeBrowserWindows.get(instance.slotIndex);
    if (win && !win.isDestroyed()) {
      win.close();
    }
    activeBrowserWindows.delete(instance.slotIndex);
    updateSplitscreenWindows();
  } else if (instance.pid) {
    // It's an external process
    try {
      process.kill(instance.pid, "SIGTERM");
    } catch (err) {
      log.warn("splitscreen-instance", `Failed to kill pid ${instance.pid}: ${err}`);
    }
  }
}

export async function pauseInstance(instance: SplitscreenInstanceState): Promise<void> {
  if (instance.browserWindowId) {
    // BrowserWindow instance: use background throttling
    const win = activeBrowserWindows.get(instance.slotIndex);
    if (win && !win.isDestroyed()) {
      win.webContents.backgroundThrottling = true;
      // Send a pause message to the renderer
      win.webContents.send("splitscreen:pause");
    }
  } else if (instance.pid) {
    // External process: SIGSTOP
    try {
      process.kill(instance.pid, "SIGSTOP");
      log.info("splitscreen-instance", `Paused pid ${instance.pid} (SIGSTOP)`);
    } catch (err) {
      log.warn("splitscreen-instance", `Failed to SIGSTOP pid ${instance.pid}: ${err}`);
    }
  }
}

export async function resumeInstance(instance: SplitscreenInstanceState): Promise<void> {
  if (instance.browserWindowId) {
    const win = activeBrowserWindows.get(instance.slotIndex);
    if (win && !win.isDestroyed()) {
      win.webContents.backgroundThrottling = false;
      win.webContents.send("splitscreen:resume");
    }
  } else if (instance.pid) {
    try {
      process.kill(instance.pid, "SIGCONT");
      log.info("splitscreen-instance", `Resumed pid ${instance.pid} (SIGCONT)`);
    } catch (err) {
      log.warn("splitscreen-instance", `Failed to SIGCONT pid ${instance.pid}: ${err}`);
    }
  }
}

export function getBrowserWindow(slotIndex: number): BrowserWindow | null {
  return activeBrowserWindows.get(slotIndex) ?? null;
}

export function getAllBrowserWindows(): Map<number, BrowserWindow> {
  return new Map(activeBrowserWindows);
}

export async function cleanupAllInstances(): Promise<void> {
  for (const [slotIndex, win] of activeBrowserWindows) {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
  activeBrowserWindows.clear();
  updateSplitscreenWindows();

  // Clear overlay game registration
  if (overlayGameRegistered && overlayGameId) {
    clearOverlayGame(overlayGameId);
    overlayGameRegistered = false;
    overlayGameId = null;
  }

  for (const [slotIndex, proc] of activeProcesses) {
    try {
      process.kill(proc.pid!, "SIGTERM");
    } catch {
      // ignore
    }
  }
  activeProcesses.clear();
}
