import { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from "fs";
import { join, extname, basename, dirname } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { Game, GamePlatform } from "../../shared/types";
import { resolveSourceLocation } from "../../shared/path-utils";
import { detectChdPlatform } from "@shared/chd";
import { createLogger } from "../util/logger";

const log = createLogger("info");

// Path patterns that indicate a file is DOS/Windows/PC software, not a console ROM
const DOS_PC_EXCLUSION_PATTERNS = [
  /dos/i,
  /dosbox/i,
  /windows/i,
  /win95/i,
  /win98/i,
  /winxp/i,
  /pcsoftware/i,
  /pc.?games/i,
];

function shouldExcludeDosPc(fullPath: string): boolean {
  const lower = fullPath.toLowerCase();
  return DOS_PC_EXCLUSION_PATTERNS.some((p) => p.test(lower));
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
  ".pbp": "psx",
  ".nds": "nds",
  ".gdi": "dreamcast",
  ".cdi": "dreamcast",
};

// Files that need content-based detection (used by multiple platforms)
const ISO_EXTS = new Set([".iso", ".img", ".bin"]);

/**
 * Detect console ISO platform by checking for platform-specific signatures.
 * Returns the detected platform or null for unknown/generic ISOs.
 */
function detectIsoPlatform(filePath: string): GamePlatform | null {
  let fd: number;
  try {
    fd = openSync(filePath, "r");
  } catch {
    return null;
  }
  try {
    // Read a larger buffer at 0x8000 to catch signatures that appear
    // later in the ISO 9660 Primary Volume Descriptor
    const buf = Buffer.alloc(256);
    const bytesRead = readSync(fd, buf, 0, 256, 0x8000);
    if (bytesRead < 16) {
      closeSync(fd);
      return null;
    }

    const str = buf.toString("ascii", 0, bytesRead);
    const hexPreview = buf.toString("hex", 0, 32);
    log.debug("rom", `ISO header at 0x8000: "${str.slice(0, 96).replace(/[^\x20-\x7E]/g, '.')}" (hex: ${hexPreview})`);

    // PSP UMD ISO: "PSP GAME" in system identifier area
    if (str.includes("PSP GAME")) {
      closeSync(fd);
      return "psp";
    }

    // PS3 Blu-ray ISO: "PS3VOLUME" in the volume descriptor
    if (str.includes("PS3VOLUME")) {
      closeSync(fd);
      return "ps3";
    }

    // PlayStation family (PS1/PS2): "PLAYSTATION" in the system identifier
    if (str.includes("PLAYSTATION")) {
      // Distinguish PS1 from PS2 by checking for PS1 EXE header at 0x9320
      const psxBuf = Buffer.alloc(128);
      const psxBytes = readSync(fd, psxBuf, 0, 128, 0x9320);
      if (psxBytes >= 8) {
        const psxStr = psxBuf.toString("ascii", 0, psxBytes);
        if (psxStr.includes("PS-X EXE")) {
          log.info("rom", `PS1 EXE header found at 0x9320, detecting as psx: ${filePath}`);
          closeSync(fd);
          return "psx";
        }
      }
      // No PS1 EXE header → PS2
      log.debug("rom", `PLAYSTATION header without PS1 EXE, detecting as ps2: ${filePath}`);
      closeSync(fd);
      return "ps2";
    }

    closeSync(fd);

    // Standard ISO 9660 with no PlayStation signature.
    // Use directory path as a fallback for platforms with no reliable header.
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.includes("xbox360") || lowerPath.includes("xbox 360")) {
      return "xbox360";
    }

    return null;
  } catch (err) {
    log.info("rom", `ISO detection error for ${filePath}: ${err}`);
    try { closeSync(fd); } catch {}
    return null;
  }
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

function getRetroarchContentDir(): string | null {
  const cfgPath = join(homedir(), ".config", "retroarch", "retroarch.cfg");
  if (!existsSync(cfgPath)) return null;
  try {
    const content = readFileSync(cfgPath, "utf-8");
    const match = content.match(/content_directory\s*=\s*"([^"]+)"/);
    if (match && match[1]) {
      const dir = match[1].trim();
      if (existsSync(dir)) return dir;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function scanRomGames(): Game[] {
  const roots = [
    join(homedir(), "Roms"),
    join(homedir(), "ROMs"),
    join(homedir(), "Games"),
    join(homedir(), "games"),
    join(homedir(), "roms"),
    join(homedir(), "Emulation", "roms"),
    join(homedir(), "retropie", "roms"),
  ].filter(existsSync);

  const retroarchDir = getRetroarchContentDir();
  if (retroarchDir) roots.push(retroarchDir);

  log.info("rom", `scanning roots: ${roots.join(", ")}`);
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    walkDir(root, (fullPath) => {
      // Skip files in DOS/Windows directories - these are handled by v86 scanner
      if (shouldExcludeDosPc(fullPath)) {
        // log.info("rom", `skip DOS/PC path: ${fullPath}`);
        return;
      }

      const ext = extname(fullPath).toLowerCase();
      let platform: GamePlatform | null = PLATFORM_EXTS[ext] || null;

      // For ISO/BIN files, detect the platform from file contents
      if (!platform && ISO_EXTS.has(ext)) {
        // For .bin files, require a corresponding .cue file to exist
        // (otherwise it's likely a PC installer/data file, not a PSX/Sega CD ROM)
        if (ext === ".bin") {
          const baseName = basename(fullPath, ".bin");
          const cuePath = join(dirname(fullPath), baseName + ".cue");
          if (!existsSync(cuePath)) {
            log.debug("rom", `skip .bin without .cue: ${fullPath}`);
            return;
          }
        }

        platform = detectIsoPlatform(fullPath);
        if (!platform) {
          log.debug("rom", `skip unknown ISO/BIN: ${fullPath}`);
          return;
        }
      }

      // For CHD files, detect the platform from CHD header metadata
      if (!platform && ext === ".chd") {
        platform = detectChdPlatform(fullPath);
        if (!platform) {
          log.debug("rom", `skip unknown CHD platform: ${fullPath}`);
          return;
        }
      }

      if (!platform) return;
      if (seen.has(fullPath)) {
        log.debug("rom", `skip duplicate path: ${fullPath}`);
        return;
      }
      seen.add(fullPath);

      const title = titleFromFilename(basename(fullPath));
      const id = hashId(platform, fullPath);

      log.debug("rom", `found ${title} → ${id} platform: ${platform} path: ${fullPath}`);

      games.push({
        id,
        title,
        platform,
        romPath: fullPath,
        tags: [],
        sourceLocation: resolveSourceLocation(fullPath),
      });
    });
  }

  log.info("rom", `total found: ${games.length}`);
  return games;
}
