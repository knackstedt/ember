import { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from "fs";
import { join, extname, basename, dirname } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { Game, GamePlatform } from "../../shared/types";
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
  ".chd": "dreamcast",
  ".gdi": "dreamcast",
  ".cdi": "dreamcast",
};

// Files that need content-based detection (used by multiple platforms)
const ISO_EXTS = new Set([".iso", ".img", ".bin"]);

/**
 * Detect PlayStation ISO by checking for definitive PSX/PS2 signatures.
 * Only returns "psx" if we find EXACT PlayStation system identifiers.
 * Returns null for unknown/generic ISOs (including DOS/PC ISOs).
 */
function detectPlayStationIso(filePath: string): "psx" | null {
  let fd: number;
  try {
    fd = openSync(filePath, "r");
  } catch {
    return null;
  }
  try {
    // Read from multiple offsets where PlayStation data appears
    // PS1: License string at 0x8000 (32KB - start of user area)
    // PS2: Various system locations
    const offsets = [0x8000, 0x9320, 0x4000];
    const searches = [
      "PLAYSTATION",
      "Sony Computer Entertainment",
      "PS-X EXE",  // PS1 EXE header
      "BOOT2",     // PS2 boot indicator
    ];

    for (const offset of offsets) {
      const buf = Buffer.alloc(128);
      const bytesRead = readSync(fd, buf, 0, 128, offset);
      if (bytesRead < 16) continue;

      const str = buf.toString("ascii", 0, bytesRead);
      const hexPreview = buf.toString("hex", 0, 32);

      for (const search of searches) {
        if (str.includes(search)) {
          log.info("rom", `PSX detection: found "${search}" at offset 0x${offset.toString(16)} in ${filePath} (hex: ${hexPreview})`);
          closeSync(fd);
          return "psx";
        }
      }

      // Debug: log what we found for investigation
      if (offset === 0x8000) {
        log.info("rom", `ISO header at 0x8000: "${str.slice(0, 64).replace(/[^\x20-\x7E]/g, '.')}" (hex: ${hexPreview})`);
      }
    }

    closeSync(fd);
    return null;
  } catch (err) {
    log.info("rom", `PSX detection error for ${filePath}: ${err}`);
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
            log.info("rom", `skip .bin without .cue: ${fullPath}`);
            return;
          }
        }

        platform = detectPlayStationIso(fullPath);
        if (!platform) {
          log.info("rom", `skip unknown ISO/BIN (not PlayStation): ${fullPath}`);
          return;
        }
      }

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
