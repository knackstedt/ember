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
import { scanItchGames } from "../scanners/itch.scanner";
import { Game } from "../../shared/types";
import { SCAN_SOURCE_ID_PREFIXES } from "../../shared/scan-sources";
import type { ScanSourceId } from "../../shared/scan-sources";
import { createLogger } from "../util/logger";
import { getSettings } from "./settings.service";
import { calculateCRC32, calculateMD5, calculateSHA1, getRomHashes } from "./metadata/datfiles.service";
import { createDesktopEntry } from "./desktop-entry.service";

const log = createLogger("info");

function normalizeGame(game: Game): Record<string, unknown> {
  const n: Record<string, unknown> = { ...game };
  if (n.isFavorite === undefined) n.isFavorite = false;
  if (n.tags === undefined) n.tags = [];
  if (n.playTime === undefined) n.playTime = 0;
  if (n.rating === undefined) n.rating = 0;
  if (n.lastPlayed === undefined) n.lastPlayed = 0;
  if (n.hidden === undefined) n.hidden = false;
  if (n.sourceLocation === undefined) n.sourceLocation = "local";
  delete n.metadataFetched;
  return n;
}

/**
 * Platforms whose games are discovered by scanners and may become stale
 */
const MANAGED_PLATFORMS = new Set([
  "steam", "gog", "heroic", "lutris", "desktop", "itch",
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

function gameSource(game: Game): ScanSourceId | undefined {
  if (game.source) return game.source;
  const id = extractRecordId(game.id);
  if (!id) return undefined;
  for (const [source, prefixes] of Object.entries(SCAN_SOURCE_ID_PREFIXES)) {
    if (prefixes.some((p) => id.startsWith(p))) return source as ScanSourceId;
  }
  return undefined;
}

async function markStaleGamesMissing(
  db: ReturnType<typeof getDb>,
  scannedGames: Game[],
): Promise<void> {
  const scannedIds = new Set(scannedGames.map((g) => g.id));
  const result = await db.query<[Game[]]>("SELECT * FROM game");
  const existingGames = (result[0] ?? []) as Game[];
  const settings = await getSettings();
  const disabledSources = new Set(settings.disabledScanSources ?? []);

  log.info("cleanup", `Checking ${existingGames.length} existing games against ${scannedIds.size} scanned games`);

  const updatePromises: Promise<unknown>[] = [];

  for (const game of existingGames) {
    const id = extractRecordId(game.id);
    if (!id) {
      log.warn("cleanup", `Skipping game with unparseable id: ${JSON.stringify(game.id)}`);
      continue;
    }

    if (!MANAGED_PLATFORMS.has(game.platform)) continue;

    // Don't mark games from disabled scan sources as missing, since they are intentionally skipped.
    const source = gameSource(game);
    if (source && disabledSources.has(source)) continue;

    if (scannedIds.has(id)) {
      // Game was found in scan: ensure it is not marked missing
      if (game.missing) {
        updatePromises.push(
          db.query(`UPDATE game:⟨${id}⟩ SET missing = false`)
            .then(() => log.info("cleanup", `Restored game ${id} (${game.title})`))
            .catch((err) => log.warn("cleanup", `Failed to restore ${id}: ${err}`))
        );
      }
      continue;
    }

    let shouldMarkMissing = false;

    if (game.platform === "steam") {
      // Steam games not found in scan were skipped because install dir is missing or empty
      shouldMarkMissing = true;
    } else {
      const target = resolveTargetPath(game);
      if (target && target.startsWith("/")) {
        shouldMarkMissing = !existsSync(target);
      }
    }

    if (shouldMarkMissing && !game.missing) {
      log.info("cleanup", `Marking missing game ${id} (${game.title}) platform=${game.platform}`);
      updatePromises.push(
        db.query(`UPDATE game:⟨${id}⟩ SET missing = true`)
          .catch((err) => log.warn("cleanup", `Failed to mark missing ${id}: ${err}`))
      );
    }
  }

  // Await in chunks
  const chunkSize = 50;
  for (let i = 0; i < updatePromises.length; i += chunkSize) {
    await Promise.all(updatePromises.slice(i, i + chunkSize));
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

async function fetchExistingGameFields(db: ReturnType<typeof getDb>): Promise<Map<string, any>> {
  const rows = await db.query<[any[]]>(`SELECT id, playTime, lastPlayed, isFavorite, tags, rating, hidden, coverUrl, coverSource, corrupt, wineRunner, wineCustomCommand, umuCustomCommand, compressedRomPath, compressionFormat FROM game`);
  const existing = rows[0] ?? [];
  const map = new Map<string, any>();
  for (const row of existing) {
    const id = extractRecordId(row.id);
    if (id) {
      map.set(id, row);
    }
  }
  return map;
}

function applyExistingFields(
  game: Record<string, unknown>,
  existing?: Record<string, unknown>,
): Record<string, unknown> {
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
      const coverUrl = String(existing.coverUrl);
      const isRawLocal =
        coverUrl.startsWith("/") ||
        coverUrl.startsWith("file://");
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

  const settings = await getSettings();
  const romPaths = settings.romPaths ?? [];
  const gamePaths = settings.gamePaths ?? [];
  const disabledSources = new Set(settings.disabledScanSources ?? []);
  const dolphinExtra = [...gamePaths, ...romPaths];
  const isEnabled = (source: ScanSourceId) => !disabledSources.has(source);

  const reportAndScan = async <T>(
    scanner: ScanSourceId,
    fn: () => T[] | Promise<T[]>,
  ): Promise<T[]> => {
    report(scanner, 0, 0, "scanning");
    const result = await fn();
    report(scanner, result.length, result.length, "done");
    return result;
  };

  const steam = isEnabled("steam") ? await reportAndScan("steam", scanSteamGames) : [];
  const dolphin = isEnabled("dolphin")
    ? await reportAndScan("dolphin", () => scanDolphinGames(dolphinExtra))
    : [];
  const heroic = isEnabled("heroic") ? scanHeroicGames() : [];
  const lutris = isEnabled("lutris") ? scanLutrisGames() : [];
  const desktop = isEnabled("desktop") ? scanDesktopGames() : [];
  const flash = isEnabled("flash") ? scanFlashGames() : [];
  const roms = isEnabled("rom") ? await scanRomGames(romPaths) : [];
  const v86 = isEnabled("v86") ? scanV86Games(romPaths, gamePaths) : [];
  const windows = isEnabled("windows") ? scanWindowsGames(gamePaths, romPaths) : [];
  const itch = isEnabled("itch") ? scanItchGames() : [];

  const all = [...steam, ...dolphin, ...heroic, ...lutris, ...desktop, ...flash, ...roms, ...v86, ...windows, ...itch];

  // Metadata enrichment disabled - games are stored as scanned
  const enrichedGames = all;

  const db = getDb();
  const existingMap = await fetchExistingGameFields(db);
  const autoCreateDesktop = settings.autoCreateDesktopEntries ?? false;

  const chunkSize = 50;
  for (let i = 0; i < enrichedGames.length; i += chunkSize) {
    const chunk = enrichedGames.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (game) => {
        try {
          const normalized = applyExistingFields(normalizeGame(game), existingMap.get(game.id));
          await db.query(`UPSERT game:⟨${game.id}⟩ CONTENT $game`, {
            game: normalized,
          });
        } catch (err) {
          log.warn("scan", `Failed to upsert ${game.id}: ${err}`);
        }
      })
    );
  }

  if (autoCreateDesktop) {
    for (const game of enrichedGames) {
      if (!existingMap.has(game.id)) {
        try {
          createDesktopEntry(game);
        } catch (err) {
          log.warn("scan", `Failed to create desktop entry for ${game.id}: ${err}`);
        }
      }
    }
  }

  await markStaleGamesMissing(db, enrichedGames);

  if (typeof (global as any).gc === "function") {
    (global as any).gc();
  }

  return enrichedGames;
}

export async function performGameScan(
  window: BrowserWindow | null,
  extraPaths?: string[],
): Promise<Game[]> {
  // __dirname may be out/main/ or out/main/chunks/ depending on bundling
  const baseDir = join(__dirname, "workers", "game-scan.worker.js");
  const chunkDir = join(__dirname, "..", "workers", "game-scan.worker.js");
  const workerPath = existsSync(baseDir) ? baseDir : chunkDir;

  if (!existsSync(workerPath)) {
    log.warn(
      "scan",
      "Worker bundle not found, falling back to main-thread scan",
    );
    return scanInMainThread(window, extraPaths);
  }

  const settings = await getSettings();
  const romPaths = settings.romPaths ?? [];
  const gamePaths = settings.gamePaths ?? [];
  const disabledScanSources = settings.disabledScanSources ?? [];

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
            // Metadata enrichment disabled - use games as scanned
            const enrichedGames = games;

            const db = getDb();
            const existingMap = await fetchExistingGameFields(db);

            const chunkSize = 50;
            for (let i = 0; i < enrichedGames.length; i += chunkSize) {
              const chunk = enrichedGames.slice(i, i + chunkSize);
              await Promise.all(
                chunk.map(async (game) => {
                  try {
                    const normalized = applyExistingFields(normalizeGame(game), existingMap.get(game.id));
                    await db.query(`UPSERT game:⟨${game.id}⟩ CONTENT $game`, {
                      game: normalized,
                    });
                  } catch (err) {
                    log.warn("scan", `Failed to upsert ${game.id}: ${err}`);
                  }
                })
              );
            }

            const autoCreateDesktop = settings.autoCreateDesktopEntries ?? false;
            if (autoCreateDesktop) {
              for (const game of enrichedGames) {
                if (!existingMap.has(game.id)) {
                  try {
                    createDesktopEntry(game);
                  } catch (err) {
                    log.warn("scan", `Failed to create desktop entry for ${game.id}: ${err}`);
                  }
                }
              }
            }

            await markStaleGamesMissing(db, enrichedGames);

            if (typeof (global as any).gc === "function") {
              (global as any).gc();
            }

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

    worker.postMessage({ extraPaths, romPaths, gamePaths, disabledScanSources });
  });
}
