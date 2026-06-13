import { app, BrowserWindow, ipcMain, NativeImage } from "electron";
import { join, dirname, basename, extname } from "path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  openSync,
  closeSync,
  readSync,
} from "fs";
import { createHash } from "crypto";
import { getDb } from "../db";
import { Game } from "../../shared/types";
import { searchGame } from "./rawg.service";
import { getSettings } from "./settings.service";
import { createLogger } from "../util/logger";

const log = createLogger("info");

let coverRoot;
try { coverRoot = join(app.getPath("userData"), "covers", "flash"); } catch { coverRoot = join(process.cwd(), "covers", "flash"); }
const screenshotDir = join(coverRoot, "screenshots");
const generatedDir = join(coverRoot, "generated");
mkdirSync(screenshotDir, { recursive: true });
mkdirSync(generatedDir, { recursive: true });

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getRuffleBaseUrl(): string {
  const isDev = !app.isPackaged;
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    return `${process.env["ELECTRON_RENDERER_URL"]}/ruffle`;
  }
  return `file://${join(__dirname, "../renderer/ruffle")}`;
}

/* ------------------------------------------------------------------ */
/*  Per-SWF capture config                                            */
/* ------------------------------------------------------------------ */

interface FlashCaptureConfig {
  width: number;
  height: number;
  waitMs: number;
  timeoutMs: number;
  backgroundColor: string;
}

const DEFAULT_CAPTURE_CONFIG: FlashCaptureConfig = {
  width: 800,
  height: 600,
  waitMs: 40000,
  timeoutMs: 120000,
  backgroundColor: "#000",
};

function loadCaptureConfig(swfPath: string): FlashCaptureConfig {
  const configPath = join(
    dirname(swfPath),
    `${basename(swfPath, extname(swfPath))}.htpc.json`,
  );
  if (!existsSync(configPath)) return DEFAULT_CAPTURE_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
      width: typeof raw.width === "number" ? raw.width : DEFAULT_CAPTURE_CONFIG.width,
      height: typeof raw.height === "number" ? raw.height : DEFAULT_CAPTURE_CONFIG.height,
      waitMs: typeof raw.waitMs === "number" ? raw.waitMs : DEFAULT_CAPTURE_CONFIG.waitMs,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_CAPTURE_CONFIG.timeoutMs,
      backgroundColor: typeof raw.backgroundColor === "string" ? raw.backgroundColor : DEFAULT_CAPTURE_CONFIG.backgroundColor,
    };
  } catch {
    return DEFAULT_CAPTURE_CONFIG;
  }
}

function hashFileHead(filePath: string): Buffer {
  try {
    const fd = openSync(filePath, "r");
    const buf = Buffer.alloc(4096);
    const n = readSync(fd, buf, 0, 4096, 0);
    closeSync(fd);
    return createHash("sha256").update(buf.subarray(0, n)).digest();
  } catch {
    return createHash("sha256").update(filePath).digest();
  }
}

function byteHue(b: number): number {
  return Math.round((b / 255) * 360);
}

function bytePct(b: number, min: number, max: number): number {
  return min + (b / 255) * (max - min);
}

/* ------------------------------------------------------------------ */
/*  1. Sidecar image check                                             */
/* ------------------------------------------------------------------ */

export function findSidecarImage(filePath: string): string | undefined {
  const dir = dirname(filePath);
  const base = basename(filePath, extname(filePath));
  const candidates = [
    `${base}.png`,
    `${base}.jpg`,
    `${base}.jpeg`,
    `${base}.webp`,
    `${base}-thumb.png`,
    `${base}-thumb.jpg`,
    `${base}-cover.png`,
    `${base}-cover.jpg`,
    `${base}-thumbnail.png`,
    `${base}-thumbnail.jpg`,
  ];
  for (const name of candidates) {
    const full = join(dir, name);
    if (existsSync(full)) return full;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  2. SWF metadata extraction                                       */
/* ------------------------------------------------------------------ */

export interface SwfMetadata {
  title?: string;
  description?: string;
  width?: number;
  height?: number;
  frameRate?: number;
}

export function extractSwfMetadata(filePath: string): SwfMetadata {
  try {
    const fd = readFileSync(filePath);
    const sig = fd.subarray(0, 3).toString("ascii");
    let uncompressed: Buffer;
    let offset = 8;

    if (sig === "FWS") {
      uncompressed = fd;
    } else if (sig === "CWS") {
      const { inflateSync } = require("zlib");
      const inflated = inflateSync(fd.subarray(8));
      uncompressed = Buffer.concat([fd.subarray(0, 8), inflated]);
    } else if (sig === "ZWS") {
      // LZMA compressed — too complex, skip
      return {};
    } else {
      return {};
    }

    const version = uncompressed[3];
    // Parse RECT: first byte gives N bits per field
    const bitsByte = uncompressed[offset];
    const nBits = bitsByte >> 3;
    const totalBits = 5 + nBits * 4;
    const totalBytes = Math.ceil(totalBits / 8);
    offset += totalBytes;

    // Frame rate (fixed 8.8) + frame count
    offset += 4;

    const metadata: SwfMetadata = {};
    let tagCount = 0;

    while (offset < uncompressed.length && tagCount < 200) {
      tagCount++;
      const tagCodeAndLength = uncompressed.readUInt16LE(offset);
      const tagCode = tagCodeAndLength >> 6;
      let tagLength = tagCodeAndLength & 0x3f;
      offset += 2;
      if (tagLength === 0x3f) {
        if (offset + 4 > uncompressed.length) break;
        tagLength = uncompressed.readUInt32LE(offset);
        offset += 4;
      }
      if (offset + tagLength > uncompressed.length) break;

      if (tagCode === 77) {
        // Metadata tag
        const xml = uncompressed
          .subarray(offset, offset + tagLength)
          .toString("utf8");
        const titleMatch = xml.match(
          /<dc:title[^>]*>(?:<rdf:Alt>.*?<rdf:li[^>]*>(.*?)<\/rdf:li>.*?<\/rdf:Alt>|<!\[CDATA\[(.*?)\]\]>|([^<]+))<\/dc:title>/is,
        );
        if (titleMatch)
          metadata.title =
            titleMatch[1] || titleMatch[2] || titleMatch[3]?.trim();
        const descMatch = xml.match(
          /<dc:description[^>]*>(?:<rdf:Alt>.*?<rdf:li[^>]*>(.*?)<\/rdf:li>.*?<\/rdf:Alt>|<!\[CDATA\[(.*?)\]\]>|([^<]+))<\/dc:description>/is,
        );
        if (descMatch)
          metadata.description =
            descMatch[1] || descMatch[2] || descMatch[3]?.trim();
        break; // metadata tag is usually early
      }

      // DefineShape tags can hint at dimensions, but we already have header RECT
      offset += tagLength;
    }

    return metadata;
  } catch (err) {
    log.error("flash:metadata", String(err));
    return {};
  }
}

/* ------------------------------------------------------------------ */
/*  3. Online database thumbnail                                     */
/* ------------------------------------------------------------------ */

export async function searchOnlineThumbnail(
  title: string,
): Promise<string | undefined> {
  try {
    const settings = await getSettings();
    const rawg = await searchGame(title, settings.rawgApiKey);
    if (rawg?.background_image) return rawg.background_image;
    return undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  4. Offscreen Ruffle screenshot (single queue)                    */
/* ------------------------------------------------------------------ */

function isImageUniform(image: NativeImage): boolean {
  const size = image.getSize();
  const bitmap = image.toBitmap(); // BGRA
  if (bitmap.length < 100) return true;

  const w = size.width;
  const h = size.height;
  const samples: number[] = [];
  const coords = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), Math.floor(h / 2)],
    [Math.floor(w / 4), Math.floor(h / 4)],
    [Math.floor((3 * w) / 4), Math.floor((3 * h) / 4)],
    [Math.floor(w / 2), 0],
    [0, Math.floor(h / 2)],
  ];

  for (const [x, y] of coords) {
    const idx = (y * w + x) * 4;
    // Sum B+G+R (ignore A)
    samples.push(bitmap[idx] + bitmap[idx + 1] + bitmap[idx + 2]);
  }

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance =
    samples.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) /
    samples.length;

  // Very low variance means mostly one colour (e.g. black screen)
  return variance < 600;
}

function buildCaptureHTML(swfPath: string, config: FlashCaptureConfig): string {
  const ruffleUrl = getRuffleBaseUrl();
  const escapedSwf = swfPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<base href="${ruffleUrl}/">
<style>
html,body{margin:0;padding:0;width:${config.width}px;height:${config.height}px;background:${config.backgroundColor};overflow:hidden;display:flex;align-items:center;justify-content:center}
#player{width:100%;height:100%}
</style>
<script src="${ruffleUrl}/ruffle.js"></script>
</head>
<body>
<div id="player"></div>
<script>
const fs = require('fs');
const { ipcRenderer } = require('electron');

async function run() {
  try {
    const ruffle = window.RufflePlayer.newest();
    const player = ruffle.createPlayer();
    player.id = 'ruffle-capture';
    player.style.width = '100%';
    player.style.height = '100%';
    document.getElementById('player').appendChild(player);
    const data = fs.readFileSync('${escapedSwf}');
    await player.load({ data });
    setTimeout(() => {
      ipcRenderer.send('flash-capture:ready');
    }, ${config.waitMs});
  } catch (err) {
    ipcRenderer.send('flash-capture:error', String(err));
  }
}

function startWhenReady() {
  if (window.RufflePlayer) {
    run();
  } else if (document.readyState === 'loading') {
    window.addEventListener('load', startWhenReady);
  } else {
    const poll = setInterval(() => {
      if (window.RufflePlayer) {
        clearInterval(poll);
        run();
      }
    }, 50);
    setTimeout(() => {
      clearInterval(poll);
      ipcRenderer.send('flash-capture:log', '[flash:run] RufflePlayer never appeared, sending error');
      ipcRenderer.send('flash-capture:error', 'RufflePlayer not available');
    }, 15000);
  }
}
startWhenReady();
</script>
</body>
</html>`;
}

class ScreenshotQueue {
  private queue: Array<{ game: Game; resolve: (result: { url?: string; source?: string }) => void }> = [];
  private running = 0;
  private readonly maxConcurrency = 4;

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
          log.error("flash:screenshot", `queue error: ${e}`);
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
    const id = game.id;
    const destPath = join(screenshotDir, `${id}.png`);
    if (existsSync(destPath)) {
      return { url: `ember://covers/flash/screenshots/${id}.png`, source: "ruffle-screenshot" };
    }

    return new Promise<{ url?: string; source?: string }>((resolve) => {
      let resolved = false;
      const resolveOnce = (val?: string, source?: string) => {
        if (resolved) return;
        resolved = true;
        resolve({ url: val, source });
        try {
          win.destroy();
        } catch {}
      };

      const config = loadCaptureConfig(romPath);

      const win = new BrowserWindow({
        width: config.width,
        height: config.height,
        show: false,
        frame: false,
        skipTaskbar: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          webSecurity: false,          
        },
      });
      win.webContents.setAudioMuted(true);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

      win.webContents.on("console-message", (event, level, message) => {
        if (level >= 3) {
          log.error("flash:renderer", message);
        }
      });

      win.webContents.on("render-process-gone", (event, details) => {
        log.error("flash:renderer:crashed", `reason=${details.reason}, exitCode=${details.exitCode}`);
        cleanup();
        const brokenUrl = generateBrokenThumbnail(id, "CRASHED", "RENDERER GONE");
        if (brokenUrl) {
          recordBrokenFlashGame(game, `render-process-gone: ${details.reason}`);
          resolveOnce(brokenUrl, "broken");
        } else {
          resolveOnce(undefined, "procedural-crash");
        }
      });

      const targetId = win.webContents.id;

      const onReady = (event: Electron.IpcMainEvent) => {
        if (event.sender.id !== targetId) return;
        cleanup();
        win
          .webContents.capturePage()
          .then((image: NativeImage) => {
            if (isImageUniform(image)) {
              log.warn("flash:screenshot", `blank/uniform screenshot for "${game.title}" (${id}), falling back to procedural`);
              const svgUrl = generateProceduralThumbnail(romPath, id);
              resolveOnce(svgUrl, "procedural-blank");
            } else {
              const png = image.toPNG();
              mkdirSync(screenshotDir, { recursive: true });
              writeFileSync(destPath, png);
              resolveOnce(
                `ember://covers/flash/screenshots/${id}.png`,
                "ruffle-screenshot",
              );
            }
          })
          .catch((err) => {
            log.error("flash:screenshot", `capturePage failed for "${game.title}" (${id}): ${err}`);
            const brokenUrl = generateBrokenThumbnail(id, "CAPTURE FAIL", "SCREENSHOT ERROR");
            if (brokenUrl) {
              recordBrokenFlashGame(game, `capturePage failed: ${err}`);
              resolveOnce(brokenUrl, "broken");
            } else {
              resolveOnce(undefined, "procedural-capture-error");
            }
          });
      };

      const onError = (event: Electron.IpcMainEvent, _err: string) => {
        if (event.sender.id !== targetId) return;
        log.error("flash:screenshot", `Ruffle IPC error for "${game.title}" (${id}): ${_err}`);
        cleanup();
        const errLower = _err.toLowerCase();
        const slug = errLower.includes("buffer") ? "LOAD FAIL" : errLower.includes("movie") ? "LOAD FAIL" : "BROKEN";
        const subtext = errLower.includes("buffer") ? "BUFFER ERROR" : "FLASH ERROR";
        const brokenUrl = generateBrokenThumbnail(id, slug, subtext);
        if (brokenUrl) {
          recordBrokenFlashGame(game, _err);
          resolveOnce(brokenUrl, "broken");
        } else {
          resolveOnce(undefined, "procedural-ruffle-error");
        }
      };

      const onLog = (event: Electron.IpcMainEvent, msg: string) => {
        if (event.sender.id !== targetId) return;
        log.info("flash:renderer", msg);
      };

      const cleanup = () => {
        ipcMain.off("flash-capture:ready", onReady);
        ipcMain.off("flash-capture:error", onError);
        ipcMain.off("flash-capture:log", onLog);
      };

      ipcMain.on("flash-capture:ready", onReady);
      ipcMain.on("flash-capture:error", onError);
      ipcMain.on("flash-capture:log", onLog);

      const html = buildCaptureHTML(romPath, config);
      win
        .loadURL(`data:text/html,${encodeURIComponent(html)}`)
        .catch((err) => {
          log.error("flash:screenshot", `window load failed for "${game.title}" (${id}): ${err}`);
          cleanup();
          const brokenUrl = generateBrokenThumbnail(id, "LOAD FAIL", "WINDOW ERROR");
          if (brokenUrl) {
            recordBrokenFlashGame(game, `window load failed: ${err}`);
            resolveOnce(brokenUrl, "broken");
          } else {
            resolveOnce(undefined, "procedural-load-error");
          }
        });

      setTimeout(() => {
        if (!resolved) {
          log.warn("flash:screenshot", `timeout for "${game.title}" (${id}) after ${config.timeoutMs}ms, giving up`);
          cleanup();
          const brokenUrl = generateBrokenThumbnail(id, "TIMEOUT", "NO RESPONSE");
          if (brokenUrl) {
            recordBrokenFlashGame(game, `timeout after ${config.timeoutMs}ms`);
            resolveOnce(brokenUrl, "broken");
          } else {
            resolveOnce(undefined, "procedural-timeout");
          }
        }
      }, config.timeoutMs);
    });
  }
}

const screenshotQueue = new ScreenshotQueue();
const inFlight = new Set<string>();

export function clearInFlight(id: string): void {
  inFlight.delete(id);
}

function coverExistsOnDisk(id: string): string | undefined {
  for (const ext of [".png", ".jpg", ".webp"]) {
    const p = join(screenshotDir, `${id}${ext}`);
    if (existsSync(p)) return `ember://covers/flash/screenshots/${id}${ext}`;
  }
  const svg = join(generatedDir, `${id}.svg`);
  if (existsSync(svg)) return `ember://covers/flash/generated/${id}.svg`;
  const broken = join(generatedDir, `${id}-broken.svg`);
  if (existsSync(broken)) return `ember://covers/flash/generated/${id}-broken.svg`;
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  5. Procedural thumbnail (music-style)                              */
/* ------------------------------------------------------------------ */

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

  // Geometric circles / orbs (game-like)
  let shapes = "";
  for (let i = 0; i < 5; i++) {
    const cx = Math.round(
      bytePct(bytes[(5 + i * 5) % bytes.length], 50, w - 50),
    );
    const cy = Math.round(
      bytePct(bytes[(6 + i * 5) % bytes.length], 50, h - 50),
    );
    const r = Math.round(
      bytePct(bytes[(7 + i * 5) % bytes.length], 20, 140),
    );
    const hHue = (hueBg1 + Math.floor(bytes[(8 + i * 5) % bytes.length] / 6)) % 360;
    const hSat = Math.round(
      bytePct(bytes[(9 + i * 5) % bytes.length], 20, 50),
    );
    const op = bytePct(bytes[(10 + i * 5) % bytes.length], 0.05, 0.18).toFixed(
      2,
    );
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hHue},${hSat}%,60%)" opacity="${op}"/>`;
  }

  // Grid lines reminiscent of a Flash stage
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

export function generateProceduralThumbnail(
  filePath: string,
  id: string,
): string | undefined {
  const dest = join(generatedDir, `${id}.svg`);
  if (existsSync(dest)) {
    return `ember://covers/flash/generated/${id}.svg`;
  }
  try {
    const hash = hashFileHead(filePath);
    const svg = buildProceduralSVG(hash);
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(dest, svg);
    return `ember://covers/flash/generated/${id}.svg`;
  } catch (err) {
    log.error("flash:procedural", String(err));
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  6. Broken thumbnail (Pixel Graveyard style)                        */
/* ------------------------------------------------------------------ */

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

  <!-- Warning triangle -->
  <g opacity="0.85">
    <polygon points="256,55 328,180 184,180" fill="none" stroke="#ff3333" stroke-width="6" stroke-linejoin="round"/>
    <line x1="256" y1="105" x2="256" y2="145" stroke="#ff3333" stroke-width="8" stroke-linecap="round"/>
    <circle cx="256" cy="162" r="5" fill="#ff3333"/>
  </g>

  <text x="256" y="310" text-anchor="middle" fill="#ff3333" font-size="32" font-weight="bold" font-family="'Courier New',monospace" letter-spacing="6">${safeSlug}</text>
  <line x1="80" y1="330" x2="432" y2="330" stroke="#ff3333" stroke-width="1.5" opacity="0.3"/>
  <text x="256" y="360" text-anchor="middle" fill="#ff3333" font-size="18" font-family="'Courier New',monospace" letter-spacing="2" opacity="0.55">${safeSub}</text>
  <text x="256" y="480" text-anchor="middle" fill="#ff3333" font-size="14" font-family="'Courier New',monospace" letter-spacing="2" opacity="0.3">0xDEAD · FLASH ERROR</text>
</svg>`;
}

export function generateBrokenThumbnail(
  id: string,
  slug: string,
  subtext: string,
): string | undefined {
  const dest = join(generatedDir, `${id}-broken.svg`);
  if (existsSync(dest)) {
    return `ember://covers/flash/generated/${id}-broken.svg`;
  }
  try {
    const svg = buildBrokenSVG(slug, subtext);
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(dest, svg);
    return `ember://covers/flash/generated/${id}-broken.svg`;
  } catch (err) {
    log.error("flash:broken", String(err));
    return undefined;
  }
}

async function recordBrokenFlashGame(
  game: Game,
  reason: string,
): Promise<void> {
  try {
    const db = getDb();
    await db.query(`UPSERT broken_flash_game:⟨${game.id}⟩ CONTENT $data`, {
      data: {
        id: game.id,
        gameId: game.id,
        title: game.title,
        romPath: game.romPath ?? "",
        reason,
        detectedAt: Date.now(),
      },
    });
  } catch (err) {
    log.error("flash:broken", `Failed to record broken game: ${err}`);
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
      log.error("flash:updateGameCover", `DB update failed: ${err}`);
      return;
    }
  }
}

export async function loadFlashThumbnail(
  game: Game,
): Promise<string | undefined> {
  const romPath = game.romPath;
  if (!romPath) {
    log.info("flash:loadFlashThumbnail", `no romPath for ${game.id}`);
    return undefined;
  }
  const id = game.id;

  // Deduplicate concurrent calls
  if (inFlight.has(id)) {
    log.debug("flash:loadFlashThumbnail", `already in flight ${id}`);
    return undefined;
  }
  inFlight.add(id);

  try {
    // Check if already on disk from a previous run
    const cached = coverExistsOnDisk(id);
    if (cached) {
      const source = cached.includes("-broken.svg") ? "broken" : "cached";
      await updateGameCover(id, cached, source);
      return cached;
    }

    // 1. Sidecar image
    const sidecar = findSidecarImage(romPath);
    if (sidecar) {
    log.debug("flash:loadFlashThumbnail", `using sidecar ${sidecar}`);
      const ext = extname(sidecar).toLowerCase();
      const destExt = ext === ".webp" ? ".webp" : ".jpg";
      const dest = join(screenshotDir, `${id}${destExt}`);
      if (!existsSync(dest)) {
        const data = readFileSync(sidecar);
        writeFileSync(dest, data);
      }
      const url = `ember://covers/flash/screenshots/${id}${destExt}`;
      await updateGameCover(id, url, "sidecar");
      return url;
    }

    // 2. Online database
    const onlineUrl = await searchOnlineThumbnail(game.title);
    if (onlineUrl) {
      log.info("flash:loadFlashThumbnail", `downloading online cover ${onlineUrl}`);
      try {
        const res = await fetch(onlineUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const dest = join(screenshotDir, `${id}.jpg`);
          writeFileSync(dest, buf);
          const url = `ember://covers/flash/screenshots/${id}.jpg`;
          await updateGameCover(id, url, "online");
          return url;
        }
      } catch {}
    }

    // 3. Offscreen Ruffle screenshot (queued)
    log.info("flash:loadFlashThumbnail", `queuing Ruffle screenshot for ${game.title}`);
    const { url: screenshotUrl, source: screenshotSource } = await screenshotQueue.enqueue(game);
    if (screenshotUrl) {
      log.info("flash:loadFlashThumbnail", `got screenshot ${screenshotUrl} source: ${screenshotSource}`);
      await updateGameCover(id, screenshotUrl, screenshotSource);
      return screenshotUrl;
    }

    // 4. Procedural fallback
    log.info("flash:loadFlashThumbnail", `falling back to procedural for ${game.title}`);
    const procUrl = generateProceduralThumbnail(romPath, id);
    if (procUrl) await updateGameCover(id, procUrl, "procedural-fallback");
    return procUrl;
  } finally {
    inFlight.delete(id);
  }
}

/* ------------------------------------------------------------------ */
/*  Scan-time helpers                                                  */
/* ------------------------------------------------------------------ */

export function copySidecarCover(
  filePath: string,
  id: string,
): string | undefined {
  const sidecar = findSidecarImage(filePath);
  if (!sidecar) return undefined;
  const ext = extname(sidecar).toLowerCase();
  const destExt = ext === ".webp" ? ".webp" : ".jpg";
  const dest = join(screenshotDir, `${id}${destExt}`);
  if (!existsSync(dest)) {
    const data = readFileSync(sidecar);
    writeFileSync(dest, data);
  }
  return `ember://covers/flash/screenshots/${id}${destExt}`;
}
