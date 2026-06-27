import { existsSync, readdirSync, statSync, lstatSync, openSync, readSync, closeSync } from "fs";
import { join, extname, basename } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { Game, GamePlatform } from "../../shared/types";
import { resolveSourceLocation } from "../../shared/path-utils";
import { createLogger } from "../util/logger";

const log = createLogger("info");

function resolveCaseInsensitive(
  basePath: string,
  ...segments: string[]
): string | null {
  let current = basePath;
  for (const segment of segments) {
    if (!existsSync(current)) return null;
    const entries = readdirSync(current);
    const match = entries.find((e) => e.toLowerCase() === segment.toLowerCase());
    if (!match) return null;
    current = join(current, match);
  }
  return current;
}

function getDefaultRomDirs(): string[] {
  const dirs: (string | null)[] = [
    resolveCaseInsensitive(homedir(), "Games"),
    resolveCaseInsensitive(homedir(), "Roms"),
    resolveCaseInsensitive(homedir(), "Games", "GameCube"),
    resolveCaseInsensitive(homedir(), "Games", "Wii"),
    resolveCaseInsensitive(homedir(), "Roms", "GameCube"),
    resolveCaseInsensitive(homedir(), "Roms", "Wii"),
    "/mnt/games/GameCube",
    "/mnt/games/Wii",
  ];
  return dirs.filter((d): d is string => d !== null && existsSync(d));
}

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
      const lstat = lstatSync(fullPath);
      if (lstat.isSymbolicLink()) continue;
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

const GC_EXTS = new Set([".iso", ".gcm", ".gcz", ".ciso", ".rvz", ".dol", ".elf"]);
const WII_EXTS = new Set([".iso", ".wbfs", ".gcz", ".rvz", ".wia", ".wad"]);

function detectIsoPlatform(filePath: string): "dolphin-gc" | "dolphin-wii" | null {
  let fd: number;
  try {
    fd = openSync(filePath, "r");
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(32);
    const bytesRead = readSync(fd, buf, 0, 32, 0);
    closeSync(fd);
    if (bytesRead < 32) return null;
    // Wii magic at offset 0x18 (big-endian)
    const wiiMagic = buf.readUInt32BE(0x18);
    if (wiiMagic === 0x5D1C9EA3) return "dolphin-wii";
    // GameCube magic at offset 0x1C (big-endian)
    const gcMagic = buf.readUInt32BE(0x1C);
    if (gcMagic === 0xC2339F3D) return "dolphin-gc";
    return null;
  } catch {
    try { closeSync(fd); } catch {}
    return null;
  }
}

function platformFromExt(ext: string, filePath: string): GamePlatform | null {
  if (ext === ".iso") {
    return detectIsoPlatform(filePath);
  }
  const lower = filePath.toLowerCase();
  if (lower.includes("wii") && !lower.includes("gamecube"))
    return "dolphin-wii";
  if (lower.includes("gamecube") || lower.includes("gc")) return "dolphin-gc";
  if (ext === ".wad" || ext === ".wbfs" || ext === ".wia") return "dolphin-wii";
  return "dolphin-gc";
}

function titleFromFilename(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashId(prefix: string, fullPath: string): string {
  return `${prefix}_${createHash("sha256").update(fullPath).digest("hex").slice(0, 16)}`;
}

export function scanDolphinGames(extraPaths: string[] = []): Game[] {
  const dirs = [...getDefaultRomDirs(), ...extraPaths].filter(existsSync);
  log.info("dolphin", `scanning dirs: ${dirs.join(", ")}`);
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    walkDir(dir, (fullPath) => {
      const ext = extname(fullPath).toLowerCase();
      if (!GC_EXTS.has(ext) && !WII_EXTS.has(ext)) {
        // silently skip non-ROM files
        return;
      }
      if (seen.has(fullPath)) {
        log.debug("dolphin", `skip duplicate path: ${fullPath}`);
        return;
      }

      seen.add(fullPath);
      const platform = platformFromExt(ext, fullPath);
      if (!platform) {
        log.debug("dolphin", `skip unknown ISO: ${fullPath}`);
        return;
      }
      const title = titleFromFilename(basename(fullPath));
      const id = hashId("dolphin", fullPath);
      log.debug("dolphin", `found ${title} → ${id} platform: ${platform} path: ${fullPath}`);

      games.push({
        id,
        title,
        platform,
        romPath: fullPath,
        execPath: `dolphin-emu --exec="${fullPath}"`,
        tags: [],
        sourceLocation: resolveSourceLocation(fullPath),
        source: "dolphin",
      });
    });
  }

  log.info("dolphin", `total found: ${games.length}`);
  return games;
}
