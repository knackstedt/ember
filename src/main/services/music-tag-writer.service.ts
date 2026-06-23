import { extname } from "path";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { AudioTags } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");
const execAsync = promisify(exec);

const SUPPORTED_FFMPEG_EXTS = new Set([
  ".flac",
  ".ogg",
  ".m4a",
  ".aac",
  ".wav",
  ".wma",
  ".opus",
  ".mp4",
  ".webm",
]);

function isMpegExtension(ext: string): boolean {
  return ext === ".mp3";
}

function isFfmpegSupported(ext: string): boolean {
  return SUPPORTED_FFMPEG_EXTS.has(ext);
}

async function checkFfmpeg(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function writeMp3Tags(
  filePath: string,
  tags: AudioTags,
): Promise<{ success: boolean; error?: string }> {
  try {
    const mod = await import("node-id3");
    const NodeID3 = (mod as any).default ?? mod;

    const id3Tags: Record<string, string | number | object | undefined> = {};
    if (tags.title !== undefined) id3Tags.title = tags.title;
    if (tags.artist !== undefined) id3Tags.artist = tags.artist;
    if (tags.album !== undefined) id3Tags.album = tags.album;
    if (tags.albumArtist !== undefined) id3Tags.performerInfo = tags.albumArtist;
    if (tags.genre !== undefined) id3Tags.genre = tags.genre;
    if (tags.year !== undefined) id3Tags.year = String(tags.year);
    if (tags.trackNumber !== undefined) id3Tags.trackNumber = String(tags.trackNumber);
    if (tags.discNumber !== undefined) id3Tags.partOfSet = String(tags.discNumber);
    if (tags.comment !== undefined) id3Tags.comment = { language: "eng", text: tags.comment };

    const result = NodeID3.write(id3Tags, filePath);
    if (result === true || typeof result === "object") {
      return { success: true };
    }
    return { success: false, error: "node-id3 returned an unexpected result" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("writeMp3Tags", `failed to write MP3 tags: ${msg}`);
    return { success: false, error: msg };
  }
}

async function writeFfmpegTags(
  filePath: string,
  tags: AudioTags,
): Promise<{ success: boolean; error?: string }> {
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    return { success: false, error: "ffmpeg is not available in PATH" };
  }

  const metadataArgs: string[] = [];
  if (tags.title !== undefined) metadataArgs.push(`-metadata`, `title=${tags.title}`);
  if (tags.artist !== undefined) metadataArgs.push(`-metadata`, `artist=${tags.artist}`);
  if (tags.album !== undefined) metadataArgs.push(`-metadata`, `album=${tags.album}`);
  if (tags.albumArtist !== undefined) metadataArgs.push(`-metadata`, `album_artist=${tags.albumArtist}`);
  if (tags.genre !== undefined) metadataArgs.push(`-metadata`, `genre=${tags.genre}`);
  if (tags.year !== undefined) metadataArgs.push(`-metadata`, `date=${tags.year}`);
  if (tags.trackNumber !== undefined) metadataArgs.push(`-metadata`, `track=${tags.trackNumber}`);
  if (tags.discNumber !== undefined) metadataArgs.push(`-metadata`, `disc=${tags.discNumber}`);
  if (tags.comment !== undefined) metadataArgs.push(`-metadata`, `comment=${tags.comment}`);

  // Use a temp file next to the original to avoid corrupting it on failure
  const tmpPath = `${filePath}.tmp`;

  try {
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      ...metadataArgs,
      "-c",
      "copy",
      tmpPath,
    ];

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn("ffmpeg", args, { stdio: "ignore" });
      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve(1);
      }, 30000);
      proc.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code ?? 1);
      });
      proc.on("error", () => {
        clearTimeout(timer);
        resolve(1);
      });
    });

    if (exitCode !== 0) {
      try {
        const { unlinkSync } = await import("fs");
        unlinkSync(tmpPath);
      } catch { /* ignore cleanup errors */ }
      return { success: false, error: `ffmpeg exited with code ${exitCode}` };
    }

    const { renameSync } = await import("fs");
    renameSync(tmpPath, filePath);
    return { success: true };
  } catch (err) {
    // Clean up temp file on failure
    try {
      const { unlinkSync } = await import("fs");
      unlinkSync(tmpPath);
    } catch { /* ignore cleanup errors */ }

    const msg = err instanceof Error ? err.message : String(err);
    log.error("writeFfmpegTags", `ffmpeg tag write failed: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function writeTags(
  filePath: string,
  tags: AudioTags,
): Promise<{ success: boolean; error?: string }> {
  if (!filePath) {
    return { success: false, error: "No file path provided" };
  }

  const ext = extname(filePath).toLowerCase();

  if (isMpegExtension(ext)) {
    return writeMp3Tags(filePath, tags);
  }

  if (isFfmpegSupported(ext)) {
    return writeFfmpegTags(filePath, tags);
  }

  return {
    success: false,
    error: `Unsupported file extension: ${ext}. Supported: .mp3, .flac, .ogg, .m4a, .aac, .wav, .wma, .opus`,
  };
}
