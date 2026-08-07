import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../../shared/ipc";
import {
  startSession,
  stopSession,
  getSessionState,
  pauseInstanceBySlot,
  resumeInstanceBySlot,
  stopInstanceBySlot,
  getDisplays,
  getLayouts,
  getAudioSinks,
  setSinkLabel,
  setHost,
  assignDeviceToSlot,
  locateDeviceByDeviceId,
  showOverlay,
  hideOverlay,
  focusSlot,
} from "../../services/splitscreen.service";
import { routeAudioStream } from "../../services/splitscreen-audio.service";
import type { IpcContext } from "../types";

export function registerSplitscreenHandlers(_ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.splitscreen.detectDisplays, async () => getDisplays());
  ipcMain.handle(IPC_CHANNELS.splitscreen.getLayouts, () => getLayouts());
  ipcMain.handle(IPC_CHANNELS.splitscreen.startSession, async (_e, config: any) => startSession(config));
  ipcMain.handle(IPC_CHANNELS.splitscreen.stopSession, async () => stopSession());
  ipcMain.handle(IPC_CHANNELS.splitscreen.getSessionState, async () => getSessionState());
  ipcMain.handle(IPC_CHANNELS.splitscreen.pauseInstance, async (_e, slotIndex: number) => pauseInstanceBySlot(slotIndex));
  ipcMain.handle(IPC_CHANNELS.splitscreen.resumeInstance, async (_e, slotIndex: number) => resumeInstanceBySlot(slotIndex));
  ipcMain.handle(IPC_CHANNELS.splitscreen.stopInstance, async (_e, slotIndex: number) => stopInstanceBySlot(slotIndex));
  ipcMain.handle(IPC_CHANNELS.splitscreen.getAudioSinks, async () => getAudioSinks());
  ipcMain.handle(IPC_CHANNELS.splitscreen.setAudioSinkLabel, async (_e, sinkId: string, label: string) => setSinkLabel(sinkId, label));
  ipcMain.handle(IPC_CHANNELS.splitscreen.routeAudio, async (_e, pid: number, sinkId: string) => routeAudioStream(pid, sinkId));
  ipcMain.handle(IPC_CHANNELS.splitscreen.assignDevice, async (_e, deviceId: string, slotIndex: number) => assignDeviceToSlot(deviceId, slotIndex));
  ipcMain.handle(IPC_CHANNELS.splitscreen.setHostDevice, async (_e, deviceId: string) => setHost(deviceId));
  ipcMain.handle(IPC_CHANNELS.splitscreen.locateDevice, async (_e, deviceId: string) => locateDeviceByDeviceId(deviceId));
  ipcMain.handle(IPC_CHANNELS.splitscreen.showOverlay, async () => showOverlay());
  ipcMain.handle(IPC_CHANNELS.splitscreen.hideOverlay, async () => hideOverlay());
  ipcMain.handle(IPC_CHANNELS.splitscreen.focusSlot, async (_e, slotIndex: number) => focusSlot(slotIndex));
}
