/**
 * DAT File Parser for No-Intro and Redump
 * Covers: Retro ROMs (No-Intro) and Disc ROMs (Redump)
 * Provides: Hashes for ROM verification
 * Access: Free download
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DatEntry, RomHashInfo } from './types';

// XML parsing for DAT files
interface DatXmlHeader {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
}

interface DatXmlRom {
  name: string;
  size: string;
  crc?: string;
  md5?: string;
  sha1?: string;
  serial?: string;
}

interface DatXmlGame {
  name: string;
  description?: string;
  rom?: DatXmlRom | DatXmlRom[];
}

interface DatXmlData {
  header?: DatXmlHeader;
  game?: DatXmlGame | DatXmlGame[];
}

/**
 * Simple XML parser for DAT files (since we can't rely on external XML libraries)
 */
function parseDatXml(xmlContent: string): DatXmlData {
  const data: DatXmlData = {};

  // Parse header
  const headerMatch = xmlContent.match(/<header>([\s\S]*?)<\/header>/);
  if (headerMatch) {
    const headerContent = headerMatch[1];
    data.header = {};

    const nameMatch = headerContent.match(/<name>([^<]*)<\/name>/);
    if (nameMatch) data.header.name = nameMatch[1].trim();

    const descMatch = headerContent.match(/<description>([^<]*)<\/description>/);
    if (descMatch) data.header.description = descMatch[1].trim();

    const versionMatch = headerContent.match(/<version>([^<]*)<\/version>/);
    if (versionMatch) data.header.version = versionMatch[1].trim();

    const authorMatch = headerContent.match(/<author>([^<]*)<\/author>/);
    if (authorMatch) data.header.author = authorMatch[1].trim();
  }

  // Parse games
  const gameMatches = xmlContent.matchAll(/<game[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/game>/g);
  const games: DatXmlGame[] = [];

  for (const match of gameMatches) {
    const gameName = match[1];
    const gameContent = match[2];

    const game: DatXmlGame = {
      name: gameName,
    };

    // Parse description
    const descMatch = gameContent.match(/<description>([^<]*)<\/description>/);
    if (descMatch) game.description = descMatch[1].trim();

    // Parse ROMs
    const romMatches = gameContent.matchAll(/<rom[^>]*name="([^"]*)"[^>]*\/>/g);
    const roms: DatXmlRom[] = [];

    for (const romMatch of romMatches) {
      const romAttrs = romMatch[0];
      const romName = romMatch[1];

      const sizeMatch = romAttrs.match(/size="([^"]*)"/);
      const crcMatch = romAttrs.match(/crc="([^"]*)"/);
      const md5Match = romAttrs.match(/md5="([^"]*)"/);
      const sha1Match = romAttrs.match(/sha1="([^"]*)"/);
      const serialMatch = romAttrs.match(/serial="([^"]*)"/);

      roms.push({
        name: romName,
        size: sizeMatch?.[1] || '0',
        crc: crcMatch?.[1],
        md5: md5Match?.[1],
        sha1: sha1Match?.[1],
        serial: serialMatch?.[1],
      });
    }

    if (roms.length === 1) {
      game.rom = roms[0];
    } else if (roms.length > 1) {
      game.rom = roms;
    }

    games.push(game);
  }

  if (games.length > 0) {
    data.game = games.length === 1 ? games[0] : games;
  }

  return data;
}

/**
 * Load and parse a DAT file
 */
export function loadDatFile(filePath: string): Map<string, DatEntry> {
  const entries = new Map<string, DatEntry>();

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = parseDatXml(content);

    const games = Array.isArray(data.game) ? data.game : data.game ? [data.game] : [];

    for (const game of games) {
      const roms = Array.isArray(game.rom) ? game.rom : game.rom ? [game.rom] : [];

      for (const rom of roms) {
        const entry: DatEntry = {
          name: game.name,
          description: game.description,
          romName: rom.name,
          size: parseInt(rom.size, 10) || 0,
          crc32: rom.crc?.toLowerCase(),
          md5: rom.md5?.toLowerCase(),
          sha1: rom.sha1?.toLowerCase(),
          serial: rom.serial,
        };

        // Index by all available hashes
        if (entry.crc32) entries.set(`crc32:${entry.crc32}`, entry);
        if (entry.md5) entries.set(`md5:${entry.md5}`, entry);
        if (entry.sha1) entries.set(`sha1:${entry.sha1}`, entry);
        if (entry.serial) entries.set(`serial:${entry.serial.toLowerCase()}`, entry);
      }
    }
  } catch (err) {
    console.error(`[DAT Parser] Failed to load ${filePath}:`, err);
  }

  return entries;
}

/**
 * Calculate CRC32 of a file (used for ROM matching)
 */
export function calculateCRC32(buffer: Buffer): string {
  // CRC32 table
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }

  return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Calculate MD5 of a file
 */
export function calculateMD5(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex').toLowerCase();
}

/**
 * Calculate SHA1 of a file
 */
export function calculateSHA1(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex').toLowerCase();
}

/**
 * Get all hashes for a ROM file
 */
export function getRomHashes(buffer: Buffer): RomHashInfo {
  return {
    crc32: calculateCRC32(buffer),
    md5: calculateMD5(buffer),
    sha1: calculateSHA1(buffer),
  };
}

/**
 * Find a game in DAT files by hash
 */
export function findByHash(
  datFiles: Map<string, DatEntry>[],
  hash: { crc32?: string; md5?: string; sha1?: string }
): DatEntry | null {
  for (const dat of datFiles) {
    if (hash.crc32) {
      const entry = dat.get(`crc32:${hash.crc32.toLowerCase()}`);
      if (entry) return entry;
    }
    if (hash.md5) {
      const entry = dat.get(`md5:${hash.md5.toLowerCase()}`);
      if (entry) return entry;
    }
    if (hash.sha1) {
      const entry = dat.get(`sha1:${hash.sha1.toLowerCase()}`);
      if (entry) return entry;
    }
  }
  return null;
}

/**
 * DAT File Manager
 */
export class DatFileManager {
  private dats = new Map<string, Map<string, DatEntry>>();

  loadDat(name: string, filePath: string): void {
    this.dats.set(name, loadDatFile(filePath));
  }

  findByHash(hash: { crc32?: string; md5?: string; sha1?: string }): DatEntry | null {
    for (const dat of this.dats.values()) {
      if (hash.crc32) {
        const entry = dat.get(`crc32:${hash.crc32.toLowerCase()}`);
        if (entry) return entry;
      }
      if (hash.md5) {
        const entry = dat.get(`md5:${hash.md5.toLowerCase()}`);
        if (entry) return entry;
      }
      if (hash.sha1) {
        const entry = dat.get(`sha1:${hash.sha1.toLowerCase()}`);
        if (entry) return entry;
      }
    }
    return null;
  }

  findBySerial(serial: string): DatEntry | null {
    for (const dat of this.dats.values()) {
      const entry = dat.get(`serial:${serial.toLowerCase()}`);
      if (entry) return entry;
    }
    return null;
  }

  getLoadedDats(): string[] {
    return Array.from(this.dats.keys());
  }
}

// Common No-Intro DAT names by platform
export const NOINTRO_DAT_NAMES: Record<string, string> = {
  'nes': 'Nintendo - Nintendo Entertainment System (Headered)',
  'snes': 'Nintendo - Super Nintendo Entertainment System',
  'n64': 'Nintendo - Nintendo 64',
  'gamecube': 'Nintendo - GameCube',
  'gb': 'Nintendo - Game Boy',
  'gbc': 'Nintendo - Game Boy Color',
  'gba': 'Nintendo - Game Boy Advance',
  'nds': 'Nintendo - Nintendo DS',
  'genesis': 'Sega - Mega Drive - Genesis',
  'mastersystem': 'Sega - Master System - Mark III',
  'gamegear': 'Sega - Game Gear',
  'saturn': 'Sega - Saturn',
  'dreamcast': 'Sega - Dreamcast',
  'psx': 'Sony - PlayStation',
  'ps2': 'Sony - PlayStation 2',
  'pce': 'NEC - PC Engine - TurboGrafx-16',
  'neogeo': 'SNK - Neo Geo',
  'ngp': 'SNK - Neo Geo Pocket',
  'ngpc': 'SNK - Neo Geo Pocket Color',
  'lynx': 'Atari - Lynx',
  'atari2600': 'Atari - 2600',
};

// Common Redump DAT names by platform
export const REDUMP_DAT_NAMES: Record<string, string> = {
  'psx': 'Sony - PlayStation',
  'ps2': 'Sony - PlayStation 2',
  'psp': 'Sony - PlayStation Portable',
  'dreamcast': 'Sega - Dreamcast',
  'saturn': 'Sega - Saturn',
  'gamecube': 'Nintendo - GameCube',
  'wii': 'Nintendo - Wii',
  'wiiu': 'Nintendo - Wii U',
  'pcecd': 'NEC - PC Engine CD & TurboGrafx CD',
  'megacd': 'Sega - Mega CD & Sega CD',
  'neogeocd': 'SNK - Neo Geo CD',
  '3do': 'The 3DO Company - 3DO',
  'cdi': 'Philips - CD-i',
  'amiga': 'Commodore - Amiga CD',
};
