import { app } from "electron";
import { join, dirname, basename, extname } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { deflateSync } from "zlib";
import { createHash } from "crypto";
import { getDb } from "../db";
import { GameRepo } from "../db/repository";
import { Game } from "../../shared/types";
import { findSidecarImage, searchOnlineThumbnail } from "./flash-thumbnail.service";
import { detectInstalledCores } from "./package-manager.service";
import { workerCall } from "../ipc";
import { createLogger } from "../util/logger";

const log = createLogger("info");

let coverRoot: string;
try { coverRoot = join(app.getPath("userData"), "covers", "libretro"); } catch { coverRoot = join(process.cwd(), "covers", "libretro"); }
const screenshotDir = join(coverRoot, "screenshots");
const generatedDir = join(coverRoot, "generated");
mkdirSync(screenshotDir, { recursive: true });
mkdirSync(generatedDir, { recursive: true });

const LIBRETRO_PLATFORMS = new Set<string>([
  "nes", "snes", "gb", "gbc", "gba", "n64", "genesis", "sms",
  "gamegear", "pce", "psx", "dreamcast", "nds", "dos",
]);

export function isLibretroPlatform(platform: string): boolean {
  return LIBRETRO_PLATFORMS.has(platform);
}

/* ------------------------------------------------------------------ */
/*  Core detection                                                     */
/* ------------------------------------------------------------------ */

const PLATFORM_EXTS: Record<string, string> = {
  ".nes": "nes", ".smc": "snes", ".sfc": "snes", ".gb": "gb", ".gbc": "gb",
  ".gba": "gba", ".z64": "n64", ".n64": "n64", ".v64": "n64", ".nds": "nds",
  ".md": "genesis", ".smd": "genesis", ".gen": "genesis", ".sms": "sms",
  ".gg": "gamegear", ".pce": "pce", ".cue": "psx", ".bin": "psx",
  ".iso": "psx", ".pbp": "psx", ".gdi": "dreamcast", ".cdi": "dreamcast", ".wad": "doom",
};

const CORE_PRIORITY: Record<string, string[]> = {
  nes: ["nestopia", "fceumm", "mesen"],
  snes: ["bsnes", "snes9x", "mesen"],
  gb: ["gambatte", "mgba", "mesen"],
  gbc: ["gambatte", "mgba", "mesen"],
  gba: ["mgba", "vbam"],
  genesis: ["genesis_plus_gx", "picodrive"],
  sms: ["genesis_plus_gx", "picodrive"],
  gamegear: ["genesis_plus_gx", "picodrive"],
  n64: ["mupen64plus_next", "parallel_n64"],
  nds: ["melonds", "desmume"],
  psx: ["duckstation", "beetle_psx", "pcsx_rearmed"],
  dreamcast: ["flycast", "redream"],
  pce: ["beetle_pce", "beetle_pce_fast"],
};

export async function findCoresForRom(romPath: string): Promise<{ corePath: string; coreName: string }[]> {
  const ext = (romPath.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const platform = PLATFORM_EXTS[ext];
  if (!platform) return [];

  const installed = await detectInstalledCores();
  const compatible = installed.filter((c) => {
    const cexts = c.extensions.map((e) => e.toLowerCase());
    return cexts.includes(ext);
  });

  if (compatible.length === 0) return [];

  const priorityList = CORE_PRIORITY[platform] ?? [];
  compatible.sort((a, b) => {
    const aIdx = priorityList.indexOf(a.coreName);
    const bIdx = priorityList.indexOf(b.coreName);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.coreName.localeCompare(b.coreName);
  });

  return compatible.map((c) => ({ corePath: c.corePath, coreName: c.coreName }));
}

/* ------------------------------------------------------------------ */
/*  PNG encoder (minimal, no deps)                                     */
/* ------------------------------------------------------------------ */

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return ~crc >>> 0;
}

function writePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function rgbaToPng(width: number, height: number, rgba: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = width * 4;
  const rawSize = height * (rowSize + 1);
  const raw = Buffer.alloc(rawSize);
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0;
    rgba.copy(raw, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }

  const compressed = deflateSync(raw);

  return Buffer.concat([
    signature,
    writePngChunk("IHDR", ihdr),
    writePngChunk("IDAT", compressed),
    writePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Frame analysis                                                     */
/* ------------------------------------------------------------------ */

function scoreFrameVariance(width: number, height: number, rgba: Buffer): number {
  if (width < 2 || height < 2 || rgba.length < width * height * 4) return 0;

  const samples: number[] = [];
  const stepX = Math.max(1, Math.floor(width / 16));
  const stepY = Math.max(1, Math.floor(height / 16));

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      const lum = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
      samples.push(lum);
    }
  }

  if (samples.length < 2) return 0;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((sum, s) => sum + (s - mean) * (s - mean), 0) / samples.length;
  return variance;
}

function isImageUniform(width: number, height: number, rgba: Buffer): boolean {
  if (rgba.length < 100) return true;
  const samples: number[] = [];
  const coords = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), Math.floor(height / 2)],
    [Math.floor(width / 4), Math.floor(height / 4)],
    [Math.floor((3 * width) / 4), Math.floor((3 * height) / 4)],
    [Math.floor(width / 2), 0], [0, Math.floor(height / 2)],
  ];
  for (const [x, y] of coords) {
    if (x >= width || y >= height) continue;
    const idx = (y * width + x) * 4;
    samples.push(rgba[idx] + rgba[idx + 1] + rgba[idx + 2]);
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((sum, s) => sum + (s - avg) * (s - avg), 0) / samples.length;
  return variance < 600;
}

function regionEntropy(
  rgba: Buffer,
  width: number,
  height: number,
  startY: number,
  lines: number,
): number {
  if (lines <= 0 || width <= 0) return 0;
  const samples: number[] = [];
  const stepX = Math.max(1, Math.floor(width / 16));
  for (let y = startY; y < startY + lines && y < height; y++) {
    for (let x = 0; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      const lum = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
      samples.push(lum);
    }
  }
  if (samples.length < 2) return 0;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return samples.reduce((sum, s) => sum + (s - mean) * (s - mean), 0) / samples.length;
}

function cropSolidDsScreens(
  width: number,
  height: number,
  rgba: Buffer,
  platform: string,
): { width: number; height: number; rgba: Buffer } {
  if (platform !== "nds" && platform !== "3ds") return { width, height, rgba };
  if (height < 8) return { width, height, rgba };

  const halfHeight = Math.floor(height / 2);
  const topEntropy = regionEntropy(rgba, width, height, 0, halfHeight);
  const bottomEntropy = regionEntropy(rgba, width, height, halfHeight, height - halfHeight);

  // Default to the top screen. Only switch to the bottom screen if the
  // top is essentially blank (very low variance) while the bottom has
  // meaningful content.
  const BLANK = 100;
  const MEANINGFUL = 500;
  if (topEntropy < BLANK && bottomEntropy > MEANINGFUL) {
    const newHeight = height - halfHeight;
    const cropped = Buffer.alloc(width * newHeight * 4);
    rgba.copy(cropped, 0, halfHeight * width * 4);
    return { width, height: newHeight, rgba: cropped };
  }

  // Keep the top screen.
  const cropped = Buffer.alloc(width * halfHeight * 4);
  rgba.copy(cropped, 0, 0, halfHeight * width * 4);
  return { width, height: halfHeight, rgba: cropped };
}

/* ------------------------------------------------------------------ */
/*  Capture config                                                     */
/* ------------------------------------------------------------------ */

interface LibretroCaptureConfig {
  delaysMs: number[];
  timeoutMs: number;
}

const DEFAULT_CAPTURE_CONFIG: LibretroCaptureConfig = {
  delaysMs: [5000, 10000, 15000, 20000, 25000, 30000],
  timeoutMs: 120000,
};

function loadCaptureConfig(romPath: string): LibretroCaptureConfig {
  const configPath = join(
    dirname(romPath),
    `${basename(romPath, extname(romPath))}.htpc.json`,
  );
  if (!existsSync(configPath)) return DEFAULT_CAPTURE_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const delays = Array.isArray(raw.delaysMs)
      ? raw.delaysMs.filter((n: unknown) => typeof n === "number")
      : DEFAULT_CAPTURE_CONFIG.delaysMs;
    return {
      delaysMs: delays.length > 0 ? delays : DEFAULT_CAPTURE_CONFIG.delaysMs,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_CAPTURE_CONFIG.timeoutMs,
    };
  } catch {
    return DEFAULT_CAPTURE_CONFIG;
  }
}

/* ------------------------------------------------------------------ */
/*  Screenshot capture via libretro worker                             */
/* ------------------------------------------------------------------ */

async function runLibretroCapture(
  romPath: string,
  corePath: string,
  game: Game,
): Promise<{ url?: string; source?: string }> {
  const id = game.id;
  const destPath = join(screenshotDir, `${id}.png`);
  if (existsSync(destPath)) {
    return { url: `ember://covers/libretro/screenshots/${id}.png`, source: "libretro-screenshot" };
  }

  const config = loadCaptureConfig(romPath);
  let coreId: number | null = null;
  const capturedFrames: { width: number; height: number; png: Buffer; score: number }[] = [];

  return new Promise<{ url?: string; source?: string }>(async (resolve) => {
    let resolved = false;
    const resolveOnce = (val?: { url?: string; source?: string }) => {
      if (resolved) return;
      resolved = true;
      resolve(val ?? {});
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        log.warn("libretro:screenshot", `timeout for "${game.title}" (${id}) after ${config.timeoutMs}ms`);
        resolveOnce();
      }
    }, config.timeoutMs);

    try {
      const coreInfo = await workerCall("loadCore", corePath);
      coreId = coreInfo.id;
      log.info("libretro:screenshot", `loaded core ${coreInfo.name} (id=${coreId}) for ${game.title}`);

      try {
        await workerCall("setAudioEnabled", coreId, false);
      } catch {
        // Addon may be from an older build; audio will still run, which is fine.
      }
      await workerCall("loadGame", coreId, romPath);
      log.info("libretro:screenshot", `loaded game ${romPath}`);

      const avInfo = await workerCall("getAvInfo", coreId);
      if (!avInfo) {
        log.warn("libretro:screenshot", `no avInfo for ${romPath}`);
        clearTimeout(timeout);
        resolveOnce();
        return;
      }
      log.info("libretro:screenshot", `avInfo: ${avInfo.base_width}x${avInfo.base_height} @ ${avInfo.fps}fps`);

      await workerCall("start", coreId);
      await workerCall("setMute", coreId, true);
      log.info("libretro:screenshot", `started core (muted) for ${game.title}`);

      const startTime = Date.now();
      for (const delayMs of config.delaysMs) {
        const elapsed = Date.now() - startTime;
        const waitRemaining = delayMs - elapsed;
        if (waitRemaining > 0) {
          await new Promise((r) => setTimeout(r, waitRemaining));
        }

        const frame = await workerCall("getFrame", coreId);
        if (!frame || !frame.data || frame.width === 0 || frame.height === 0) {
          log.warn("libretro:screenshot", `blank frame at ${delayMs}ms for ${game.title}`);
          continue;
        }

        const rgba = Buffer.from(frame.data, "base64");
        const cropped = cropSolidDsScreens(frame.width, frame.height, rgba, game.platform);
        const cw = cropped.width;
        const ch = cropped.height;
        const cbuf = cropped.rgba;
        if (isImageUniform(cw, ch, cbuf)) {
          log.info("libretro:screenshot", `uniform frame at ${delayMs}ms for ${game.title}, skipping`);
          continue;
        }

        const score = scoreFrameVariance(cw, ch, cbuf);
        const png = rgbaToPng(cw, ch, cbuf);
        log.info("libretro:screenshot", `captured ${cw}x${ch} at ${delayMs}ms score=${score.toFixed(1)} for ${game.title}`);

        capturedFrames.push({ width: cw, height: ch, png, score });
      }

      await workerCall("stop", coreId);
      try {
        await workerCall("unload", coreId);
      } catch {}
      coreId = null;

      clearTimeout(timeout);

      const lastFrame = capturedFrames.at(-1);
      if (lastFrame) {
        writeFileSync(destPath, lastFrame.png);
        log.info("libretro:screenshot", `saved last screenshot for ${game.title} score=${lastFrame.score.toFixed(1)}`);
        // Save all captured frames as numbered screenshots for the gallery
        for (let i = 0; i < capturedFrames.length; i++) {
          const framePath = join(screenshotDir, `${id}_${i}.png`);
          writeFileSync(framePath, capturedFrames[i].png);
        }
        log.info("libretro:screenshot", `saved ${capturedFrames.length} screenshots for ${game.title}`);
        resolveOnce({
          url: `ember://covers/libretro/screenshots/${id}.png`,
          source: "libretro-screenshot",
        });
      } else {
        log.warn("libretro:screenshot", `no usable frames for ${game.title}`);
        resolveOnce();
      }
    } catch (err: any) {
      log.error("libretro:screenshot", `capture error for ${game.title}: ${err?.message ?? String(err)}`);
      clearTimeout(timeout);
      resolveOnce();
    } finally {
      if (coreId !== null) {
        try {
          await workerCall("unload", coreId);
        } catch {}
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Queue & concurrency                                                */
/* ------------------------------------------------------------------ */

class ScreenshotQueue {
  private queue: Array<{ game: Game; resolve: (result: { url?: string; source?: string }) => void }> = [];
  private running = 0;
  private maxConcurrency = 1;

  setMaxConcurrency(n: number) {
    this.maxConcurrency = Math.max(1, Math.min(4, n));
    this.process();
  }

  enqueue(game: Game): Promise<{ url?: string; source?: string }> {
    return new Promise((resolve) => {
      this.queue.push({ game, resolve });
      this.process();
    });
  }

  private async process() {
    while (this.running < this.maxConcurrency && this.queue.length > 0) {
      this.running++;
      const item = this.queue.shift()!;
      this.run(item.game)
        .then((result) => item.resolve(result))
        .catch((e) => {
          log.error("libretro:screenshot", `queue error: ${e}`);
          item.resolve({});
        })
        .finally(() => {
          this.running--;
          this.process();
        });
    }
  }

  private async run(game: Game): Promise<{ url?: string; source?: string }> {
    const romPath = game.romPath;
    if (!romPath) return {};

    const cores = await findCoresForRom(romPath);
    if (cores.length === 0) {
      log.warn("libretro:screenshot", `no core found for ${game.title} (${romPath})`);
      return {};
    }

    for (const core of cores) {
      const result = await runLibretroCapture(romPath, core.corePath, game);
      if (result.url) return result;
      log.warn("libretro:screenshot", `core ${core.coreName} failed for ${game.title}, trying next...`);
    }
    return {};
  }
}

const screenshotQueue = new ScreenshotQueue();
const inFlight = new Set<string>();

/* ------------------------------------------------------------------ */
/*  Semaphore                                                          */
/* ------------------------------------------------------------------ */

class Semaphore {
  private running = 0;
  private max: number;
  private queue: Array<() => void> = [];

  constructor(max: number) {
    this.max = max;
  }

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

const libretroThumbnailSemaphore = new Semaphore(4);

/* ------------------------------------------------------------------ */
/*  Disk helpers                                                       */
/* ------------------------------------------------------------------ */

function coverExistsOnDisk(id: string): string | undefined {
  for (const ext of [".png", ".jpg", ".webp"]) {
    const p = join(screenshotDir, `${id}${ext}`);
    if (existsSync(p)) return `ember://covers/libretro/screenshots/${id}${ext}`;
  }
  const svg = join(generatedDir, `${id}.svg`);
  if (existsSync(svg)) return `ember://covers/libretro/generated/${id}.svg`;
  const broken = join(generatedDir, `${id}-broken.svg`);
  if (existsSync(broken)) return `ember://covers/libretro/generated/${id}-broken.svg`;
  return undefined;
}

export function listLocalScreenshots(id: string): string[] {
  const urls: string[] = [];
  for (let i = 0; i < 20; i++) {
    const p = join(screenshotDir, `${id}_${i}.png`);
    if (existsSync(p)) {
      urls.push(`ember://covers/libretro/screenshots/${id}_${i}.png`);
    } else {
      break;
    }
  }
  return urls;
}

/* ------------------------------------------------------------------ */
/*  Procedural fallback                                                */
/* ------------------------------------------------------------------ */

function byteHue(b: number): number {
  return Math.round((b / 255) * 360);
}

function bytePct(b: number, min: number, max: number): number {
  return min + (b / 255) * (max - min);
}

function hashFileHead(filePath: string): Buffer {
  try {
    const fs = require("fs") as typeof import("fs");
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    return createHash("sha256").update(buf.subarray(0, n)).digest();
  } catch {
    return createHash("sha256").update(filePath).digest();
  }
}

function buildProceduralSVG(hash: Buffer): string {
  const bytes = Array.from(hash);
  const w = 512;
  const h = 512;

  const hueBg1 = byteHue(bytes[0]);
  const hueBg2 = byteHue(bytes[1]);
  const sat = Math.round(bytePct(bytes[2], 40, 70));
  const light1 = Math.round(bytePct(bytes[3], 10, 20));
  const light2 = Math.round(bytePct(bytes[4], 14, 24));

  const bg = `hsl(${hueBg1}, ${sat}%, ${light1}%)`;
  const bg2 = `hsl(${hueBg2}, ${sat}%, ${light2}%)`;

  let shapes = "";
  for (let i = 0; i < 5; i++) {
    const cx = Math.round(bytePct(bytes[(5 + i * 5) % bytes.length], 50, w - 50));
    const cy = Math.round(bytePct(bytes[(6 + i * 5) % bytes.length], 50, h - 50));
    const r = Math.round(bytePct(bytes[(7 + i * 5) % bytes.length], 20, 140));
    const hHue = (hueBg1 + Math.floor(bytes[(8 + i * 5) % bytes.length] / 6)) % 360;
    const hSat = Math.round(bytePct(bytes[(9 + i * 5) % bytes.length], 20, 50));
    const op = bytePct(bytes[(10 + i * 5) % bytes.length], 0.05, 0.18).toFixed(2);
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hHue},${hSat}%,60%)" opacity="${op}"/>`;
  }

  let grid = "";
  const gridColor = `hsl(${hueBg1}, ${Math.max(0, sat - 30)}%, ${light1 + 15}%)`;
  for (let i = 0; i < w; i += 64) {
    grid += `<line x1="${i}" y1="0" x2="${i}" y2="${h}" stroke="${gridColor}" stroke-width="0.5" opacity="0.08"/>`;
  }
  for (let i = 0; i < h; i += 64) {
    grid += `<line x1="0" y1="${i}" x2="${w}" y2="${i}" stroke="${gridColor}" stroke-width="0.5" opacity="0.08"/>`;
  }

  const accentHue = (hueBg1 + 180) % 360;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
  <g>${grid}</g>
  <g>${shapes}</g>
  <circle cx="${w / 2}" cy="${h / 2}" r="80" fill="none" stroke="hsl(${accentHue},30%,50%)" stroke-width="2" opacity="0.15"/>
  <circle cx="${w / 2}" cy="${h / 2}" r="120" fill="none" stroke="hsl(${accentHue},30%,50%)" stroke-width="1" opacity="0.08"/>
</svg>`;
}

function generateProceduralThumbnail(filePath: string, id: string): string | undefined {
  const dest = join(generatedDir, `${id}.svg`);
  if (existsSync(dest)) {
    return `ember://covers/libretro/generated/${id}.svg`;
  }
  try {
    const hash = hashFileHead(filePath);
    const svg = buildProceduralSVG(hash);
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(dest, svg);
    return `ember://covers/libretro/generated/${id}.svg`;
  } catch (err) {
    log.error("libretro:procedural", String(err));
    return undefined;
  }
}

function buildBrokenSVG(slug: string, subtext: string): string {
  const safeSlug = slug.slice(0, 14).toUpperCase();
  const safeSub = subtext.slice(0, 20).toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.82"/>
    </radialGradient>
    <pattern id="scan" x="0" y="0" width="512" height="6" patternUnits="userSpaceOnUse">
      <rect width="512" height="2" fill="black" fill-opacity="0.22"/>
    </pattern>
  </defs>
  <rect width="512" height="512" fill="#1a0505"/>
  <rect width="512" height="512" filter="url(#noise)" fill="#aa5555" opacity="0.9"/>
  <rect width="512" height="512" fill="url(#scan)"/>
  <rect width="512" height="512" fill="url(#vignette)"/>

  <g opacity="0.85">
    <polygon points="256,55 328,180 184,180" fill="none" stroke="#ff3333" stroke-width="6" stroke-linejoin="round"/>
    <line x1="256" y1="105" x2="256" y2="145" stroke="#ff3333" stroke-width="8" stroke-linecap="round"/>
    <circle cx="256" cy="162" r="5" fill="#ff3333"/>
  </g>

  <text x="256" y="310" text-anchor="middle" fill="#ff3333" font-size="32" font-weight="bold" font-family="'Courier New',monospace" letter-spacing="6">${safeSlug}</text>
  <line x1="80" y1="330" x2="432" y2="330" stroke="#ff3333" stroke-width="1.5" opacity="0.3"/>
  <text x="256" y="360" text-anchor="middle" fill="#ff3333" font-size="18" font-family="'Courier New',monospace" letter-spacing="2" opacity="0.55">${safeSub}</text>
  <text x="256" y="480" text-anchor="middle" fill="#ff3333" font-size="14" font-family="'Courier New',monospace" letter-spacing="2" opacity="0.3">0xDEAD · LIBRETRO ERROR</text>
</svg>`;
}

function generateBrokenThumbnail(
  id: string,
  slug: string,
  subtext: string,
): string | undefined {
  const dest = join(generatedDir, `${id}-broken.svg`);
  if (existsSync(dest)) {
    return `ember://covers/libretro/generated/${id}-broken.svg`;
  }
  try {
    const svg = buildBrokenSVG(slug, subtext);
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(dest, svg);
    return `ember://covers/libretro/generated/${id}-broken.svg`;
  } catch (err) {
    log.error("libretro:broken", String(err));
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Orchestrator                                                       */
/* ------------------------------------------------------------------ */

async function updateGameCover(id: string, url: string, source?: string): Promise<void> {
  const broken = source === "broken";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const db = getDb();
      if (source) {
        await db.query(`UPDATE game:⟨${id}⟩ SET coverUrl = $url, coverSource = $source, corrupt = $broken`, { url, source, broken });
      } else {
        await db.query(`UPDATE game:⟨${id}⟩ SET coverUrl = $url, corrupt = $broken`, { url, broken });
      }
      return;
    } catch (err: any) {
      const isConflict =
        err?.kind === "Query" &&
        (err?.message?.includes("Transaction conflict") ||
          err?.message?.includes("write conflict"));
      if (isConflict && attempt < 3) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
        continue;
      }
      log.error("libretro:updateGameCover", `DB update failed: ${err}`);
      return;
    }
  }
}

export async function loadLibretroThumbnail(
  game: Game,
  onNoCore?: () => void,
): Promise<string | undefined> {
  const romPath = game.romPath;
  if (!romPath) {
    log.info("libretro:loadLibretroThumbnail", `no romPath for ${game.id}`);
    return undefined;
  }
  const id = game.id;

  if (inFlight.has(id)) {
    log.debug("libretro:loadLibretroThumbnail", `already in flight ${id}`);
    return undefined;
  }
  inFlight.add(id);

  await libretroThumbnailSemaphore.acquire();
  try {
    const cached = coverExistsOnDisk(id);
    if (cached) {
      const source = cached.includes("-broken.svg") ? "broken" : "cached";
      await updateGameCover(id, cached, source);
      return cached;
    }

    const sidecar = findSidecarImage(romPath);
    if (sidecar) {
      const ext = extname(sidecar).toLowerCase();
      const destExt = ext === ".webp" ? ".webp" : ".jpg";
      const dest = join(screenshotDir, `${id}${destExt}`);
      if (!existsSync(dest)) {
        const data = readFileSync(sidecar);
        writeFileSync(dest, data);
      }
      const url = `ember://covers/libretro/screenshots/${id}${destExt}`;
      await updateGameCover(id, url, "sidecar");
      return url;
    }

    const online = await searchOnlineThumbnail(game.title);
    if (online) {
      await updateGameCover(id, online, "online");
      return online;
    }

    const cores = await findCoresForRom(romPath);
    if (cores.length === 0) {
      onNoCore?.();
      const procedural = generateProceduralThumbnail(romPath, id);
      if (procedural) {
        await updateGameCover(id, procedural, "procedural");
        return procedural;
      }
      const broken = generateBrokenThumbnail(id, game.slug ?? id, game.platform ?? "libretro");
      if (broken) {
        await updateGameCover(id, broken, "broken");
        return broken;
      }
      return undefined;
    }

    const screenshot = await screenshotQueue.enqueue(game);
    if (screenshot.url) {
      await updateGameCover(id, screenshot.url, screenshot.source);
      return screenshot.url;
    }

    const procedural = generateProceduralThumbnail(romPath, id);
    if (procedural) {
      await updateGameCover(id, procedural, "procedural");
      return procedural;
    }

    const broken = generateBrokenThumbnail(id, game.slug ?? id, game.platform ?? "libretro");
    if (broken) {
      await updateGameCover(id, broken, "broken");
      return broken;
    }

    return undefined;
  } catch (err) {
    log.error("libretro:loadLibretroThumbnail", `error for ${game.title}: ${err}`);
    return undefined;
  } finally {
    libretroThumbnailSemaphore.release();
    inFlight.delete(id);
  }
}

export async function requeueThumbnailsForPlatforms(platforms: string[]): Promise<number> {
  if (platforms.length === 0) return 0;
  const games = await GameRepo.list();
  let queued = 0;
  for (const game of games) {
    if (!game.romPath || !platforms.includes(game.platform)) continue;
    const hasRealThumbnail = game.coverUrl && !game.coverUrl.includes("/generated/");
    if (hasRealThumbnail) continue;

    const id = game.id;
    // Remove generated thumbnails so they get re-processed
    const svg = join(generatedDir, `${id}.svg`);
    const brokenSvg = join(generatedDir, `${id}-broken.svg`);
    try { unlinkSync(svg); } catch {}
    try { unlinkSync(brokenSvg); } catch {}
    inFlight.delete(id);

    loadLibretroThumbnail(game).catch(() => {});
    queued++;
  }
  log.info("libretro:requeue", `queued ${queued} games for platforms ${platforms.join(", ")}`);
  return queued;
}

