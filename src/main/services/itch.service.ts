import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { Game } from "../../shared/types";
import { resolveSourceLocation } from "../../shared/path-utils";
import { createLogger } from "../util/logger";

const log = createLogger("info");

/** Where itch app stores its data */
const ITCH_CONFIG_DIR = join(homedir(), ".config", "itch");
const ITCH_DB_PATH = join(ITCH_CONFIG_DIR, "db.json");

/** List installed itch games from the itch app DB */
export function listInstalledItchGames(): Game[] {
  const games: Game[] = [];

  if (!existsSync(ITCH_DB_PATH)) {
    return games;
  }

  try {
    const db = JSON.parse(readFileSync(ITCH_DB_PATH, "utf-8"));
    const caves: Record<string, any> = db.caves ?? {};
    for (const caveId of Object.keys(caves)) {
      const cave = caves[caveId];
      const game = cave.game ?? {};
      const installInfo = cave.installInfo ?? {};
      const path = installInfo?.installedToUrn
        ? installInfo.installedToUrn.replace("disk+", "").replace(/\+/g, "/")
        : installInfo?.installPath;
      if (!path || !existsSync(path)) continue;

      const exe = findExecutableInInstall(path);
      if (!exe) continue;

      games.push({
        id: `itch_${game.id ?? caveId}`,
        title: game.title ?? "Unknown",
        platform: "itch",
        execPath: exe,
        coverUrl: game.coverUrl,
        developer: game.user?.displayName ?? game.user?.username,
        tags: [],
        sourceLocation: resolveSourceLocation(exe),
      });
    }
  } catch (err: any) {
    log.error("itch", `Failed to read itch DB: ${err.message}`);
  }

  return games;
}

/** Launch an itch game via direct exec */
export async function launchItchGame(game: Game): Promise<{ success: boolean; error?: string }> {
  if (!game.execPath) {
    return { success: false, error: "No executable path for itch game" };
  }

  try {
    const proc = spawn(game.execPath, [], {
      detached: true,
      stdio: "ignore",
      cwd: dirname(game.execPath),
    });
    proc.on("error", (err) => {
      log.error("itch", `Failed to launch ${game.title}: ${err.message}`);
    });
    proc.unref();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findExecutableInInstall(dirPath: string): string | null {
  if (!existsSync(dirPath)) return null;
  try {
    const entries = require("fs").readdirSync(dirPath);
    const candidates = entries.filter((e: string) => {
      const lower = e.toLowerCase();
      return lower.endsWith(".exe") || lower.endsWith(".sh") || lower.endsWith(".bin") || (!lower.includes(".") && lower !== "readme" && lower !== "license");
    });
    if (candidates.length > 0) {
      return join(dirPath, candidates[0]);
    }
    for (const entry of entries) {
      const subPath = join(dirPath, entry);
      try {
        const stat = require("fs").statSync(subPath);
        if (stat.isDirectory()) {
          const subExe = findExecutableInInstall(subPath);
          if (subExe) return subExe;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  return null;
}
