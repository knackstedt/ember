import { createHash } from "crypto";
import {
  openSync,
  closeSync,
  readSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { createLogger } from "../util/logger";

const log = createLogger("info");

/* ------------------------------------------------------------------ */
/*  Shared low-level helpers                                           */
/* ------------------------------------------------------------------ */

export function hashFileHead(filePath: string): Buffer {
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

export function hashString(str: string): Buffer {
  return createHash("sha256").update(str).digest();
}

export function byteHue(b: number): number {
  return Math.round((b / 255) * 360);
}

export function bytePct(b: number, min: number, max: number): number {
  return min + (b / 255) * (max - min);
}

/* ------------------------------------------------------------------ */
/*  Shared shape helpers                                               */
/* ------------------------------------------------------------------ */

export type ShapeType = "circle" | "triangle" | "rect" | "hexagon";

export function pickShape(byte: number): ShapeType {
  const shapes: ShapeType[] = ["circle", "triangle", "rect", "hexagon"];
  return shapes[byte % shapes.length];
}

export function buildShape(
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

/* ------------------------------------------------------------------ */
/*  Generic procedural SVG (shapes + waveform bars + editorial block)  */
/* ------------------------------------------------------------------ */

export function buildProceduralSVG(hash: Buffer): string {
  const bytes = Array.from(hash);
  const w = 512;
  const h = 512;

  const hueBg1 = byteHue(bytes[0]);
  const hueBg2 = byteHue(bytes[1]);
  const sat = Math.round(bytePct(bytes[2], 55, 95));
  const light1 = Math.round(bytePct(bytes[3], 8, 28));
  const light2 = Math.round(bytePct(bytes[4], 12, 35));

  const hueAccent = byteHue(bytes[5]);

  const bg = `hsl(${hueBg1}, ${sat}%, ${light1}%)`;
  const bg2 = `hsl(${hueBg2}, ${sat}%, ${light2}%)`;

  const blockHue = (hueBg1 + 30 + bytes[6]) % 360;
  const blockSat = Math.round(bytePct(bytes[7], 40, 75));
  const blockLight = Math.round(bytePct(bytes[8], 25, 55));
  const blockW = Math.round(bytePct(bytes[9], 200, 380));
  const blockH = h;
  const blockX = bytePct(bytes[10], 0, 1) < 0.5 ? 0 : w - blockW;
  const blockColor = `hsl(${blockHue}, ${blockSat}%, ${blockLight}%)`;

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
    const rHue = (hueBg1 + bytes[(16 + i * 7) % bytes.length]) % 360;
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
  <rect x="${blockX}" y="0" width="${blockW}" height="${blockH}" fill="${blockColor}" opacity="0.22"/>
  <g>${shapes}</g>
  <line x1="80" y1="${lineY}" x2="432" y2="${lineY}" stroke="hsl(${lineHue},30%,55%)" stroke-width="0.5" opacity="0.35"/>
  <g>${bars}</g>
</svg>`;
}

/* ------------------------------------------------------------------ */
/*  Generic parameterized thumbnail generator                          */
/* ------------------------------------------------------------------ */

export interface ProceduralThumbnailOptions {
  filePath?: string;
  id: string;
  seedText: string;
  outputDir: string;
  emberPathPrefix: string;
}

export function generateProceduralThumbnail(
  opts: ProceduralThumbnailOptions,
): string | undefined {
  const { filePath, id, seedText, outputDir, emberPathPrefix } = opts;

  const dest = join(outputDir, `${id}.svg`);
  try {
    if (existsSync(dest)) unlinkSync(dest);
  } catch { /* ignore */ }

  try {
    const hash = filePath ? hashFileHead(filePath) : hashString(seedText);
    const svg = buildProceduralSVG(hash);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(dest, svg);
    return `ember://${emberPathPrefix}/${id}.svg`;
  } catch (err) {
    log.error("procedural-thumbnail", String(err));
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Convenience: write an SVG to a destination path                    */
/* ------------------------------------------------------------------ */

export function writeSVG(
  dest: string,
  svg: string,
): string | undefined {
  try {
    mkdirSync(join(dest, ".."), { recursive: true });
    writeFileSync(dest, svg);
    return dest;
  } catch (err) {
    log.error("thumbnailer:writeSVG", String(err));
    return undefined;
  }
}
