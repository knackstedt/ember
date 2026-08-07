import { ipcMain, app } from "electron";
import { join } from "path";
import { existsSync, unlinkSync } from "fs";
import { TVRepo } from "../../db/repository";
import { scanTvShows, generateShowThumbnail } from "../../scanners/video.scanner";
import { launchMovie } from "../../services/launcher.service";
import { searchShow } from "../../services/tmdb.service";
import { getSettings } from "../../services/settings.service";
import type { TVShow, Movie } from "../../../shared/types";
import type { IpcContext } from "../types";

export function registerTvHandlers(ctx: IpcContext): void {
  const { window, sendToWindow, scanLocks } = ctx;

  ipcMain.handle("tv:scan", async (_e, extraPaths?: string[]) => {
    if (scanLocks.tv) return;
    scanLocks.tv = true;
    sendToWindow("scan:progress", { scanner: "tv", current: 0, total: 0, status: "scanning" });
    const shows = await scanTvShows(extraPaths).finally(() => { scanLocks.tv = false; });
    for (const show of shows) {
      await TVRepo.upsert(show);
    }
    sendToWindow("scan:progress", { scanner: "tv", current: shows.length, total: shows.length, status: "done" });
  });

  ipcMain.handle("tv:list", async () => TVRepo.list());

  ipcMain.handle("tv:launch", (_e, filePath: string) => {
    launchMovie({ id: "", title: "", filePath } as Movie);
  });

  ipcMain.handle("tv:favorite", async (_e, id: string, value: boolean) => TVRepo.setFavorite(id, value));
  ipcMain.handle("tv:tag", async (_e, id: string, tags: string[]) => TVRepo.setTags(id, tags));
  ipcMain.handle("tv:hide", async (_e, id: string, value: boolean) => TVRepo.setHidden(id, value));

  ipcMain.handle("tv:metadata", async (_e, title: string) => {
    const settings = await getSettings();
    return await searchShow(title, settings.tmdbApiKey);
  });

  ipcMain.handle("tv:regenerateThumbnail", async (_e, show: TVShow) => {
    const dest = join(app.getPath("userData"), "thumbnails", "tv", `${show.id}.jpg`);
    if (existsSync(dest)) { try { unlinkSync(dest); } catch {} }
    const episodes =
      show.seasons?.flatMap((s) =>
        s.episodes.map((ep) => ({
          season: s.seasonNumber,
          ep: ep.episodeNumber,
          path: ep.filePath,
        })),
      ) ?? [];
    const coverUrl = await generateShowThumbnail(show.dirPath, episodes, show.id);
    if (coverUrl) {
      await TVRepo.setCoverUrl(show.id, coverUrl);
    }
    return coverUrl ?? null;
  });
}
