import { existsSync, readdirSync, statSync, lstatSync } from "fs";
import { join, extname, basename, dirname } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { Game, WineRunner } from "../../shared/types";
import { resolveSourceLocation } from "../../shared/path-utils";
import { createLogger } from "../util/logger";
import { detectWineRunner } from "../services/wine-detection.service";
import { detectGameInfo } from "../services/game-detection.service";

const log = createLogger("info");

function walkDir(dir: string, callback: (filePath: string) => void): void {
  if (isSystemDir(dir)) return;
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

const SKIP_NAMES = new Set([
  "uninstall",
  "setup",
  "install",
  "launcher",
  "updater",
  "crashhandler",
  "unitycrashhandler",
  "redist",
  "vcredist",
  "dxsetup",
  // Common DOS/Windows 3.x utility executables that are not the game
  "runexit",
  "autoexec",
  "config",
  "winhelp",
  "winhlp32",
  "freecell",
  "mshearts",
  "solitaire",
  "calc",
  "calendar",
  "cardfile",
  "charmap",
  "clock",
  "notepad",
  "pbrush",
  "mspaint",
  "write",
  "control",
  "drwatson",
  "drwatson32",
  "expand",
  "msd",
  "pifedit",
  "player",
  "packager",
  "clipsrv",
  "clipbrd",
  "mplayer",
  "winfile",
  "progman",
  "taskman",
  "readme",
  "readmecom",
  // Sound Blaster / driver utilities
  "ctcd",
  "ctconfig",
  "ctmidi",
  "ctmixer",
  "ctwav",
  "ctwave",
  "remote",
  "soundole",
  "diagnose",
  "mixer",
  "mixerset",
  "cqa",
  // Installer stubs
  "qtinstal",
  "loadwing",
  "wsetup",
  "winsetup",
  "win32s",
  "_mssetup",
  "_mstest",
  "sx"
]);

const JUNK_CONTAINS = [
  "unins",
  "settings",
  "dgvoodoo",
  "voodoo",
  "cpl",
];

const SYSTEM_DIR_NAMES = new Set([
  "windows",
  "winnt",
  "win95",
  "win98",
  "winme",
  "winxp",
  "win32s",
  "win32app",
  "system32",
  "syswow64",
  "drivers",
  "apps",
  "common files",
  "program files",
  "program files (x86)",
  "programdata",
  "directx",
  "directx9",
  "redist",
  "_commonredist",
  "_redist",
  "vcredist",
  "dotnet",
  "dotnetfx",
  "install",
  "setup",
  "scummvm",
  "openal",
  "physx",
  "nethood",
  "print hood",
  "recent",
  "sendto",
  "start menu",
  "templates",
  "sysbackup",
]);

function isSystemDir(dir: string): boolean {
  return SYSTEM_DIR_NAMES.has(basename(dir).toLowerCase());
}

function isJunkName(base: string): boolean {
  if (SKIP_NAMES.has(base)) return true;
  for (const name of SKIP_NAMES) {
    if (base.endsWith(` ${name}`) || base.endsWith(`_${name}`) || base.endsWith(`-${name}`)) {
      return true;
    }
  }
  for (const pattern of JUNK_CONTAINS) {
    if (base.includes(pattern)) return true;
  }
  return false;
}

function titleFromFilename(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUnityGame(exePath: string): boolean {
  const dir = dirname(exePath);
  const base = basename(exePath, extname(exePath));
  try {
    const entries = readdirSync(dir);
    return entries.some((e) => e.toLowerCase() === `${base.toLowerCase()}_data`);
  } catch {
    return false;
  }
}

const GENERIC_BAT_NAMES = new Set(["run", "play", "start", "game", "launch", "go"]);

function titleForWindowsGame(fullPath: string): string {
  const actualExt = extname(fullPath);
  const ext = actualExt.toLowerCase();
  const base = basename(fullPath, actualExt).toLowerCase();
  if (ext === ".bat" && GENERIC_BAT_NAMES.has(base)) {
    // Use the parent directory as the game title for generic launcher scripts
    const parent = basename(dirname(fullPath));
    if (parent && parent !== "/" && parent !== ".") return parent;
  }
  return titleFromFilename(basename(fullPath));
}

function hashId(prefix: string, fullPath: string): string {
  return `${prefix}_${createHash("sha256").update(fullPath).digest("hex").slice(0, 16)}`;
}

const WIN_GAME_EXTS = new Set([".exe", ".bat", ".com"]);

export function scanWindowsGames(gamePaths: string[] = [], romPaths: string[] = []): Game[] {
  const roots = [
    join(homedir(), "Games"),
    join(homedir(), "games"),
    ...gamePaths,
    ...romPaths,
  ].filter(existsSync);

  log.info("windows", `scanning roots: ${roots.join(", ")}`);
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    walkDir(root, (fullPath) => {
      const ext = extname(fullPath).toLowerCase();
      if (!WIN_GAME_EXTS.has(ext)) return;
      if (seen.has(fullPath)) {
        log.debug("windows", `skip duplicate path: ${fullPath}`);
        return;
      }

      const actualExt = extname(fullPath);
      const base = basename(fullPath, actualExt).toLowerCase();
      if (isJunkName(base)) {
        log.debug("windows", `skip junk ${ext} file: ${fullPath}`);
        return;
      }
      if (ext === ".exe" && (base.endsWith("_data") || base.startsWith("unity"))) {
        log.debug("windows", `skip unity data exe: ${fullPath}`);
        return;
      }

      seen.add(fullPath);
      const title = titleForWindowsGame(fullPath);
      const isUnity = ext === ".exe" && isUnityGame(fullPath);
      const id = hashId("win", fullPath);
      const installDir = dirname(fullPath);
      const detection = detectGameInfo(installDir, fullPath);
      log.debug("windows", `found ${title} → ${id} unity: ${isUnity} engine: ${detection.engine} path: ${fullPath}`);

      games.push({
        id,
        title,
        platform: "windows",
        romPath: fullPath,
        // execPath is set at launch time once the preferred runner is resolved
        tags: isUnity ? ["unity"] : [],
        sourceLocation: resolveSourceLocation(fullPath),
        source: "windows",
        osPlatform: detection.osPlatform,
        engine: detection.engine,
        engineVersion: detection.engineVersion,
        graphicsApi: detection.graphicsApi,
        entrypoints: detection.entrypoints.length > 0 ? detection.entrypoints : undefined,
      });
    });
  }

  log.info("windows", `total found: ${games.length}`);
  return games;
}

/**
 * Resolve the best available wine/proton runner for this machine and return
 * a ready-to-use execPath string for a given .exe path.
 */
export async function resolveWindowsExecPath(exePath: string): Promise<{ execPath: string; wineRunner: WineRunner }> {
  const runner = await detectWineRunner();
  if (runner === "proton-ge" || runner === "system-proton") {
    // buildWineCommand is used at launch time; here we just annotate the runner
    return { execPath: exePath, wineRunner: runner ?? "wine" };
  }
  // Default to wine
  return { execPath: exePath, wineRunner: "wine" };
}
