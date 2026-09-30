import { spawn } from "child_process";
import { app, ipcMain } from "electron";
import { readFileSync } from "fs";
import { getMainWindow } from "../..";
import type { AppSettings } from "../../../shared/types";
import { getDefaultScanSourcesAsync } from "../../scanners/defaults";
import { getXdgMusicDir, getXdgVideosDir } from "../../scanners/xdg";
import { setFlashThumbnailConcurrency } from "../../services/flash-thumbnail.service";
import { invalidateMediaAccessCache } from "../../services/media-access.service";
import { getSettings, setSetting, setSettings } from "../../services/settings.service";
import { createLogger } from "../../util/logger";
import type { IpcContext } from "../types";

const log = createLogger("info");

export function registerAppHandlers(ctx: IpcContext): void {
  const { window, sendScanTrigger } = ctx;

  ipcMain.handle("settings:get", async () => getSettings());

  ipcMain.handle("settings:set", async (_e, partial: Partial<AppSettings>) => {
    await setSettings(partial);
    // Scan-root changes alter which paths the renderer may read.
    invalidateMediaAccessCache();
    if ("fullscreen" in partial) {
      window.setFullScreen(partial.fullscreen ?? false);
    }
    if ("flashThumbnailConcurrency" in partial) {
      setFlashThumbnailConcurrency(partial.flashThumbnailConcurrency ?? 4);
    }
    const triggerTypes: ("games" | "movies" | "music")[] = [];
    if ("moviePaths" in partial) triggerTypes.push("movies");
    if ("musicPaths" in partial) triggerTypes.push("music");
    if ("romPaths" in partial || "gamePaths" in partial) triggerTypes.push("games");
    if (triggerTypes.length > 0) {
      setTimeout(() => sendScanTrigger(triggerTypes), 300);
    }
  });

  ipcMain.handle("app:fullscreen", (_e, value: boolean) => {
    window.setFullScreen(value);
    setSetting("fullscreen", value);
  });

  ipcMain.handle("app:focus-ember", () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  ipcMain.handle("app:quit", () => app.quit());

  ipcMain.handle("app:restart", () => {
    if (app.isPackaged) {
      app.relaunch();
      app.quit();
    } else {
      window.reload();
    }
  });

  ipcMain.handle("gc:trigger", () => {
    if (typeof (global as any).gc === "function") (global as any).gc();
  });

  ipcMain.handle("app:shutdown", () => {
    try {
      spawn("systemctl", ["poweroff"], { detached: true, stdio: "ignore" });
    } catch {
      try { spawn("shutdown", ["-h", "now"], { detached: true, stdio: "ignore" }); } catch {}
    }
  });

  ipcMain.handle("app:reboot", () => {
    try {
      spawn("systemctl", ["reboot"], { detached: true, stdio: "ignore" });
    } catch {
      try { spawn("shutdown", ["-r", "now"], { detached: true, stdio: "ignore" }); } catch {}
    }
  });

  ipcMain.handle("app:suspend", () => {
    try {
      spawn("systemctl", ["suspend"], { detached: true, stdio: "ignore" });
    } catch {
      try { spawn("pm-suspend", [], { detached: true, stdio: "ignore" }); } catch {}
    }
  });

  ipcMain.handle("app:hibernate", () => {
    try {
      spawn("systemctl", ["hibernate"], { detached: true, stdio: "ignore" });
    } catch {}
  });

  ipcMain.handle("app:canHibernate", () => {
    try {
      const states = readFileSync("/sys/power/state", "utf-8");
      return states.includes("disk");
    } catch {
      return false;
    }
  });

  ipcMain.handle("app:xdg-defaults", async () => {
    const sources = await getDefaultScanSourcesAsync();
    log.info("app:xdg-defaults", `Returning sources: ${JSON.stringify(sources)}`);
    return {
      videosDir: getXdgVideosDir(),
      musicDir: getXdgMusicDir(),
      ...sources,
    };
  });
}
