import { ipcMain } from "electron";
import { dirname } from "path";
import {
  getItchStatus,
  listInstalledItchGames,
  launchItchGame,
} from "../../services/itch.service";
import type { Game } from "../../../shared/types";
import type { IpcContext } from "../types";

export function registerStoreHandlers(_ctx: IpcContext): void {
  ipcMain.handle("store:itch:status", async () => getItchStatus());

  ipcMain.handle("store:itch:library", async () => {
    const games = listInstalledItchGames();
    return games.map((g) => ({
      id: g.id,
      title: g.title,
      coverUrl: g.coverUrl,
      developer: g.developer,
      installed: true,
      installPath: g.execPath ? dirname(g.execPath) : undefined,
      execPath: g.execPath,
    }));
  });

  ipcMain.handle("store:itch:launch", async (_e, game: Game) => launchItchGame(game));

  ipcMain.handle("store:itch:login", async () => {
    return { success: false, error: "itch.io login is not implemented. Please log in via the official itch app." };
  });
  ipcMain.handle("store:itch:logout", async () => {
    return { success: false, error: "itch.io logout is not implemented." };
  });
  ipcMain.handle("store:itch:install", async () => {
    return { success: false, error: "itch.io install is not implemented." };
  });
  ipcMain.handle("store:itch:uninstall", async () => {
    return { success: false, error: "itch.io uninstall is not implemented." };
  });
  ipcMain.handle("store:itch:update", async () => {
    return { success: false, error: "itch.io update is not implemented." };
  });
  ipcMain.handle("store:itch:updates", async () => []);
  ipcMain.handle("store:itch:download", async () => {
    return { success: false, error: "itch.io download is not implemented." };
  });

  ipcMain.handle("store:providers:list", async () => {
    return [
      { id: "itch", name: "itch.io", url: "https://itch.io", icon: "itch-io" },
    ];
  });
}
