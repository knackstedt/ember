import { BrowserWindow } from "electron";
import {
  SplitscreenConfig,
  SplitscreenSession,
  SplitscreenInstanceState,
  SplitscreenInstanceProgress,
  DisplayInfo,
  AudioSink,
} from "../../shared/splitscreen-types";
import { computeLayoutSlots, LAYOUT_DEFINITIONS } from "../../shared/splitscreen-types";
import { createLogger } from "../util/logger";
import { IPC_CHANNELS } from "../../shared/ipc";

import {
  launchInstance,
  stopInstance,
  pauseInstance,
  resumeInstance,
  cleanupAllInstances,
  InstanceLaunchResult,
} from "./splitscreen-instance.service";
import {
  detectDisplays,
  positionWindow,
  waitForGameWindow,
} from "./splitscreen-window.service";
import {
  listAudioSinks,
  setAudioSinkLabel,
  routeAudioStream,
} from "./splitscreen-audio.service";
import {
  createVirtualDevice,
  destroyVirtualDevice,
  assignDevice,
  setHostDevice,
  setHostMode,
  locateDevice,
  cleanupInputService,
} from "./splitscreen-input.service";

const log = createLogger("info");

let activeSession: SplitscreenSession | null = null;
let overlayVisible = false;

function getMainWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows();
  return wins.find((w) => !w.isDestroyed()) ?? null;
}

function sendStateToRenderer(): void {
  if (!activeSession) return;
  const win = getMainWindow();
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.splitscreen.state, activeSession);
  }
}

function sendInstanceProgress(slotIndex: number, step: string, detail?: string): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    const payload: SplitscreenInstanceProgress = { slotIndex, step, detail };
    win.webContents.send(IPC_CHANNELS.splitscreen.instanceProgress, payload);
  }
}

export async function startSession(config: SplitscreenConfig): Promise<string> {
  if (activeSession) {
    log.warn("splitscreen", "Session already active, stopping previous session");
    await stopSession();
  }

  const sessionId = `ss-${Date.now()}`;
  const instances: SplitscreenInstanceState[] = config.instances.map((inst) => ({
    slotIndex: inst.slotIndex,
    windowId: null,
    pid: null,
    browserWindowId: null,
    paused: false,
    status: "launching",
  }));

  activeSession = {
    id: sessionId,
    config,
    instances,
    activeOverlaySlot: null,
  };

  log.info("splitscreen", `Starting session ${sessionId} with ${config.instances.length} instances`);

  // Setup input routing
  for (const mapping of config.deviceMappings) {
    assignDevice(mapping.deviceId, mapping.slotIndex);
    if (mapping.isHost) {
      setHostDevice(mapping.deviceId);
    }
  }

  // Create virtual input devices for each slot
  for (const inst of config.instances) {
    try {
      await createVirtualDevice(inst.slotIndex, "controller");
    } catch (err) {
      log.warn("splitscreen", `Failed to create virtual device for slot ${inst.slotIndex}: ${err}`);
    }
  }

  // Launch all instances
  const launchPromises = config.instances.map(async (instConfig) => {
    const slot = config.layout.slots.find((s) => s.index === instConfig.slotIndex);
    if (!slot) {
      log.error("splitscreen", `No slot found for index ${instConfig.slotIndex}`);
      updateInstanceStatus(instConfig.slotIndex, "error", "No slot geometry found");
      return;
    }

    try {
      const result = await launchInstance(instConfig, slot, (step, detail) => {
        sendInstanceProgress(instConfig.slotIndex, step, detail);
      });

      // Update instance state with launch result
      const inst = activeSession?.instances.find((i) => i.slotIndex === instConfig.slotIndex);
      if (inst) {
        inst.windowId = result.windowId;
        inst.pid = result.pid;
        inst.browserWindowId = result.browserWindowId;
        inst.status = "running";
      }

      // Position window if we have a window ID (for external games)
      // BrowserWindow instances are already positioned at creation time
      if (result.browserWindowId) {
        // BrowserWindow — already positioned via slot geometry at creation
        log.info("splitscreen", `Slot ${instConfig.slotIndex}: BrowserWindow positioned at creation`);
      } else if (result.windowId !== null) {
        await positionWindow(result.windowId, slot);
      } else if (result.pid) {
        // External game — try to find the window for this PID
        log.info("splitscreen", `Slot ${instConfig.slotIndex}: Waiting for external game window (PID ${result.pid})`);
        const windowId = await waitForGameWindow(result.pid, 15000);
        if (windowId !== null) {
          if (inst) inst.windowId = windowId;
          await positionWindow(windowId, slot);
        } else {
          log.warn("splitscreen", `Slot ${instConfig.slotIndex}: Could not find window for PID ${result.pid}`);
        }
      }

      // Route audio to assigned sink
      const audioMapping = config.audioMappings.find((m) => m.slotIndex === instConfig.slotIndex);
      if (audioMapping && result.pid) {
        setTimeout(() => {
          routeAudioStream(result.pid!, audioMapping.sinkId).catch((err) => {
            log.warn("splitscreen", `Failed to route audio for slot ${instConfig.slotIndex}: ${err}`);
          });
        }, 2000);
      }

      sendStateToRenderer();
    } catch (err) {
      log.error("splitscreen", `Failed to launch instance for slot ${instConfig.slotIndex}: ${err}`);
      updateInstanceStatus(instConfig.slotIndex, "error", String(err));
    }
  });

  // Wait for all launches to complete
  await Promise.allSettled(launchPromises);

  sendStateToRenderer();
  log.info("splitscreen", `Session ${sessionId} launch complete`);
  return sessionId;
}

function updateInstanceStatus(slotIndex: number, status: SplitscreenInstanceState["status"], error?: string): void {
  if (!activeSession) return;
  const inst = activeSession.instances.find((i) => i.slotIndex === slotIndex);
  if (inst) {
    inst.status = status;
    if (error) inst.error = error;
  }
  sendStateToRenderer();
}

export async function stopSession(): Promise<void> {
  if (!activeSession) return;

  log.info("splitscreen", `Stopping session ${activeSession.id}`);

  // Stop all instances
  for (const inst of activeSession.instances) {
    if (inst.status === "running" || inst.status === "launching") {
      try {
        await stopInstance(inst);
        inst.status = "stopped";
      } catch (err) {
        log.warn("splitscreen", `Failed to stop instance ${inst.slotIndex}: ${err}`);
      }
    }
  }

  // Cleanup virtual input devices
  for (const inst of activeSession.instances) {
    try {
      await destroyVirtualDevice(inst.slotIndex);
    } catch (err) {
      log.warn("splitscreen", `Failed to destroy virtual device for slot ${inst.slotIndex}: ${err}`);
    }
  }

  // Cleanup all browser windows and processes
  await cleanupAllInstances();

  // Cleanup input service
  await cleanupInputService();

  activeSession = null;
  overlayVisible = false;
  sendStateToRenderer();
  log.info("splitscreen", "Session stopped");
}

export async function pauseInstanceBySlot(slotIndex: number): Promise<void> {
  if (!activeSession) return;
  const inst = activeSession.instances.find((i) => i.slotIndex === slotIndex);
  if (!inst || inst.status !== "running") return;

  try {
    await pauseInstance(inst);
    inst.paused = true;
    sendStateToRenderer();
  } catch (err) {
    log.error("splitscreen", `Failed to pause instance ${slotIndex}: ${err}`);
  }
}

export async function resumeInstanceBySlot(slotIndex: number): Promise<void> {
  if (!activeSession) return;
  const inst = activeSession.instances.find((i) => i.slotIndex === slotIndex);
  if (!inst || inst.status !== "running") return;

  try {
    await resumeInstance(inst);
    inst.paused = false;
    sendStateToRenderer();
  } catch (err) {
    log.error("splitscreen", `Failed to resume instance ${slotIndex}: ${err}`);
  }
}

export async function stopInstanceBySlot(slotIndex: number): Promise<void> {
  if (!activeSession) return;
  const inst = activeSession.instances.find((i) => i.slotIndex === slotIndex);
  if (!inst) return;

  try {
    await stopInstance(inst);
    inst.status = "stopped";
    sendStateToRenderer();
  } catch (err) {
    log.error("splitscreen", `Failed to stop instance ${slotIndex}: ${err}`);
  }
}

export function getSessionState(): SplitscreenSession | null {
  return activeSession;
}

export function isSessionActive(): boolean {
  return activeSession !== null;
}

export function showOverlay(): void {
  if (!activeSession) return;
  overlayVisible = true;
  setHostMode(true);
  log.info("splitscreen", "Overlay shown, host mode enabled");
}

export function hideOverlay(): void {
  if (!activeSession) return;
  overlayVisible = false;
  setHostMode(false);
  log.info("splitscreen", "Overlay hidden, host mode disabled");
}

export function focusSlot(slotIndex: number): void {
  if (!activeSession) return;
  activeSession.activeOverlaySlot = slotIndex;
  sendStateToRenderer();
  log.info("splitscreen", `Focused slot ${slotIndex}`);
}

export async function getDisplays(): Promise<DisplayInfo[]> {
  return detectDisplays();
}

export function getLayouts() {
  return LAYOUT_DEFINITIONS;
}

export async function getAudioSinks(): Promise<AudioSink[]> {
  return listAudioSinks();
}

export async function setSinkLabel(sinkId: string, label: string): Promise<void> {
  return setAudioSinkLabel(sinkId, label);
}

export async function locateDeviceByDeviceId(deviceId: string): Promise<void> {
  return locateDevice(deviceId);
}

export async function assignDeviceToSlot(deviceId: string, slotIndex: number): Promise<void> {
  assignDevice(deviceId, slotIndex);
}

export async function setHost(deviceId: string): Promise<void> {
  setHostDevice(deviceId);
}

export async function cleanupSplitscreen(): Promise<void> {
  await stopSession();
}
