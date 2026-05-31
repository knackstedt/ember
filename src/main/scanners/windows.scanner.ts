import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename, dirname } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { Game } from "../../shared/types";

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

  console.log("[windows] scanning roots:", roots);
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    walkDir(root, (fullPath) => {
      const ext = extname(fullPath).toLowerCase();
      if (ext !== ".exe") return;
      if (seen.has(fullPath)) {
        console.log("[windows] skip duplicate path:", fullPath);
        return;
      }

      const base = basename(fullPath, ".exe").toLowerCase();
      if (SKIP_NAMES.has(base)) {
        console.log("[windows] skip junk exe:", fullPath);
        return;
      }
      if (base.endsWith("_data") || base.startsWith("unity")) {
        console.log("[windows] skip unity data exe:", fullPath);
        return;
      }

      seen.add(fullPath);
      const title = titleFromFilename(basename(fullPath));
      const isUnity = isUnityGame(fullPath);
      const id = hashId("win", fullPath);
      console.log("[windows] found", title, "→", id, "unity:", isUnity, "path:", fullPath);

      games.push({
        id,
        title,
        platform: "desktop",
        romPath: fullPath,
        execPath: `wine "${fullPath}"`,
        tags: isUnity ? ["unity"] : [],
      });
    });
  }

  console.log("[windows] total found:", games.length);
  return games;
}
