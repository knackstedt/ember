import { createHash } from "crypto";
import { extname, basename } from "path";
import { promisify } from "util";
import { exec } from "child_process";
import { RemoteSource } from "../../shared/types";
import { Movie, MusicTrack, Game, GamePlatform, AudioTrackInfo, SubtitleTrackInfo, ChapterInfo } from "../../shared/types";
import { createLogger } from "../util/logger";
import { getRemoteFileList, startServe, getServePort, restartServe, listRemotes } from "./rclone-manager";
import { MovieRepo, MusicRepo, GameRepo } from "../db/repository";
import { applyCorruptPolicy } from "./settings.service";
import { generateMovieThumbnail } from "../scanners/video.scanner";

export interface ScanItemEvent {
  type: "movie" | "music" | "rom";
  item: Movie | MusicTrack | Game;
  pending: boolean;
}

type SendScanItem = (event: ScanItemEvent) => void;

const log = createLogger("info");
const execAsync = promisify(exec);

/* ------------------------------------------------------------------ */
/*  Extension sets                                                        */
/* ------------------------------------------------------------------ */

const VIDEO_EXTS = new Set([
  ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".ts", ".m2ts", ".webm", ".flv",
]);

const AUDIO_EXTS = new Set([
  ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".wav", ".opus", ".wma",
]);

const TV_PATTERN = /[Ss](\d+)[Ee](\d+)/;

/* ------------------------------------------------------------------ */
/*  Helpers: walk remote tree via rclone list API                       */
/* ------------------------------------------------------------------ */

async function walkRemote(
  source: RemoteSource,
  remotePath: string,
  onFile: (path: string) => void,
  onProgress?: (current: number) => void,
): Promise<void> {
  let queue: string[] = [remotePath];
  let processed = 0;

  while (queue.length > 0) {
    const dir = queue.shift()!;
    log.debug("remote:scan:walk", `listing dir=${dir}`);
    try {
      const items = await getRemoteFileList(source, dir);
      log.debug("remote:scan:walk", `dir=${dir} returned ${items.length} items`);
      for (const item of items) {
        log.debug("remote:scan:walk", `  item name=${item.name} isDir=${item.isDir}`);
        if (!item.name) continue; // skip empty names
        const itemPath = dir === "/" ? `/${item.name}` : `${dir}/${item.name}`;
        if (item.isDir) {
          log.debug("remote:scan:walk", `  -> queue dir ${itemPath}`);
          queue.push(itemPath);
        } else {
          log.debug("remote:scan:walk", `  -> file ${itemPath}`);
          onFile(itemPath);
        }
      }
      processed++;
      onProgress?.(processed);
    } catch (err) {
      log.warn("remote:scan", `failed to list ${dir}: ${err}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers: verify/restart serve before file operations               */
/* ------------------------------------------------------------------ */

async function ensureServe(source: RemoteSource): Promise<number | null | undefined> {
  let port = await getServePort(source.id);
  if (port) return port;
  log.info("remote:scan", `restarting serve for ${source.id}`);
  return restartServe(source);
}

/* ------------------------------------------------------------------ */
/*  Error helpers                                                       */
/* ------------------------------------------------------------------ */

function isConnectionError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes("Connection refused") || msg.includes("ECONNREFUSED");
}

function summarizeExecError(err: unknown): string {
  // exec errors have stderr with the actual tool output.
  const stderr = (err as any)?.stderr;
  const msg = typeof stderr === "string" && stderr.trim()
    ? stderr
    : String(err);
  // ffmpeg/ffprobe dump their full build config to stderr on every error.
  // Extract just the last meaningful line (usually the actual error).
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

function buildRemoteUrl(port: number, remotePath: string, basePath: string = "/"): string {
  // rclone serve is rooted at basePath, so strip it from the URL path.
  let relativePath = remotePath;
  if (remotePath.startsWith(basePath)) {
    relativePath = remotePath.slice(basePath.length);
    if (!relativePath.startsWith("/")) relativePath = "/" + relativePath;
  }
  return `http://localhost:${port}${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

/* ------------------------------------------------------------------ */
/*  Video (Movies) scanning over HTTP                                  */
/* ------------------------------------------------------------------ */

async function probVideoHttp(url: string, source?: RemoteSource): Promise<{
  duration?: number;
  resolution?: string;
  codec?: string;
  title?: string;
  hdr?: boolean;
  container?: string;
  audioCodec?: string;
  audioChannels?: number;
  audioChannelLayout?: string;
  audioTracks?: AudioTrackInfo[];
  subtitleTracks?: SubtitleTrackInfo[];
  chapters?: ChapterInfo[];
} | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -hide_banner -loglevel error -v quiet -print_format json -show_streams -show_format -show_chapters "${url.replace(/"/g, '\\"')}"`,
      { timeout: 30000 },
    );
    const data = JSON.parse(stdout);
    const video = data.streams?.find(
      (s: any) => s.codec_type === "video" && s.disposition?.attached_pic !== 1,
    );

    const audioStreams = (data.streams ?? []).filter((s: any) => s.codec_type === "audio");
    const audioTracks: AudioTrackInfo[] = audioStreams.map((s: any, i: number) => ({
      id: i,
      codec: s.codec_name,
      channels: s.channels,
      channelLayout: s.channel_layout || (s.channels === 1 ? "mono" : s.channels === 2 ? "stereo" : s.channels === 6 ? "5.1" : s.channels === 8 ? "7.1" : String(s.channels ?? "unknown")),
      language: s.tags?.language,
      title: s.tags?.title,
      default: s.disposition?.default === 1,
    }));
    const primaryAudio = audioStreams[0];

    const subStreams = (data.streams ?? []).filter((s: any) => s.codec_type === "subtitle");
    const subtitleTracks: SubtitleTrackInfo[] = subStreams.map((s: any, i: number) => ({
      id: i,
      codec: s.codec_name,
      language: s.tags?.language,
      title: s.tags?.title,
      default: s.disposition?.default === 1,
    }));

    const chapters: ChapterInfo[] = (data.chapters ?? []).map((ch: any, i: number) => ({
      index: i,
      title: ch.tags?.title ?? `Chapter ${i + 1}`,
      timeMs: Math.round(parseFloat(ch.start_time) * 1000),
    }));

    const transfer = video?.color_transfer?.toLowerCase() ?? "";
    const primaries = video?.color_primaries?.toLowerCase() ?? "";
    const hdr = video ? (transfer === "smpte2084" || transfer === "arib-std-b67" || primaries === "bt2020" || primaries === "smpte2084") : undefined;

    return {
      duration: data.format?.duration ? parseFloat(data.format.duration) : undefined,
      resolution: video ? `${video.width}x${video.height}` : undefined,
      codec: video?.codec_name,
      title: data.format?.tags?.title,
      hdr,
      container: data.format?.format_name,
      audioCodec: primaryAudio?.codec_name,
      audioChannels: primaryAudio?.channels,
      audioChannelLayout: primaryAudio ? (primaryAudio.channel_layout || (primaryAudio.channels === 1 ? "mono" : primaryAudio.channels === 2 ? "stereo" : primaryAudio.channels === 6 ? "5.1" : primaryAudio.channels === 8 ? "7.1" : String(primaryAudio.channels ?? "unknown"))) : undefined,
      audioTracks: audioTracks.length > 0 ? audioTracks : undefined,
      subtitleTracks: subtitleTracks.length > 0 ? subtitleTracks : undefined,
      chapters: chapters.length > 0 ? chapters : undefined,
    };
  } catch (err) {
    if (source && isConnectionError(err)) {
      log.warn("remote:scan:video", `ffprobe connection refused for ${url}, restarting serve`);
      const newPort = await restartServe(source);
      if (!newPort) {
        log.error("remote:scan:video", `failed to restart serve for ${source.id}`);
        return null;
      }
      const newUrl = url.replace(/localhost:\d+/, `localhost:${newPort}`);
      return probVideoHttp(newUrl);
    }
    log.error("remote:scan:video", `ffprobe failed: ${summarizeExecError(err)}`);
    return null;
  }
}

export async function scanRemoteMovies(
  source: RemoteSource,
  onProgress?: (current: number, total: number) => void,
  onItem?: (item: Movie, pending: boolean) => Promise<void> | void,
): Promise<Movie[]> {
  const files: string[] = [];

  await walkRemote(source, source.remotePath || "/", (path) => {
    if (VIDEO_EXTS.has(extname(path).toLowerCase()) && !TV_PATTERN.test(basename(path))) {
      files.push(path);
    }
  });

  log.info("remote:scan:movies", `found ${files.length} video files in ${source.name}`);

  // Pre-load cached movies from DB to skip re-probing
  const cached = new Map<string, Movie>();
  try {
    const all = await MovieRepo.list();
    for (const m of all) {
      if (m.filePath) cached.set(m.filePath, m);
    }
  } catch (err) {
    log.warn("remote:scan:movies", `failed to pre-load cache: ${err}`);
  }

  const movies: Movie[] = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const remotePath = files[i];
    onProgress?.(i, total);

    const basePath = source.remotePath || "/";
    const emberPath = `ember://remote/${source.id}${remotePath.split("/").map(encodeURIComponent).join("/")}`;
    const id = createHash("md5").update(emberPath).digest("hex").slice(0, 16);
    const name = basename(remotePath, extname(remotePath))
      .replace(/\.\d{4}\..*$/, "")
      .replace(/[._]/g, " ")
      .trim();

    // Check cache first — skip probe if metadata already exists AND new fields are present
    const cachedMovie = cached.get(emberPath);
    const hasBadChapters = cachedMovie?.chapters?.some((ch) => ch.timeMs > 100_000_000_000);
    if (cachedMovie && !cachedMovie.pendingMetadata && (cachedMovie.resolution || cachedMovie.runtime) && cachedMovie.container !== undefined && !hasBadChapters) {
      const movie: Movie = {
        ...cachedMovie,
        id,
        filePath: emberPath,
        sourceLocation: `rclone:${source.protocol}`,
        remoteSourceId: source.id,
        pendingMetadata: false,
        missing: false,
      };
      movies.push(movie);
      await onItem?.(movie, false);
      continue;
    }

    // Emit placeholder immediately so UI shows a card with spinner
    const placeholder: Movie = {
      id,
      title: name,
      filePath: emberPath,
      tags: [],
      hidden: false,
      sourceLocation: `rclone:${source.protocol}`,
      remoteSourceId: source.id,
      pendingMetadata: true,
    };
    await onItem?.(placeholder, true);

    const port = await ensureServe(source);
    if (!port) {
      log.error("remote:scan:movies", `serve unavailable for ${source.id}, aborting scan`);
      break;
    }

    const url = buildRemoteUrl(port, remotePath, basePath);
    log.debug("remote:scan:movies", `url=${url}, emberPath=${emberPath}`);

    try {
      const probe = await probVideoHttp(url, source);
      let coverUrl: string | undefined;
      try {
        coverUrl = await generateMovieThumbnail(url, id, probe?.duration);
      } catch (thumbErr) {
        if (isConnectionError(thumbErr)) {
          log.warn("remote:scan:movies", `thumbnail connection refused for ${remotePath}, restarting serve`);
          const newPort = await restartServe(source);
          if (newPort) {
            const newUrl = buildRemoteUrl(newPort, remotePath, basePath);
            coverUrl = await generateMovieThumbnail(newUrl, id, probe?.duration);
          }
        } else {
          throw thumbErr;
        }
      }

      const movie: Movie = {
        id,
        title: probe?.title || name,
        filePath: emberPath,
        coverUrl,
        runtime: probe?.duration ? Math.round(probe.duration) : undefined,
        resolution: probe?.resolution,
        codec: probe?.codec,
        hdr: probe?.hdr,
        container: probe?.container,
        audioCodec: probe?.audioCodec,
        audioChannels: probe?.audioChannels,
        audioChannelLayout: probe?.audioChannelLayout,
        audioTracks: probe?.audioTracks,
        subtitleTracks: probe?.subtitleTracks,
        chapters: probe?.chapters,
        tags: [],
        hidden: false,
        sourceLocation: `rclone:${source.protocol}`,
        remoteSourceId: source.id,
        pendingMetadata: false,
      };
      movies.push(movie);
      await onItem?.(movie, false);
    } catch (err) {
      log.error("remote:scan:movies", `error processing ${remotePath}: ${summarizeExecError(err)}`);
      const movie: Movie = { ...placeholder, pendingMetadata: false };
      movies.push(movie);
      await onItem?.(movie, false);
    }
  }

  onProgress?.(total, total);
  log.info("remote:scan:movies", `completed for ${source.name}, movies: ${movies.length}`);
  return movies;
}

/* ------------------------------------------------------------------ */
/*  Music scanning over HTTP                                             */
/* ------------------------------------------------------------------ */

let musicMetadata: any = null;

async function getMusicMetadata() {
  if (!musicMetadata) musicMetadata = await import("music-metadata");
  return musicMetadata;
}

export async function scanRemoteMusic(
  source: RemoteSource,
  onProgress?: (current: number, total: number) => void,
  onItem?: (item: MusicTrack, pending: boolean) => Promise<void> | void,
): Promise<MusicTrack[]> {
  const files: string[] = [];

  await walkRemote(source, source.remotePath || "/", (path) => {
    if (AUDIO_EXTS.has(extname(path).toLowerCase())) {
      files.push(path);
    }
  });

  log.info("remote:scan:music", `found ${files.length} audio files in ${source.name}`);

  // Pre-load cached tracks from DB to skip re-parsing
  const cached = new Map<string, MusicTrack>();
  try {
    const all = await MusicRepo.list();
    for (const t of all) {
      if (t.filePath) cached.set(t.filePath, t);
    }
  } catch (err) {
    log.warn("remote:scan:music", `failed to pre-load cache: ${err}`);
  }

  const tracks: MusicTrack[] = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const remotePath = files[i];
    onProgress?.(i, total);

    const basePath = source.remotePath || "/";
    const emberPath = `ember://remote/${source.id}${remotePath.split("/").map(encodeURIComponent).join("/")}`;
    const id = createHash("md5").update(emberPath).digest("hex").slice(0, 16);

    // Check cache first — skip probe if metadata already exists
    const cachedTrack = cached.get(emberPath);
    if (cachedTrack && !cachedTrack.pendingMetadata && (cachedTrack.duration || cachedTrack.artist)) {
      const track: MusicTrack = {
        ...cachedTrack,
        id,
        filePath: emberPath,
        sourceLocation: `rclone:${source.protocol}`,
        remoteSourceId: source.id,
        pendingMetadata: false,
        missing: false,
      };
      tracks.push(track);
      await onItem?.(track, false);
      continue;
    }

    // Emit placeholder immediately so UI shows a card with spinner
    const placeholder: MusicTrack = {
      id,
      title: basename(remotePath).replace(/\.[^.]+$/, ""),
      filePath: emberPath,
      tags: [],
      hidden: false,
      sourceLocation: `rclone:${source.protocol}`,
      remoteSourceId: source.id,
      pendingMetadata: true,
    };
    await onItem?.(placeholder, true);

    const port = await ensureServe(source);
    if (!port) {
      log.error("remote:scan:music", `serve unavailable for ${source.id}, aborting scan`);
      break;
    }

    const url = buildRemoteUrl(port, remotePath, basePath);

    try {
      const mm = await getMusicMetadata();
      const response = await fetch(url, {
        headers: { Range: "bytes=0-262143" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const meta = await mm.parseBuffer(buffer, undefined, { skipCovers: true });
      const { title, artist, album, genre, year, track } = meta.common;

      const trackItem: MusicTrack = {
        id,
        title: title ?? basename(remotePath).replace(/\.[^.]+$/, ""),
        filePath: emberPath,
        artist,
        album,
        albumArtUrl: undefined,
        genre: Array.isArray(genre) ? genre[0] : genre,
        year,
        trackNumber: track?.no ?? undefined,
        duration: meta.format.duration,
        tags: [],
        hidden: false,
        sourceLocation: `rclone:${source.protocol}`,
        remoteSourceId: source.id,
        pendingMetadata: false,
      };
      tracks.push(trackItem);
      await onItem?.(trackItem, false);
    } catch (err: any) {
      log.error("remote:scan:music", `failed to parse ${remotePath}: ${err?.message ?? String(err)}`);
      const trackItem: MusicTrack = {
        id,
        title: basename(remotePath).replace(/\.[^.]+$/, ""),
        filePath: emberPath,
        tags: [],
        hidden: false,
        corrupt: true,
        sourceLocation: `rclone:${source.protocol}`,
        remoteSourceId: source.id,
        pendingMetadata: false,
      };
      tracks.push(trackItem);
      await onItem?.(trackItem, false);
    }
  }

  log.info("remote:scan:music", `completed for ${source.name}, tracks: ${tracks.length}`);
  return tracks;
}

/* ------------------------------------------------------------------ */
/*  ROM scanning over HTTP                                               */
/* ------------------------------------------------------------------ */

const PLATFORM_EXTS: Record<string, string> = {
  ".nes": "nes",
  ".snes": "snes",
  ".sfc": "snes",
  ".smc": "snes",
  ".n64": "n64",
  ".z64": "n64",
  ".v64": "n64",
  ".gb": "gb",
  ".gbc": "gbc",
  ".gba": "gba",
  ".sgb": "sgb",
  ".gen": "genesis",
  ".md": "genesis",
  ".smd": "genesis",
  ".sms": "sms",
  ".gg": "gamegear",
  ".pce": "pce",
  ".iso": "psx",
  ".bin": "psx",
  ".cue": "psx",
  ".chd": "dreamcast",
  ".nds": "nds",
  ".dc": "dreamcast",
};

export async function scanRemoteRoms(
  source: RemoteSource,
  onProgress?: (current: number, total: number) => void,
  onItem?: (item: Game, pending: boolean) => Promise<void> | void,
): Promise<Game[]> {
  const port = await ensureServe(source);
  if (!port) {
    log.warn("remote:scan:roms", `source ${source.id} not serving`);
    return [];
  }

  const files: string[] = [];

  await walkRemote(source, source.remotePath || "/", (path) => {
    const ext = extname(path).toLowerCase();
    if (PLATFORM_EXTS[ext]) {
      files.push(path);
    }
  });

  log.info("remote:scan:roms", `found ${files.length} ROM files in ${source.name}`);

  const games: Game[] = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const remotePath = files[i];
    onProgress?.(i, total);
    const ext = extname(remotePath).toLowerCase();
    const platform = (PLATFORM_EXTS[ext] ?? "unknown") as GamePlatform;
    const emberPath = `ember://remote/${source.id}${remotePath}`;
    const id = createHash("md5").update(emberPath).digest("hex").slice(0, 16);
    const title = basename(remotePath, ext).replace(/[._]/g, " ").trim();

    const game: Game = {
      id,
      title,
      platform,
      romPath: emberPath,
      tags: [],
      isFavorite: false,
      playTime: 0,
      rating: 0,
      lastPlayed: 0,
      hidden: false,
      sourceLocation: `rclone:${source.protocol}`,
      remoteSourceId: source.id,
      pendingMetadata: false,
    };
    games.push(game);
    await onItem?.(game, false);
  }

  onProgress?.(total, total);
  log.info("remote:scan:roms", `completed for ${source.name}, games: ${games.length}`);
  return games;
}

/* ------------------------------------------------------------------ */
/*  Progress tracking                                                   */
/* ------------------------------------------------------------------ */

interface RemoteScanProgress {
  scanner: string;
  current: number;
  total: number;
  status: "scanning" | "done" | "error";
  message?: string;
}

type RemoteProgressSender = (progress: RemoteScanProgress) => void;

const activeRemoteScans = {
  movie: 0,
  music: 0,
  rom: 0,
};

function emitRemoteProgress(
  sendProgress: RemoteProgressSender | undefined,
  mediaType: "movie" | "music" | "rom",
  status: "scanning" | "done" | "error",
  message?: string,
) {
  if (!sendProgress) return;
  const scanner = `remote-${mediaType}`;
  if (status === "scanning") {
    activeRemoteScans[mediaType]++;
    if (activeRemoteScans[mediaType] === 1) {
      sendProgress({ scanner, current: 0, total: 0, status: "scanning" });
    }
  } else {
    activeRemoteScans[mediaType] = Math.max(0, activeRemoteScans[mediaType] - 1);
    if (activeRemoteScans[mediaType] === 0) {
      sendProgress({ scanner, current: 0, total: 0, status: status === "error" ? "error" : "done", message });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Queue helper                                                        */
/* ------------------------------------------------------------------ */

const scanQueue: Array<() => Promise<void>> = [];
let scanRunning = false;
const scanningSourceIds = new Set<string>();

async function drainQueue(): Promise<void> {
  if (scanRunning) return;
  scanRunning = true;
  while (scanQueue.length > 0) {
    const job = scanQueue.shift();
    if (job) {
      try {
        await job();
      } catch (err) {
        log.error("remote:scan:queue", `job failed: ${err}`);
      }
    }
  }
  scanRunning = false;
}

export function queueRemoteSourceScan(
  source: RemoteSource,
  sendProgress?: RemoteProgressSender,
  sendItem?: SendScanItem,
): void {
  if (scanningSourceIds.has(source.id)) {
    log.info("remote:scan:queue", `skipping ${source.name}, already queued or scanning`);
    return;
  }
  scanningSourceIds.add(source.id);

  scanQueue.push(async () => {
    log.info("remote:scan:queue", `starting scan for ${source.name} (${source.mediaTypes.join(", ")})`);

    try {
      let port: number | null | undefined = await getServePort(source.id);
      if (!port) {
        log.info("remote:scan:queue", `starting serve for ${source.id}`);
        port = await startServe(source);
        if (!port) {
          log.error("remote:scan:queue", `failed to start serve for ${source.id}`);
          return;
        }
      }

      // Verify the serve is actually responding before scanning
      try {
        await fetch(`http://localhost:${port}/`, { method: "HEAD", signal: AbortSignal.timeout(2000) });
      } catch {
        log.warn("remote:scan:queue", `serve for ${source.id} on port ${port} not responding, restarting`);
        const restartedPort = await startServe(source);
        if (!restartedPort) {
          log.error("remote:scan:queue", `failed to restart serve for ${source.id}`);
          return;
        }
        port = restartedPort;
      }

      if (source.mediaTypes.includes("movie")) {
        emitRemoteProgress(sendProgress, "movie", "scanning");
        try {
          await scanRemoteMovies(source, undefined, async (item, pending) => {
            try {
              await MovieRepo.upsert(item);
            } catch (err) {
              log.warn("remote:scan", `failed to upsert movie ${item.id}: ${err}`);
            }
            sendItem?.({ type: "movie", item, pending });
          });
        } catch (err) {
          log.error("remote:scan", `movie scan failed for ${source.name}: ${err}`);
          emitRemoteProgress(sendProgress, "movie", "error", String(err));
        } finally {
          emitRemoteProgress(sendProgress, "movie", "done");
        }
      }

      if (source.mediaTypes.includes("music")) {
        emitRemoteProgress(sendProgress, "music", "scanning");
        try {
          await scanRemoteMusic(source, undefined, async (item, pending) => {
            try {
              await MusicRepo.upsert(item);
              if ((item as MusicTrack).corrupt) await applyCorruptPolicy(item.id, "music");
            } catch (err) {
              log.warn("remote:scan", `failed to upsert track ${item.id}: ${err}`);
            }
            sendItem?.({ type: "music", item, pending });
          });
        } catch (err) {
          log.error("remote:scan", `music scan failed for ${source.name}: ${err}`);
          emitRemoteProgress(sendProgress, "music", "error", String(err));
        } finally {
          emitRemoteProgress(sendProgress, "music", "done");
        }
      }

      if (source.mediaTypes.includes("rom")) {
        emitRemoteProgress(sendProgress, "rom", "scanning");
        try {
          await scanRemoteRoms(source, undefined, async (item, pending) => {
            try {
              await GameRepo.upsert(item);
            } catch (err) {
              log.warn("remote:scan", `failed to upsert game ${item.id}: ${err}`);
            }
            sendItem?.({ type: "rom", item, pending });
          });
        } catch (err) {
          log.error("remote:scan", `rom scan failed for ${source.name}: ${err}`);
          emitRemoteProgress(sendProgress, "rom", "error", String(err));
        } finally {
          emitRemoteProgress(sendProgress, "rom", "done");
        }
      }

      log.info("remote:scan:queue", `completed scan for ${source.name}`);
    } finally {
      scanningSourceIds.delete(source.id);
    }
  });

  void drainQueue();
}

export async function scanAllRemoteSources(
  mediaType?: "movie" | "music" | "rom",
  sendProgress?: RemoteProgressSender,
  sendItem?: SendScanItem,
): Promise<void> {
  try {
    const sources = await listRemotes();
    for (const source of sources) {
      if (!source.enabled) continue;
      if (mediaType && !source.mediaTypes.includes(mediaType)) continue;
      queueRemoteSourceScan(source, sendProgress, sendItem);
    }
  } catch (err) {
    log.error("remote:scan", `failed to scan all remotes: ${err}`);
  }
}
