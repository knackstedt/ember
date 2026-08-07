import { ipcMain, shell, webContents } from "electron";
import { join } from "path";
import { spawn } from "child_process";
import {
  getStreamingServices,
  getAllStreamingServices,
  addCustomService,
  updateService,
  deleteService,
  setServiceEnabled,
  detectDesktopApp,
} from "../../services/streaming.service";
import {
  authenticateAdapter,
  disconnectAdapter,
  adapterSearch,
  adapterPlay,
  adapterPause,
  adapterNext,
  adapterPrevious,
  adapterCurrentlyPlaying,
  adapterGetDevices,
  adapterGetTrack,
  adapterGetAlbum,
  adapterGetPlaylist,
} from "../../services/streaming/streaming-player.service";
import {
  StreamingServiceRepo,
  StreamingFrontpageItemRepo,
} from "../../db/repository";
import {
  downloadExtension,
  loadExtensionIntoSession,
  unloadExtensionFromSession,
  removeExtension,
  applyExtensionsToPartition,
  ensureDefaultExtensions,
} from "../../services/extension-manager.service";
import type { StreamingService, StreamingExtension, StreamingFrontpageItem } from "../../../shared/types";
import type { IpcContext } from "../types";
import { createLogger } from "../../util/logger";

const log = createLogger("info");

export function registerStreamingHandlers(_ctx: IpcContext): void {
  ipcMain.handle("streaming:list", async (_e, category?: string) => {
    if (category) return getStreamingServices(category);
    return getAllStreamingServices();
  });

  ipcMain.handle("streaming:add", async (_e, service: Omit<StreamingService, "isBuiltin" | "sortOrder">) => addCustomService(service));
  ipcMain.handle("streaming:update", async (_e, service: StreamingService) => updateService(service));
  ipcMain.handle("streaming:delete", async (_e, id: string) => deleteService(id));
  ipcMain.handle("streaming:setEnabled", async (_e, id: string, enabled: boolean) => setServiceEnabled(id, enabled));
  ipcMain.handle("streaming:detectDesktopApp", async (_e, command: string) => detectDesktopApp(command));

  ipcMain.handle("streaming:launch", async (_e, service: StreamingService) => {
    const desktopAvailable = service.desktopApp ? detectDesktopApp(service.desktopApp) : false;
    if (desktopAvailable && service.desktopApp) {
      const args = service.desktopAppArgs ?? [];
      const proc = spawn(service.desktopApp, args, { detached: true, stdio: "ignore" });
      proc.on("error", (err) => {
        log.error("streaming:launch", `Failed to launch ${service.desktopApp}: ${err}`);
      });
      proc.unref();
    } else {
      await shell.openExternal(service.url);
    }
  });

  // Frontpage items
  ipcMain.handle("streaming:frontpage:report", async (_e, serviceId: string, items: StreamingFrontpageItem[]) => {
    await StreamingFrontpageItemRepo.replaceForService(serviceId, items);
    return { success: true, count: items.length };
  });
  ipcMain.handle("streaming:frontpage:list", async (_e, serviceId: string) => StreamingFrontpageItemRepo.listByService(serviceId));
  ipcMain.handle("streaming:frontpage:listAll", async () => StreamingFrontpageItemRepo.listAll());
  ipcMain.handle("streaming:frontpage:clear", async (_e, maxAgeMs?: number) => {
    await StreamingFrontpageItemRepo.clearOld(maxAgeMs ?? 7 * 24 * 60 * 60 * 1000);
    return { success: true };
  });

  ipcMain.handle("streaming:usage:start", async (_e, id: string) => {
    await StreamingServiceRepo.setLastPlayed(id, Date.now());
    return { success: true };
  });
  ipcMain.handle("streaming:usage:stop", async (_e, id: string, seconds: number) => {
    await StreamingServiceRepo.addPlayTime(id, seconds);
    return { success: true };
  });

  // Adapter framework
  ipcMain.handle("streaming:adapter:authenticate", async (_e, serviceId: string) => authenticateAdapter(serviceId));
  ipcMain.handle("streaming:adapter:disconnect", async (_e, serviceId: string) => {
    await disconnectAdapter(serviceId);
    return { success: true };
  });
  ipcMain.handle("streaming:adapter:search", async (_e, serviceId: string, query: string, types?: ("track" | "album" | "artist" | "playlist")[]) => adapterSearch(serviceId, query, types));
  ipcMain.handle("streaming:adapter:play", async (_e, serviceId: string, uri?: string) => {
    await adapterPlay(serviceId, uri);
    return { success: true };
  });
  ipcMain.handle("streaming:adapter:pause", async (_e, serviceId: string) => {
    await adapterPause(serviceId);
    return { success: true };
  });
  ipcMain.handle("streaming:adapter:next", async (_e, serviceId: string) => {
    await adapterNext(serviceId);
    return { success: true };
  });
  ipcMain.handle("streaming:adapter:previous", async (_e, serviceId: string) => {
    await adapterPrevious(serviceId);
    return { success: true };
  });
  ipcMain.handle("streaming:adapter:currentlyPlaying", async (_e, serviceId: string) => adapterCurrentlyPlaying(serviceId));
  ipcMain.handle("streaming:adapter:getDevices", async (_e, serviceId: string) => adapterGetDevices(serviceId));
  ipcMain.handle("streaming:adapter:getTrack", async (_e, serviceId: string, id: string) => adapterGetTrack(serviceId, id));
  ipcMain.handle("streaming:adapter:getAlbum", async (_e, serviceId: string, id: string) => adapterGetAlbum(serviceId, id));
  ipcMain.handle("streaming:adapter:getPlaylist", async (_e, serviceId: string, id: string) => adapterGetPlaylist(serviceId, id));

  // Media key injection
  ipcMain.on("streaming:mediaKeys", (_e, action: "play" | "pause" | "next" | "previous") => {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.getType() === "webview") {
        wc.send("streaming:mediaKeys", action);
      }
    }
  });

  ipcMain.handle("app:getPreloadPath", async (_e, name: string) => {
    return join(__dirname, "../preload", `${name}.js`);
  });

  // Extension manager
  ipcMain.handle("streaming:extensions:ensureDefaults", async () => ensureDefaultExtensions());
  ipcMain.handle("streaming:extensions:download", async (_e, extId: string, url: string, version: string) => downloadExtension(url, extId, version));
  ipcMain.handle("streaming:extensions:load", async (_e, extId: string, partition: string) => loadExtensionIntoSession(extId, partition));
  ipcMain.handle("streaming:extensions:unload", async (_e, extId: string, partition: string) => unloadExtensionFromSession(extId, partition));
  ipcMain.handle("streaming:extensions:remove", async (_e, extId: string) => removeExtension(extId));
  ipcMain.handle("streaming:extensions:apply", async (_e, partition: string, extensions: StreamingExtension[]) => applyExtensionsToPartition(partition, extensions));
}
