/**
 * Media access allowlist.
 *
 * Decides which filesystem paths the renderer is permitted to read via
 * `ember://media/...` URLs and the `files:read` IPC channel. The renderer is
 * a trusted context for its own library, but plugin iframes and third-party
 * content should not be able to exfiltrate arbitrary files.
 *
 * Allowed:
 *   - anything under userData (covers, thumbnails, caches, db)
 *   - anything under configured scan roots (settings) and auto-detected
 *     default scan sources
 *   - any path recorded in the library DB, plus its sibling files
 *     (covers/subtitles/sidecars next to recorded media)
 *   - paths registered at runtime via registerAllowedPath() (dialog picks)
 *   - XDG media dirs
 *
 * Directory entries are realpath'd so symlinks inside a media dir cannot
 * escape to unrelated locations.
 */

import { app } from "electron";
import { dirname, resolve, sep, join } from "path";
import { realpathSync } from "fs";
import { homedir } from "os";
import { getDb } from "../db";
import { getSettings } from "./settings.service";
import { getDefaultScanSources } from "../scanners/defaults";
import { getXdgMusicDir, getXdgVideosDir } from "../scanners/xdg";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const CACHE_TTL_MS = 30_000;

let cachedDirs: Set<string> | null = null;
let cachedFiles: Set<string> | null = null;
let cacheExpiresAt = 0;
let building: Promise<void> | null = null;

/** Paths explicitly allowed at runtime (e.g. user-picked via file dialog). */
const runtimeDirs = new Set<string>();
const runtimeFiles = new Set<string>();

function normalize(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** Convert a stored value (raw path or ember://media / file:// URL) to a local path. */
export function toLocalPath(value: string | undefined | null): string | null {
  if (!value || typeof value !== "string") return null;
  let v = value;
  if (v.startsWith("ember://remote/") || v.startsWith("http://") || v.startsWith("https://")) {
    return null;
  }
  if (v.startsWith("ember://media")) {
    v = v.slice("ember://media".length);
  } else if (v.startsWith("ember://")) {
    // covers/thumbnails/other hosts are already rooted under userData
    return null;
  } else if (v.startsWith("file://")) {
    v = v.slice("file://".length);
  }
  try {
    v = decodeURIComponent(v);
  } catch {
    return null;
  }
  if (!v.startsWith("/")) return null;
  return v;
}

async function collectDbPaths(dirs: Set<string>, files: Set<string>): Promise<void> {
  const db = getDb();
  const queries = [
    "SELECT romPath, execPath, installPath, compressedRomPath, coverUrl, bannerUrl FROM game",
    "SELECT filePath, coverUrl, backdropUrl FROM movie",
    "SELECT filePath, albumArtUrl FROM music_track",
    "SELECT dirPath, coverUrl, backdropUrl FROM tv_show",
  ];
  for (const q of queries) {
    try {
      const result = (await db.query<[Record<string, unknown>[]]>(q)) ?? [];
      const rows = result[0] ?? [];
      for (const row of rows) {
        for (const v of Object.values(row)) {
          const p = toLocalPath(v as string);
          if (!p) continue;
          const n = normalize(p);
          files.add(n);
          dirs.add(dirname(n));
        }
      }
    } catch (err) {
      log.warn("media-access", `path collection failed: ${err}`);
    }
  }
}

async function rebuild(): Promise<void> {
  const dirs = new Set<string>();
  const files = new Set<string>();
  const addDir = (p: string | undefined | null) => {
    if (!p) return;
    try {
      dirs.add(normalize(p));
    } catch { /* ignore */ }
  };

  try {
    addDir(app.getPath("userData"));
  } catch { /* app not ready */ }
  addDir(join(homedir(), ".config", "htpc"));

  addDir(getXdgVideosDir());
  addDir(getXdgMusicDir());
  addDir(join(homedir(), "Pictures"));

  try {
    const settings = await getSettings();
    for (const p of [
      ...(settings.romPaths ?? []),
      ...(settings.gamePaths ?? []),
      ...(settings.moviePaths ?? []),
      ...(settings.musicPaths ?? []),
      ...(settings.tvPaths ?? []),
    ]) {
      addDir(p);
    }
  } catch (err) {
    log.warn("media-access", `failed to load settings paths: ${err}`);
  }

  try {
    const defaults = getDefaultScanSources();
    for (const list of Object.values(defaults)) {
      if (!Array.isArray(list)) continue;
      for (const p of list) addDir(p);
    }
  } catch (err) {
    log.warn("media-access", `failed to load default scan sources: ${err}`);
  }

  await collectDbPaths(dirs, files);

  for (const p of runtimeDirs) dirs.add(p);
  for (const p of runtimeFiles) {
    files.add(p);
    dirs.add(dirname(p));
  }

  cachedDirs = dirs;
  cachedFiles = files;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  log.debug("media-access", `allowlist rebuilt: ${dirs.size} dirs, ${files.size} files`);
}

async function getSets(): Promise<{ dirs: Set<string>; files: Set<string> }> {
  if (cachedDirs && cachedFiles && Date.now() < cacheExpiresAt) {
    return { dirs: cachedDirs, files: cachedFiles };
  }
  if (!building) {
    building = rebuild().finally(() => {
      building = null;
    });
  }
  await building;
  return { dirs: cachedDirs!, files: cachedFiles! };
}

export function invalidateMediaAccessCache(): void {
  cachedDirs = null;
  cachedFiles = null;
  cacheExpiresAt = 0;
}

/** Allow a user-picked path (file or directory) for subsequent media reads. */
export function registerAllowedPath(p: string, isDirectory = false): void {
  const n = normalize(p);
  if (isDirectory) {
    runtimeDirs.add(n);
  } else {
    runtimeFiles.add(n);
  }
  invalidateMediaAccessCache();
}

/**
 * True if the renderer may read `input` (raw abs path or ember://media URL).
 * Never throws; denies on error.
 */
export async function isMediaAccessAllowed(input: string): Promise<boolean> {
  const local = toLocalPath(input) ?? (input.startsWith("/") ? input : null);
  if (!local) return false;
  const norm = normalize(local);
  const { dirs, files } = await getSets();
  if (files.has(norm)) return true;
  for (const d of dirs) {
    if (norm === d || norm.startsWith(d + sep)) return true;
  }
  return false;
}
