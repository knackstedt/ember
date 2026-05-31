import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";
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

const FLASH_EXTS = new Set([".swf"]);

function titleFromFilename(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashId(prefix: string, fullPath: string): string {
  return `${prefix}_${createHash("sha256").update(fullPath).digest("hex").slice(0, 16)}`;
}

export function scanFlashGames(): Game[] {
  const roots = [
    join(homedir(), "Roms"),
    join(homedir(), "ROMs"),
    join(homedir(), "Games"),
    join(homedir(), "games"),
    join(homedir(), "roms"),
  ].filter(existsSync);

  console.log("[flash] scanning roots:", roots);
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    walkDir(root, (fullPath) => {
      const ext = extname(fullPath).toLowerCase();
      if (!FLASH_EXTS.has(ext)) return;
      if (seen.has(fullPath)) {
        console.log("[flash] skip duplicate path:", fullPath);
        return;
      }
      seen.add(fullPath);

      const title = titleFromFilename(basename(fullPath));
      const id = hashId("flash", fullPath);
      console.log("[flash] found", title, "→", id, "path:", fullPath);

      games.push({
        id,
        title,
        platform: "flash",
        romPath: fullPath,
        execPath: `ruffle "${fullPath}"`,
        tags: [],
      });
    });
  }

  console.log("[flash] total found:", games.length);
  return games;
}
