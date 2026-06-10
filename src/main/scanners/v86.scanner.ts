import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename, dirname } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { Game } from "../../shared/types";
import { resolveSourceLocation } from "../../shared/path-utils";
import { createLogger } from "../util/logger";

const log = createLogger("info");

/** Windows 9x game indicators that tell us a directory is NOT a pure DOS game */
const WINDOWS_INDICATORS = new Set([
  "runexit.exe",
  "winsetup.exe",
  "win32app",
  "windows",
  "winnt",
  "win95",
  "win98",
]);

function isWindowsGameDir(dir: string): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (WINDOWS_INDICATORS.has(entry.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/** Walk up a few parent levels to detect if this file lives inside a Windows 9x game folder */
function isInsideWindowsGameDir(fullPath: string): boolean {
  let dir = dirname(fullPath);
  for (let i = 0; i < 3; i++) {
    if (isWindowsGameDir(dir)) return true;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
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

const V86_EXTS = new Set([".img", ".iso", ".flp", ".vfd", ".ima"]);

const EXCLUDED_PATH_PATTERNS = [
  /gamecube/i,
  /wii/i,
  /psx/i,
  /playstation/i,
  /dreamcast/i,
  /saturn/i,
  /xbox/i,
  /switch/i,
  /nintendo(64|ds|3ds)/i,
];

function shouldExcludeV86(fullPath: string): boolean {
  const lower = fullPath.toLowerCase();
  return EXCLUDED_PATH_PATTERNS.some((p) => p.test(lower));
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

export function scanV86Games(): Game[] {
  const roots = [
    join(homedir(), "Roms"),
    join(homedir(), "ROMs"),
    join(homedir(), "Games"),
    join(homedir(), "games"),
    join(homedir(), "roms"),
    join(homedir(), "DOS"),
    join(homedir(), "dos"),
  ].filter(existsSync);

  log.info("v86", `scanning roots: ${roots.join(", ")}`);
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    walkDir(root, (fullPath) => {
      const ext = extname(fullPath).toLowerCase();
      if (!V86_EXTS.has(ext)) return;
      if (isInsideWindowsGameDir(fullPath)) {
        log.debug("v86", `skip Windows game dir: ${fullPath}`);
        return;
      }
      if (shouldExcludeV86(fullPath)) return;
      if (seen.has(fullPath)) {
        log.debug("v86", `skip duplicate path: ${fullPath}`);
        return;
      }
      seen.add(fullPath);

      const title = titleFromFilename(basename(fullPath));
      const id = hashId("v86", fullPath);

      log.debug("v86", `found ${title} → ${id} path: ${fullPath}`);

      games.push({
        id,
        title,
        platform: "dos",
        romPath: fullPath,
        tags: [],
        sourceLocation: resolveSourceLocation(fullPath),
      });
    });
  }

  log.info("v86", `total found: ${games.length}`);
  return games;
}
