/**
 * MAME/ArcadeDB Metadata Provider
 * Covers: Arcade games
 * Provides: Metadata, hashes
 * Access: Bundled with MAME emulator
 * API Docs: Uses MAME -listxml output
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataSource } from './types';

interface MameGame {
  name: string;
  description?: string;
  year?: string;
  manufacturer?: string;
  cloneof?: string;
  romof?: string;
  isbios?: boolean;
  isdevice?: boolean;
  ismechanical?: boolean;
  runnable?: boolean;
  input?: {
    players?: number;
    coins?: number;
    controls?: { type: string; ways?: number; buttons?: number }[];
  };
  display?: {
    type: string;
    refresh: number;
    width?: number;
    height?: number;
    orientation?: string;
  }[];
  driver?: {
    status: string;
    emulation?: string;
    color?: string;
    sound?: string;
    graphic?: string;
    savestate?: string;
  };
  biosset?: { name: string; description?: string }[];
  rom?: { name: string; size: number; crc?: string; sha1?: string; region?: string }[];
  disk?: { name: string; sha1?: string; region?: string }[];
  softwarelist?: { name: string; tag?: string; interface?: string }[];
}

// Genre mapping based on MAME categories or external databases
const GENRE_MAP: Record<string, string[]> = {
  'shmup': ['Shooter'],
  'shoot': ['Shooter'],
  'fight': ['Fighting'],
  'versus': ['Fighting'],
  'puzzle': ['Puzzle'],
  'maze': ['Maze'],
  'race': ['Racing'],
  'driving': ['Racing'],
  'sports': ['Sports'],
  'platform': ['Platform'],
  'run': ['Platform'],
  'gun': ['Light Gun'],
  'beat': ["Beat 'em up"],
  'quiz': ['Quiz'],
  'casino': ['Casino'],
};

function inferGenres(description?: string): string[] | undefined {
  if (!description) return undefined;

  const genres: string[] = [];
  const desc = description.toLowerCase();

  for (const [keyword, genreList] of Object.entries(GENRE_MAP)) {
    if (desc.includes(keyword)) {
      genres.push(...genreList);
    }
  }

  return genres.length > 0 ? [...new Set(genres)] : undefined;
}

function mapMameToMetadata(game: MameGame): GameMetadata {
  const releaseYear = game.year ? parseInt(game.year, 10) : undefined;

  // Parse player count from input
  let playerCount: { min: number; max: number } | undefined;
  if (game.input?.players) {
    playerCount = { min: 1, max: game.input.players };
  }

  const source: MetadataSource = {
    name: 'MAME',
    type: 'retro',
    confidence: 0.9,
    fieldCoverage: ['title', 'releaseYear', 'developer', 'playerCount'],
  };

  return {
    title: game.description || game.name,
    releaseYear,
    developer: game.manufacturer,
    publisher: game.manufacturer,
    genres: inferGenres(game.description),
    playerCount,
    platforms: ['Arcade'],
    sources: [source],
  };
}

/**
 * MAME ROM Manager class
 * Handles loading and querying MAME game data
 */
export class MameRomManager {
  private games = new Map<string, MameGame>();
  private loaded = false;

  /**
   * Load MAME data from -listxml output
   */
  loadFromXml(xmlContent: string): void {
    // Parse MAME -listxml output
    // This is a simplified parser - real implementation would need full XML parsing
    const gameMatches = xmlContent.matchAll(/<game[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/game>/g);

    for (const match of gameMatches) {
      const name = match[1];
      const content = match[2];

      const game: MameGame = { name };

      const descMatch = content.match(/<description>([^<]*)<\/description>/);
      if (descMatch) game.description = descMatch[1].trim();

      const yearMatch = content.match(/<year>([^<]*)<\/year>/);
      if (yearMatch) game.year = yearMatch[1].trim();

      const mfgMatch = content.match(/<manufacturer>([^<]*)<\/manufacturer>/);
      if (mfgMatch) game.manufacturer = mfgMatch[1].trim();

      const cloneMatch = content.match(/cloneof="([^"]*)"/);
      if (cloneMatch) game.cloneof = cloneMatch[1];

      this.games.set(name, game);
    }

    this.loaded = true;
  }

  /**
   * Find a game by its ROM name
   */
  findByName(name: string): MameGame | null {
    return this.games.get(name) || null;
  }

  /**
   * Search for games by partial name match
   */
  searchByName(query: string): MameGame[] {
    const results: MameGame[] = [];
    const lowerQuery = query.toLowerCase();

    for (const game of this.games.values()) {
      if (game.name.toLowerCase().includes(lowerQuery) ||
          game.description?.toLowerCase().includes(lowerQuery)) {
        results.push(game);
      }
    }

    return results;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getGameCount(): number {
    return this.games.size;
  }
}

// Singleton instance
let mameManager: MameRomManager | null = null;

export function getMameRomManager(): MameRomManager {
  if (!mameManager) {
    mameManager = new MameRomManager();
  }
  return mameManager;
}

export const MameProvider: MetadataProvider = {
  name: 'MAME',
  type: 'retro',
  priority: 90,
  requiresApiKey: false,

  isAvailable(): boolean {
    return getMameRomManager().isLoaded();
  },

  async search(options: MetadataSearchOptions): Promise<GameMetadata | null> {
    const manager = getMameRomManager();
    if (!manager.isLoaded()) return null;

    // For arcade games, the title often matches the ROM name directly
    const game = manager.findByName(options.title.replace(/\s+/g, '_').toLowerCase());
    if (game) return mapMameToMetadata(game);

    // Try searching
    const results = manager.searchByName(options.title);
    if (results.length > 0) return mapMameToMetadata(results[0]);

    return null;
  },
};

export { mapMameToMetadata, inferGenres };
