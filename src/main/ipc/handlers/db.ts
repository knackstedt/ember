import { ipcMain, app, dialog, shell } from "electron";
import { readFileSync, rmSync, mkdirSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { getDb } from "../../db";
import { GameRepo, MovieRepo, MusicRepo } from "../../db/repository";
import { executeODataQuery } from "../../services/query.service";
import type { IpcContext } from "../types";
import { createLogger } from "../../util/logger";

const log = createLogger("info");

export function registerDbHandlers(ctx: IpcContext): void {
  const { window } = ctx;

  ipcMain.handle("db:wipe-thumbnails", async () => {
    const userData = app.getPath("userData");
    const cacheDirs = [
      join(userData, "covers", "flash", "screenshots"),
      join(userData, "covers", "flash", "generated"),
      join(userData, "covers", "libretro", "screenshots"),
      join(userData, "covers", "libretro", "generated"),
      join(userData, "covers", "music"),
      join(userData, "covers", "artists"),
      join(userData, "thumbnails", "movies"),
      join(userData, "thumbnails", "tv"),
    ];
    for (const dir of cacheDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        log.warn("db:wipe-thumbnails", `failed to clear cache dir: ${dir} ${err}`);
      }
    }
    return true;
  });

  ipcMain.handle("db:clear", async () => {
    const db = getDb();
    await db.query(`
      DELETE FROM game;
      DELETE FROM movie;
      DELETE FROM music_track;
      DELETE FROM tv_show;
      DELETE FROM controller_mapping;
    `);

    const userData = app.getPath("userData");
    const cacheDirs = [
      join(userData, "covers", "flash", "screenshots"),
      join(userData, "covers", "flash", "generated"),
      join(userData, "covers", "libretro", "screenshots"),
      join(userData, "covers", "libretro", "generated"),
      join(userData, "covers", "music"),
      join(userData, "covers", "artists"),
      join(userData, "thumbnails", "movies"),
      join(userData, "thumbnails", "tv"),
    ];
    for (const dir of cacheDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        log.warn("db:clear", `failed to clear cache dir: ${dir} ${err}`);
      }
    }

    return true;
  });

  ipcMain.handle("db:clear-all", async () => {
    const db = getDb();
    await db.query(`
      DELETE FROM game;
      DELETE FROM movie;
      DELETE FROM music_track;
      DELETE FROM tv_show;
      DELETE FROM controller_mapping;
      DELETE FROM broken_flash_game;
      DELETE FROM game_config;
      DELETE FROM collection;
      DELETE FROM collection_item;
      DELETE FROM streaming_service;
      DELETE FROM setting;
    `);

    const userData = app.getPath("userData");
    const cacheDirs = [
      join(userData, "covers", "flash", "screenshots"),
      join(userData, "covers", "flash", "generated"),
      join(userData, "covers", "libretro", "screenshots"),
      join(userData, "covers", "libretro", "generated"),
      join(userData, "covers", "music"),
      join(userData, "covers", "artists"),
      join(userData, "thumbnails", "movies"),
      join(userData, "thumbnails", "tv"),
    ];
    for (const dir of cacheDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        log.warn("db:clear-all", `failed to clear cache dir: ${dir} ${err}`);
      }
    }

    const windowStatePath = join(userData, "window-state.json");
    try {
      rmSync(windowStatePath, { force: true });
    } catch (err) {
      log.warn("db:clear-all", `failed to remove window-state.json: ${err}`);
    }

    return true;
  });

  ipcMain.handle("db:delete-missing", async () => {
    const [games, movies, music] = await Promise.all([
      GameRepo.deleteMissing(),
      MovieRepo.deleteMissing(),
      MusicRepo.deleteMissing(),
    ]);
    log.info("db:delete-missing", `deleted ${games} games, ${movies} movies, ${music} tracks`);
    return { games, movies, music };
  });

  ipcMain.handle("db:list-corrupt", async () => {
    const [games, movies, music] = await Promise.all([
      GameRepo.listCorrupt(),
      MovieRepo.listCorrupt(),
      MusicRepo.listCorrupt(),
    ]);
    log.info("db:list-corrupt", `${games.length} games, ${movies.length} movies, ${music.length} tracks`);
    return { games, movies, music };
  });

  ipcMain.handle("db:delete-corrupt", async () => {
    const [games, movies, music] = await Promise.all([
      GameRepo.deleteCorrupt(),
      MovieRepo.deleteCorrupt(),
      MusicRepo.deleteCorrupt(),
    ]);
    log.info("db:delete-corrupt", `deleted ${games} games, ${movies} movies, ${music} tracks`);
    return { games, movies, music };
  });

  ipcMain.handle("dialog:open-directory", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle("dialog:open-file", async (_e, opts?: { filters?: Electron.FileFilter[]; title?: string }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: opts?.title ?? "Select File",
      properties: ["openFile"],
      filters: opts?.filters ?? [{ name: "All Files", extensions: ["*"] }],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle("shell:openPath", async (_e, path: string) => shell.openPath(path));
  ipcMain.handle("shell:showItemInFolder", async (_e, path: string) => { shell.showItemInFolder(path); });

  ipcMain.handle("files:read", async (_e, filePath: string) => {
    try {
      return readFileSync(filePath);
    } catch (err) {
      log.warn("files:read", `failed: ${filePath} ${err}`);
      return null;
    }
  });

  ipcMain.handle("flash-filters:list", async () => {
    const dir = join(app.getPath("userData"), "flash-filters");
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir);
    const glslFiles = entries.filter((f) => f.endsWith(".glsl"));
    return glslFiles.map((name) => {
      const content = readFileSync(join(dir, name), "utf-8");
      return { id: name.replace(".glsl", ""), name: name.replace(".glsl", ""), content };
    });
  });

  ipcMain.handle("flash-filters:open-dir", async () => {
    const dir = join(app.getPath("userData"), "flash-filters");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
  });

  ipcMain.handle("db:query", async (_e, table: string, odataQuery: string) => {
    return executeODataQuery(table, odataQuery);
  });
}
