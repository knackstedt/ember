import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { join, extname, basename } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { Game } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

function walkDir(dir: string, callback: (filePath: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath, callback);
      } else if (stat.isFile()) {
        callback(fullPath);
      }
    } catch {
      // ignore permission errors etc.
    }
  }
}

const FLASH_EXTS = new Set([".swf"]);

function titleFromFilename(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashId(prefix: string, fullPath: string): string {
  return `${prefix}_${createHash("sha256").update(fullPath).digest("hex").slice(0, 16)}`;
}

/* ------------------------------------------------------------------ */
/*  SWF metadata extraction (no Electron deps — safe in worker)       */
/* ------------------------------------------------------------------ */

function extractSwfMeta(filePath: string): { title?: string; description?: string } {
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
    } else {
      return {};
    }

    const bitsByte = uncompressed[offset];
    const nBits = bitsByte >> 3;
    const totalBits = 5 + nBits * 4;
    offset += Math.ceil(totalBits / 8);
    offset += 4; // frame rate + frame count

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
        const xml = uncompressed.subarray(offset, offset + tagLength).toString("utf8");
        const titleMatch = xml.match(
          /<dc:title[^>]*>(?:<rdf:Alt>.*?<rdf:li[^>]*>(.*?)<\/rdf:li>.*?<\/rdf:Alt>|<!\[CDATA\[(.*?)\]\]>|([^<]+))<\/dc:title>/is,
        );
        const descMatch = xml.match(
          /<dc:description[^>]*>(?:<rdf:Alt>.*?<rdf:li[^>]*>(.*?)<\/rdf:li>.*?<\/rdf:Alt>|<!\[CDATA\[(.*?)\]\]>|([^<]+))<\/dc:description>/is,
        );
        return {
          title: titleMatch ? (titleMatch[1] || titleMatch[2] || titleMatch[3]?.trim()) : undefined,
          description: descMatch ? (descMatch[1] || descMatch[2] || descMatch[3]?.trim()) : undefined,
        };
      }
      offset += tagLength;
    }
    return {};
  } catch {
    return {};
  }
}

export function scanFlashGames(): Game[] {
  const roots = [
    join(homedir(), "Roms"),
    join(homedir(), "ROMs"),
    join(homedir(), "Games"),
    join(homedir(), "games"),
    join(homedir(), "roms"),
  ].filter(existsSync);

  log.info("flash", `scanning roots: ${roots.join(", ")}`);
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    walkDir(root, (fullPath) => {
      const ext = extname(fullPath).toLowerCase();
      if (!FLASH_EXTS.has(ext)) return;
      if (seen.has(fullPath)) {
        log.info("flash", `skip duplicate path: ${fullPath}`);
        return;
      }
      seen.add(fullPath);

      const fileTitle = titleFromFilename(basename(fullPath));
      const swfMeta = extractSwfMeta(fullPath);
      const isGenericFlexTitle = swfMeta.title ? /^Adobe Flex\s+\d+(?:\.\d+)?\s+Application$/i.test(swfMeta.title) : false;
      const title = swfMeta.title && swfMeta.title.length > 0 && !isGenericFlexTitle ? swfMeta.title : fileTitle;
      const id = hashId("flash", fullPath);

      log.info("flash", `found ${title} → ${id} path: ${fullPath}`);

      games.push({
        id,
        title,
        platform: "flash",
        romPath: fullPath,
        execPath: `ruffle "${fullPath}"`,
        description: swfMeta.description,
        tags: [],
      });
    });
  }

  log.info("flash", `total found: ${games.length}`);
  return games;
}
