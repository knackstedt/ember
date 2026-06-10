import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename, dirname } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { Game, WineRunner } from "../../shared/types";
import { resolveSourceLocation } from "../../shared/path-utils";
import { createLogger } from "../util/logger";
import { detectWineRunner } from "../services/wine-detection.service";

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
]);

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

function hashId(prefix: string, fullPath: string): string {
  return `${prefix}_${createHash("sha256").update(fullPath).digest("hex").slice(0, 16)}`;
}

export function scanWindowsGames(): Game[] {
  const roots = [
    join(homedir(), "Games"),
    join(homedir(), "games"),
  ].filter(existsSync);

  log.info("windows", `scanning roots: ${roots.join(", ")}`);
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    walkDir(root, (fullPath) => {
      const ext = extname(fullPath).toLowerCase();
      if (ext !== ".exe") return;
      if (seen.has(fullPath)) {
        log.info("windows", `skip duplicate path: ${fullPath}`);
        return;
      }

      const base = basename(fullPath, ".exe").toLowerCase();
      if (SKIP_NAMES.has(base)) {
        log.info("windows", `skip junk exe: ${fullPath}`);
        return;
      }
      if (base.endsWith("_data") || base.startsWith("unity")) {
        log.info("windows", `skip unity data exe: ${fullPath}`);
        return;
      }

      seen.add(fullPath);
      const title = titleFromFilename(basename(fullPath));
      const isUnity = isUnityGame(fullPath);
      const id = hashId("win", fullPath);
      log.debug("windows", `found ${title} → ${id} unity: ${isUnity} path: ${fullPath}`);

      games.push({
        id,
        title,
        platform: "windows",
        romPath: fullPath,
        // execPath is set at launch time once the preferred runner is resolved
        tags: isUnity ? ["unity"] : [],
        sourceLocation: resolveSourceLocation(fullPath),
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
