import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { Game, GamePlatform } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

function walkDir(dir: string, callback: (filePath: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath, callback);
      } else if (stat.isFile()) {
        callback(fullPath);
      }
    } catch {
      // ignore permission errors etc.
    }
  }
}

const PLATFORM_EXTS: Record<string, GamePlatform> = {
  ".nes": "nes",
  ".smc": "snes",
  ".sfc": "snes",
  ".gb": "gb",
  ".gbc": "gb",
  ".gba": "gba",
  ".z64": "n64",
  ".n64": "n64",
  ".v64": "n64",
  ".md": "genesis",
  ".smd": "genesis",
  ".gen": "genesis",
  ".sms": "sms",
  ".gg": "gamegear",
  ".pce": "pce",
  ".cue": "psx",
  ".bin": "psx",
  ".iso": "psx",
  ".pbp": "psx",
  ".nds": "nds",
  ".chd": "dreamcast",
  ".gdi": "dreamcast",
  ".cdi": "dreamcast",
};

function titleFromFilename(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashId(prefix: string, fullPath: string): string {
  return `${prefix}_${createHash("sha256").update(fullPath).digest("hex").slice(0, 16)}`;
}

export function scanRomGames(): Game[] {
  const roots = [
    join(homedir(), "Roms"),
    join(homedir(), "ROMs"),
    join(homedir(), "Games"),
    join(homedir(), "games"),
    join(homedir(), "roms"),
  ].filter(existsSync);

  log.info("rom", `scanning roots: ${roots.join(", ")}`);
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    walkDir(root, (fullPath) => {
      const ext = extname(fullPath).toLowerCase();
      const platform = PLATFORM_EXTS[ext];
      if (!platform) return;
      if (seen.has(fullPath)) {
        log.info("rom", `skip duplicate path: ${fullPath}`);
        return;
      }
      seen.add(fullPath);

      const title = titleFromFilename(basename(fullPath));
      const id = hashId(platform, fullPath);

      log.info("rom", `found ${title} → ${id} platform: ${platform} path: ${fullPath}`);

      games.push({
        id,
        title,
        platform,
        romPath: fullPath,
        tags: [],
      });
    });
  }

  log.info("rom", `total found: ${games.length}`);
  return games;
}
