import { createHash } from "crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readSync,
  unlinkSync,
} from "fs";
import { join, extname, dirname, basename } from "path";
import { app, dialog } from "electron";
import { loadMusicMetadata } from "music-metadata";
import { MusicTrack } from "../../shared/types";
import { getDb } from "../db";
import { createLogger } from "../util/logger";

const log = createLogger("info");

function getUserDataPath(): string {
  try {
    return app.getPath("userData");
  } catch {
    return process.cwd();
  }
}

const coverCache = join(getUserDataPath(), "covers", "music");
const generatedCache = join(coverCache, "generated");
const artistCache = join(getUserDataPath(), "covers", "artists");
try { mkdirSync(generatedCache, { recursive: true }); } catch { /* ignore */ }
try { mkdirSync(artistCache, { recursive: true }); } catch { /* ignore */ }

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

type ShapeType = "circle" | "triangle" | "rect" | "hexagon";

function pickShape(byte: number): ShapeType {
  const shapes: ShapeType[] = ["circle", "triangle", "rect", "hexagon"];
  return shapes[byte % shapes.length];
}

function buildShape(
  type: ShapeType,
  x: number,
  y: number,
  size: number,
  rot: number,
  fill: string,
  opacity: string,
): string {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const transform = `rotate(${rot}, ${cx}, ${cy})`;

  switch (type) {
    case "circle": {
      const r = Math.round(size / 2);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}" transform="${transform}"/>`;
    }
    case "triangle": {
      const half = size / 2;
      const points = `${cx},${cy - half} ${cx - half},${cy + half} ${cx + half},${cy + half}`;
      return `<polygon points="${points}" fill="${fill}" opacity="${opacity}" transform="${transform}"/>`;
    }
    case "hexagon": {
      const r = size / 2;
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${fill}" opacity="${opacity}" transform="${transform}"/>`;
    }
    case "rect":
    default: {
      const rw = Math.round(size * 0.9);
      const rh = Math.round(size * 0.65);
      const rx = Math.round(cx - rw / 2);
      const ry = Math.round(cy - rh / 2);
      return `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="3" fill="${fill}" opacity="${opacity}" transform="${transform}"/>`;
    }
  }
}

function buildProceduralSVG(hash: Buffer): string {
  const bytes = Array.from(hash);
  const w = 512;
  const h = 512;

  const hueBg1 = byteHue(bytes[0]);
  const hueBg2 = byteHue(bytes[1]);
  const sat = Math.round(bytePct(bytes[2], 55, 95));
  const light1 = Math.round(bytePct(bytes[3], 8, 28));
  const light2 = Math.round(bytePct(bytes[4], 12, 35));

  const hueAccent = byteHue(bytes[5]);

  // Background gradient
  const bg = `hsl(${hueBg1}, ${sat}%, ${light1}%)`;
  const bg2 = `hsl(${hueBg2}, ${sat}%, ${light2}%)`;

  // Low-contrast editorial block behind everything
  const blockHue = (hueBg1 + 30 + bytes[6]) % 360;
  const blockSat = Math.round(bytePct(bytes[7], 40, 75));
  const blockLight = Math.round(bytePct(bytes[8], 25, 55));
  const blockW = Math.round(bytePct(bytes[9], 200, 380));
  const blockH = h;
  const blockX = bytePct(bytes[10], 0, 1) < 0.5 ? 0 : w - blockW;
  const blockColor = `hsl(${blockHue}, ${blockSat}%, ${blockLight}%)`;

  // Construct overlapping shapes (circles, triangles, rectangles, hexagons)
  let shapes = "";
  for (let i = 0; i < 4; i++) {
    const shapeType = pickShape(bytes[(11 + i * 7) % bytes.length]);
    const size = Math.round(
      bytePct(bytes[(12 + i * 7) % bytes.length], 140, 320),
    );
    const sx = Math.round(
      bytePct(bytes[(13 + i * 7) % bytes.length], 40, w - size - 40),
    );
    const sy = Math.round(
      bytePct(bytes[(14 + i * 7) % bytes.length], 40, h - size - 40),
    );
    const rot = Math.round(
      bytePct(bytes[(15 + i * 7) % bytes.length], -25, 25),
    );
    const rHue =
      (hueBg1 + bytes[(16 + i * 7) % bytes.length]) % 360;
    const rSat = Math.round(
      bytePct(bytes[(17 + i * 7) % bytes.length], 35, 70),
    );
    const rLight = Math.round(
      bytePct(bytes[(18 + i * 7) % bytes.length], 45, 70),
    );
    const rOp = bytePct(bytes[(19 + i * 7) % bytes.length], 0.08, 0.35).toFixed(
      2,
    );
    shapes += buildShape(
      shapeType,
      sx,
      sy,
      size,
      rot,
      `hsl(${rHue},${rSat}%,${rLight}%)`,
      rOp,
    );
  }

  // Waveform bars (bottom area) — single solid color, low contrast
  const barCount = 48;
  const barMaxH = 70;
  const barW = 6;
  const barGap = 4;
  const barStartX = (w - barCount * (barW + barGap)) / 2 + barGap / 2;
  const barBaseY = 430;
  const barColor = `hsl(${(hueAccent + bytes[25]) % 360}, ${Math.max(15, sat - 15)}%, ${light1 + 30}%)`;

  let bars = "";
  for (let i = 0; i < barCount; i++) {
    const bh = Math.round(bytePct(bytes[(26 + i) % bytes.length], 8, barMaxH));
    const bx = Math.round(barStartX + i * (barW + barGap));
    const by = barBaseY - bh;
    const opacity = bytePct(bytes[(30 + i) % bytes.length], 0.3, 0.65).toFixed(
      2,
    );
    bars += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="${barColor}" opacity="${opacity}"/>`;
  }

  // Thin accent line
  const lineY = Math.round(bytePct(bytes[24], 200, 380));
  const lineHue = (hueAccent + 60 + bytes[23]) % 360;

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
  <rect x="${blockX}" y="0" width="${blockW}" height="${blockH}" fill="${blockColor}" opacity="0.22"/>
  <!-- Construct shapes -->
  <g>${shapes}</g>
  <!-- Accent line -->
  <line x1="80" y1="${lineY}" x2="432" y2="${lineY}" stroke="hsl(${lineHue},30%,55%)" stroke-width="0.5" opacity="0.35"/>
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
    return `ember://covers/music/generated/${id}.svg`;
  }
  try {
    const hash = hashFileHead(filePath);
    const svg = buildProceduralSVG(hash);
    mkdirSync(generatedCache, { recursive: true });
    writeFileSync(dest, svg);
    return `ember://covers/music/generated/${id}.svg`;
  } catch (err) {
    log.error("generateProceduralCover", String(err));
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
    return `ember://covers/music/${id}.jpg`;
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
        return `ember://covers/music/${id}.jpg`;
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
        log.error("loadThumbnail", `DB update failed: ${err}`);
      }
    }
    return url;
  } finally {
    inFlight.delete(id);
  }
}

export async function regenerateThumbnail(
  track: MusicTrack,
): Promise<string | null> {
  const id = normalizeId(track.id);

  // Delete cached/generated files
  const jpgPath = join(coverCache, `${id}.jpg`);
  const svgPath = join(generatedCache, `${id}.svg`);
  try {
    if (existsSync(jpgPath)) unlinkSync(jpgPath);
  } catch { /* ignore */ }
  try {
    if (existsSync(svgPath)) unlinkSync(svgPath);
  } catch { /* ignore */ }

  // Clear albumArtUrl in DB
  try {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${id}⟩ SET albumArtUrl = NONE`);
  } catch (err) {
    log.error("regenerateThumbnail", `DB clear failed: ${err}`);
  }

  // Re-generate thumbnail
  const url = await loadThumbnail(track);
  return url ?? null;
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
    // ── MusicBrainz release search → Cover Art Archive ──────────────
    const searchUrl = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json`;
    const searchRes = await throttledMbFetch(searchUrl, {
      headers: { "User-Agent": "HTPC-App/0.1.0" },
    });
    if (searchRes.ok) {
      const data = (await searchRes.json()) as { releases?: Array<{ id: string; "release-group"?: { id?: string } }> };
      const release = data.releases?.[0];
      if (release?.id) {
        // Try 500px first, then 250px
        for (const size of [500, 250] as const) {
          const caaUrl = `https://coverartarchive.org/release/${release.id}/front-${size}`;
          const head = await throttledMbFetch(caaUrl, { method: "HEAD" });
          if (head.ok) return caaUrl;
        }

        // Fallback to release-group front cover
        const rgId = release["release-group"]?.id;
        if (rgId) {
          for (const size of [500, 250] as const) {
            const rgUrl = `https://coverartarchive.org/release-group/${rgId}/front-${size}`;
            const rgHead = await throttledMbFetch(rgUrl, { method: "HEAD" });
            if (rgHead.ok) return rgUrl;
          }
        }
      }
    }

    // ── TheAudioDB album art fallback ───────────────────────────────
    if (artist && album) {
      try {
        const tadbUrl = `https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?s=${encodeURIComponent(artist)}&a=${encodeURIComponent(album)}`;
        const tadbRes = await fetch(tadbUrl, {
          headers: { "User-Agent": "HTPC-App/0.1.0" },
        });
        if (tadbRes.ok) {
          const tadbData = (await tadbRes.json()) as { album?: Array<{ strAlbumThumbHQ?: string; strAlbumThumb?: string }> | null };
          const tadbAlbum = tadbData.album?.[0];
          const tadbThumb = tadbAlbum?.strAlbumThumbHQ || tadbAlbum?.strAlbumThumb;
          if (tadbThumb) return tadbThumb;
        }
      } catch {
        // TheAudioDB fallback failed; continue
      }
    }

    return undefined;
  } catch (err) {
    log.error("searchCoverArt", String(err));
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
    log.error("downloadImage", String(err));
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
    log.error("embedCoverArt", `cache write failed: ${err}`);
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
      log.error("embedCoverArt", `folder write failed: ${err}`);
    }
  }

  // Update DB
  const emberUrl = `ember://covers/music/${track.id}.jpg`;
  try {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${track.id}⟩ SET albumArtUrl = $url`, {
      url: emberUrl,
    });
  } catch (err) {
    log.error("embedCoverArt", `db update failed: ${err}`);
  }

  return emberUrl;
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
    log.error("embedMp3Cover", String(err));
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
/*  Procedural artist thumbnail (deterministic SVG)                   */
/* ------------------------------------------------------------------ */

function hashString(str: string): Buffer {
  return createHash("sha256").update(str).digest();
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function buildProceduralArtistSVG(hash: Buffer, artist: string): string {
  const bytes = Array.from(hash);
  const w = 512;
  const h = 512;

  const hueBg1 = byteHue(bytes[0]);
  const hueBg2 = byteHue(bytes[1]);
  const sat = Math.round(bytePct(bytes[2], 45, 75));
  const light1 = Math.round(bytePct(bytes[3], 12, 22));
  const light2 = Math.round(bytePct(bytes[4], 16, 28));

  const hueAccent = byteHue(bytes[5]);
  const accentSat = Math.round(bytePct(bytes[6], 50, 80));
  const accentLight = Math.round(bytePct(bytes[7], 45, 65));

  // Background gradient
  const bg = `hsl(${hueBg1}, ${sat}%, ${light1}%)`;
  const bg2 = `hsl(${hueBg2}, ${sat}%, ${light2}%)`;

  // Decorative circle behind initials
  const circleHue = (hueBg1 + 180) % 360;
  const circleSat = Math.round(bytePct(bytes[8], 30, 60));
  const circleLight = Math.round(bytePct(bytes[9], 25, 40));
  const circleR = Math.round(bytePct(bytes[10], 140, 200));
  const circleCx = 256;
  const circleCy = 220;

  // Small decorative dots
  let dots = "";
  for (let i = 0; i < 6; i++) {
    const dx = Math.round(bytePct(bytes[(11 + i * 4) % bytes.length], 40, w - 40));
    const dy = Math.round(bytePct(bytes[(12 + i * 4) % bytes.length], 40, h - 40));
    const dr = Math.round(bytePct(bytes[(13 + i * 4) % bytes.length], 4, 18));
    const dOp = bytePct(bytes[(14 + i * 4) % bytes.length], 0.08, 0.25).toFixed(2);
    const dHue = (hueAccent + Math.floor(bytes[(15 + i * 4) % bytes.length] / 8)) % 360;
    dots += `<circle cx="${dx}" cy="${dy}" r="${dr}" fill="hsl(${dHue},${accentSat}%,${accentLight}%)" opacity="${dOp}"/>`;
  }

  // Arc lines
  let arcs = "";
  for (let i = 0; i < 3; i++) {
    const ar = Math.round(bytePct(bytes[(16 + i * 5) % bytes.length], 180, 260));
    const ax = 256;
    const ay = 220;
    const aStart = Math.round(bytePct(bytes[(17 + i * 5) % bytes.length], 0, 360));
    const aEnd = aStart + Math.round(bytePct(bytes[(18 + i * 5) % bytes.length], 60, 180));
    const aOp = bytePct(bytes[(19 + i * 5) % bytes.length], 0.06, 0.18).toFixed(2);
    const aHue = (hueAccent + i * 40) % 360;
    // Convert polar to cartesian for arc path
    const radStart = (aStart * Math.PI) / 180;
    const radEnd = (aEnd * Math.PI) / 180;
    const x1 = ax + ar * Math.cos(radStart);
    const y1 = ay + ar * Math.sin(radStart);
    const x2 = ax + ar * Math.cos(radEnd);
    const y2 = ay + ar * Math.sin(radEnd);
    const largeArc = aEnd - aStart > 180 ? 1 : 0;
    arcs += `<path d="M ${x1} ${y1} A ${ar} ${ar} 0 ${largeArc} 1 ${x2} ${y2}" stroke="hsl(${aHue},${accentSat}%,${accentLight}%)" stroke-width="2" fill="none" opacity="${aOp}" stroke-linecap="round"/>`;
  }

  const init = initialsFromName(artist);

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
  <!-- Decorative circle -->
  <circle cx="${circleCx}" cy="${circleCy}" r="${circleR}" fill="hsl(${circleHue},${circleSat}%,${circleLight}%)" opacity="0.25"/>
  <!-- Arcs -->
  <g>${arcs}</g>
  <!-- Dots -->
  <g>${dots}</g>
  <!-- Initials -->
  <text x="256" y="240" text-anchor="middle" dominant-baseline="central"
    font-family="system-ui, -apple-system, sans-serif" font-size="96" font-weight="700"
    fill="hsl(${hueAccent},${accentSat}%,${accentLight}%)" opacity="0.9" filter="url(#glow)">
    ${init}
  </text>
</svg>`;
}

export async function generateArtistThumbnail(
  artist: string,
): Promise<string | undefined> {
  if (!artist) return undefined;
  const safeName = artist.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const dest = join(artistCache, `${safeName}.svg`);
  if (existsSync(dest)) {
    return `ember://covers/artists/${safeName}.svg`;
  }
  try {
    const hash = hashString(artist);
    const svg = buildProceduralArtistSVG(hash, artist);
    mkdirSync(artistCache, { recursive: true });
    writeFileSync(dest, svg);
    return `ember://covers/artists/${safeName}.svg`;
  } catch (err) {
    log.error("generateArtistThumbnail", String(err));
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Online artist thumbnail (Deezer + TheAudioDB fallback)            */
/* ------------------------------------------------------------------ */

const artistInFlight = new Set<string>();

export async function fetchArtistThumbnail(
  artist: string,
): Promise<string | undefined> {
  if (!artist) return undefined;
  const safeName = artist.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const jpgDest = join(artistCache, `${safeName}.jpg`);
  const svgDest = join(artistCache, `${safeName}.svg`);
  if (existsSync(jpgDest)) {
    return `ember://covers/artists/${safeName}.jpg`;
  }
  if (existsSync(svgDest)) {
    return `ember://covers/artists/${safeName}.svg`;
  }
  if (artistInFlight.has(safeName)) return undefined;
  artistInFlight.add(safeName);

  try {
    let imageUrl: string | undefined;

    // Try Deezer first (usually fastest, no key required)
    try {
      const searchUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`;
      const res = await throttledDeezerFetch(searchUrl, {
        headers: { "User-Agent": "HTPC-App/0.1.0" },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          data?: Array<{
            picture?: string;
            picture_big?: string;
            picture_xl?: string;
          }>;
        };
        const artistData = data.data?.[0];
        imageUrl = artistData?.picture_xl || artistData?.picture_big || artistData?.picture || undefined;
      }
    } catch {
      // Deezer failed, try TheAudioDB
    }

    // Fallback to TheAudioDB artist thumbnail
    if (!imageUrl) {
      try {
        const tadbUrl = `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artist)}`;
        const tadbRes = await fetch(tadbUrl, {
          headers: { "User-Agent": "HTPC-App/0.1.0" },
        });
        if (tadbRes.ok) {
          const tadbData = (await tadbRes.json()) as {
            artists?: Array<{ strArtistThumb?: string; strArtistWideThumb?: string }> | null;
          };
          const tadbArtist = tadbData.artists?.[0];
          imageUrl = tadbArtist?.strArtistThumb || tadbArtist?.strArtistWideThumb || undefined;
        }
      } catch {
        // TheAudioDB fallback also failed
      }
    }

    if (imageUrl) {
      const imageRes = await fetch(imageUrl, {
        headers: { "User-Agent": "HTPC-App/0.1.0" },
      });
      if (!imageRes.ok) return undefined;
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      mkdirSync(artistCache, { recursive: true });
      writeFileSync(jpgDest, buffer);
      return `ember://covers/artists/${safeName}.jpg`;
    }

    // Final fallback: procedural SVG thumbnail
    return generateArtistThumbnail(artist);
  } catch (err) {
    log.error("fetchArtistThumbnail", String(err));
    return undefined;
  } finally {
    artistInFlight.delete(safeName);
  }
}
