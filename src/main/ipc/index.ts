import { join } from "path";
import { BrowserWindow, ipcMain, app, dialog } from "electron";
import {
  getSettings,
  setSettings,
  setSetting,
} from "../services/settings.service";
import {
  launchGame,
  launchMovie,
  launchTrack,
} from "../services/launcher.service";
import { scanMusicFiles } from "../scanners/music.scanner";
import {
  searchCoverArt,
  downloadImage,
  embedCoverArt,
  pickCoverImage,
  loadThumbnail,
} from "../services/music-cover.service";
import { scanMovieFiles, scanTvShows } from "../scanners/video.scanner";
import { getDb } from "../db";
import { getProtonRating } from "../services/protondb.service";
import { performGameScan } from "../services/game-scan.service";
import { searchGame } from "../services/rawg.service";
import { searchMovie, searchShow } from "../services/tmdb.service";
import { listPlugins, reloadPlugins } from "../plugins/loader";
import { getConnectedDevices } from "../input/evdev";
import { getXdgVideosDir, getXdgMusicDir } from "../scanners/xdg";
import {
  Game,
  Movie,
  MusicTrack,
  TVShow,
  AppSettings,
} from "../../shared/types";

const scanLocks = {
  movies: false,
  music: false,
  tv: false,
};

export function registerIpcHandlers(window: BrowserWindow): void {
  ipcMain.handle("settings:get", async () => {
    return await getSettings();
  });

  ipcMain.handle("settings:set", async (_e, partial: Partial<AppSettings>) => {
    await setSettings(partial);
    if ("fullscreen" in partial) {
      window.setFullScreen(partial.fullscreen ?? false);
    }
  });

  ipcMain.handle("app:fullscreen", (_e, value: boolean) => {
    window.setFullScreen(value);
    setSetting("fullscreen", value);
  });

  ipcMain.handle("app:quit", () => {
    app.quit();
  });

  ipcMain.handle("app:restart", () => {
    if (app.isPackaged) {
      app.relaunch();
      app.quit();
    } else {
      // In dev, electron-vite manages the process; just reload the renderer
      window.reload();
    }
  });

  ipcMain.handle("games:scan", async (_e, extraPaths?: string[]) => {
    return performGameScan(window, extraPaths);
  });

  ipcMain.handle("games:list", async () => {
    const db = getDb();
    const result = await db.query<[Game[]]>(
      "SELECT * FROM game ORDER BY title ASC",
    );
    const games = (result[0] ?? []) as Game[];
    return games.map((g) => {
      const id =
        typeof g.id === "string" ? g.id : ((g.id as any)?.id ?? String(g.id));
      return { ...g, id };
    });
  });

  ipcMain.handle("games:launch", (_e, game: Game) => {
    launchGame(game);
  });

  ipcMain.handle("games:favorite", async (_e, id: string, value: boolean) => {
    const db = getDb();
    await db.query(`UPDATE game:⟨${id}⟩ SET isFavorite = $value`, { value });
  });

  ipcMain.handle("games:tag", async (_e, id: string, tags: string[]) => {
    const db = getDb();
    await db.query(`UPDATE game:⟨${id}⟩ SET tags = $tags`, { tags });
  });

  ipcMain.handle(
    "games:metadata",
    async (_e, title: string, steamAppId?: number) => {
      const settings = await getSettings();
      const [rawg, proton] = await Promise.all([
        searchGame(title, settings.rawgApiKey),
        steamAppId ? getProtonRating(steamAppId) : Promise.resolve("unknown"),
      ]);
      return { rawg, proton };
    },
  );

  ipcMain.handle("movies:scan", async (_e, extraPaths?: string[]) => {
    if (scanLocks.movies) return [];
    scanLocks.movies = true;
    window.webContents.send("scan:progress", {
      scanner: "movies",
      current: 0,
      total: 0,
      status: "scanning",
    });
    const movies = await scanMovieFiles(extraPaths, (current, total) => {
      window.webContents.send("scan:progress", {
        scanner: "movies",
        current,
        total,
        status: "scanning",
      });
    }).finally(() => {
      scanLocks.movies = false;
    });
    const db = getDb();
    for (const movie of movies) {
      // Defensive: strip any field not in the schema to prevent SCHEMAFULL rejects
      const {
        id,
        title,
        filePath,
        coverUrl,
        backdropUrl,
        description,
        genres,
        releaseYear,
        director,
        runtime,
        resolution,
        codec,
        tmdbId,
        isFavorite,
        tags,
        rating,
      } = movie as any;
      const clean = {
        id,
        title,
        filePath,
        coverUrl,
        backdropUrl,
        description,
        genres,
        releaseYear,
        director,
        runtime,
        resolution,
        codec,
        tmdbId,
        isFavorite,
        tags,
        rating,
      };
      const defined: any = {};
      for (const [k, v] of Object.entries(clean)) {
        if (v !== undefined) defined[k] = v;
      }
      if (defined.isFavorite === undefined) defined.isFavorite = false;
      if (defined.tags === undefined) defined.tags = [];
      // Preserve existing playback progress and lastPlayed
      const existing = await db.query(
        `SELECT watchProgress, lastPlayed FROM movie:⟨${defined.id}⟩`,
      );
      const existingRecord = existing[0]?.[0];
      if (
        existingRecord?.watchProgress !== undefined &&
        existingRecord?.watchProgress !== null
      ) {
        defined.watchProgress = existingRecord.watchProgress;
      }
      if (
        existingRecord?.lastPlayed !== undefined &&
        existingRecord?.lastPlayed !== null
      ) {
        defined.lastPlayed = existingRecord.lastPlayed;
      }
      await db.query(`UPSERT movie:⟨${defined.id}⟩ CONTENT $movie`, {
        movie: defined,
      });
    }
    window.webContents.send("scan:progress", {
      scanner: "movies",
      current: movies.length,
      total: movies.length,
      status: "done",
    });
    return movies;
  });

  ipcMain.handle("movies:list", async () => {
    const db = getDb();
    const result = await db.query<[Movie[]]>(
      "SELECT * FROM movie ORDER BY title ASC",
    );
    const movies = (result[0] ?? []) as Movie[];
    console.log(
      "[movies:list] returning",
      movies.length,
      "movies, coverUrl samples:",
      movies.slice(0, 3).map((m) => ({ title: m.title, coverUrl: m.coverUrl })),
    );
    const thumbRoot = join(app.getPath("userData"), "thumbnails").replace(
      /\\/g,
      "/",
    );
    return movies.map((m) => {
      const id =
        typeof m.id === "string" ? m.id : ((m.id as any)?.id ?? String(m.id));
      const normalized = { ...m, id };
      if (!normalized.coverUrl?.startsWith("file://")) return normalized;
      const pathPart = normalized.coverUrl.slice("file://".length);
      if (!pathPart.startsWith(thumbRoot)) return normalized;
      const rel = pathPart.slice(thumbRoot.length + 1).replace(/\\/g, "/");
      return { ...normalized, coverUrl: `htpc-thumb://thumbnails/${rel}` };
    });
  });

  ipcMain.handle("movies:launch", (_e, movie: Movie) => {
    launchMovie(movie);
  });

  ipcMain.handle("movies:favorite", async (_e, id: string, value: boolean) => {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${id}⟩ SET isFavorite = $value`, { value });
  });

  ipcMain.handle("movies:tag", async (_e, id: string, tags: string[]) => {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${id}⟩ SET tags = $tags`, { tags });
  });

  ipcMain.handle(
    "movies:progress:set",
    async (_e, id: string, progress: number | null) => {
      const db = getDb();
      const now = Date.now();
      if (progress === null || progress === undefined) {
        await db.query(
          `UPDATE movie:⟨${id}⟩ SET watchProgress = NONE, lastPlayed = $now`,
          { now },
        );
      } else {
        await db.query(
          `UPDATE movie:⟨${id}⟩ SET watchProgress = $progress, lastPlayed = $now`,
          { progress, now },
        );
      }
    },
  );

  ipcMain.handle("movies:metadata", async (_e, title: string) => {
    const settings = await getSettings();
    return await searchMovie(title, settings.tmdbApiKey);
  });

  ipcMain.handle("music:scan", async (_e, extraPaths?: string[]) => {
    if (scanLocks.music) return [];
    scanLocks.music = true;
    window.webContents.send("scan:progress", {
      scanner: "music",
      current: 0,
      total: 0,
      status: "scanning",
    });
    const tracks = await scanMusicFiles(extraPaths).finally(() => {
      scanLocks.music = false;
    });
    const db = getDb();
    console.log("[music:scan] inserting", tracks.length, "tracks into DB...");
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (i % 100 === 0)
        console.log(`[music:scan] db insert ${i + 1}/${tracks.length}`);
      const clean = {
        ...track,
        isFavorite: track.isFavorite ?? false,
        tags: track.tags ?? [],
      };
      await db.query(`UPSERT music_track:⟨${clean.id}⟩ CONTENT $track`, {
        track: clean,
      });
    }
    console.log("[music:scan] DB insert done");
    window.webContents.send("scan:progress", {
      scanner: "music",
      current: tracks.length,
      total: tracks.length,
      status: "done",
    });
    return tracks;
  });

  ipcMain.handle("music:list", async () => {
    const db = getDb();
    const result = await db.query<[MusicTrack[]]>(
      "SELECT * FROM music_track ORDER BY artist, album, trackNumber ASC",
    );
    const tracks = (result[0] ?? []) as MusicTrack[];
    const coverRoot = join(app.getPath("userData"), "covers", "music").replace(
      /\\/g,
      "/",
    );
    return tracks.map((t) => {
      const id =
        typeof t.id === "string" ? t.id : ((t.id as any)?.id ?? String(t.id));
      const normalized = { ...t, id };
      if (!normalized.albumArtUrl?.startsWith("file://")) return normalized;
      const pathPart = normalized.albumArtUrl.slice("file://".length);
      if (!pathPart.startsWith(coverRoot)) return normalized;
      const rel = pathPart.slice(coverRoot.length + 1).replace(/\\/g, "/");
      return { ...normalized, albumArtUrl: `htpc-thumb://covers/music/${rel}` };
    });
  });

  ipcMain.handle("music:launch", (_e, track: MusicTrack) => {
    launchTrack(track);
  });

  ipcMain.handle("music:favorite", async (_e, id: string, value: boolean) => {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${id}⟩ SET isFavorite = $value`, {
      value,
    });
  });

  ipcMain.handle("music:tag", async (_e, id: string, tags: string[]) => {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${id}⟩ SET tags = $tags`, { tags });
  });

  ipcMain.handle("music:searchCoverArt", async (_e, track: MusicTrack) => {
    const imageUrl = await searchCoverArt(
      track.artist ?? "",
      track.album ?? "",
    );
    if (!imageUrl) return null;
    const imageBuffer = await downloadImage(imageUrl);
    if (!imageBuffer) return null;
    const result = await embedCoverArt(track, imageBuffer);
    return result ?? null;
  });

  ipcMain.handle("music:pickCoverImage", async (_e, track: MusicTrack) => {
    const result = await pickCoverImage(track);
    return result ?? null;
  });

  ipcMain.handle("music:loadThumbnail", async (_e, track: MusicTrack) => {
    const url = await loadThumbnail(track);
    return url ?? null;
  });

  ipcMain.handle("tv:scan", async (_e, extraPaths?: string[]) => {
    if (scanLocks.tv) return [];
    scanLocks.tv = true;
    window.webContents.send("scan:progress", {
      scanner: "tv",
      current: 0,
      total: 0,
      status: "scanning",
    });
    const shows = await scanTvShows(extraPaths).finally(() => {
      scanLocks.tv = false;
    });
    const db = getDb();
    for (const show of shows) {
      const clean = {
        ...show,
        isFavorite: show.isFavorite ?? false,
        tags: show.tags ?? [],
      };
      await db.query(`UPSERT tv_show:⟨${clean.id}⟩ CONTENT $show`, {
        show: clean,
      });
    }
    window.webContents.send("scan:progress", {
      scanner: "tv",
      current: shows.length,
      total: shows.length,
      status: "done",
    });
    return shows;
  });

  ipcMain.handle("tv:list", async () => {
    const db = getDb();
    const result = await db.query<[TVShow[]]>(
      "SELECT * FROM tv_show ORDER BY title ASC",
    );
    const shows = (result[0] ?? []) as TVShow[];
    return shows.map((s) => {
      const id =
        typeof s.id === "string" ? s.id : ((s.id as any)?.id ?? String(s.id));
      return { ...s, id };
    });
  });

  ipcMain.handle("tv:launch", (_e, filePath: string) => {
    launchMovie({ id: "", title: "", filePath } as Movie);
  });

  ipcMain.handle("tv:favorite", async (_e, id: string, value: boolean) => {
    const db = getDb();
    await db.query(`UPDATE tv_show:⟨${id}⟩ SET isFavorite = $value`, { value });
  });

  ipcMain.handle("tv:tag", async (_e, id: string, tags: string[]) => {
    const db = getDb();
    await db.query(`UPDATE tv_show:⟨${id}⟩ SET tags = $tags`, { tags });
  });

  ipcMain.handle("tv:metadata", async (_e, title: string) => {
    const settings = await getSettings();
    return await searchShow(title, settings.tmdbApiKey);
  });

  ipcMain.handle("input:devices", () => {
    return getConnectedDevices();
  });

  ipcMain.handle("input:mappings:get", async (_e, deviceId: string) => {
    const db = getDb();
    const result = await db.query(
      "SELECT * FROM controller_mapping WHERE deviceId = $deviceId",
      { deviceId },
    );
    return result[0] ?? [];
  });

  ipcMain.handle(
    "input:mappings:set",
    async (_e, deviceId: string, inputCode: string, action: string) => {
      const db = getDb();
      await db.query(
        `INSERT INTO controller_mapping (deviceId, inputCode, action) VALUES ($deviceId, $inputCode, $action)
       ON DUPLICATE KEY UPDATE action = $action`,
        { deviceId, inputCode, action },
      );
    },
  );

  ipcMain.handle("input:mappings:reset", async (_e, deviceId: string) => {
    const db = getDb();
    await db.query("DELETE controller_mapping WHERE deviceId = $deviceId", {
      deviceId,
    });
  });

  ipcMain.handle("plugins:list", async () => {
    return await listPlugins();
  });

  ipcMain.handle("plugins:reload", async () => {
    return await reloadPlugins();
  });

  ipcMain.handle("app:xdg-defaults", () => ({
    videosDir: getXdgVideosDir(),
    musicDir: getXdgMusicDir(),
  }));

  ipcMain.handle("db:clear", async () => {
    const db = getDb();
    await db.query(`
      DELETE FROM game;
      DELETE FROM movie;
      DELETE FROM music_track;
      DELETE FROM tv_show;
      DELETE FROM controller_mapping;
    `);
    return true;
  });

  ipcMain.handle("dialog:open-directory", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return canceled ? null : filePaths[0];
  });
}
