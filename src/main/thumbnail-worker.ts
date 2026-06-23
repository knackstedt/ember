/**
 * Thumbnail capture worker child process.
 *
 * Uses the native video-decoder addon (libmpv) to render a single frame
 * and pipes the raw RGBA data to ffmpeg for JPEG encoding.
 */

import { join } from "path";
import { existsSync } from "fs";
import { spawn } from "child_process";

const arch = process.arch === "arm64" ? "arm64" : "x64";
const addonName = `video-decoder.linux-${arch}-gnu.node`;

function findAddon(): string | null {
  const candidates = [
    join(__dirname, "..", "..", "resources", addonName),
    join(__dirname, "..", "renderer", addonName),
    join(__dirname, addonName),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

const addonPath = findAddon();
if (!addonPath) {
  console.error(`Video decoder native addon not found (${addonName})`);
  process.exit(1);
}

const NativeAddon = require(addonPath);

const filePath = process.argv[2];
const seekMs = parseInt(process.argv[3], 10);
const destPath = process.argv[4];
const targetWidth = parseInt(process.argv[5] || "480", 10);

const HEADER_SIZE = 256;
const OFF_WIDTH = 24;
const OFF_HEIGHT = 28;

/** Compute a simple visual-complexity score (average RGB standard deviation).
 *  Returns a value between 0 (solid colour) and ~128 (highly textured).
 */
function computeComplexity(data: Uint8Array, sampleCount = 500): number {
  const pixelCount = Math.floor(data.length / 4);
  if (pixelCount === 0) return 0;

  const step = Math.max(1, Math.floor(pixelCount / sampleCount));
  let sumR = 0, sumG = 0, sumB = 0;
  let n = 0;

  for (let i = 0; i < pixelCount; i += step) {
    const off = i * 4;
    sumR += data[off];
    sumG += data[off + 1];
    sumB += data[off + 2];
    n++;
  }

  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;

  let varSum = 0;
  for (let i = 0; i < pixelCount; i += step) {
    const off = i * 4;
    const dr = data[off] - meanR;
    const dg = data[off + 1] - meanG;
    const db = data[off + 2] - meanB;
    varSum += (dr * dr + dg * dg + db * db) / 3;
  }

  return Math.sqrt(varSum / n);
}

async function renderNonBlackFrame(
  decoder: any,
  ab: ArrayBuffer,
): Promise<{ width: number; height: number; data: Uint8Array } | null> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const frameMeta = decoder.renderFrame();
    if (!frameMeta) {
      throw new Error("Failed to render frame");
    }

    const view = new DataView(ab);
    const width = view.getUint32(OFF_WIDTH, true);
    const height = view.getUint32(OFF_HEIGHT, true);

    if (width === 0 || height === 0) {
      throw new Error("Rendered frame has zero dimensions");
    }

    const slotOffset = 0x100;
    const stride = width * 4;
    const data = new Uint8Array(ab, slotOffset, height * stride);

    // Check if frame is all zeros (black).
    let isBlack = true;
    const blackStep = Math.max(1, Math.floor(data.length / 4 / 100)) * 4;
    for (let i = 0; i < data.length; i += blackStep) {
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) {
        isBlack = false;
        break;
      }
    }

    if (!isBlack) {
      return { width, height, data };
    }

    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function capture(): Promise<void> {
  const decoder = new NativeAddon.VideoDecoder();

  try {
    decoder.open(filePath);
    decoder.setMute(true);

    const meta = decoder.getMetadata();
    if (meta.width === 0 || meta.height === 0) {
      throw new Error("No video stream found");
    }

    const durationMs = meta.duration_ms;
    let seek = seekMs;
    if (durationMs > 0) {
      seek = Math.max(1000, Math.min(seek, durationMs - 1000));
    }

    // Calculate thumbnail dimensions preserving aspect ratio
    const aspectRatio = meta.height / meta.width;
    const targetHeight = Math.max(1, Math.round(targetWidth * aspectRatio));

    decoder.setRenderSize(targetWidth, targetHeight);

    // Buffer must be large enough for source resolution (2 slots + header)
    const bufSize = HEADER_SIZE + meta.width * meta.height * 4 * 2;
    const ab = new ArrayBuffer(bufSize);
    decoder.attachSharedBuffer(ab);

    decoder.seek(seek);
    await new Promise((r) => setTimeout(r, 500));

    let frame = await renderNonBlackFrame(decoder, ab);
    if (!frame) {
      throw new Error("Rendered frame is black after multiple attempts");
    }

    // If visual complexity is very low, try progressively later frames.
    for (let retry = 0; retry < 10; retry++) {
      const complexity = computeComplexity(frame.data);
      if (complexity >= 15) break;
      const nextSeek = seek + (retry + 1) * 60000;
      if (durationMs > 0 && nextSeek >= durationMs - 1000) break;
      decoder.seek(nextSeek);
      await new Promise((r) => setTimeout(r, 500));
      const laterFrame = await renderNonBlackFrame(decoder, ab);
      if (laterFrame) {
        frame = laterFrame;
      } else {
        break;
      }
    }

    const pixelData = Buffer.from(frame.data);

    // Convert raw RGBA to JPEG via ffmpeg
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "-s", `${frame.width}x${frame.height}`,
      "-i", "-",
      "-q:v", "2",
      "-pix_fmt", "yuvj420p",
      "-y",
      destPath,
    ]);

    ffmpeg.stdin.write(pixelData);
    ffmpeg.stdin.end();

    const exitCode = await new Promise<number>((resolve) => {
      ffmpeg.on("close", resolve);
    });

    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}`);
    }
  } finally {
    decoder.close();
  }
}

capture().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
