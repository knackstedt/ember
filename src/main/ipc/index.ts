import { join, dirname } from "path";
import { readFileSync, rmSync, mkdirSync, readdirSync, existsSync } from "fs";
import { BrowserWindow, ipcMain, app, dialog, shell } from "electron";
import {
  getSettings,
  setSettings,
  setSetting,
} from "../services/settings.service";
import {
  launchGame,
  launchMovie,
  launchTrack,
  startPlayTimeTracking,
  stopPlayTimeTracking,
} from "../services/launcher.service";
import { scanMusicFiles } from "../scanners/music.scanner";
import {
  searchCoverArt,
  downloadImage,
  embedCoverArt,
  pickCoverImage,
  loadThumbnail,
  fetchArtistThumbnail,
} from "../services/music-cover.service";
import {
  scanMovieFiles,
  scanTvShows,
  generateMovieThumbnail,
  generateShowThumbnail,
} from "../scanners/video.scanner";
import { getDb } from "../db";
import {
  GameRepo,
  MovieRepo,
  MusicRepo,
  TVRepo,
  MappingRepo,
  BrokenFlashRepo,
  CollectionRepo,
} from "../db/repository";
import { getProtonRating } from "../services/protondb.service";
import { performGameScan } from "../services/game-scan.service";
import { loadFlashThumbnail, clearInFlight } from "../services/flash-thumbnail.service";
import { searchGame } from "../services/rawg.service";
import { searchMovie, searchShow } from "../services/tmdb.service";
import {
  searchGameMetadata,
  fetchGameMetadata,
  enrichGameMetadata,
  quickMetadataLookup,
  getAvailableProviders,
  getProvidersByType,
  GameMetadata,
} from "../services/metadata";
import { listPlugins, reloadPlugins } from "../plugins/loader";
import { getConnectedDevices } from "../input/evdev";
import { getXdgVideosDir, getXdgMusicDir } from "../scanners/xdg";
import { getDefaultScanSources, getDefaultScanSourcesAsync } from "../scanners/defaults";
import { isOllamaAvailable, naturalLanguageToFilter, aiGroupItems } from "../services/local-ai.service";
import { AiGroup } from "../../shared/types";
import {
  getStreamingServices,
  getAllStreamingServices,
  addCustomService,
  updateService,
  deleteService,
  setServiceEnabled,
  detectDesktopApp,
} from "../services/streaming.service";
import {
  Game,
  Movie,
  MusicTrack,
  TVShow,
  AppSettings,
  GameEmulatorConfig,
  StreamingService,
  WineRunner,
} from "../../shared/types";
import { createLogger } from "../util/logger";
import {
  listAvailablePackages,
  searchPackages,
  installPackage,
  uninstallPackage,
  checkUpdates,
  setAptPassword,
  detectInstalledCores,
  detectWineRunner,
} from "../services/package-manager.service";
import {
  enrichTrack,
  enrichTracks,
} from "../services/music-enrichment.service";

const log = createLogger("info");

const scanLocks = {
  movies: false,
  music: false,
  tv: false,
};

const regenerateLocks = new Set<string>();

export function registerIpcHandlers(window: BrowserWindow): void {
  ipcMain.handle("devtools:is-open", () => {
    return window.webContents.isDevToolsOpened();
  });

  window.webContents.on("devtools-opened", () => {
    window.webContents.send("devtools:changed", true);
  });
  window.webContents.on("devtools-closed", () => {
    window.webContents.send("devtools:changed", false);
  });

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
    return GameRepo.list();
  });

  ipcMain.handle("games:launch", (_e, game: Game) => {
    return launchGame(game);
  });

  ipcMain.handle("games:favorite", async (_e, id: string, value: boolean) => {
    await GameRepo.setFavorite(id, value);
  });

  ipcMain.handle("games:tag", async (_e, id: string, tags: string[]) => {
    await GameRepo.setTags(id, tags);
  });

  ipcMain.handle("games:hide", async (_e, id: string, value: boolean) => {
    await GameRepo.setHidden(id, value);
  });

  ipcMain.handle("games:emulatorConfig:get", async (_e, id: string) => {
    return GameRepo.getEmulatorConfig(id);
  });

  ipcMain.handle("games:emulatorConfig:set", async (_e, id: string, config: GameEmulatorConfig) => {
    await GameRepo.setEmulatorConfig(id, config);
  });

  ipcMain.handle("games:wineConfig:set", async (_e, id: string, config: { wineRunner?: WineRunner; wineCustomCommand?: string | null; umuCustomCommand?: string | null }) => {
    const db = getDb();
    const updates: string[] = [];
    if (config.wineRunner !== undefined) updates.push(`wineRunner = ${JSON.stringify(config.wineRunner)}`);
    if (config.wineCustomCommand !== undefined) updates.push(`wineCustomCommand = ${config.wineCustomCommand === null ? "NONE" : JSON.stringify(config.wineCustomCommand)}`);
    if (config.umuCustomCommand !== undefined) updates.push(`umuCustomCommand = ${config.umuCustomCommand === null ? "NONE" : JSON.stringify(config.umuCustomCommand)}`);
    if (updates.length > 0) {
      await db.query(`UPDATE game:⟨${id}⟩ SET ${updates.join(", ")}`);
    }
  });

  ipcMain.handle("games:playTime:start", async (_e, id: string) => {
    startPlayTimeTracking(id);
  });

  ipcMain.handle("games:playTime:stop", async (_e, id: string) => {
    stopPlayTimeTracking(id);
  });

  ipcMain.handle("games:loadThumbnail", async (_e, game: Game) => {
    if (game.platform !== "flash" || !game.romPath) return null;
    const url = await loadFlashThumbnail(game);
    return url ?? null;
  });

  // Enhanced metadata handlers using unified metadata service
  ipcMain.handle(
    "games:metadata",
    async (_e, title: string, steamAppId?: number) => {
      // Legacy handler - kept for backwards compatibility
      const settings = await getSettings();
      const [rawg, proton] = await Promise.all([
        searchGame(title, settings.rawgApiKey),
        steamAppId ? getProtonRating(steamAppId) : Promise.resolve("unknown"),
      ]);
      return { rawg, proton };
    },
  );

  // New comprehensive metadata search using unified service
  ipcMain.handle(
    "games:metadata:search",
    async (_e, title: string, platform?: string, steamAppId?: number) => {
      try {
        const metadata = await searchGameMetadata({ title, platform, steamAppId });
        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:search", String(err));
        return null;
      }
    },
  );

  // Fetch metadata by external IDs
  ipcMain.handle(
    "games:metadata:fetch",
    async (_e, options: {
      steamAppId?: number;
      igdbId?: number;
      rawgSlug?: string;
      mobyGamesId?: number;
      theGamesDbId?: number;
      launchBoxDbId?: string;
    }) => {
      try {
        const metadata = await fetchGameMetadata(options);
        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:fetch", String(err));
        return null;
      }
    },
  );

  // Enrich existing game metadata with all available sources
  ipcMain.handle(
    "games:metadata:enrich",
    async (_e, game: { title: string; platform?: string; steamAppId?: number }) => {
      try {
        const metadata = await enrichGameMetadata(game.title, game.platform, game.steamAppId);
        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:enrich", String(err));
        return null;
      }
    },
  );

  // Quick metadata lookup (uses only fast sources)
  ipcMain.handle(
    "games:metadata:quick",
    async (_e, title: string, platform?: string) => {
      try {
        const metadata = await quickMetadataLookup(title, platform);
        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:quick", String(err));
        return null;
      }
    },
  );

  // Get list of available metadata providers
  ipcMain.handle("games:metadata:providers", () => {
    return {
      all: getAvailableProviders(),
      primary: getProvidersByType("primary"),
      retro: getProvidersByType("retro"),
      artwork: getProvidersByType("artwork"),
      video: getProvidersByType("video"),
      supplementary: getProvidersByType("supplementary"),
    };
  });

  // Fetch lazy metadata (artwork, videos, low-rate-limit sources) when viewing game details
  ipcMain.handle(
    "games:metadata:lazy",
    async (_e, options: {
      gameId: string;
      title: string;
      platform?: string;
      steamAppId?: number;
      igdbId?: number;
      rawgSlug?: string;
      theGamesDbId?: number;
      launchBoxDbId?: string;
    }) => {
      try {
        // Fetch artwork and video sources (low rate limits)
        const metadata = await searchGameMetadata(
          {
            title: options.title,
            platform: options.platform,
            steamAppId: options.steamAppId,
          },
          ["artwork", "video"] // Only fetch low-rate-limit sources
        );

        return metadata;
      } catch (err) {
        log.error("ipc:games:metadata:lazy", String(err));
        return null;
      }
    },
  );

  // Fetch achievements for a game (lazy loading)
  ipcMain.handle(
    "games:metadata:achievements",
    async (_e, options: {
      gameId: string;
      consoleId?: number;
      steamAppId?: number;
      retroAchievementsGameId?: number;
    }) => {
      try {
        // Fetch from RetroAchievements if console ID provided
        if (options.consoleId && options.retroAchievementsGameId) {
          // This would call the RetroAchievements provider directly
          // For now, return empty
          return { achievements: [], count: 0 };
        }

        // Fetch from Steam API if Steam App ID provided
        if (options.steamAppId) {
          const settings = await getSettings();
          if (settings.steamApiKey) {
            const { SteamWebAPIProvider } = await import("../services/metadata/index.js");
            if (!SteamWebAPIProvider.fetch) {
              return { achievements: [], count: 0 };
            }
            const metadata = await SteamWebAPIProvider.fetch(
              { steamAppId: options.steamAppId },
              settings.steamApiKey
            );
            return {
              achievements: metadata?.achievements || [],
              count: metadata?.achievementCount || 0,
            };
          }
        }

        return { achievements: [], count: 0 };
      } catch (err) {
        log.error("ipc:games:metadata:achievements", String(err));
        return { achievements: [], count: 0 };
      }
    },
  );

  // Fetch artwork specifically (lazy loading for detail view)
  ipcMain.handle(
    "games:metadata:artwork",
    async (_e, options: {
      gameId: string;
      steamAppId?: number;
      theGamesDbId?: number;
      title?: string;
    }) => {
      try {
        const artworkSources: ("artwork")[] = ["artwork"];

        // Fetch from SteamGridDB and Fanart.tv
        const metadata = await fetchGameMetadata(
          {
            steamAppId: options.steamAppId,
            theGamesDbId: options.theGamesDbId,
          },
          artworkSources
        );

        return {
          coverUrl: metadata?.coverUrl,
          bannerUrl: metadata?.bannerUrl,
          iconUrl: metadata?.iconUrl,
          screenshots: metadata?.screenshots,
        };
      } catch (err) {
        log.error("ipc:games:metadata:artwork", String(err));
        return null;
      }
    },
  );

  // Fetch videos specifically (lazy loading for detail view)
  ipcMain.handle(
    "games:metadata:videos",
    async (_e, options: {
      gameId: string;
      title: string;
    }) => {
      try {
        const videoSources: ("video")[] = ["video"];

        // Fetch from YouTube
        const metadata = await searchGameMetadata(
          { title: options.title },
          videoSources
        );

        return metadata?.videos || [];
      } catch (err) {
        log.error("ipc:games:metadata:videos", String(err));
        return [];
      }
    },
  );

  // Fetch Proton rating specifically (lazy loading for detail view)
  ipcMain.handle(
    "games:metadata:proton",
    async (_e, steamAppId: number) => {
      try {
        if (!steamAppId) return "unknown";
        const rating = await getProtonRating(steamAppId);
        return rating;
      } catch (err) {
        log.error("ipc:games:metadata:proton", String(err));
        return "unknown";
      }
    },
  );

  ipcMain.handle("games:regenerateThumbnail", async (_e, game: Game) => {
    log.info("ipc:games:regenerateThumbnail", `called for ${game.id} ${game.platform}`);
    if (regenerateLocks.has(game.id)) {
      log.info("ipc:games:regenerateThumbnail", `already regenerating ${game.id}`);
      return null;
    }
    regenerateLocks.add(game.id);
    try {
      if (game.platform === "flash" && game.romPath) {
        const { join } = await import("path");
        const { existsSync, unlinkSync } = await import("fs");
        const coverRoot = join(app.getPath("userData"), "covers", "flash");
        const screenshotDir = join(coverRoot, "screenshots");
        const generatedDir = join(coverRoot, "generated");
        const id = game.id;
        for (const ext of [".png", ".jpg", ".webp"]) {
          const p = join(screenshotDir, `${id}${ext}`);
          if (existsSync(p)) {
            try {
              unlinkSync(p);
              log.info("ipc:games:regenerateThumbnail", `deleted ${p}`);
            } catch {}
          }
        }
        const svg = join(generatedDir, `${id}.svg`);
        if (existsSync(svg)) {
          try {
            unlinkSync(svg);
            log.info("ipc:games:regenerateThumbnail", `deleted ${svg}`);
          } catch {}
        }
        const brokenSvg = join(generatedDir, `${id}-broken.svg`);
        if (existsSync(brokenSvg)) {
          try {
            unlinkSync(brokenSvg);
            log.info("ipc:games:regenerateThumbnail", `deleted ${brokenSvg}`);
          } catch {}
        }
        try {
          await BrokenFlashRepo.delete(id);
          log.info("ipc:games:regenerateThumbnail", `cleared broken record for ${id}`);
        } catch {}
        try {
          await GameRepo.setCorrupt(id, false);
          log.info("ipc:games:regenerateThumbnail", `cleared corrupt for ${id}`);
        } catch {}
        clearInFlight(id);
        log.info("ipc:games:regenerateThumbnail", `cleared inFlight for ${id}`);
        const url = await loadFlashThumbnail(game);
        log.info("ipc:games:regenerateThumbnail", `loadFlashThumbnail returned ${url}`);
        return url ?? null;
      }
      const settings = await getSettings();
      const rawg = await searchGame(game.title, settings.rawgApiKey);
      if (rawg?.background_image) {
        const db = getDb();
        await db.query(`UPDATE game:⟨${game.id}⟩ SET coverUrl = $url`, {
          url: rawg.background_image,
        });
        return rawg.background_image;
      }
      return null;
    } finally {
      regenerateLocks.delete(game.id);
    }
  });

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
        hidden,
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
        hidden,
      };
      const defined: any = {};
      for (const [k, v] of Object.entries(clean)) {
        if (v !== undefined) defined[k] = v;
      }
      if (defined.isFavorite === undefined) defined.isFavorite = false;
      if (defined.tags === undefined) defined.tags = [];
      if (defined.hidden === undefined) defined.hidden = false;
      // Preserve existing playback progress and lastPlayed
      const existing = await db.query<[{ watchProgress?: number; lastPlayed?: number }[]]>(
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
    const movies = await MovieRepo.list();
    log.info(
      "movies:list",
      `returning ${movies.length} movies, coverUrl samples: ${JSON.stringify(
        movies.slice(0, 3).map((m) => ({ title: m.title, coverUrl: m.coverUrl })),
      )}`,
    );
    const thumbRoot = join(app.getPath("userData"), "thumbnails").replace(
      /\\/g,
      "/",
    );
    return movies.map((m) => {
      const normalized = { ...m };
      if (!normalized.coverUrl?.startsWith("file://")) return normalized;
      const pathPart = normalized.coverUrl.slice("file://".length);
      if (!pathPart.startsWith(thumbRoot)) return normalized;
      const rel = pathPart.slice(thumbRoot.length + 1).replace(/\\/g, "/");
      return { ...normalized, coverUrl: `ember://thumbnails/${rel}` };
    });
  });

  ipcMain.handle("movies:launch", (_e, movie: Movie) => {
    launchMovie(movie);
  });

  ipcMain.handle("movies:favorite", async (_e, id: string, value: boolean) => {
    await MovieRepo.setFavorite(id, value);
  });

  ipcMain.handle("movies:tag", async (_e, id: string, tags: string[]) => {
    await MovieRepo.setTags(id, tags);
  });

  ipcMain.handle("movies:hide", async (_e, id: string, value: boolean) => {
    await MovieRepo.setHidden(id, value);
  });

  ipcMain.handle(
    "movies:progress:set",
    async (_e, id: string, progress: number | null) => {
      const now = Date.now();
      await MovieRepo.setProgress(id, progress ?? null);
      // Also update lastPlayed via repo if needed; currently setProgress handles it
      // We keep lastPlayed update here for backward compat
      const db = getDb();
      await db.query(`UPDATE movie:⟨${id}⟩ SET lastPlayed = $now`, { now });
    },
  );

  ipcMain.handle("movies:metadata", async (_e, title: string) => {
    const settings = await getSettings();
    return await searchMovie(title, settings.tmdbApiKey);
  });

  ipcMain.handle("movies:regenerateThumbnail", async (_e, movie: Movie) => {
    const { join } = await import("path");
    const { existsSync, unlinkSync } = await import("fs");
    const dest = join(
      app.getPath("userData"),
      "thumbnails",
      "movies",
      `${movie.id}.jpg`,
    );
    if (existsSync(dest)) {
      try {
        unlinkSync(dest);
      } catch {}
    }
    const coverUrl = await generateMovieThumbnail(movie.filePath, movie.id);
    if (coverUrl) {
      await MovieRepo.setCoverUrl(movie.id, coverUrl);
    }
    return coverUrl ?? null;
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
    log.info("music:scan", `inserting ${tracks.length} tracks into DB...`);
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (i % 100 === 0)
        log.info("music:scan", `db insert ${i + 1}/${tracks.length}`);
      await MusicRepo.upsert(track);
    }
    log.info("music:scan", "DB insert done");
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
      return { ...normalized, albumArtUrl: `ember://covers/music/${rel}` };
    });
  });

  ipcMain.handle("music:launch", (_e, track: MusicTrack) => {
    launchTrack(track);
  });

  ipcMain.handle("music:favorite", async (_e, id: string, value: boolean) => {
    await MusicRepo.setFavorite(id, value);
  });

  ipcMain.handle("music:tag", async (_e, id: string, tags: string[]) => {
    await MusicRepo.setTags(id, tags);
  });

  ipcMain.handle("music:hide", async (_e, id: string, value: boolean) => {
    await MusicRepo.setHidden(id, value);
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

  ipcMain.handle("music:artistThumbnail", async (_e, artist: string) => {
    const url = await fetchArtistThumbnail(artist);
    return url ?? null;
  });

  ipcMain.handle("music:enrich", async (_e, track: MusicTrack) => {
    const settings = await getSettings();
    const result = await enrichTrack(track, {
      tadbApiKey: settings.theaudiodbApiKey,
    });
    if (Object.keys(result.updates).length > 0) {
      const db = getDb();
      const id =
        typeof track.id === "string"
          ? track.id
          : (track.id as any)?.id ?? String(track.id);
      const setClauses = Object.entries(result.updates)
        .map(([key]) => `${key} = $updates.${key}`)
        .join(", ");
      await db.query(
        `UPDATE music_track:⟨${id}⟩ SET ${setClauses}`,
        { updates: result.updates },
      );
    }
    return result;
  });

  ipcMain.handle("music:enrichBatch", async (_e, tracks: MusicTrack[]) => {
    const settings = await getSettings();
    const results = await enrichTracks(tracks, {
      tadbApiKey: settings.theaudiodbApiKey,
      onProgress: (current, total) => {
        window.webContents.send("scan:progress", {
          scanner: "music-enrich",
          current,
          total,
          status: current === total ? "done" : "scanning",
        });
      },
    });

    // Persist all enrichment updates to DB
    const db = getDb();
    for (const [trackId, result] of results) {
      if (Object.keys(result.updates).length > 0) {
        try {
          const setClauses = Object.entries(result.updates)
            .map(([key]) => `${key} = $updates.${key}`)
            .join(", ");
          await db.query(
            `UPDATE music_track:⟨${trackId}⟩ SET ${setClauses}`,
            { updates: result.updates },
          );
        } catch (err) {
          log.error("music:enrichBatch", `DB update failed for ${trackId}: ${err}`);
        }
      }
    }

    // Convert Map to serializable object
    const serialized: Record<string, { updates: Partial<MusicTrack>; coverArtUrl?: string; artistImageUrl?: string }> = {};
    for (const [id, result] of results) {
      serialized[id] = result;
    }
    return serialized;
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
    for (const show of shows) {
      await TVRepo.upsert(show);
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
    return TVRepo.list();
  });

  ipcMain.handle("tv:launch", (_e, filePath: string) => {
    launchMovie({ id: "", title: "", filePath } as Movie);
  });

  ipcMain.handle("tv:favorite", async (_e, id: string, value: boolean) => {
    await TVRepo.setFavorite(id, value);
  });

  ipcMain.handle("tv:tag", async (_e, id: string, tags: string[]) => {
    await TVRepo.setTags(id, tags);
  });

  ipcMain.handle("tv:hide", async (_e, id: string, value: boolean) => {
    await TVRepo.setHidden(id, value);
  });

  ipcMain.handle("tv:metadata", async (_e, title: string) => {
    const settings = await getSettings();
    return await searchShow(title, settings.tmdbApiKey);
  });

  ipcMain.handle("tv:regenerateThumbnail", async (_e, show: TVShow) => {
    const { join } = await import("path");
    const { existsSync, unlinkSync } = await import("fs");
    const dest = join(
      app.getPath("userData"),
      "thumbnails",
      "tv",
      `${show.id}.jpg`,
    );
    if (existsSync(dest)) {
      try {
        unlinkSync(dest);
      } catch {}
    }
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

  ipcMain.handle("input:devices", () => {
    return getConnectedDevices();
  });

  ipcMain.handle("input:mappings:get", async (_e, deviceId: string) => {
    return MappingRepo.get(deviceId);
  });

  ipcMain.handle(
    "input:mappings:set",
    async (_e, deviceId: string, inputCode: string, action: string) => {
      await MappingRepo.set(deviceId, inputCode, action);
    },
  );

  ipcMain.handle("input:mappings:reset", async (_e, deviceId: string) => {
    await MappingRepo.reset(deviceId);
  });

  ipcMain.handle("plugins:list", async () => {
    return await listPlugins();
  });

  ipcMain.handle("plugins:reload", async () => {
    return await reloadPlugins();
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

  ipcMain.handle("db:wipe-thumbnails", async () => {
    const userData = app.getPath("userData");
    const cacheDirs = [
      join(userData, "covers", "flash", "screenshots"),
      join(userData, "covers", "flash", "generated"),
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

  ipcMain.handle("dialog:open-directory", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle("shell:openPath", async (_e, path: string) => {
    return shell.openPath(path);
  });

  ipcMain.handle("shell:showItemInFolder", async (_e, path: string) => {
    shell.showItemInFolder(path);
  });

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

  /* ------------------------------------------------------------------ */
  /*  Collections                                                        */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("collections:list", async () => {
    return CollectionRepo.list();
  });

  ipcMain.handle("collections:get", async (_e, id: string) => {
    return CollectionRepo.get(id);
  });

  ipcMain.handle("collections:create", async (_e, collection: import("../../shared/types").Collection) => {
    await CollectionRepo.create(collection);
  });

  ipcMain.handle("collections:update", async (_e, collection: import("../../shared/types").Collection) => {
    await CollectionRepo.update(collection);
  });

  ipcMain.handle("collections:delete", async (_e, id: string) => {
    await CollectionRepo.delete(id);
  });

  ipcMain.handle("collections:items:list", async (_e, collectionId: string) => {
    return CollectionRepo.listItems(collectionId);
  });

  ipcMain.handle("collections:items:add", async (_e, item: import("../../shared/types").CollectionItem) => {
    await CollectionRepo.addItem(item);
  });

  ipcMain.handle("collections:items:remove", async (_e, collectionId: string, itemId: string) => {
    await CollectionRepo.removeItem(collectionId, itemId);
  });

  ipcMain.handle("collections:smart:evaluate", async (_e, itemType: string, filter: import("../../shared/types").SmartFilterGroup) => {
    return CollectionRepo.evaluateSmartFilter(itemType, filter);
  });

  /* ------------------------------------------------------------------ */
  /*  Streaming Services                                                 */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("streaming:list", async (_e, category?: string) => {
    if (category) return getStreamingServices(category);
    return getAllStreamingServices();
  });

  ipcMain.handle("streaming:add", async (_e, service: Omit<StreamingService, "isBuiltin" | "sortOrder">) => {
    return addCustomService(service);
  });

  ipcMain.handle("streaming:update", async (_e, service: StreamingService) => {
    return updateService(service);
  });

  ipcMain.handle("streaming:delete", async (_e, id: string) => {
    return deleteService(id);
  });

  ipcMain.handle("streaming:setEnabled", async (_e, id: string, enabled: boolean) => {
    return setServiceEnabled(id, enabled);
  });

  ipcMain.handle("streaming:detectDesktopApp", async (_e, command: string) => {
    return detectDesktopApp(command);
  });

  ipcMain.handle("streaming:launch", async (_e, service: StreamingService) => {
    const desktopAvailable = service.desktopApp
      ? detectDesktopApp(service.desktopApp)
      : false;

    if (desktopAvailable && service.desktopApp) {
      const { spawn } = await import("child_process");
      const args = service.desktopAppArgs ?? [];
      const proc = spawn(service.desktopApp, args, {
        detached: true,
        stdio: "ignore",
      });
      proc.on("error", (err) => {
        log.error("streaming:launch", `Failed to launch ${service.desktopApp}: ${err}`);
      });
      proc.unref();
    } else {
      await shell.openExternal(service.url);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Local AI (Ollama)                                                  */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("localAi:available", async () => {
    return isOllamaAvailable();
  });

  ipcMain.handle("localAi:nlToFilter", async (_e, query: string, itemType: string) => {
    return naturalLanguageToFilter(query, itemType);
  });

  ipcMain.handle("localAi:groupItems", async (_e, items: Array<{
    id: string;
    title: string;
    genres?: string[];
    tags?: string[];
    description?: string;
    platform?: string;
    artist?: string;
    album?: string;
    genre?: string;
  }>, groupCount: number) => {
    return aiGroupItems(items, groupCount);
  });

  /* ------------------------------------------------------------------ */
  /*  Package Manager (Libretro cores, emulators, dependencies)         */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("packages:list", async () => {
    return listAvailablePackages();
  });

  ipcMain.handle("packages:search", async (_e, query: string) => {
    return searchPackages(query);
  });

  ipcMain.handle("packages:install", async (_e, packageId: string) => {
    return installPackage(packageId, window);
  });

  ipcMain.handle("packages:uninstall", async (_e, packageId: string) => {
    return uninstallPackage(packageId, window);
  });

  ipcMain.handle("packages:update", async () => {
    return checkUpdates(window);
  });

  ipcMain.handle("packages:setAptPassword", async (_e, password: string) => {
    return setAptPassword(password);
  });

  ipcMain.handle("packages:detectCores", async () => {
    return detectInstalledCores();
  });

  ipcMain.handle("packages:detectWineRunner", async () => {
    return detectWineRunner();
  });

  /* ------------------------------------------------------------------ */
  /*  Emulator Configuration                                             */
  /* ------------------------------------------------------------------ */

  ipcMain.handle("dolphin:openSettings", async () => {
    const { spawn } = await import("child_process");
    const { existsSync } = await import("fs");
    const { homedir } = await import("os");
    const { join } = await import("path");

    // Try to detect Dolphin installation and open its settings
    const dolphinPaths = [
      "/usr/bin/dolphin-emu",
      "/var/lib/flatpak/exports/bin/org.DolphinEmu.dolphin-emu",
    ];

    for (const path of dolphinPaths) {
      if (existsSync(path)) {
        if (path.includes("flatpak")) {
          spawn("flatpak", ["run", "org.DolphinEmu.dolphin-emu", "--settings"], {
            detached: true,
            stdio: "ignore",
          }).unref();
        } else {
          spawn(path, ["--settings"], {
            detached: true,
            stdio: "ignore",
          }).unref();
        }
        return true;
      }
    }
    return false;
  });

  ipcMain.handle("dolphin:openConfig", async () => {
    const { homedir } = await import("os");
    const { join } = await import("path");
    const { existsSync } = await import("fs");

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

  ipcMain.handle("controller:openMapping", async () => {
    // For now, this will navigate to the Input tab in settings
    // In the future, this could open a dedicated controller mapping UI
    return true;
  });

  ipcMain.handle("controller:resetMappings", async () => {
    const db = getDb();
    await db.query("DELETE FROM controller_mapping");
    return true;
  });
}
