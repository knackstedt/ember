import { app, ipcMain } from "electron";
import { existsSync, mkdirSync, statSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import type { Movie } from "../../../shared/types";
import { getDb } from "../../db";
import { MovieRepo, escapeId } from "../../db/repository";
import { generateMovieThumbnail, resolveThumbnailPath, scanMovieFiles } from "../../scanners/video.scanner";
import { getXdgVideosDir } from "../../scanners/xdg";
import { launchMovie } from "../../services/launcher.service";
import { scanAllRemoteSources } from "../../services/remote-scan.service";
import { getSettings } from "../../services/settings.service";
import { searchMovie } from "../../services/tmdb.service";
import { uninstallMovie } from "../../services/uninstall.service";
import { createLogger } from "../../util/logger";
import type { IpcContext } from "../types";

const log = createLogger("info");

export function registerMoviesHandlers(ctx: IpcContext): void {
  const { window, sendToWindow, sendRemoteProgress, sendScanItem, scanLocks } = ctx;

  ipcMain.handle("movies:scan", async (_e, extraPaths?: string[]) => {
    if (scanLocks.movies) return;
    scanLocks.movies = true;
    sendToWindow("scan:progress", { scanner: "movies", current: 0, total: 0, status: "scanning" });
    const movies = await scanMovieFiles(extraPaths, (current, total) => {
      sendToWindow("scan:progress", { scanner: "movies", current, total, status: "scanning" });
    }).finally(() => { scanLocks.movies = false; });

    const db = getDb();
    for (const movie of movies) {
      const {
        id, title, filePath, coverUrl, backdropUrl, description, genres,
        releaseYear, director, runtime, resolution, codec, tmdbId,
        isFavorite, tags, rating, hidden, sourceLocation, remoteSourceId,
        pendingMetadata, hdr, container, audioCodec, audioChannels,
        audioChannelLayout, audioTracks, subtitleTracks, chapters,
      } = movie as any;
      const clean = {
        id, title, filePath, coverUrl, backdropUrl, description, genres,
        releaseYear, director, runtime, resolution, codec, tmdbId,
        isFavorite, tags, rating, hidden, sourceLocation, remoteSourceId,
        pendingMetadata, hdr, container, audioCodec, audioChannels,
        audioChannelLayout, audioTracks, subtitleTracks, chapters,
      };
      const defined: any = {};
      for (const [k, v] of Object.entries(clean)) {
        if (v !== undefined) defined[k] = v;
      }
      if (defined.isFavorite === undefined) defined.isFavorite = false;
      if (defined.tags === undefined) defined.tags = [];
      if (defined.hidden === undefined) defined.hidden = false;
      if (defined.sourceLocation === undefined) defined.sourceLocation = "local";
      const existing = await db.query<[{ watchProgress?: number; subtitleTrackId?: number | null; audioTrackId?: number | null; playbackSpeed?: number; lastPlayed?: number }[]]>(
        `SELECT watchProgress, subtitleTrackId, audioTrackId, playbackSpeed, lastPlayed FROM movie:⟨${defined.id}⟩`,
      );
      const existingRecord = existing[0]?.[0];
      if (existingRecord?.watchProgress !== undefined && existingRecord?.watchProgress !== null) {
        defined.watchProgress = existingRecord.watchProgress;
      }
      if (existingRecord?.subtitleTrackId !== undefined) defined.subtitleTrackId = existingRecord.subtitleTrackId;
      if (existingRecord?.audioTrackId !== undefined) defined.audioTrackId = existingRecord.audioTrackId;
      if (existingRecord?.playbackSpeed !== undefined && existingRecord.playbackSpeed !== null) {
        defined.playbackSpeed = existingRecord.playbackSpeed;
      }
      if (existingRecord?.lastPlayed !== undefined && existingRecord?.lastPlayed !== null) {
        defined.lastPlayed = existingRecord.lastPlayed;
      }
      defined.missing = false;
      await db.query(`UPSERT movie:⟨${defined.id}⟩ CONTENT $movie`, { movie: defined });
    }

    const allScannedPaths = [getXdgVideosDir(), ...(extraPaths ?? [])].map((p) => resolve(p)).filter(existsSync);
    await markMissingMovies(allScannedPaths, movies);

    sendToWindow("scan:progress", { scanner: "movies", current: movies.length, total: movies.length, status: "done" });
    void scanAllRemoteSources("movie", sendRemoteProgress, sendScanItem);
    sendToWindow("scan:background:complete", { type: "movies" });
  });

  ipcMain.handle("movies:list", async () => {
    const movies = await MovieRepo.list();
    log.debug("movies:list", `returning ${movies.length} movies, coverUrl samples: ${JSON.stringify(movies.slice(0, 3).map((m) => ({ title: m.title, coverUrl: m.coverUrl })))}`);
    const thumbRoot = join(app.getPath("userData"), "thumbnails").replace(/\\/g, "/");
    return movies.map((m) => {
      const normalized = { ...m };
      if (!normalized.coverUrl?.startsWith("file://")) return normalized;
      const pathPart = normalized.coverUrl.slice("file://".length);
      if (!pathPart.startsWith(thumbRoot)) return normalized;
      const rel = pathPart.slice(thumbRoot.length + 1).replace(/\\/g, "/");
      return { ...normalized, coverUrl: `ember://thumbnails/${rel}` };
    });
  });

  ipcMain.handle("movies:launch", (_e, movie: Movie) => launchMovie(movie));
  ipcMain.handle("movies:favorite", async (_e, id: string, value: boolean) => MovieRepo.setFavorite(id, value));
  ipcMain.handle("movies:tag", async (_e, id: string, tags: string[]) => MovieRepo.setTags(id, tags));
  ipcMain.handle("movies:hide", async (_e, id: string, value: boolean) => MovieRepo.setHidden(id, value));
  ipcMain.handle("movies:delete", async (_e, id: string) => MovieRepo.delete(id));
  ipcMain.handle("movies:uninstall", async (_e, movie: Movie) => uninstallMovie(movie));

  ipcMain.handle("movies:progress:set", async (_e, id: string, progress: number | null) => {
    const idStr = typeof id === "string" ? id : String(id);
    const now = Date.now();
    await MovieRepo.setProgress(idStr, progress ?? null);
    const db = getDb();
    await db.query(`UPDATE movie:⟨${idStr}⟩ SET lastPlayed = $now`, { now });
  });

  ipcMain.on("movies:progress:set:sync", (event, id: string, progress: number | null) => {
    const start = performance.now();
    const idStr = typeof id === "string" ? id : String(id);
    const db = getDb();
    if (progress === null) {
      db.query(`UPDATE movie:⟨${escapeId(idStr)}⟩ SET watchProgress = none`).catch(() => {});
    } else {
      db.query(`UPDATE movie:⟨${escapeId(idStr)}⟩ SET watchProgress = $progress`, { progress }).catch(() => {});
    }
    db.query(`UPDATE movie:⟨${escapeId(idStr)}⟩ SET lastPlayed = $now`, { now: Date.now() }).catch(() => {});
    event.returnValue = true;
    const elapsed = performance.now() - start;
    if (elapsed > 20) log.warn("ipc", `movies:progress:set:sync handler took ${elapsed.toFixed(1)}ms`);
  });

  ipcMain.handle("movies:subtitleTrack:set", async (_e, id: string, trackId: number | null) => MovieRepo.setSubtitleTrack(id, trackId));
  ipcMain.handle("movies:audioTrack:set", async (_e, id: string, trackId: number | null) => MovieRepo.setAudioTrack(id, trackId));
  ipcMain.handle("movies:playbackSpeed:set", async (_e, id: string, speed: number) => MovieRepo.setPlaybackSpeed(id, speed));

  ipcMain.handle("movies:metadata", async (_e, title: string) => {
    const settings = await getSettings();
    return await searchMovie(title, settings.tmdbApiKey);
  });

  ipcMain.handle("movies:regenerateThumbnail", async (_e, movie: Movie) => {
    const dest = join(app.getPath("userData"), "thumbnails", "movies", `${movie.id}.jpg`);
    if (existsSync(dest)) { try { unlinkSync(dest); } catch {} }
    const coverUrl = await generateMovieThumbnail(movie.filePath, movie.id);
    if (coverUrl) await MovieRepo.setCoverUrl(movie.id, coverUrl);
    return coverUrl ?? null;
  });

  ipcMain.handle("movies:chapterThumbnail", async (_e, movieId: string, filePath: string, timeMs: number, chapterIndex: number) => {
    const { promisify } = await import("util");
    const { exec } = await import("child_process");
    const execA = promisify(exec);

    let resolvedPath = filePath;
    if (resolvedPath.startsWith("ember://remote/") || resolvedPath.startsWith("ember://media/")) {
      try { resolvedPath = await resolveThumbnailPath(filePath); } catch {}
    }

    const thumbDir = join(app.getPath("userData"), "thumbnails", "movies", "chapters", movieId);
    try { mkdirSync(thumbDir, { recursive: true }); } catch {}
    const dest = join(thumbDir, `${chapterIndex}.jpg`);

    if (existsSync(dest) && statSync(dest).size > 0) {
      return `ember://thumbnails/movies/chapters/${movieId}/${chapterIndex}.jpg`;
    }

    const seekSec = timeMs / 1000;
    if (seekSec < 0 || seekSec > 86400) {
      log.warn("ipc", `chapter thumbnail skip unreasonable seek time for ${movieId} ch${chapterIndex}: ${seekSec}s`);
      return null;
    }

    try {
      await execA(
        `ffmpeg -hide_banner -loglevel error -ss ${seekSec} -i "${resolvedPath.replace(/"/g, '\\"')}" -frames:v 1 -q:v 2 -vf "scale=320:-1" -pix_fmt yuvj420p -y "${dest}"`,
        { timeout: 15000 },
      );
      if (existsSync(dest) && statSync(dest).size > 0) {
        return `ember://thumbnails/movies/chapters/${movieId}/${chapterIndex}.jpg`;
      }
    } catch (err) {
      log.warn("ipc", `chapter thumbnail failed for ${movieId} ch${chapterIndex}: ${err}`);
    }
    return null;
  });

  async function markMissingMovies(scannedPaths: string[], foundMovies: { id: string; filePath?: string }[]): Promise<void> {
    const foundIds = new Set(foundMovies.map((m) => m.id));
    const allMovies = await MovieRepo.list();
    const resolvedPaths = scannedPaths.map((p) => resolve(p));
    for (const movie of allMovies) {
      if (movie.sourceLocation !== "local") continue;
      if (!movie.filePath) continue;
      const isFromScannedPath = resolvedPaths.some((p) => movie.filePath!.startsWith(p));
      if (!isFromScannedPath) continue;
      if (!foundIds.has(movie.id) && !movie.missing) {
        await MovieRepo.setMissing(movie.id, true);
        log.info("movies:scan", `marked missing: ${movie.title}`);
      } else if (foundIds.has(movie.id) && movie.missing) {
        await MovieRepo.setMissing(movie.id, false);
        log.info("movies:scan", `restored: ${movie.title}`);
      }
    }
  }
}
