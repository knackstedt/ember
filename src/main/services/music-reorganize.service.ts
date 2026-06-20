import { join, dirname, basename, extname } from "path";
import {
  existsSync,
  renameSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { MusicTrack, ReorganizeMove, ReorganizeResult } from "../../shared/types";
import { MusicRepo } from "../db/repository";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const PREDEFINED_PATTERNS: Record<string, string> = {
  "artist/album/track": "{artist}/{album}/{trackNumber}{title}{ext}",
  "artist - album/track": "{artist} - {album}/{trackNumber}{title}{ext}",
  "genre/artist/album/track": "{genre}/{artist}/{album}/{trackNumber}{title}{ext}",
  "year - artist/album/track": "{year} - {artist}/{album}/{trackNumber}{title}{ext}",
  flat: "{title}{ext}",
};

const SIDECAR_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
  ".cue", ".lrc", ".txt", ".log", ".m3u", ".m3u8",
]);

const COVER_NAMES = new Set([
  "cover", "folder", "albumart", "front", "back", "cd",
]);

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "")
    || "unknown";
}

function padNumber(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || isNaN(n)) return "";
  return String(n).padStart(digits, "0");
}

function formatTrackNumber(track: MusicTrack): string {
  const num = track.trackNumber;
  if (num === undefined || num === null || isNaN(num)) return "";
  const disc = track.discNumber;
  let result: string;
  if (disc !== undefined && disc !== null && !isNaN(disc) && disc > 1) {
    result = `${disc}-${padNumber(num)}`;
  } else {
    result = padNumber(num);
  }
  return result ? `${result} ` : "";
}

function getPatternString(pattern: string): string {
  return PREDEFINED_PATTERNS[pattern] || pattern;
}

function computeTargetPath(track: MusicTrack, pattern: string, rootDir: string): string {
  const p = getPatternString(pattern);
  const ext = extname(track.filePath);

  const tokens: Record<string, string> = {
    artist: sanitizeFilename(track.artist || "Unknown Artist"),
    albumArtist: sanitizeFilename(track.albumArtist || track.artist || "Unknown Artist"),
    album: sanitizeFilename(track.album || "Unknown Album"),
    genre: sanitizeFilename(track.genre || "Unknown Genre"),
    year: track.year ? String(track.year) : "Unknown Year",
    trackNumber: formatTrackNumber(track),
    title: sanitizeFilename(track.title || "Unknown Title"),
    discNumber: track.discNumber ? String(track.discNumber) : "",
    ext,
  };

  let relativePath = p;
  for (const [key, value] of Object.entries(tokens)) {
    relativePath = relativePath.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }

  // Clean up any double slashes or trailing slashes
  relativePath = relativePath.replace(/\/+/g, "/").replace(/\/$/, "");

  // Remove leading slash if present
  relativePath = relativePath.replace(/^\//, "");

  return join(rootDir, relativePath);
}

function findSidecars(filePath: string): string[] {
  const dir = dirname(filePath);
  const base = basename(filePath, extname(filePath));
  const results: string[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const entryPath = join(dir, entry);
      try {
        if (!statSync(entryPath).isFile()) continue;
      } catch {
        continue;
      }

      const entryBase = basename(entry, extname(entry));
      const entryExt = extname(entry).toLowerCase();

      // Same basename files (e.g., song.cue, song.lrc)
      if (entryBase === base && SIDECAR_EXTS.has(entryExt)) {
        results.push(entryPath);
        continue;
      }

      // Cover images with common names
      if (COVER_NAMES.has(entryBase.toLowerCase()) && [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(entryExt)) {
        results.push(entryPath);
        continue;
      }
    }
  } catch {
    // ignore unreadable dirs
  }

  return results;
}

function ensureUniquePath(targetPath: string): string {
  if (!existsSync(targetPath)) return targetPath;

  const dir = dirname(targetPath);
  const ext = extname(targetPath);
  const base = basename(targetPath, ext);
  let counter = 1;
  let candidate: string;

  do {
    candidate = join(dir, `${base} (${counter})${ext}`);
    counter++;
  } while (existsSync(candidate));

  return candidate;
}

function moveFileSafely(oldPath: string, newPath: string): void {
  const targetDir = dirname(newPath);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Try atomic rename first
  try {
    renameSync(oldPath, newPath);
  } catch (err: any) {
    // EXDEV or other error: fall back to copy + delete
    if (err?.code === "EXDEV" || err?.code === "EPERM" || err?.code === "EACCES") {
      copyFileSync(oldPath, newPath);
      // Verify copy exists before deleting source
      if (!existsSync(newPath)) {
        throw new Error(`Copy verification failed: ${newPath} does not exist after copy`);
      }
      unlinkSync(oldPath);
    } else {
      throw err;
    }
  }

  // Final verification
  if (!existsSync(newPath)) {
    throw new Error(`Destination file missing after move: ${newPath}`);
  }
}

function findRootDir(track: MusicTrack, musicPaths: string[], rawPattern: string): string {
  // Flat pattern: keep files in their current directory
  if (rawPattern === "flat") {
    return dirname(track.filePath);
  }
  // Find which music path root this track belongs to
  for (const root of musicPaths) {
    if (track.filePath.startsWith(root)) {
      return root;
    }
  }
  // Fallback to parent directory of the track
  return dirname(track.filePath);
}

export async function previewReorganize(
  pattern: string,
  musicPaths: string[],
): Promise<ReorganizeResult> {
  return reorganizeMusic(pattern, musicPaths, true);
}

export async function executeReorganize(
  pattern: string,
  musicPaths: string[],
): Promise<ReorganizeResult> {
  return reorganizeMusic(pattern, musicPaths, false);
}

async function reorganizeMusic(
  pattern: string,
  musicPaths: string[],
  dryRun: boolean,
): Promise<ReorganizeResult> {
  const moves: ReorganizeMove[] = [];
  const errors: { id: string; error: string }[] = [];

  if (!pattern || pattern.trim() === "") {
    return { moves: [], errors: [{ id: "", error: "No pattern provided" }] };
  }

  const tracks = await MusicRepo.list();
  const localTracks = tracks.filter(
    (t) => t.filePath && !t.missing && (!t.sourceLocation || t.sourceLocation === "local"),
  );

  log.info("music:reorganize", `Processing ${localTracks.length} local tracks with pattern: ${pattern}`);

  for (const track of localTracks) {
    try {
      const rootDir = findRootDir(track, musicPaths, pattern);
      let targetPath = computeTargetPath(track, pattern, rootDir);

      if (targetPath === track.filePath) {
        continue; // No change needed
      }

      targetPath = ensureUniquePath(targetPath);

      const sidecarOldPaths = findSidecars(track.filePath);
      const sidecars: { oldPath: string; newPath: string }[] = [];

      for (const sidecarOld of sidecarOldPaths) {
        const sidecarBase = basename(sidecarOld);
        const musicBase = basename(track.filePath, extname(track.filePath));
        const sidecarTargetBase = basename(targetPath, extname(targetPath));

        // If sidecar shares the music file's basename, rename it to match the new basename
        let sidecarTargetName: string;
        if (basename(sidecarOld, extname(sidecarOld)) === musicBase) {
          sidecarTargetName = `${sidecarTargetBase}${extname(sidecarOld)}`;
        } else {
          sidecarTargetName = sidecarBase;
        }

        const sidecarNewPath = ensureUniquePath(join(dirname(targetPath), sidecarTargetName));
        sidecars.push({ oldPath: sidecarOld, newPath: sidecarNewPath });
      }

      moves.push({
        id: track.id,
        oldPath: track.filePath,
        newPath: targetPath,
        sidecars,
      });

      if (!dryRun) {
        try {
          moveFileSafely(track.filePath, targetPath);
        } catch (err: any) {
          errors.push({ id: track.id, error: `Move main file failed: ${err?.message ?? String(err)}` });
          continue; // Skip sidecars if main file failed
        }

        for (const sidecar of sidecars) {
          try {
            moveFileSafely(sidecar.oldPath, sidecar.newPath);
          } catch (err: any) {
            errors.push({ id: track.id, error: `Move sidecar failed: ${err?.message ?? String(err)}` });
          }
        }

        // Update DB
        try {
          await MusicRepo.upsert({ ...track, filePath: targetPath });
        } catch (err: any) {
          errors.push({ id: track.id, error: `DB update failed: ${err?.message ?? String(err)}` });
        }
      }
    } catch (err: any) {
      errors.push({ id: track.id, error: err?.message ?? String(err) });
    }
  }

  log.info("music:reorganize", `Done. Moves: ${moves.length}, Errors: ${errors.length}`);
  return { moves, errors };
}
