import { Worker } from "worker_threads";
import { join } from "path";
import { existsSync } from "fs";
import { BrowserWindow } from "electron";
import { getDb } from "../db";
import { scanSteamGames } from "../scanners/steam.scanner";
import { scanDolphinGames } from "../scanners/dolphin.scanner";
import { scanDesktopGames } from "../scanners/desktop.scanner";
import { scanHeroicGames, scanLutrisGames } from "../scanners/heroic.scanner";
import { scanFlashGames } from "../scanners/flash.scanner";
import { scanRomGames } from "../scanners/rom.scanner";
import { scanV86Games } from "../scanners/v86.scanner";
import { scanWindowsGames } from "../scanners/windows.scanner";
import { Game } from "../../shared/types";
import { createLogger } from "../util/logger";
import { quickMetadataLookup, fetchGameMetadata } from "./metadata";
import { calculateCRC32, calculateMD5, calculateSHA1, getRomHashes } from "./metadata/datfiles.service";

const log = createLogger("info");

function normalizeGame(game: Game): Record<string, unknown> {
  const n: Record<string, unknown> = { ...game };
  if (n.isFavorite === undefined) n.isFavorite = false;
  if (n.tags === undefined) n.tags = [];
  if (n.playTime === undefined) n.playTime = 0;
  if (n.rating === undefined) n.rating = 0;
  if (n.lastPlayed === undefined) n.lastPlayed = 0;
  if (n.hidden === undefined) n.hidden = false;
  delete n.metadataFetched;
  return n;
}

/**
 * Metadata sources that are fetched immediately during scan
 * (high rate limits or no API key required)
 */
const IMMEDIATE_METADATA_SOURCES = ["primary", "supplementary"];

/**
 * Metadata sources that are fetched lazily when viewing game details
 * (low rate limits or expensive APIs)
 */
const LAZY_METADATA_SOURCES = ["artwork", "video"];

interface MetadataEnrichmentResult {
  description?: string;
  releaseYear?: number;
  developer?: string;
  publisher?: string;
  genres?: string[];
  tags?: string[];
  coverUrl?: string;
  bannerUrl?: string;
  iconUrl?: string;
  rating?: number;
  metacriticScore?: number;
  openCriticScore?: number;
  protonRating?: string;
  steamAppId?: number;
  steamReviewScore?: number;
  steamOwnersEstimate?: number;
  platforms?: string[];
  playerCount?: { min: number; max: number };
  playtime?: number;
  // ROM-specific
  romHash?: string;
  romHashType?: string;
  serialNumber?: string;
  region?: string;
  language?: string;
  // External IDs
  igdbId?: number;
  rawgSlug?: string;
  mobyGamesId?: number;
  theGamesDbId?: number;
  launchBoxDbId?: string;
  // Achievement info (counts only, not full list)
  achievementCount?: number;
  // PCGamingWiki
  pcgwEngine?: string;
  pcgwSeries?: string;
}

/**
 * Enrich a game with metadata from high-rate-limit sources
 * This is called during the initial scan for all games
 */
async function enrichGameWithImmediateMetadata(game: Game): Promise<MetadataEnrichmentResult | null> {
  try {
    // Determine which sources to use based on platform
    const preferredSources: ("primary" | "retro" | "supplementary")[] = ["primary", "supplementary"];

    // For ROM-based platforms, also include retro sources
    const romPlatforms = ["nes", "snes", "gb", "gba", "n64", "genesis", "sms", "gamegear", "pce", "psx", "nds", "dreamcast"];
    if (romPlatforms.includes(game.platform)) {
      preferredSources.push("retro");
    }

    // Fetch metadata using unified service
    const metadata = await quickMetadataLookup(game.title, game.platform);

    if (!metadata || !metadata.sources || metadata.sources.length === 0) {
      return null;
    }

    // Map to enrichment result
    const result: MetadataEnrichmentResult = {
      description: metadata.description,
      releaseYear: metadata.releaseYear,
      developer: metadata.developer,
      publisher: metadata.publisher,
      genres: metadata.genres,
      tags: metadata.tags,
      coverUrl: metadata.coverUrl,
      bannerUrl: metadata.bannerUrl,
      iconUrl: metadata.iconUrl,
      rating: metadata.rating,
      metacriticScore: metadata.metacriticScore,
      openCriticScore: metadata.openCriticScore,
      protonRating: metadata.protonRating,
      steamAppId: metadata.steamAppId,
      steamReviewScore: metadata.steamReviewScore,
      steamOwnersEstimate: metadata.steamOwnersEstimate,
      platforms: metadata.platforms,
      playerCount: metadata.playerCount,
      playtime: metadata.playtime,
      romHash: metadata.romHash,
      romHashType: metadata.romHashType,
      serialNumber: metadata.serialNumber,
      region: metadata.region,
      language: metadata.language,
      igdbId: metadata.igdbId,
      rawgSlug: metadata.rawgSlug,
      mobyGamesId: metadata.mobyGamesId,
      theGamesDbId: metadata.theGamesDbId,
      launchBoxDbId: metadata.launchBoxDbId,
      achievementCount: metadata.achievementCount,
      pcgwEngine: metadata.pcgwEngine,
      pcgwSeries: metadata.pcgwSeries,
    };

    // Clean up undefined values
    Object.keys(result).forEach(key => {
      if (result[key as keyof MetadataEnrichmentResult] === undefined) {
        delete result[key as keyof MetadataEnrichmentResult];
      }
    });

    return result;
  } catch (err) {
    log.warn("enrichGameWithImmediateMetadata", `Failed for ${game.title}: ${err}`);
    return null;
  }
}

/**
 * Platforms whose games are discovered by scanners and may become stale
 */
const MANAGED_PLATFORMS = new Set([
  "steam", "gog", "heroic", "lutris", "desktop",
  "dolphin-gc", "dolphin-wii", "nes", "snes", "gb", "gba", "n64",
  "genesis", "sms", "gamegear", "pce", "psx", "nds", "dreamcast",
  "flash", "dos", "windows",
]);

function resolveTargetPath(game: Game): string | undefined {
  // Prefer compressed ROM if it still exists, so games aren't removed
  // from the library when the original file is deleted after compression.
  if (game.compressedRomPath && existsSync(game.compressedRomPath)) {
    return game.compressedRomPath;
  }
  if (game.romPath) return game.romPath;
  if (!game.execPath) return undefined;
  // Skip URL schemes (steam://, ember://, etc.)
  if (/^\w+:\/\//.test(game.execPath)) return undefined;
  // Strip desktop field codes and extract path
  const cleaned = game.execPath.replace(/%[uUfFdDnNickvm]/g, "").trim();
  const quoted = cleaned.match(/^"(.+)"$/);
  if (quoted) return quoted[1];
  return cleaned.split(/\s+/)[0];
}

function extractRecordId(raw: unknown): string | null {
  if (typeof raw === "string") {
    // SurrealDB sometimes returns "tb:id" compound strings
    const colonIdx = raw.indexOf(":");
    return colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.id === "string") return obj.id;
    if (typeof obj.id === "object" && obj.id !== null) {
      return extractRecordId(obj.id);
    }
    const str = String(raw);
    const colonIdx = str.indexOf(":");
    return colonIdx >= 0 ? str.slice(colonIdx + 1) : str;
  }
  return null;
}

async function cleanupStaleGames(
  db: ReturnType<typeof getDb>,
  scannedGames: Game[],
): Promise<void> {
  const scannedIds = new Set(scannedGames.map((g) => g.id));
  const result = await db.query<[Game[]]>("SELECT * FROM game");
  const existingGames = (result[0] ?? []) as Game[];

  log.info("cleanup", `Checking ${existingGames.length} existing games against ${scannedIds.size} scanned games`);

  for (const game of existingGames) {
    const id = extractRecordId(game.id);
    if (!id) {
      log.warn("cleanup", `Skipping game with unparseable id: ${JSON.stringify(game.id)}`);
      continue;
    }

    if (!MANAGED_PLATFORMS.has(game.platform)) continue;
    if (scannedIds.has(id)) continue;

    let shouldDelete = false;

    if (game.platform === "steam") {
      // Steam games not found in scan were skipped because install dir is missing or empty
      shouldDelete = true;
    } else {
      const target = resolveTargetPath(game);
      if (target && target.startsWith("/")) {
        shouldDelete = !existsSync(target);
      }
    }

    if (shouldDelete) {
      log.info("cleanup", `Removing stale game ${id} (${game.title}) platform=${game.platform}`);
      try {
        await db.query(`DELETE game:⟨${id}⟩`);
      } catch (err) {
        log.warn("cleanup", `Failed to delete ${id}: ${err}`);
      }
    }
  }
}

/**
 * Calculate ROM hashes for verification
 */
async function calculateRomHashes(romPath?: string): Promise<{ crc32?: string; md5?: string; sha1?: string } | null> {
  if (!romPath) return null;

  try {
    // This would need to read the ROM file
    // For now, return null as actual implementation requires file system access
    return null;
  } catch {
    return null;
  }
}

async function preserveExistingFields(
  db: ReturnType<typeof getDb>,
  game: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rows = await db.query<
    [
      {
        playTime?: number;
        lastPlayed?: number;
        isFavorite?: boolean;
        tags?: string[];
        rating?: number;
        hidden?: boolean;
        coverUrl?: string;
        coverSource?: string;
        corrupt?: boolean;
        wineRunner?: string;
        wineCustomCommand?: string;
        umuCustomCommand?: string;
        compressedRomPath?: string;
        compressionFormat?: string;
      }[],
    ]
  >(`SELECT playTime, lastPlayed, isFavorite, tags, rating, hidden, coverUrl, coverSource, corrupt, wineRunner, wineCustomCommand, umuCustomCommand, compressedRomPath, compressionFormat FROM game:⟨${game.id}⟩`);
  const existing = rows[0]?.[0];
  if (existing) {
    if (existing.playTime !== undefined && existing.playTime !== null) {
      game.playTime = existing.playTime;
    }
    if (existing.lastPlayed !== undefined && existing.lastPlayed !== null) {
      game.lastPlayed = existing.lastPlayed;
    }
    if (existing.isFavorite !== undefined && existing.isFavorite !== null) {
      game.isFavorite = existing.isFavorite;
    }
    if (existing.tags !== undefined && existing.tags !== null) {
      game.tags = existing.tags;
    }
    if (existing.rating !== undefined && existing.rating !== null) {
      game.rating = existing.rating;
    }
    if (existing.hidden !== undefined && existing.hidden !== null) {
      game.hidden = existing.hidden;
    }
    if (existing.coverUrl !== undefined && existing.coverUrl !== null) {
      // Don't preserve raw local paths — the scanner now serves them via ember://media/
      const isRawLocal =
        existing.coverUrl.startsWith("/") ||
        existing.coverUrl.startsWith("file://");
      if (!isRawLocal) {
        game.coverUrl = existing.coverUrl;
      }
    }
    if (existing.coverSource !== undefined && existing.coverSource !== null) {
      game.coverSource = existing.coverSource;
    }
    if (existing.corrupt !== undefined && existing.corrupt !== null) {
      game.corrupt = existing.corrupt;
    }
    if (existing.wineRunner !== undefined && existing.wineRunner !== null) {
      game.wineRunner = existing.wineRunner;
    }
    if (existing.wineCustomCommand !== undefined && existing.wineCustomCommand !== null) {
      game.wineCustomCommand = existing.wineCustomCommand;
    }
    if (existing.umuCustomCommand !== undefined && existing.umuCustomCommand !== null) {
      game.umuCustomCommand = existing.umuCustomCommand;
    }
    if (existing.compressedRomPath !== undefined && existing.compressedRomPath !== null) {
      game.compressedRomPath = existing.compressedRomPath;
    }
    if (existing.compressionFormat !== undefined && existing.compressionFormat !== null) {
      game.compressionFormat = existing.compressionFormat;
    }
  }
  return game;
}

async function scanInMainThread(
  window: BrowserWindow | null,
  extraPaths?: string[],
): Promise<Game[]> {
  const report = (
    scanner: string,
    current: number,
    total: number,
    status: "scanning" | "done",
  ) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send("scan:progress", {
        scanner,
        current,
        total,
        status,
      });
    }
  };

  report("steam", 0, 0, "scanning");
  const steam = scanSteamGames();
  report("steam", steam.length, steam.length, "done");

  report("dolphin", 0, 0, "scanning");
  const dolphin = scanDolphinGames(extraPaths);
  report("dolphin", dolphin.length, dolphin.length, "done");

  const heroic = scanHeroicGames();
  const lutris = scanLutrisGames();
  const desktop = scanDesktopGames();

  const flash = scanFlashGames();
  const roms = scanRomGames();
  const v86 = scanV86Games();
  const windows = scanWindowsGames();

  const all = [...steam, ...dolphin, ...heroic, ...lutris, ...desktop, ...flash, ...roms, ...v86, ...windows];

  // Enrich games with metadata from high-rate-limit sources
  report("metadata", 0, all.length, "scanning");
  const enrichedGames: Game[] = [];

  // Process metadata enrichment in batches to avoid overwhelming APIs
  const batchSize = 5;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    const batchPromises = batch.map(async (game) => {
      try {
        const enrichment = await enrichGameWithImmediateMetadata(game);
        if (enrichment) {
          // Merge enrichment data into game
          return {
            ...game,
            description: enrichment.description ?? game.description,
            releaseYear: enrichment.releaseYear ?? game.releaseYear,
            developer: enrichment.developer ?? game.developer,
            publisher: enrichment.publisher ?? game.publisher,
            genres: enrichment.genres ?? game.genres,
            tags: enrichment.tags ?? game.tags,
            coverUrl: enrichment.coverUrl ?? game.coverUrl,
            rating: enrichment.rating ?? game.rating,
            metacriticScore: enrichment.metacriticScore ?? game.metacriticScore,
            protonRating: enrichment.protonRating ?? game.protonRating,
            steamAppId: enrichment.steamAppId ?? game.steamAppId,
            steamReviewScore: enrichment.steamReviewScore ?? game.steamReviewScore,
            platforms: enrichment.platforms ?? game.platforms,
            playerCount: enrichment.playerCount ?? game.playerCount,
            playtime: enrichment.playtime ?? game.playtime,
            // Store external IDs for lazy loading
            igdbId: enrichment.igdbId ?? game.igdbId,
            rawgSlug: enrichment.rawgSlug ?? game.rawgSlug,
            mobyGamesId: enrichment.mobyGamesId ?? game.mobyGamesId,
            theGamesDbId: enrichment.theGamesDbId ?? game.theGamesDbId,
            launchBoxDbId: enrichment.launchBoxDbId ?? game.launchBoxDbId,
            achievementCount: enrichment.achievementCount ?? game.achievementCount,
            // Mark that immediate metadata has been fetched
            metadataFetched: true,
          } as Game;
        }
        return game;
      } catch (err) {
        log.warn("scan", `Metadata enrichment failed for ${game.title}: ${err}`);
        return game;
      }
    });

    const enrichedBatch = await Promise.allSettled(batchPromises);
    enrichedBatch.forEach((result, index) => {
      if (result.status === "fulfilled") {
        enrichedGames.push(result.value);
      } else {
        enrichedGames.push(batch[index]);
      }
    });

    report("metadata", Math.min(i + batchSize, all.length), all.length, "scanning");

    // Small delay between batches to be nice to APIs
    if (i + batchSize < all.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  report("metadata", all.length, all.length, "done");

  const db = getDb();
  for (const game of enrichedGames) {
    try {
      const normalized = await preserveExistingFields(db, normalizeGame(game));
      await db.query(`UPSERT game:⟨${game.id}⟩ CONTENT $game`, {
        game: normalized,
      });
    } catch (err) {
      log.warn("scan", `Failed to upsert ${game.id}: ${err}`);
    }
  }

  await cleanupStaleGames(db, enrichedGames);

  return enrichedGames;
}

export async function performGameScan(
  window: BrowserWindow | null,
  extraPaths?: string[],
): Promise<Game[]> {
  const workerPath = join(__dirname, "workers/game-scan.worker.js");

  if (!existsSync(workerPath)) {
    log.warn(
      "scan",
      "Worker bundle not found, falling back to main-thread scan",
    );
    return scanInMainThread(window, extraPaths);
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath);

    worker.on("message", (msg: { type: string } & Record<string, unknown>) => {
      if (msg.type === "progress") {
        if (window && !window.isDestroyed()) {
          window.webContents.send("scan:progress", msg);
        }
      } else if (msg.type === "result") {
        const games = (msg.games as Game[]) ?? [];
        (async () => {
          try {
            // Send metadata progress update
            if (window && !window.isDestroyed()) {
              window.webContents.send("scan:progress", {
                type: "progress",
                scanner: "metadata",
                current: 0,
                total: games.length,
                status: "scanning",
              });
            }

            // Enrich games with metadata from high-rate-limit sources
            const enrichedGames: Game[] = [];
            const batchSize = 5;

            for (let i = 0; i < games.length; i += batchSize) {
              const batch = games.slice(i, i + batchSize);
              const batchPromises = batch.map(async (game) => {
                try {
                  const enrichment = await enrichGameWithImmediateMetadata(game);
                  if (enrichment) {
                    return {
                      ...game,
                      description: enrichment.description ?? game.description,
                      releaseYear: enrichment.releaseYear ?? game.releaseYear,
                      developer: enrichment.developer ?? game.developer,
                      publisher: enrichment.publisher ?? game.publisher,
                      genres: enrichment.genres ?? game.genres,
                      tags: enrichment.tags ?? game.tags,
                      coverUrl: enrichment.coverUrl ?? game.coverUrl,
                      rating: enrichment.rating ?? game.rating,
                      metacriticScore: enrichment.metacriticScore ?? game.metacriticScore,
                      protonRating: enrichment.protonRating ?? game.protonRating,
                      steamAppId: enrichment.steamAppId ?? game.steamAppId,
                      steamReviewScore: enrichment.steamReviewScore ?? game.steamReviewScore,
                      platforms: enrichment.platforms ?? game.platforms,
                      playerCount: enrichment.playerCount ?? game.playerCount,
                      playtime: enrichment.playtime ?? game.playtime,
                      igdbId: enrichment.igdbId ?? game.igdbId,
                      rawgSlug: enrichment.rawgSlug ?? game.rawgSlug,
                      mobyGamesId: enrichment.mobyGamesId ?? game.mobyGamesId,
                      theGamesDbId: enrichment.theGamesDbId ?? game.theGamesDbId,
                      launchBoxDbId: enrichment.launchBoxDbId ?? game.launchBoxDbId,
                      achievementCount: enrichment.achievementCount ?? game.achievementCount,
                      metadataFetched: true,
                    } as Game;
                  }
                  return game;
                } catch (err) {
                  log.warn("scan", `Metadata enrichment failed for ${game.title}: ${err}`);
                  return game;
                }
              });

              const enrichedBatch = await Promise.allSettled(batchPromises);
              enrichedBatch.forEach((result, index) => {
                if (result.status === "fulfilled") {
                  enrichedGames.push(result.value);
                } else {
                  enrichedGames.push(batch[index]);
                }
              });

              // Send progress update
              if (window && !window.isDestroyed()) {
                window.webContents.send("scan:progress", {
                  type: "progress",
                  scanner: "metadata",
                  current: Math.min(i + batchSize, games.length),
                  total: games.length,
                  status: "scanning",
                });
              }

              // Small delay between batches
              if (i + batchSize < games.length) {
                await new Promise(r => setTimeout(r, 200));
              }
            }

            // Send completion update
            if (window && !window.isDestroyed()) {
              window.webContents.send("scan:progress", {
                type: "progress",
                scanner: "metadata",
                current: games.length,
                total: games.length,
                status: "done",
              });
            }

            const db = getDb();
            for (const game of enrichedGames) {
              try {
                const normalized = await preserveExistingFields(db, normalizeGame(game));
                await db.query(`UPSERT game:⟨${game.id}⟩ CONTENT $game`, {
                  game: normalized,
                });
              } catch (err) {
                log.warn("scan", `Failed to upsert ${game.id}: ${err}`);
              }
            }

            await cleanupStaleGames(db, enrichedGames);

            worker.terminate();
            resolve(enrichedGames);
          } catch (err) {
            worker.terminate();
            reject(err);
          }
        })();
      } else if (msg.type === "error") {
        worker.terminate();
        reject(new Error(String(msg.error)));
      }
    });

    worker.on("error", (err) => {
      worker.terminate();
      reject(err);
    });

    worker.postMessage(extraPaths);
  });
}
