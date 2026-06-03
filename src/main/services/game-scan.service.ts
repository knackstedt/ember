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

const log = createLogger("info");

function normalizeGame(game: Game): Record<string, unknown> {
  const n: Record<string, unknown> = { ...game };
  if (n.isFavorite === undefined) n.isFavorite = false;
  if (n.tags === undefined) n.tags = [];
  if (n.playTime === undefined) n.playTime = 0;
  if (n.rating === undefined) n.rating = 0;
  if (n.lastPlayed === undefined) n.lastPlayed = 0;
  if (n.hidden === undefined) n.hidden = false;
  return n;
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
      }[],
    ]
  >(`SELECT playTime, lastPlayed, isFavorite, tags, rating, hidden, coverUrl, coverSource, corrupt FROM game:⟨${game.id}⟩`);
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
      game.coverUrl = existing.coverUrl;
    }
    if (existing.coverSource !== undefined && existing.coverSource !== null) {
      game.coverSource = existing.coverSource;
    }
    if (existing.corrupt !== undefined && existing.corrupt !== null) {
      game.corrupt = existing.corrupt;
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

  const db = getDb();
  for (const game of all) {
    try {
      const normalized = await preserveExistingFields(db, normalizeGame(game));
      await db.query(`UPSERT game:⟨${game.id}⟩ CONTENT $game`, {
        game: normalized,
      });
    } catch (err) {
      log.warn("scan", `Failed to upsert ${game.id}: ${err}`);
    }
  }

  return all;
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
            const db = getDb();
            for (const game of games) {
              try {
                const normalized = await preserveExistingFields(db, normalizeGame(game));
                await db.query(`UPSERT game:⟨${game.id}⟩ CONTENT $game`, {
                  game: normalized,
                });
              } catch (err) {
                log.warn("scan", `Failed to upsert ${game.id}: ${err}`);
              }
            }
            worker.terminate();
            resolve(games);
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
