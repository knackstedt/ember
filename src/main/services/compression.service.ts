import { spawn, spawnSync } from "child_process";
import { extname, basename, dirname, join } from "path";
import { existsSync, statSync } from "fs";
import { Game, GamePlatform } from "../../shared/types";
import { createLogger } from "../util/logger";
import { getDb } from "../db";
import { escapeId } from "../db/repository";

const log = createLogger("info");

export type CompressionFormat = "chd" | "rvz" | "cso" | "zso" | "nsz" | "7z";

export interface CompressionToolStatus {
  available: boolean;
  path?: string;
  version?: string;
}

export interface CompressionResult {
  success: boolean;
  outputPath?: string;
  format?: CompressionFormat;
  error?: string;
  originalSize?: number;
  compressedSize?: number;
}

export interface ToolAvailability {
  chdman: CompressionToolStatus;
  dolphinTool: CompressionToolStatus;
  maxcso: CompressionToolStatus;
  nsz: CompressionToolStatus;
  sevenZip: CompressionToolStatus;
}

/* ------------------------------------------------------------------ */
/*  Platform → format mapping                                          */
/* ------------------------------------------------------------------ */

const PLATFORM_FORMATS: Record<
  GamePlatform,
  { format: CompressionFormat; tool: keyof ToolAvailability } | undefined
> = {
  psx: { format: "chd", tool: "chdman" },
  ps2: { format: "chd", tool: "chdman" },
  ps3: undefined,
  psp: { format: "cso", tool: "maxcso" },
  xbox360: undefined,
  dreamcast: { format: "chd", tool: "chdman" },
  "dolphin-gc": { format: "rvz", tool: "dolphinTool" },
  "dolphin-wii": { format: "rvz", tool: "dolphinTool" },
  // Switch not yet scanned, but prepared for future use
  // "switch": { format: "nsz", tool: "nsz" },
  // Fallback for all other ROM platforms
  nes: { format: "7z", tool: "sevenZip" },
  snes: { format: "7z", tool: "sevenZip" },
  gb: { format: "7z", tool: "sevenZip" },
  gba: { format: "7z", tool: "sevenZip" },
  n64: { format: "7z", tool: "sevenZip" },
  genesis: { format: "7z", tool: "sevenZip" },
  sms: { format: "7z", tool: "sevenZip" },
  gamegear: { format: "7z", tool: "sevenZip" },
  pce: { format: "7z", tool: "sevenZip" },
  nds: { format: "7z", tool: "sevenZip" },
  // Non-ROM platforms
  steam: undefined,
  gog: undefined,
  heroic: undefined,
  lutris: undefined,
  flash: undefined,
  dos: undefined,
  windows: undefined,
  desktop: undefined,
  itch: undefined,
  unknown: undefined,
};

/* ------------------------------------------------------------------ */
/*  Tool detection                                                     */
/* ------------------------------------------------------------------ */

function commandExists(cmd: string): string | undefined {
  const result = spawnSync("sh", ["-c", `command -v ${cmd}`], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
  if (result.status === 0) {
    const path = result.stdout.trim();
    return path || undefined;
  }
  return undefined;
}

function getToolVersion(cmd: string, versionArg = "--version"): string | undefined {
  try {
    const result = spawnSync(cmd, [versionArg], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 3000,
    });
    if (result.status === 0) {
      return result.stdout.trim().split("\n")[0];
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function getToolAvailability(): ToolAvailability {
  const chdmanPath = commandExists("chdman");
  const dolphinToolPath = commandExists("dolphin-tool");
  const maxcsoPath = commandExists("maxcso");
  const nszPath = commandExists("nsz");
  const sevenZipPath = commandExists("7z") || commandExists("7za");

  return {
    chdman: {
      available: !!chdmanPath,
      path: chdmanPath,
      version: chdmanPath ? getToolVersion("chdman") : undefined,
    },
    dolphinTool: {
      available: !!dolphinToolPath,
      path: dolphinToolPath,
      version: dolphinToolPath ? getToolVersion("dolphin-tool", "version") : undefined,
    },
    maxcso: {
      available: !!maxcsoPath,
      path: maxcsoPath,
      version: maxcsoPath ? getToolVersion("maxcso") : undefined,
    },
    nsz: {
      available: !!nszPath,
      path: nszPath,
      version: nszPath ? getToolVersion("nsz") : undefined,
    },
    sevenZip: {
      available: !!sevenZipPath,
      path: sevenZipPath,
      version: sevenZipPath ? getToolVersion(sevenZipPath.split("/").pop()!) : undefined,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Compression helpers                                                */
/* ------------------------------------------------------------------ */

function getOutputPath(inputPath: string, format: CompressionFormat): string {
  const dir = dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  return join(dir, `${base}.${format}`);
}

function getFileSize(path: string): number | undefined {
  try {
    return statSync(path).size;
  } catch {
    return undefined;
  }
}

async function runCommand(
  cmd: string,
  args: string[],
  timeoutMs = 300000,
): Promise<{ success: boolean; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuf = "";
    let stderrBuf = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      resolve({ success: false, stderr: stderrBuf, error: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    proc.stdout?.on("data", (d: Buffer) => {
      stdoutBuf += d.toString();
    });
    proc.stderr?.on("data", (d: Buffer) => {
      stderrBuf += d.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (!killed) {
        resolve({ success: false, stderr: stderrBuf, error: err.message });
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (!killed) {
        resolve({ success: code === 0, stderr: stderrBuf });
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Per-format compression                                             */
/* ------------------------------------------------------------------ */

async function compressChd(inputPath: string, outputPath: string): Promise<CompressionResult> {
  const ext = extname(inputPath).toLowerCase();
  let args: string[];

  if (ext === ".cue" || ext === ".bin" || ext === ".iso") {
    // CD-ROM image
    args = ["createcd", "-i", inputPath, "-o", outputPath];
  } else if (ext === ".gdi") {
    // Dreamcast GDI
    args = ["createcd", "-i", inputPath, "-o", outputPath];
  } else if (ext === ".cdi") {
    // CDI images: convert via createcd if possible, otherwise createhd
    args = ["createcd", "-i", inputPath, "-o", outputPath];
  } else {
    return { success: false, error: `Unsupported input format for CHD: ${ext}` };
  }

  log.info("compression", `chdman ${args.join(" ")}`);
  const result = await runCommand("chdman", args, 600000);
  if (!result.success) {
    return { success: false, error: result.error || result.stderr };
  }

  return {
    success: true,
    outputPath,
    format: "chd",
    originalSize: getFileSize(inputPath),
    compressedSize: getFileSize(outputPath),
  };
}

async function compressRvz(inputPath: string, outputPath: string): Promise<CompressionResult> {
  const args = ["convert", "-i", inputPath, "-o", outputPath, "-f", "rvz"];
  log.info("compression", `dolphin-tool ${args.join(" ")}`);
  const result = await runCommand("dolphin-tool", args, 600000);
  if (!result.success) {
    return { success: false, error: result.error || result.stderr };
  }

  return {
    success: true,
    outputPath,
    format: "rvz",
    originalSize: getFileSize(inputPath),
    compressedSize: getFileSize(outputPath),
  };
}

async function compressCso(inputPath: string, outputPath: string): Promise<CompressionResult> {
  const args = [inputPath, "-o", outputPath];
  log.info("compression", `maxcso ${args.join(" ")}`);
  const result = await runCommand("maxcso", args, 600000);
  if (!result.success) {
    return { success: false, error: result.error || result.stderr };
  }

  return {
    success: true,
    outputPath,
    format: "cso",
    originalSize: getFileSize(inputPath),
    compressedSize: getFileSize(outputPath),
  };
}

async function compressNsz(inputPath: string): Promise<CompressionResult> {
  // nsz creates output in same directory with .nsz extension
  const dir = dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  const outputPath = join(dir, `${base}.nsz`);

  const args = ["-C", inputPath];
  log.info("compression", `nsz ${args.join(" ")}`);
  const result = await runCommand("nsz", args, 600000);
  if (!result.success) {
    return { success: false, error: result.error || result.stderr };
  }

  return {
    success: true,
    outputPath,
    format: "nsz",
    originalSize: getFileSize(inputPath),
    compressedSize: getFileSize(outputPath),
  };
}

async function compress7z(inputPath: string, outputPath: string): Promise<CompressionResult> {
  const sevenZip = commandExists("7z") || commandExists("7za");
  if (!sevenZip) {
    return { success: false, error: "7z/7za not found" };
  }

  const args = ["a", "-mx9", outputPath, inputPath];
  log.info("compression", `${sevenZip} ${args.join(" ")}`);
  const result = await runCommand(sevenZip, args, 300000);
  if (!result.success) {
    return { success: false, error: result.error || result.stderr };
  }

  return {
    success: true,
    outputPath,
    format: "7z",
    originalSize: getFileSize(inputPath),
    compressedSize: getFileSize(outputPath),
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function getCompressionFormat(platform: GamePlatform): CompressionFormat | undefined {
  return PLATFORM_FORMATS[platform]?.format;
}

export function canCompress(game: Game): { ok: boolean; reason?: string } {
  if (!game.romPath) {
    return { ok: false, reason: "No ROM path" };
  }
  if (!existsSync(game.romPath)) {
    return { ok: false, reason: "ROM file does not exist" };
  }

  const mapping = PLATFORM_FORMATS[game.platform];
  if (!mapping) {
    return { ok: false, reason: `No compression format for platform: ${game.platform}` };
  }

  const tools = getToolAvailability();
  const toolStatus = tools[mapping.tool];
  if (!toolStatus.available) {
    return { ok: false, reason: `Missing tool: ${mapping.tool}` };
  }

  if (game.compressedRomPath && existsSync(game.compressedRomPath)) {
    return { ok: false, reason: "Already compressed" };
  }

  return { ok: true };
}

export async function compressGame(game: Game): Promise<CompressionResult> {
  const check = canCompress(game);
  if (!check.ok) {
    return { success: false, error: check.reason };
  }

  if (!game.romPath) {
    return { success: false, error: "No ROM path" };
  }

  const mapping = PLATFORM_FORMATS[game.platform]!;
  const outputPath = getOutputPath(game.romPath, mapping.format);

  if (existsSync(outputPath)) {
    return { success: false, error: `Output file already exists: ${outputPath}` };
  }

  let result: CompressionResult;
  switch (mapping.format) {
    case "chd":
      result = await compressChd(game.romPath, outputPath);
      break;
    case "rvz":
      result = await compressRvz(game.romPath, outputPath);
      break;
    case "cso":
    case "zso":
      result = await compressCso(game.romPath, outputPath);
      break;
    case "nsz":
      result = await compressNsz(game.romPath);
      break;
    case "7z":
      result = await compress7z(game.romPath, outputPath);
      break;
    default:
      return { success: false, error: `Unknown format: ${mapping.format}` };
  }

  if (result.success && result.outputPath) {
    // Verify output exists
    if (!existsSync(result.outputPath)) {
      return { success: false, error: "Compressed file was not created" };
    }
    const size = getFileSize(result.outputPath);
    if (!size || size === 0) {
      return { success: false, error: "Compressed file is empty" };
    }
    result.compressedSize = size;
    result.originalSize = getFileSize(game.romPath);

    // Update database
    try {
      const db = getDb();
      await db.query(
        `UPDATE game:⟨${escapeId(game.id)}⟩ SET compressedRomPath = $path, compressionFormat = $format`,
        { path: result.outputPath, format: mapping.format },
      );
    } catch (err) {
      log.warn("compression", `Failed to update DB for ${game.id}: ${err}`);
    }
  }

  return result;
}

export async function compressAllRoms(
  onProgress?: (current: number, total: number, title: string) => void,
): Promise<{ success: number; failed: number; skipped: number; errors: string[] }> {
  const db = getDb();
  const result = await db.query<[Game[]]>("SELECT * FROM game WHERE romPath IS NOT NONE");
  const games = (result[0] ?? []) as Game[];

  let success = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    onProgress?.(i + 1, games.length, game.title);

    const check = canCompress(game);
    if (!check.ok) {
      skipped++;
      continue;
    }

    try {
      const res = await compressGame(game);
      if (res.success) {
        success++;
      } else {
        failed++;
        errors.push(`${game.title}: ${res.error}`);
      }
    } catch (err) {
      failed++;
      errors.push(`${game.title}: ${String(err)}`);
    }
  }

  return { success, failed, skipped, errors };
}

export async function getCompressedGames(): Promise<Game[]> {
  const db = getDb();
  const result = await db.query<[Game[]]>("SELECT * FROM game WHERE compressedRomPath IS NOT NONE");
  return (result[0] ?? []) as Game[];
}
