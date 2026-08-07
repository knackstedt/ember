import { ipcMain } from "electron";
import { getDb } from "../../db";
import { AliasRepo, MappingRepo } from "../../db/repository";
import { getConnectedDevices, rescanDevice } from "../../input/evdev";
import type { IpcContext } from "../types";

export function registerInputHandlers(_ctx: IpcContext): void {
  ipcMain.handle("input:devices", async () => getConnectedDevices());
  ipcMain.handle("input:mappings:get", async (_e, deviceId: string) => MappingRepo.get(deviceId));
  ipcMain.handle("input:mappings:set", async (_e, deviceId: string, inputCode: string, action: string) => MappingRepo.set(deviceId, inputCode, action));
  ipcMain.handle("input:mappings:reset", async (_e, deviceId: string) => MappingRepo.reset(deviceId));
  ipcMain.handle("input:alias:get", async (_e, deviceId: string) => AliasRepo.get(deviceId));
  ipcMain.handle("input:alias:set", async (_e, deviceId: string, alias: string) => AliasRepo.set(deviceId, alias));
  ipcMain.handle("input:alias:remove", async (_e, deviceId: string) => AliasRepo.remove(deviceId));
  ipcMain.handle("input:device:reconnect", async (_e, deviceId: string) => rescanDevice(deviceId));
  ipcMain.handle("controller:openMapping", async () => true);
  ipcMain.handle("controller:resetMappings", async () => {
    const db = getDb();
    await db.query("DELETE FROM controller_mapping");
    return true;
  });
}
