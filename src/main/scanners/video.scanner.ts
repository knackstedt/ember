import { existsSync, readdirSync, statSync, mkdirSync, unlinkSync } from "fs";
import { join, extname, basename, resolve } from "path";
import { createHash } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { app } from "electron";
import { getXdgVideosDir } from "./xdg";
import { Movie, TVShow, TVSeason, TVEpisode } from "../../shared/types";
import { resolveSourceLocation } from "../../shared/path-utils";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const execAsync = promisify(exec);

const VIDEO_EXTS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".m4v",
  ".ts",
  ".m2ts",
  ".webm",
  ".flv",
]);

const TV_PATTERN = /[Ss](\d+)[Ee](\d+)/;

let movieThumbCache;
try { movieThumbCache = join(app.getPath("userData"), "thumbnails", "movies"); } catch { movieThumbCache = join(process.cwd(), "thumbnails", "movies"); }
mkdirSync(movieThumbCache, { recursive: true });

let showThumbCache;
try { showThumbCache = join(app.getPath("userData"), "thumbnails", "tv"); } catch { showThumbCache = join(process.cwd(), "thumbnails", "tv"); }
mkdirSync(showThumbCache, { recursive: true });

let ffmpegAvailable: boolean | undefined;

export async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== undefined) return ffmpegAvailable;
  try {
    await execAsync("ffmpeg -version", { timeout: 5000 });
    log.info("video.scanner", "ffmpeg is available");
    ffmpegAvailable = true;
  } catch {
    log.warn(
      "video.scanner",
      "ffmpeg NOT found in PATH — thumbnails will not be generated",
    );
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

interface FfprobeStream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  disposition?: { attached_pic?: number };
}

interface FfprobeData {
  streams?: FfprobeStream[];
  format?: { duration?: string; tags?: Record<string, string> };
}

async function probVideo(filePath: string): Promise<{
  duration?: number;
  resolution?: string;
  codec?: string;
  title?: string;
} | null> {
  if (!(await checkFfmpeg())) return null;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams -show_format "${filePath.replace(/"/g, '\\"')}"`,
      { timeout: 30000 },
    );
    const data: FfprobeData = JSON.parse(stdout);
    const video = data.streams?.find(
      (s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1,
    );
    return {
      duration: data.format?.duration
        ? parseFloat(data.format.duration)
        : undefined,
      resolution: video ? `${video.width}x${video.height}` : undefined,
      codec: video?.codec_name,
      title: data.format?.tags?.title,
    };
  } catch (err) {
    log.error("video.scanner", `ffprobe failed for ${filePath}: ${err}`);
    return null;
  }
}

function isConnectionError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes("Connection refused") || msg.includes("ECONNREFUSED");
}

function summarizeExecError(err: unknown): string {
  const stderr = (err as any)?.stderr;
  const msg = typeof stderr === "string" && stderr.trim()
    ? stderr
    : String(err);
  const lines = msg.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (
      line &&
      !line.startsWith("built with") &&
      !line.startsWith("configuration:") &&
      !line.startsWith("  --") &&
      !line.startsWith("lib") &&
      !line.startsWith("WARNING:")
    ) {
      return line;
    }
  }
  return msg.slice(0, 200);
}

async function extractEmbeddedVideoCover(
  filePath: string,
  dest: string,
): Promise<boolean> {
  if (!(await checkFfmpeg())) return false;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams v -show_entries stream_disposition=attached_pic -of json "${filePath.replace(/"/g, '\\"')}"`,
      { timeout: 30000 },
    );
    const data = JSON.parse(stdout);
    const streams = data.streams || [];
    const picIndex = streams.findIndex(
      (s: any) => s.disposition?.attached_pic === 1,
    );
    if (picIndex >= 0) {
      await execAsync(
        `ffmpeg -i "${filePath.replace(/"/g, '\\"')}" -map 0:v:${picIndex} -frames:v 1 -q:v 2 -y "${dest}"`,
        { timeout: 30000 },
      );
      if (existsSync(dest) && statSync(dest).size > 0) return true;
      try {
        unlinkSync(dest);
      } catch {
        /* ignore */
      }
      return false;
    }
    return false;
  } catch (err) {
    if (isConnectionError(err)) {
      throw err; // Let caller retry with restarted serve
    }
    log.error(
      "video.scanner",
      `extractEmbeddedVideoCover failed: ${summarizeExecError(err)}`,
    );
    return false;
  }
}

async function generateFrameThumbnail(
  filePath: string,
  dest: string,
  duration?: number,
): Promise<boolean> {
  if (!(await checkFfmpeg())) return false;
  try {
    let seekSec = 30;
    if (duration && duration > 0) {
      seekSec = Math.max(5, Math.min(Math.round(duration * 0.1), 300));
    }
    const hh = String(Math.floor(seekSec / 3600)).padStart(2, "0");
    const mm = String(Math.floor((seekSec % 3600) / 60)).padStart(2, "0");
    const ss = String(seekSec % 60).padStart(2, "0");
    const seek = `${hh}:${mm}:${ss}`;
    await execAsync(
      `ffmpeg -ss ${seek} -i "${filePath.replace(/"/g, '\\"')}" -frames:v 1 -q:v 2 -vf "scale=480:-1" -y "${dest}"`,
      { timeout: 30000 },
    );
    if (existsSync(dest) && statSync(dest).size > 0) return true;
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
    return false;
  } catch (err) {
    if (isConnectionError(err)) {
      throw err; // Let caller retry with restarted serve
    }
    log.error(
      "video.scanner",
      `generateFrameThumbnail failed: ${summarizeExecError(err)}`,
    );
    return false;
  }
}

export async function generateMovieThumbnail(
  filePath: string,
  id: string,
  duration?: number,
): Promise<string | undefined> {
  log.debug("video.scanner", `generateMovieThumbnail filePath=${filePath}`);
  const dest = join(movieThumbCache, `${id}.jpg`);
  if (existsSync(dest)) {
    try {
      if (statSync(dest).size > 0)
        return `ember://thumbnails/movies/${id}.jpg`;
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
  }
  const hasEmbedded = await extractEmbeddedVideoCover(filePath, dest);
  if (hasEmbedded) {
    return `ember://thumbnails/movies/${id}.jpg`;
  }
  const generated = await generateFrameThumbnail(filePath, dest, duration);
  if (generated) {
    return `ember://thumbnails/movies/${id}.jpg`;
  }
  log.warn("video.scanner", `No thumbnail generated for ${filePath}`);
  return undefined;
}

export async function generateShowThumbnail(
  dirPath: string,
  episodes: { season: number; ep: number; path: string }[],
  id: string,
): Promise<string | undefined> {
  const dest = join(showThumbCache, `${id}.jpg`);
  if (existsSync(dest)) {
    try {
      if (statSync(dest).size > 0)
        return `ember://thumbnails/tv/${id}.jpg`;
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
  }
  const firstEp = episodes
    .sort((a, b) => a.season - b.season || a.ep - b.ep)[0];
  if (!firstEp) return undefined;
  const hasEmbedded = await extractEmbeddedVideoCover(firstEp.path, dest);
  if (hasEmbedded) {
    return `ember://thumbnails/tv/${id}.jpg`;
  }
  const generated = await generateFrameThumbnail(firstEp.path, dest);
  if (generated) {
    return `ember://thumbnails/tv/${id}.jpg`;
  }
  log.warn("video.scanner", `No thumbnail generated for show ${dirPath}`);
  return undefined;
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
      } else if (VIDEO_EXTS.has(extname(entry).toLowerCase())) {
        results.push(full);
      }
    } catch {
      continue;
    }
  }
}

function isTvEpisode(filePath: string): boolean {
  return TV_PATTERN.test(basename(filePath));
}

export async function scanMovieFiles(
  extraPaths: string[] = [],
  onProgress?: (current: number, total: number) => void,
): Promise<Movie[]> {
  const roots = [getXdgVideosDir(), ...extraPaths]
    .map((p) => resolve(p))
    .filter(existsSync);
  const allFiles: string[] = [];
  for (const root of roots) walkDir(root, allFiles);

  const movies: Movie[] = [];
  const total = allFiles.length;

  for (let i = 0; i < allFiles.length; i++) {
    const filePath = allFiles[i];
    onProgress?.(i, total);

    if (isTvEpisode(filePath)) continue;
    try {
      const probe = await probVideo(filePath);
      const name = basename(filePath, extname(filePath))
        .replace(/\.\d{4}\..*$/, "")
        .replace(/[._]/g, " ")
        .trim();

      const id = createHash("md5").update(filePath).digest("hex").slice(0, 16);
      const coverUrl = await generateMovieThumbnail(
        filePath,
        id,
        probe?.duration,
      );

      movies.push({
        id,
        title: probe?.title ?? name,
        filePath,
        coverUrl,
        runtime: probe?.duration ? Math.round(probe.duration) : undefined,
        resolution: probe?.resolution,
        codec: probe?.codec,
        tags: [],
        hidden: false,
        sourceLocation: resolveSourceLocation(filePath),
      });
    } catch (err) {
      log.error(
        "video.scanner",
        `Unhandled error processing file: ${filePath}: ${err}`,
      );
    }
  }

  onProgress?.(total, total);
  return movies;
}

export async function scanTvShows(
  extraPaths: string[] = [],
): Promise<TVShow[]> {
  const roots = [getXdgVideosDir(), ...extraPaths].filter(existsSync);
  const showMap = new Map<
    string,
    { episodes: { season: number; ep: number; path: string }[] }
  >();

  for (const root of roots) {
    let dirs: string[];
    try {
      dirs = readdirSync(root);
    } catch {
      continue;
    }
    for (const dir of dirs) {
      const showPath = join(root, dir);
      if (!statSync(showPath).isDirectory()) continue;
      const epFiles: string[] = [];
      walkDir(showPath, epFiles);
      const tvEps = epFiles.filter((f) => isTvEpisode(f));
      if (tvEps.length === 0) continue;

      const episodes = tvEps.map((f) => {
        const m = TV_PATTERN.exec(basename(f))!;
        return { season: parseInt(m[1]), ep: parseInt(m[2]), path: f };
      });

      showMap.set(showPath, { episodes });
    }
  }

  const shows: TVShow[] = [];

  for (const [dirPath, { episodes }] of showMap) {
    const seasonMap = new Map<number, TVEpisode[]>();
    for (const { season, ep, path } of episodes) {
      if (!seasonMap.has(season)) seasonMap.set(season, []);
      seasonMap.get(season)!.push({ episodeNumber: ep, filePath: path });
    }

    const seasons: TVSeason[] = [...seasonMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([seasonNumber, eps]) => ({
        seasonNumber,
        episodes: eps.sort((a, b) => a.episodeNumber - b.episodeNumber),
      }));

    const title = basename(dirPath).replace(/[._]/g, " ").trim();
    const id = createHash("md5").update(dirPath).digest("hex").slice(0, 16);
    const coverUrl = await generateShowThumbnail(dirPath, episodes, id);

    shows.push({ id, title, dirPath, seasons, coverUrl, tags: [], sourceLocation: resolveSourceLocation(dirPath) });
  }

  return shows;
}
