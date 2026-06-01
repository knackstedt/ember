import { createHash } from "crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readSync,
} from "fs";
import { join, extname, dirname, basename } from "path";
import { app, dialog } from "electron";
import { loadMusicMetadata } from "music-metadata";
import { MusicTrack } from "../../shared/types";
import { getDb } from "../db";

const coverCache = join(app.getPath("userData"), "covers", "music");
const generatedCache = join(coverCache, "generated");
const artistCache = join(app.getPath("userData"), "covers", "artists");
mkdirSync(generatedCache, { recursive: true });
mkdirSync(artistCache, { recursive: true });

const inFlight = new Set<string>();

let musicMetadata: any = null;

async function getMusicMetadata() {
  if (!musicMetadata) musicMetadata = await loadMusicMetadata();
  return musicMetadata;
}

const FOLDER_ART_NAMES = [
  "cover.jpg",
  "folder.jpg",
  "album.jpg",
  "front.jpg",
  "art.jpg",
  "thumbnail.jpg",
  "cover.png",
  "folder.png",
  "album.png",
  "front.png",
  "art.png",
  "thumbnail.png",
];

/* ------------------------------------------------------------------ */
/*  Procedural cover-art generator (deterministic SVG)                */
/* ------------------------------------------------------------------ */

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

function buildProceduralSVG(hash: Buffer): string {
  const bytes = Array.from(hash);
  const w = 512;
  const h = 512;

  const hueBg1 = byteHue(bytes[0]);
  const hueBg2 = byteHue(bytes[1]);
  const sat = Math.round(bytePct(bytes[2], 40, 70));
  const light1 = Math.round(bytePct(bytes[3], 10, 18));
  const light2 = Math.round(bytePct(bytes[4], 14, 24));

  const hueAccent = byteHue(bytes[5]);

  // Background gradient
  const bg = `hsl(${hueBg1}, ${sat}%, ${light1}%)`;
  const bg2 = `hsl(${hueBg2}, ${sat}%, ${light2}%)`;

  // Low-contrast editorial block behind everything
  const blockHue = (hueBg1 + 160 + Math.floor(bytes[6] / 4)) % 360;
  const blockSat = Math.round(bytePct(bytes[7], 30, 55));
  const blockLight = Math.round(bytePct(bytes[8], 28, 48));
  const blockW = Math.round(bytePct(bytes[9], 200, 380));
  const blockH = h;
  const blockX = bytePct(bytes[10], 0, 1) < 0.5 ? 0 : w - blockW;
  const blockColor = `hsl(${blockHue}, ${blockSat}%, ${blockLight}%)`;

  // Construct overlapping rectangles (replaces vinyl rings)
  let rects = "";
  for (let i = 0; i < 3; i++) {
    const rw = Math.round(
      bytePct(bytes[(11 + i * 6) % bytes.length], 160, 360),
    );
    const rh = Math.round(
      bytePct(bytes[(12 + i * 6) % bytes.length], 120, 300),
    );
    const rx = Math.round(
      bytePct(bytes[(13 + i * 6) % bytes.length], 40, w - rw - 40),
    );
    const ry = Math.round(
      bytePct(bytes[(14 + i * 6) % bytes.length], 40, h - rh - 40),
    );
    const rot = Math.round(
      bytePct(bytes[(15 + i * 6) % bytes.length], -10, 10),
    );
    const rHue =
      (hueBg1 + Math.floor(bytes[(16 + i * 6) % bytes.length] / 8)) % 360;
    const rSat = Math.round(
      bytePct(bytes[(17 + i * 6) % bytes.length], 20, 40),
    );
    const rOp = bytePct(bytes[(18 + i * 6) % bytes.length], 0.04, 0.14).toFixed(
      2,
    );
    rects += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="2" fill="hsl(${rHue},${rSat}%,55%)" opacity="${rOp}" transform="rotate(${rot}, ${rx + rw / 2}, ${ry + rh / 2})"/>`;
  }

  // Waveform bars (bottom area) — single solid color, low contrast
  const barCount = 48;
  const barMaxH = 70;
  const barW = 6;
  const barGap = 4;
  const barStartX = (w - barCount * (barW + barGap)) / 2 + barGap / 2;
  const barBaseY = 430;
  const barColor = `hsl(${hueAccent}, ${Math.max(10, sat - 10)}%, ${light1 + 22}%)`;

  let bars = "";
  for (let i = 0; i < barCount; i++) {
    const bh = Math.round(bytePct(bytes[(19 + i) % bytes.length], 8, barMaxH));
    const bx = Math.round(barStartX + i * (barW + barGap));
    const by = barBaseY - bh;
    const opacity = bytePct(bytes[(23 + i) % bytes.length], 0.25, 0.55).toFixed(
      2,
    );
    bars += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="${barColor}" opacity="${opacity}"/>`;
  }

  // Thin accent line
  const lineY = Math.round(bytePct(bytes[24], 200, 380));
  const lineHue = (hueAccent + 120) % 360;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="28" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
  <!-- Editorial block -->
  <rect x="${blockX}" y="0" width="${blockW}" height="${blockH}" fill="${blockColor}" opacity="0.18"/>
  <!-- Construct rectangles -->
  <g>${rects}</g>
  <!-- Accent line -->
  <line x1="80" y1="${lineY}" x2="432" y2="${lineY}" stroke="hsl(${lineHue},20%,50%)" stroke-width="0.5" opacity="0.25"/>
  <!-- Waveform -->
  <g>${bars}</g>
</svg>`;
}

export async function generateProceduralCover(
  filePath: string,
  id: string,
  artist?: string,
  album?: string,
): Promise<string | undefined> {
  const dest = join(generatedCache, `${id}.svg`);
  if (existsSync(dest)) {
    return `htpc-thumb://covers/music/generated/${id}.svg`;
  }
  try {
    const hash = hashFileHead(filePath);
    const svg = buildProceduralSVG(hash);
    writeFileSync(dest, svg);
    return `htpc-thumb://covers/music/generated/${id}.svg`;
  } catch (err) {
    console.error("[generateProceduralCover]", err);
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Lazy thumbnail loading                                            */
/* ------------------------------------------------------------------ */

export async function extractCover(
  filePath: string,
  id: string,
): Promise<string | undefined> {
  try {
    const mm = await getMusicMetadata();
    const meta = await mm.parseFile(filePath, { skipCovers: false });
    const picture = mm.selectCover(meta.common.picture);
    if (!picture) return undefined;
    const dest = join(coverCache, `${id}.jpg`);
    if (!existsSync(dest)) {
      writeFileSync(dest, picture.data);
    }
    return `htpc-thumb://covers/music/${id}.jpg`;
  } catch {
    return undefined;
  }
}

export function findFolderArt(
  filePath: string,
  id: string,
): string | undefined {
  try {
    const dir = dirname(filePath);
    for (const name of FOLDER_ART_NAMES) {
      const full = join(dir, name);
      if (existsSync(full)) {
        const dest = join(coverCache, `${id}.jpg`);
        if (!existsSync(dest)) {
          const data = readFileSync(full);
          writeFileSync(dest, data);
        }
        return `htpc-thumb://covers/music/${id}.jpg`;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function normalizeId(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof (raw as any).id === "string") return (raw as any).id;
  return String(raw);
}

async function updateTrackCoverWithRetry(
  id: string,
  url: string,
  retries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const db = getDb();
      await db.query(`UPDATE music_track:⟨${id}⟩ SET albumArtUrl = $url`, {
        url,
      });
      return;
    } catch (err: any) {
      const isConflict =
        err?.kind === "Query" &&
        (err?.message?.includes("Transaction conflict") ||
          err?.message?.includes("write conflict"));
      if (isConflict && attempt < retries) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
        continue;
      }
      throw err;
    }
  }
}

export async function loadThumbnail(
  track: MusicTrack,
): Promise<string | undefined> {
  const id = normalizeId(track.id);
  if (inFlight.has(id)) return undefined;
  inFlight.add(id);

  try {
    const { filePath } = track;
    const url =
      (await extractCover(filePath, id)) ??
      findFolderArt(filePath, id) ??
      (await generateProceduralCover(filePath, id));
    if (url) {
      try {
        await updateTrackCoverWithRetry(id, url);
      } catch (err) {
        console.error("[loadThumbnail] DB update failed", err);
      }
    }
    return url;
  } finally {
    inFlight.delete(id);
  }
}

/* ------------------------------------------------------------------ */
/*  Shared throttled fetch utilities                                    */
/* ------------------------------------------------------------------ */

interface ThrottleSlot {
  url: string;
  resolve: (res: Response) => void;
  reject: (err: unknown) => void;
  init?: RequestInit;
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function createThrottledFetch(
  concurrency: number,
  minDelayMs: number,
) {
  const queue: ThrottleSlot[] = [];
  let running = 0;
  let lastRequest = 0;

  async function pump() {
    if (running >= concurrency) return;
    const item = queue.shift();
    if (!item) return;
    running++;

    const elapsed = Date.now() - lastRequest;
    if (elapsed < minDelayMs) {
      await delay(minDelayMs - elapsed);
    }
    lastRequest = Date.now();

    try {
      const res = await fetch(item.url, item.init);
      item.resolve(res);
    } catch (err) {
      item.reject(err);
    } finally {
      running--;
      pump();
    }
  }

  return (url: string, init?: RequestInit): Promise<Response> => {
    return new Promise((resolve, reject) => {
      queue.push({ url, resolve, reject, init });
      pump();
    });
  };
}

// MusicBrainz requires ~1 req/sec for unauthenticated users
const throttledMbFetch = createThrottledFetch(1, 1100);
// Deezer is fairly lenient; 4 concurrent with 150ms pacing is well within limits
const throttledDeezerFetch = createThrottledFetch(4, 150);

/* ------------------------------------------------------------------ */
/*  Online cover-art search (MusicBrainz + Cover Art Archive)         */
/* ------------------------------------------------------------------ */

function escapeMbQuery(term: string): string {
  return term.replace(/[\\"]/g, "\\$&");
}

export async function searchCoverArt(
  artist: string,
  album: string,
): Promise<string | undefined> {
  if (!artist && !album) return undefined;

  const parts: string[] = [];
  if (artist) parts.push(`artist:"${escapeMbQuery(artist)}"`);
  if (album) parts.push(`release:"${escapeMbQuery(album)}"`);
  const query = parts.join(" AND ");

  try {
    const searchUrl = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json`;
    const searchRes = await throttledMbFetch(searchUrl, {
      headers: { "User-Agent": "HTPC-App/0.1.0" },
    });
    if (!searchRes.ok) return undefined;
    const data = (await searchRes.json()) as { releases?: Array<{ id: string; "release-group"?: { id?: string } }> };
    const release = data.releases?.[0];
    if (!release?.id) return undefined;

    // Check Cover Art Archive for this release
    const caaUrl = `https://coverartarchive.org/release/${release.id}/front-250`;
    const head = await throttledMbFetch(caaUrl, { method: "HEAD" });
    if (head.ok) return caaUrl;

    // Fallback to release-group front cover
    const rgId = release["release-group"]?.id;
    if (rgId) {
      const rgUrl = `https://coverartarchive.org/release-group/${rgId}/front-250`;
      const rgHead = await throttledMbFetch(rgUrl, { method: "HEAD" });
      if (rgHead.ok) return rgUrl;
    }

    return undefined;
  } catch (err) {
    console.error("[searchCoverArt]", err);
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Download image from URL                                             */
/* ------------------------------------------------------------------ */

export async function downloadImage(url: string): Promise<Buffer | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[downloadImage]", err);
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Embed / save cover art                                              */
/* ------------------------------------------------------------------ */

export async function embedCoverArt(
  track: MusicTrack,
  imageBuffer: Buffer,
): Promise<string | undefined> {
  const ext = extname(track.filePath).toLowerCase();
  const cachePath = join(coverCache, `${track.id}.jpg`);

  try {
    writeFileSync(cachePath, imageBuffer);
  } catch (err) {
    console.error("[embedCoverArt] cache write failed", err);
    return undefined;
  }

  let embedded = false;
  if (ext === ".mp3") {
    embedded = await embedMp3Cover(track.filePath, imageBuffer);
  }

  if (!embedded) {
    // Save as folder art for formats we can't embed into
    const dir = dirname(track.filePath);
    const coverPath = join(dir, "cover.jpg");
    try {
      writeFileSync(coverPath, imageBuffer);
    } catch (err) {
      console.error("[embedCoverArt] folder write failed", err);
    }
  }

  // Update DB
  const htpcUrl = `htpc-thumb://covers/music/${track.id}.jpg`;
  try {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${track.id}⟩ SET albumArtUrl = $url`, {
      url: htpcUrl,
    });
  } catch (err) {
    console.error("[embedCoverArt] db update failed", err);
  }

  return htpcUrl;
}

async function embedMp3Cover(
  filePath: string,
  imageBuffer: Buffer,
): Promise<boolean> {
  try {
    const mod = await import("node-id3");
    const NodeID3 = (mod as any).default ?? mod;
    const tags = {
      APIC: {
        mimeType: "image/jpeg",
        type: { id: 3, name: "front cover" },
        description: "Cover",
        imageBuffer,
      },
    };
    const result = NodeID3.write(tags, filePath);
    return result === true || typeof result === "object";
  } catch (err) {
    console.error("[embedMp3Cover]", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Pick cover image from disk via dialog                               */
/* ------------------------------------------------------------------ */

export async function pickCoverImage(
  track: MusicTrack,
): Promise<string | undefined> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] },
    ],
    title: `Choose cover art for ${track.title}`,
  });
  if (canceled || !filePaths[0]) return undefined;

  const imageBuffer = readFileSync(filePaths[0]);
  return embedCoverArt(track, imageBuffer);
}

/* ------------------------------------------------------------------ */
/*  Online artist thumbnail (Deezer API — no key required)            */
/* ------------------------------------------------------------------ */

const artistInFlight = new Set<string>();

export async function fetchArtistThumbnail(
  artist: string,
): Promise<string | undefined> {
  if (!artist) return undefined;
  const safeName = artist.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const dest = join(artistCache, `${safeName}.jpg`);
  if (existsSync(dest)) {
    return `htpc-thumb://covers/artists/${safeName}.jpg`;
  }
  if (artistInFlight.has(safeName)) return undefined;
  artistInFlight.add(safeName);

  try {
    const searchUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`;
    const res = await throttledDeezerFetch(searchUrl, {
      headers: { "User-Agent": "HTPC-App/0.1.0" },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      data?: Array<{
        picture?: string;
        picture_big?: string;
        picture_xl?: string;
      }>;
    };
    const artistData = data.data?.[0];
    if (!artistData) return undefined;

    const imageUrl = artistData.picture_xl || artistData.picture_big || artistData.picture;
    if (!imageUrl) return undefined;

    const imageRes = await throttledDeezerFetch(imageUrl);
    if (!imageRes.ok) return undefined;
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    writeFileSync(dest, buffer);

    return `htpc-thumb://covers/artists/${safeName}.jpg`;
  } catch (err) {
    console.error("[fetchArtistThumbnail]", err);
    return undefined;
  } finally {
    artistInFlight.delete(safeName);
  }
}
