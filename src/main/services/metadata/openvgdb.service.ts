/**
 * OpenVGDB Metadata Provider
 * Covers: Retro ROMs
 * Provides: Metadata, hashes
 * Access: Free SQLite database
 * Source: https://github.com/OpenVGDB/OpenVGDB
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataSource, DatEntry } from './types';

// OpenVGDB is a SQLite database that needs to be downloaded
// For this implementation, we'll provide a service that queries the database

const OPENVGDB_DOWNLOAD_URL = 'https://github.com/OpenVGDB/OpenVGDB/releases/download/latest/openvgdb.sqlite';

interface OpenVGDBGame {
  romID: number;
  systemID: number;
  romHashSHA1: string;
  romHashMD5: string;
  romHashCRC: string;
  romSerial: string | null;
  romFileName: string;
  romSize: number;
  romExtensionlessFileName: string;
  romHeaderSize: number;
  romCloneof: string | null;
  romTriforce: number;
  romReleaseNumber: number;
  romReleaseYear: number;
  romReleaseMonth: number;
  romReleaseDay: number;
  romRegionID: number;
  romLanguageID: number;
  romTemp: string | null;
  rom romType: string | null;
  gameName: string;
  gameDescription: string;
  gameGenre: string;
  gameDeveloper: string;
  gamePublisher: string;
  gameReleaseYear: number;
  gameReleaseMonth: number;
  gameReleaseDay: number;
  systemName: string;
  systemShortName: string;
  systemHeaderSizeBytes: number;
  regionName: string;
  tempRegionName: string;
  languageName: string;
}

// System ID mapping
const OPENVGDB_SYSTEM_MAP: Record<string, number> = {
  'nes': 1,
  'famicom': 1,
  'snes': 2,
  'superfamicom': 2,
  'n64': 3,
  'gamecube': 4,
  'wii': 5,
  'gb': 6,
  'gbc': 7,
  'gba': 8,
  'nds': 9,
  'virtualboy': 10,
  'genesis': 11,
  'megadrive': 11,
  'mastersystem': 12,
  'gamegear': 13,
  'segacd': 14,
  'saturn': 15,
  'dreamcast': 16,
  '32x': 17,
  'psx': 18,
  'ps2': 19,
  'psp': 20,
  'pce': 21,
  'tg16': 21,
  'pcecd': 22,
  'tgcd': 22,
  'neogeo': 23,
  'neogeoaes': 23,
  'neogeocd': 24,
  'ngp': 25,
  'ngpc': 26,
  'wonderswan': 27,
  'wonderswancolor': 28,
  'lynx': 29,
  'jaguar': 30,
  '3do': 31,
  'colecovision': 32,
  'intellivision': 33,
  'atari2600': 34,
  'atari5200': 35,
  'atari7800': 36,
  'atarist': 37,
  'amiga': 38,
  'c64': 39,
  'msx': 40,
  'pcengine': 21,
  'turbografx': 21,
};

function normalizeSystemId(platform?: string): number | undefined {
  if (!platform) return undefined;
  const normalized = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
  return OPENVGDB_SYSTEM_MAP[normalized];
}

/**
 * OpenVGDB Service class
 * This would typically query a SQLite database
 * For the implementation, we'll define the interface and query methods
 */
export class OpenVGDBService {
  private dbPath: string | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || null;
  }

  isAvailable(): boolean {
    return !!this.dbPath;
  }

  setDbPath(path: string): void {
    this.dbPath = path;
  }

  async findByHash(hash: { sha1?: string; md5?: string; crc32?: string }, systemId?: number): Promise<OpenVGDBGame | null> {
    // This would query the SQLite database
    // Implementation depends on having sqlite3 available in the environment
    // For now, return null as this requires database connectivity
    return null;
  }

  async findByName(name: string, systemId?: number): Promise<OpenVGDBGame | null> {
    return null;
  }

  async findBySerial(serial: string, systemId?: number): Promise<OpenVGDBGame | null> {
    return null;
  }
}

function mapOpenVGDBToMetadata(game: OpenVGDBGame): GameMetadata {
  const releaseDate = game.gameReleaseYear
    ? `${game.gameReleaseYear}-${String(game.gameReleaseMonth || 1).padStart(2, '0')}-${String(game.gameReleaseDay || 1).padStart(2, '0')}`
    : undefined;

  const source: MetadataSource = {
    name: 'OpenVGDB',
    type: 'retro',
    confidence: 0.92,
    fieldCoverage: ['title', 'description', 'releaseDate', 'developer', 'publisher', 'genres', 'romHash'],
  };

  return {
    title: game.gameName,
    description: game.gameDescription,
    releaseDate,
    releaseYear: game.gameReleaseYear || undefined,
    developer: game.gameDeveloper,
    publisher: game.gamePublisher,
    genres: game.gameGenre ? game.gameGenre.split(',').map(g => g.trim()) : undefined,
    romHash: game.romHashSHA1 || game.romHashMD5 || game.romHashCRC,
    romHashType: game.romHashSHA1 ? 'sha1' : game.romHashMD5 ? 'md5' : 'crc32',
    serialNumber: game.romSerial || undefined,
    region: game.regionName,
    language: game.languageName,
    sources: [source],
  };
}

// Singleton instance
let openVgdbService: OpenVGDBService | null = null;

export function getOpenVGDBService(): OpenVGDBService {
  if (!openVgdbService) {
    openVgdbService = new OpenVGDBService();
  }
  return openVgdbService;
}

export const OpenVGDBProvider: MetadataProvider = {
  name: 'OpenVGDB',
  type: 'retro',
  priority: 88,
  requiresApiKey: false,

  isAvailable(): boolean {
    return getOpenVGDBService().isAvailable();
  },

  async search(options: MetadataSearchOptions): Promise<GameMetadata | null> {
    const service = getOpenVGDBService();
    if (!service.isAvailable()) return null;

    try {
      const systemId = normalizeSystemId(options.platform);

      // Try to find by hash first
      if (options.romHash) {
        const hashType = options.romHashType || 'crc32';
        const hash: { sha1?: string; md5?: string; crc32?: string } = {};
        hash[hashType] = options.romHash;

        const game = await service.findByHash(hash, systemId);
        if (game) return mapOpenVGDBToMetadata(game);
      }

      // Try by name
      const game = await service.findByName(options.title, systemId);
      if (game) return mapOpenVGDBToMetadata(game);

      return null;
    } catch (err) {
      console.error('[OpenVGDB] Search error:', err);
      return null;
    }
  },
};

export { mapOpenVGDBToMetadata, normalizeSystemId, OPENVGDB_DOWNLOAD_URL };
