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

const coverRoot = join(app.getPath("userData"), "covers", "flash");
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
    console.error("[flash:metadata]", err);
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

function buildCaptureHTML(swfPath: string): string {
  const ruffleUrl = getRuffleBaseUrl();
  const escapedSwf = swfPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<base href="${ruffleUrl}/">
<style>
html,body{margin:0;padding:0;width:800px;height:600px;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}
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
    const waitMs = Math.min(35000, 5000 + (data.length / (1024 * 1024)) * 1000);
    setTimeout(() => ipcRenderer.send('flash-capture:ready'), waitMs);
  } catch (err) {
    ipcRenderer.send('flash-capture:error', String(err));
  }
}

if (window.RufflePlayer) run();
else window.addEventListener('load', run);
</script>
</body>
</html>`;
}

class ScreenshotQueue {
  private queue: Array<{ game: Game; resolve: (url?: string) => void }> = [];
  private running = false;

  enqueue(game: Game): Promise<string | undefined> {
    return new Promise((resolve) => {
      this.queue.push({ game, resolve });
      this.process();
    });
  }

  private async process() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await this.run(item.game);
        item.resolve(result);
      } catch (e) {
        console.error("[flash:screenshot] queue error:", e);
        item.resolve(undefined);
      }
    }
    this.running = false;
  }

  private async run(game: Game): Promise<string | undefined> {
    if (!game.romPath) return undefined;
    const id = game.id;
    const destPath = join(screenshotDir, `${id}.png`);
    if (existsSync(destPath)) {
      return `htpc-thumb://covers/flash/screenshots/${id}.png`;
    }

    return new Promise<string | undefined>((resolve) => {
      let resolved = false;
      const resolveOnce = (val?: string) => {
        if (resolved) return;
        resolved = true;
        resolve(val);
        try {
          win.destroy();
        } catch {}
      };

      const win = new BrowserWindow({
        width: 800,
        height: 600,
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

      const targetId = win.webContents.id;

      const onReady = (event: Electron.IpcMainEvent) => {
        if (event.sender.id !== targetId) return;
        cleanup();
        win
          .webContents.capturePage()
          .then((image: NativeImage) => {
            if (isImageUniform(image)) {
              // Mostly blank — generate procedural instead
              const svgUrl = generateProceduralThumbnail(game.romPath!, id);
              resolveOnce(svgUrl);
            } else {
              const png = image.toPNG();
              writeFileSync(destPath, png);
              resolveOnce(
                `htpc-thumb://covers/flash/screenshots/${id}.png`,
              );
            }
          })
          .catch(() => resolveOnce());
      };

      const onError = (event: Electron.IpcMainEvent, _err: string) => {
        if (event.sender.id !== targetId) return;
        cleanup();
        resolveOnce();
      };

      const cleanup = () => {
        ipcMain.off("flash-capture:ready", onReady);
        ipcMain.off("flash-capture:error", onError);
      };

      ipcMain.on("flash-capture:ready", onReady);
      ipcMain.on("flash-capture:error", onError);

      const html = buildCaptureHTML(game.romPath);
      win
        .loadURL(`data:text/html,${encodeURIComponent(html)}`)
        .catch(() => {
          cleanup();
          resolveOnce();
        });

      setTimeout(() => {
        if (!resolved) {
          cleanup();
          resolveOnce();
        }
      }, 45000);
    });
  }
}

const screenshotQueue = new ScreenshotQueue();
const inFlight = new Set<string>();

function coverExistsOnDisk(id: string): string | undefined {
  for (const ext of [".png", ".jpg", ".webp"]) {
    const p = join(screenshotDir, `${id}${ext}`);
    if (existsSync(p)) return `htpc-thumb://covers/flash/screenshots/${id}${ext}`;
  }
  const svg = join(generatedDir, `${id}.svg`);
  if (existsSync(svg)) return `htpc-thumb://covers/flash/generated/${id}.svg`;
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
    return `htpc-thumb://covers/flash/generated/${id}.svg`;
  }
  try {
    const hash = hashFileHead(filePath);
    const svg = buildProceduralSVG(hash);
    writeFileSync(dest, svg);
    return `htpc-thumb://covers/flash/generated/${id}.svg`;
  } catch (err) {
    console.error("[flash:procedural]", err);
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Orchestrator                                                       */
/* ------------------------------------------------------------------ */

async function updateGameCover(id: string, url: string): Promise<void> {
  try {
    const db = getDb();
    await db.query(`UPDATE game:⟨${id}⟩ SET coverUrl = $url`, { url });
  } catch (err) {
    console.error("[flash:updateGameCover] DB update failed", err);
  }
}

export async function loadFlashThumbnail(
  game: Game,
): Promise<string | undefined> {
  if (!game.romPath) return undefined;
  const id = game.id;

  // Deduplicate concurrent calls
  if (inFlight.has(id)) return undefined;
  inFlight.add(id);

  try {
    // Check if already on disk from a previous run
    const cached = coverExistsOnDisk(id);
    if (cached) {
      await updateGameCover(id, cached);
      return cached;
    }

    // 1. Sidecar image
    const sidecar = findSidecarImage(game.romPath);
    if (sidecar) {
      const ext = extname(sidecar).toLowerCase();
      const destExt = ext === ".webp" ? ".webp" : ".jpg";
      const dest = join(screenshotDir, `${id}${destExt}`);
      if (!existsSync(dest)) {
        const data = readFileSync(sidecar);
        writeFileSync(dest, data);
      }
      const url = `htpc-thumb://covers/flash/screenshots/${id}${destExt}`;
      await updateGameCover(id, url);
      return url;
    }

    // 2. Online database
    const onlineUrl = await searchOnlineThumbnail(game.title);
    if (onlineUrl) {
      try {
        const res = await fetch(onlineUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const dest = join(screenshotDir, `${id}.jpg`);
          writeFileSync(dest, buf);
          const url = `htpc-thumb://covers/flash/screenshots/${id}.jpg`;
          await updateGameCover(id, url);
          return url;
        }
      } catch {}
    }

    // 3. Offscreen Ruffle screenshot (queued)
    const screenshotUrl = await screenshotQueue.enqueue(game);
    if (screenshotUrl) {
      await updateGameCover(id, screenshotUrl);
      return screenshotUrl;
    }

    // 4. Procedural fallback
    const procUrl = generateProceduralThumbnail(game.romPath, id);
    if (procUrl) await updateGameCover(id, procUrl);
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
  return `htpc-thumb://covers/flash/screenshots/${id}${destExt}`;
}
