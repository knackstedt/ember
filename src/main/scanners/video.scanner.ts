import { existsSync, readdirSync, statSync, lstatSync, mkdirSync, unlinkSync } from "fs";
import { join, extname, basename, resolve } from "path";
import { createHash } from "crypto";
import { exec, execSync, spawn } from "child_process";
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

let movieThumbCache: string;
try { movieThumbCache = join(app.getPath("userData"), "thumbnails", "movies"); } catch { movieThumbCache = join(process.cwd(), "thumbnails", "movies"); }
mkdirSync(movieThumbCache, { recursive: true });

let showThumbCache: string;
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

function findNodeExecutable(): string {
  for (const cmd of ["node", "bun"]) {
    try {
      const path = execSync(`which ${cmd}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
      if (path && existsSync(path)) return path;
    } catch { /* ignore */ }
  }
  return process.execPath;
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
      `ffprobe -hide_banner -loglevel error -v quiet -print_format json -show_streams -show_format "${filePath.replace(/"/g, '\\"')}"`,
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
      !line.startsWith("WARNING:") &&
      !line.startsWith("frame=") &&
      !line.startsWith("size=") &&
      !line.startsWith("Lsize=") &&
      !line.startsWith("time=") &&
      !line.startsWith("speed=") &&
      !line.startsWith("fps=") &&
      !line.startsWith("q=")
    ) {
      return line;
    }
  }
  return msg.slice(0, 200);
}

async function resolveThumbnailPath(filePath: string): Promise<string> {
  if (!filePath.startsWith("ember://remote/")) return filePath;
  const url = new URL(filePath);
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const sourceId = segments[0];
  let proxyPath = segments.slice(1).join("/");
  try {
    const { getServePort } = await import("../services/rclone-manager");
    const { RemoteSourceRepo } = await import("../db/repository.js");
    const port = await getServePort(sourceId);
    if (port) {
      try {
        const sources = await RemoteSourceRepo.list();
        const source = sources.find((s: any) => s.id === sourceId);
        const basePath = (source?.remotePath || "/").replace(/^\//, "");
        if (basePath && proxyPath.toLowerCase().startsWith(basePath.toLowerCase() + "/")) {
          proxyPath = proxyPath.slice(basePath.length + 1);
        } else if (basePath && proxyPath.toLowerCase() === basePath.toLowerCase()) {
          proxyPath = "";
        }
      } catch {
        /* ignore */
      }
      return `http://localhost:${port}/${proxyPath.split("/").map(encodeURIComponent).join("/")}`;
    }
  } catch { /* ignore */ }
  return filePath;
}

async function extractEmbeddedVideoCover(
  filePath: string,
  dest: string,
): Promise<boolean> {
  if (!(await checkFfmpeg())) return false;
  // Cover extraction requires parsing the container to locate the embedded
  // picture stream. Over HTTP/ember this is unreliable (especially for MKV
  // where ffmpeg may need range-request support), so skip it and fall back
  // to a frame thumbnail which works fine for remote files.
  if (
    filePath.startsWith("http://") ||
    filePath.startsWith("https://") ||
    filePath.startsWith("ember://")
  ) {
    return false;
  }
  try {
    const { stdout } = await execAsync(
      `ffprobe -hide_banner -loglevel warning -v quiet -select_streams v -show_entries stream_disposition=attached_pic -of json "${filePath.replace(/"/g, '\\"')}"`,
      { timeout: 30000 },
    );
    const data = JSON.parse(stdout);
    const streams = data.streams || [];
    const picIndex = streams.findIndex(
      (s: any) => s.disposition?.attached_pic === 1,
    );
    if (picIndex >= 0) {
      await execAsync(
        `ffmpeg -hide_banner -loglevel warning -i "${filePath.replace(/"/g, '\\"')}" -map 0:v:${picIndex} -frames:v 1 -q:v 2 -pix_fmt yuvj420p -y "${dest}"`,
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
    log.warn(
      "video.scanner",
      `extractEmbeddedVideoCover failed for ${filePath}: ${summarizeExecError(err)}`,
    );
    return false;
  }
}

async function tryNativeThumbnail(
  filePath: string,
  dest: string,
  seekMs: number,
): Promise<boolean> {
  const workerScript = join(__dirname, "thumbnail-worker.js");
  if (!existsSync(workerScript)) {
    log.warn("video.scanner", `thumbnail-worker not found at ${workerScript}`);
    return false;
  }

  const nodeExec = findNodeExecutable();
  const isElectron = nodeExec === process.execPath;
  const env: Record<string, string | undefined> = { ...process.env };
  if (isElectron) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(
        nodeExec,
        [workerScript, filePath, String(seekMs), dest, "480"],
        { env, stdio: ["ignore", "pipe", "pipe"] },
      );

      let stderr = "";
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code !== 0 && stderr) {
          reject(new Error(stderr.trim()));
        } else {
          resolve(code ?? -1);
        }
      });

      // Hard timeout — must exceed Rust mpv_renderer open() timeout (120s).
      setTimeout(() => {
        try { child.kill("SIGTERM"); } catch { /* ignore */ }
        reject(new Error("thumbnail-worker timed out"));
      }, 130000);
    });

    if (exitCode === 0 && existsSync(dest) && statSync(dest).size > 0) {
      return true;
    }
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
    return false;
  } catch (err) {
    if (isConnectionError(err)) throw err;
    log.warn(
      "video.scanner",
      `native thumbnail attempt failed for ${filePath} at ${seekMs}ms: ${summarizeExecError(err)}`,
    );
    return false;
  }
}

async function generateFrameThumbnail(
  filePath: string,
  dest: string,
  duration?: number,
): Promise<boolean> {
  let seekSec = 30;
  if (duration && duration > 0) {
    seekSec = Math.max(5, Math.min(Math.round(duration * 0.05), 300));
  }
  const seekMs = seekSec * 1000;

  // Use native mpv/libmpv thumbnail worker for consistent colorimetry.
  if (await tryNativeThumbnail(filePath, dest, seekMs)) return true;
  if (await tryNativeThumbnail(filePath, dest, 1000)) return true;
  log.warn(
    "video.scanner",
    `native thumbnail failed for ${filePath}, falling back to ffmpeg`,
  );

  if (!(await checkFfmpeg())) return false;

  const hh = String(Math.floor(seekSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seekSec % 3600) / 60)).padStart(2, "0");
  const ss = String(seekSec % 60).padStart(2, "0");
  const primarySeek = `${hh}:${mm}:${ss}`;

  const tryCapture = async (
    seek: string,
    filter?: string,
  ): Promise<boolean> => {
    try {
      const vf = filter
        ? `-vf "${filter}"`
        : '-vf "scale=480:-1"';
      await execAsync(
        `ffmpeg -hide_banner -loglevel error -ss ${seek} -i "${filePath.replace(/"/g, '\\"')}" -frames:v 1 -q:v 2 ${vf} -pix_fmt yuvj420p -y "${dest}"`,
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
      if (isConnectionError(err)) throw err;
      log.warn(
        "video.scanner",
        `ffmpeg thumbnail attempt failed for ${filePath} at ${seek}${filter ? " (HDR tone-map)" : ""}: ${summarizeExecError(err)}`,
      );
      return false;
    }
  };

  // Primary seek with HDR tone mapping (matches mpv's default hable).
  if (await tryCapture(primarySeek, "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable,zscale=t=bt709:m=bt709:r=tv,scale=480:-1")) return true;
  if (await tryCapture("00:00:01", "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable,zscale=t=bt709:m=bt709:r=tv,scale=480:-1")) return true;

  // Fallback without HDR filters (for ffmpeg builds lacking zscale).
  if (await tryCapture(primarySeek)) return true;
  if (await tryCapture("00:00:01")) return true;

  log.error(
    "video.scanner",
    `generateFrameThumbnail failed for ${filePath}`,
  );
  return false;
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
  const resolvedPath = await resolveThumbnailPath(filePath);
  const hasEmbedded = await extractEmbeddedVideoCover(resolvedPath, dest);
  if (hasEmbedded) {
    return `ember://thumbnails/movies/${id}.jpg`;
  }
  const generated = await generateFrameThumbnail(resolvedPath, dest, duration);
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
  const resolvedPath = await resolveThumbnailPath(firstEp.path);
  const hasEmbedded = await extractEmbeddedVideoCover(resolvedPath, dest);
  if (hasEmbedded) {
    return `ember://thumbnails/tv/${id}.jpg`;
  }
  const generated = await generateFrameThumbnail(resolvedPath, dest);
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
      const lstat = lstatSync(full);
      if (lstat.isSymbolicLink()) continue;
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
        title: probe?.title || name,
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
