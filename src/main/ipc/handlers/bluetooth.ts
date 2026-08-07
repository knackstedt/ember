import { ipcMain } from "electron";
import {
  isBluetoothAvailable as btAvailable,
  getAdapterState as btGetAdapter,
  setAdapterPower as btSetPower,
  listDevices as btListDevices,
  scanDevices as btScanDevices,
  pairDevice as btPair,
  connectDevice as btConnect,
  disconnectDevice as btDisconnect,
  removeDevice as btRemove,
  trustDevice as btTrust,
  reconnectDevice as btReconnect,
} from "../../services/bluetooth.service";
import type { IpcContext } from "../types";

export function registerBluetoothHandlers(_ctx: IpcContext): void {
  ipcMain.handle("bluetooth:available", async () => btAvailable());
  ipcMain.handle("bluetooth:adapter", async () => btGetAdapter());
  ipcMain.handle("bluetooth:power", async (_e, on: boolean) => btSetPower(on));
  ipcMain.handle("bluetooth:devices", async () => btListDevices());
  ipcMain.handle("bluetooth:scan", async (_e, durationSeconds?: number) => btScanDevices(durationSeconds ?? 10));
  ipcMain.handle("bluetooth:pair", async (_e, mac: string) => btPair(mac));
  ipcMain.handle("bluetooth:connect", async (_e, mac: string) => btConnect(mac));
  ipcMain.handle("bluetooth:disconnect", async (_e, mac: string) => btDisconnect(mac));
  ipcMain.handle("bluetooth:remove", async (_e, mac: string) => btRemove(mac));
  ipcMain.handle("bluetooth:trust", async (_e, mac: string) => btTrust(mac));
  ipcMain.handle("bluetooth:reconnect", async (_e, mac: string) => btReconnect(mac));
}
