import { ipcMain } from "electron";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { spawn } from "child_process";
import {
  listAvailablePackages,
  searchPackages,
  installPackage,
  uninstallPackage,
  checkUpdates,
  setAptPassword,
  detectInstalledCores,
} from "../../services/package-manager.service";
import { detectWineRunner } from "../../services/wine-detection.service";
import type { IpcContext } from "../types";

export function registerPackagesHandlers(ctx: IpcContext): void {
  const { window } = ctx;

  ipcMain.handle("packages:list", async () => listAvailablePackages());
  ipcMain.handle("packages:search", async (_e, query: string) => searchPackages(query));
  ipcMain.handle("packages:install", async (_e, packageId: string) => installPackage(packageId, window));
  ipcMain.handle("packages:uninstall", async (_e, packageId: string) => uninstallPackage(packageId, window));
  ipcMain.handle("packages:update", async () => checkUpdates(window));
  ipcMain.handle("packages:setAptPassword", async (_e, password: string) => setAptPassword(password));
  ipcMain.handle("packages:detectCores", async () => detectInstalledCores());
  ipcMain.handle("packages:detectWineRunner", async () => detectWineRunner());

  // Emulator configuration
  ipcMain.handle("dolphin:openSettings", async () => {
    const dolphinPaths = [
      "/usr/bin/dolphin-emu",
      "/var/lib/flatpak/exports/bin/org.DolphinEmu.dolphin-emu",
    ];
    for (const path of dolphinPaths) {
      if (existsSync(path)) {
        if (path.includes("flatpak")) {
          spawn("flatpak", ["run", "org.DolphinEmu.dolphin-emu", "--settings"], { detached: true, stdio: "ignore" }).unref();
        } else {
          spawn(path, ["--settings"], { detached: true, stdio: "ignore" }).unref();
        }
        return true;
      }
    }
    return false;
  });

  ipcMain.handle("dolphin:openConfig", async () => {
    const { shell } = await import("electron");
    const configPaths = [
      join(homedir(), ".local/share/dolphin-emu"),
      join(homedir(), ".var/app/org.DolphinEmu.dolphin-emu/config/dolphin-emu"),
    ];
    for (const path of configPaths) {
      if (existsSync(path)) {
        shell.openPath(path);
        return true;
      }
    }
    return false;
  });
}
