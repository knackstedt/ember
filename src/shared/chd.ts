import { open, read, close } from "fs/promises";
import { GamePlatform } from "./types";

/**
 * Detect the console platform of a CHD (Compressed Hunk of Data) file
 * by reading its header metadata tag.
 *
 * Supports CHD v3, v4, and v5.
 *
 * Tag → platform mapping:
 *   CHGD / CHGT → dreamcast (GD-ROM)
 *   DVD  → ps2 (DVD-ROM; PS2 is the primary DVD-based console we support)
 *   CHCD / CHTR / CHT2 → psx or ps2 (CD-ROM; defaults to psx, uses path heuristics for ps2)
 */
export async function detectChdPlatform(filePath: string): Promise<GamePlatform | null> {
  let fd: number | null = null;
  try {
    fd = await open(filePath, "r");
  } catch {
    return null;
  }

  try {
    const header = Buffer.alloc(124);
    const { bytesRead } = await fd.read(header, 0, 124, 0);
    if (bytesRead < 44) return null;

    const signature = header.toString("ascii", 0, 8);
    if (signature !== "MComprHD") return null;

    const version = header.readUInt32BE(12);
    let metaoffset: number;

    if (version === 5) {
      if (bytesRead < 56) return null;
      metaoffset = Number(header.readBigUInt64BE(48));
    } else if (version === 3 || version === 4) {
      if (bytesRead < 44) return null;
      metaoffset = Number(header.readBigUInt64BE(36));
    } else {
      return null;
    }

    if (!metaoffset || metaoffset === 0) return null;

    const metaBuf = Buffer.alloc(4);
    const { bytesRead: metaBytes } = await fd.read(metaBuf, 0, 4, metaoffset);
    if (metaBytes < 4) return null;

    const tag = metaBuf.toString("ascii", 0, 4);

    switch (tag) {
      case "CHGD":
      case "CHGT":
        return "dreamcast";
      case "DVD ":
        return "ps2";
      case "CHCD":
      case "CHTR":
      case "CHT2": {
        const lowerPath = filePath.toLowerCase();
        if (lowerPath.includes("ps2") || lowerPath.includes("playstation 2")) {
          return "ps2";
        }
        if (
          lowerPath.includes("ps1") ||
          lowerPath.includes("psx") ||
          lowerPath.includes("playstation")
        ) {
          return "psx";
        }
        return "psx";
      }
      case "GDDD":
        return null; // Hard disk — not a console ROM we handle
      default:
        return null;
    }
  } catch {
    return null;
  } finally {
    if (fd) {
      try {
        await close(fd);
      } catch {
        /* ignore */
      }
    }
  }
}
