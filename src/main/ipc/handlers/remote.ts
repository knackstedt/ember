import { ipcMain, session } from "electron";
import { join, homedir } from "os";
import { existsSync, mkdirSync } from "fs";
import { join as pathJoin } from "path";
import { homedir as osHomedir } from "os";
import {
  listRemotes,
  addRemote,
  updateRemote,
  removeRemote,
  getRemoteFileList,
  startServe,
  stopServe,
  getServePort,
  getAllServePorts,
  checkRemoteNeedsAuth,
  testRemoteConnection,
  testRemoteCredentials,
  testRemotePath,
} from "../../services/rclone-manager";
import { isRcloneAvailable } from "../../services/rclone.service";
import {
  queueRemoteSourceScan,
  scanAllRemoteSources,
  deleteMissingFromSource,
} from "../../services/remote-scan.service";
import { checkRemoteAvailability } from "../../services/remote-availability.service";
import { discoverNetworkDevices } from "../../services/network-discovery";
import { startOAuthFlow } from "../../services/oauth-webview";
import {
  setMasterPassword,
  clearMasterPassword,
  hasMasterPassword,
  needsMasterPassword,
  needsSessionReauth,
} from "../../services/credential-store.service";
import { RemoteSourceRepo, GameRepo, MovieRepo, MusicRepo } from "../../db/repository";
import { getSettings } from "../../services/settings.service";
import type { RemoteSource } from "../../../shared/types";
import type { IpcContext } from "../types";

export function registerRemoteHandlers(ctx: IpcContext): void {
  const { sendRemoteProgress, sendScanItem } = ctx;

  // Rclone
  ipcMain.handle("rclone:available", async () => isRcloneAvailable());
  ipcMain.handle("rclone:list", async () => listRemotes());
  ipcMain.handle("rclone:add", async (_e, source: Omit<RemoteSource, "id">, creds: Record<string, string | undefined>) => {
    const added = await addRemote(source, creds);
    queueRemoteSourceScan(added, sendRemoteProgress, sendScanItem);
    return added;
  });
  ipcMain.handle("rclone:update", async (_e, source: RemoteSource, creds?: Record<string, string | undefined>) => updateRemote(source, creds));
  ipcMain.handle("rclone:remove", async (_e, id: string) => removeRemote(id));
  ipcMain.handle("rclone:listFiles", async (_e, source: RemoteSource, path: string) => getRemoteFileList(source, path));
  ipcMain.handle("rclone:startServe", async (_e, source: RemoteSource) => startServe(source));
  ipcMain.handle("rclone:stopServe", async (_e, id: string) => stopServe(id));
  ipcMain.handle("rclone:getServePort", async (_e, id: string) => getServePort(id));
  ipcMain.handle("rclone:getAllServePorts", async () => {
    const ports = await getAllServePorts();
    return Object.fromEntries(ports);
  });
  ipcMain.handle("rclone:checkAuth", async (_e, source: RemoteSource) => checkRemoteNeedsAuth(source));
  ipcMain.handle("rclone:testConnection", async (_e, source: RemoteSource) => testRemoteConnection(source));
  ipcMain.handle("rclone:testCredentials", async (_e, source: RemoteSource) => testRemoteCredentials(source));
  ipcMain.handle("rclone:testPath", async (_e, source: RemoteSource) => testRemotePath(source));

  ipcMain.handle("remote:checkAvailability", async () => {
    await checkRemoteAvailability();
    return true;
  });

  ipcMain.handle("remote:deleteMissing", async (_e, type: "movie" | "music" | "game") => {
    switch (type) {
      case "movie": return MovieRepo.deleteMissing();
      case "music": return MusicRepo.deleteMissing();
      case "game": return GameRepo.deleteMissing();
      default: return 0;
    }
  });

  // Network discovery
  ipcMain.handle("network:discover", async () => discoverNetworkDevices());

  // OAuth
  ipcMain.handle("oauth:start", async (_e, authUrl: string, redirectPatterns: string[]) => startOAuthFlow(authUrl, redirectPatterns));

  // Credentials
  ipcMain.handle("credentials:setMasterPassword", async (_e, password: string) => setMasterPassword(password));
  ipcMain.handle("credentials:clearMasterPassword", async () => clearMasterPassword());
  ipcMain.handle("credentials:hasMasterPassword", async () => hasMasterPassword());
  ipcMain.handle("credentials:needsMasterPassword", async (_e, sources: RemoteSource[]) => needsMasterPassword(sources));
  ipcMain.handle("credentials:needsSessionReauth", async (_e, sources: RemoteSource[]) => needsSessionReauth(sources));

  // Download interception — redirect itch.io downloads to Games dir
  let cachedGamePaths: string[] = [];
  (async () => {
    try {
      const s = await getSettings();
      cachedGamePaths = s.gamePaths ?? [];
    } catch {}
  })();

  ipcMain.on("store:gamePaths:cache", (_e, paths: string[]) => {
    cachedGamePaths = paths;
  });

  session.defaultSession.on("will-download", (_event, item, _webContents) => {
    const url = item.getURL();
    const filename = item.getFilename();
    const isItchDownload =
      url.includes("itch.io") ||
      url.includes("itch.zone") ||
      url.includes("hwcdn.net") ||
      url.includes("amazonaws.com") ||
      filename.endsWith(".zip") ||
      filename.endsWith(".tar.gz") ||
      filename.endsWith(".tar.bz2") ||
      filename.endsWith(".rar") ||
      filename.endsWith(".7z");

    if (isItchDownload) {
      const basePath = cachedGamePaths[0] ?? pathJoin(osHomedir(), "Games");
      const itchDir = pathJoin(basePath, "itch");
      try {
        if (!existsSync(itchDir)) mkdirSync(itchDir, { recursive: true });
      } catch {}
      item.setSavePath(pathJoin(itchDir, filename));
    }
  });
}
