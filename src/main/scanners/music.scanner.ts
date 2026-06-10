import { existsSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { createHash } from "crypto";
import { loadMusicMetadata } from "music-metadata";
import { getXdgMusicDir } from "./xdg";
import { MusicTrack } from "../../shared/types";
import { resolveSourceLocation } from "../../shared/path-utils";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const AUDIO_EXTS = new Set([
  ".mp3",
  ".flac",
  ".ogg",
  ".m4a",
  ".aac",
  ".wav",
  ".opus",
  ".wma",
]);

let musicMetadata: any = null;

async function getMusicMetadata() {
  if (!musicMetadata) musicMetadata = await loadMusicMetadata();
  return musicMetadata;
}

function walkDir(dir: string, results: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walkDir(full, results);
      } else if (AUDIO_EXTS.has(extname(entry).toLowerCase())) {
        results.push(full);
      }
    } catch {
      continue;
    }
  }
}

export async function scanMusicFiles(
  extraPaths: string[] = [],
): Promise<MusicTrack[]> {
  const roots = [getXdgMusicDir(), ...extraPaths].filter(existsSync);
  log.info("music:scan", `roots: ${roots.join(", ")}`);
  const allFiles: string[] = [];
  for (const root of roots) walkDir(root, allFiles);
  log.info("music:scan", `found ${allFiles.length} audio files`);

  const tracks: MusicTrack[] = [];

  for (let i = 0; i < allFiles.length; i++) {
    const filePath = allFiles[i];
    if (i % 100 === 0)
      log.info(
        "music:scan",
        `parsing ${i + 1}/${allFiles.length} ${filePath}`,
      );
    try {
      const mm = await getMusicMetadata();
      const meta = await mm.parseFile(filePath, { skipCovers: true });
      const { title, artist, album, genre, year, track } = meta.common;
      const id = createHash("md5").update(filePath).digest("hex").slice(0, 16);

      tracks.push({
        id,
        title:
          title ??
          filePath
            .split("/")
            .pop()!
            .replace(/\.[^.]+$/, ""),
        filePath,
        artist,
        album,
        albumArtUrl: undefined,
        genre: Array.isArray(genre) ? genre[0] : genre,
        year,
        trackNumber: track?.no ?? undefined,
        duration: meta.format.duration,
        tags: [],
        hidden: false,
        sourceLocation: resolveSourceLocation(filePath),
      });
    } catch (err: any) {
      log.error(
        "music:scan",
        `failed to parse ${filePath}: ${err?.message ?? String(err)}`,
      );
      continue;
    }
  }

  log.info("music:scan", `completed, tracks: ${tracks.length}`);
  return tracks;
}
