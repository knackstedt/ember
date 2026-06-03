/**
 * TheGamesDB Metadata Provider
 * Covers: Both modern and retro games
 * Provides: Metadata, artwork
 * Access: API key (free)
 * API Docs: https://api.thegamesdb.net/
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource } from './types';

const GAMESDB_BASE = 'https://api.thegamesdb.net/v1';

interface GamesDbGame {
  id: number;
  game_title: string;
  release_date?: string;
  developers?: number[];
  publishers?: number[];
  genres?: number[];
  platform: number;
  overview?: string;
  rating?: string;
  coop?: boolean;
  players?: string;
  youtube?: string;
  alternates?: string[];
}

interface GamesDbImage {
  id: number;
  type: string;
  side?: string;
  filename: string;
  resolution?: string;
}

interface GamesDbInclude {
  boxart?: { base_url: { original: string; thumb: string; medium: string; large: string; }; data: Record<string, GamesDbImage[]> };
  platform?: Record<string, { id: number; name: string; alias?: string }>;
  genre?: Record<string, { id: number; name: string }>;
  developer?: Record<string, { id: number; name: string }>;
  publisher?: Record<string, { id: number; name: string }>;
}

interface GamesDbResponse {
  data?: {
    games?: GamesDbGame[];
    count?: number;
  };
  include?: GamesDbInclude;
  pages?: {
    previous?: string;
    current?: string;
    next?: string;
  };
}

const PLATFORM_MAP: Record<string, number> = {
  'pc': 1,
  'nes': 7,
  'snes': 6,
  'n64': 3,
  'gamecube': 2,
  'wii': 5,
  'gb': 4,
  'gba': 5,
  'gbc': 41,
  'ds': 8,
  'genesis': 18,
  'megadrive': 36,
  'mastersystem': 35,
  'gamegear': 20,
  'saturn': 17,
  'dreamcast': 16,
  'psx': 10,
  'ps2': 11,
  'ps3': 12,
  'psp': 13,
  'xbox': 14,
  'xbox360': 15,
  'switch': 497,
  '3ds': 495,
  'wiiu': 38,
  'pce': 31,
  'tg16': 34,
  'neogeo': 24,
  'atarivcs': 22,
  'arcade': 23,
};

function normalizePlatform(platform?: string): number | undefined {
  if (!platform) return undefined;
  const normalized = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PLATFORM_MAP[normalized];
}

function mapGamesDbToMetadata(game: GamesDbGame, include?: GamesDbInclude): GameMetadata {
  // Resolve names from include data
  const developer = game.developers?.[0]
    ? include?.developer?.[String(game.developers[0])]?.name
    : undefined;

  const publisher = game.publishers?.[0]
    ? include?.publisher?.[String(game.publishers[0])]?.name
    : undefined;

  const genres = game.genres?.map(gid => include?.genre?.[String(gid)]?.name).filter(Boolean) as string[];

  // Find cover/boxart
  const boxartData = include?.boxart?.data?.[String(game.id)];
  let coverUrl: string | undefined;
  let bannerUrl: string | undefined;

  if (boxartData && include?.boxart?.base_url) {
    const frontCover = boxartData.find(img => img.side === 'front') || boxartData[0];
    if (frontCover) {
      coverUrl = `${include.boxart.base_url.large}${frontCover.filename}`;
    }

    const banner = boxartData.find(img => img.type === 'fanart');
    if (banner) {
      bannerUrl = `${include.boxart.base_url.large}${banner.filename}`;
    }
  }

  // Parse release date
  const releaseYear = game.release_date
    ? parseInt(game.release_date.split('-')[0], 10)
    : undefined;

  // Parse players
  let playerCount: { min: number; max: number } | undefined;
  if (game.players) {
    const playersStr = game.players.toLowerCase();
    if (playersStr.includes('1')) playerCount = { min: 1, max: 1 };
    if (playersStr.includes('2')) playerCount = { min: 1, max: 2 };
    if (playersStr.includes('4')) playerCount = { min: 1, max: 4 };
    if (playersStr.includes('coop')) playerCount = { min: 2, max: 2 };
    if (playersStr.includes('+')) {
      const match = playersStr.match(/(\d+)\+/);
      if (match) {
        const min = parseInt(match[1], 10);
        playerCount = { min, max: min };
      }
    }
  }

  // YouTube video
  const videos = game.youtube ? [{
    type: 'trailer' as const,
    url: `https://www.youtube.com/watch?v=${game.youtube}`,
    thumbnailUrl: `https://img.youtube.com/vi/${game.youtube}/hqdefault.jpg`,
    source: 'TheGamesDB',
  }] : undefined;

  const source: MetadataSource = {
    name: 'TheGamesDB',
    type: 'primary',
    confidence: 0.85,
    fieldCoverage: ['title', 'description', 'releaseDate', 'developer', 'publisher', 'genres', 'coverUrl'],
  };

  return {
    title: game.game_title,
    description: game.overview,
    releaseDate: game.release_date,
    releaseYear,
    developer,
    publisher,
    genres,
    coverUrl,
    bannerUrl,
    videos,
    playerCount,
    theGamesDbId: game.id,
    sources: [source],
  };
}

export const TheGamesDbProvider: MetadataProvider = {
  name: 'TheGamesDB',
  type: 'primary',
  priority: 80,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    return !!apiKey;
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    try {
      const platformId = normalizePlatform(options.platform);

      let url = `${GAMESDB_BASE}/Games/ByGameName?name=${encodeURIComponent(options.title)}&apikey=${apiKey}&fields=overview,release_date,developers,publishers,genres,platform,rating,coop,players,youtube,alternates&include=boxart,platform,genre,developer,publisher`;

      if (platformId) {
        url += `&filter[platform]=${platformId}`;
      }

      const res = await fetch(url);
      if (!res.ok) return null;

      const data: GamesDbResponse = await res.json();

      if (!data.data?.games || data.data.games.length === 0) return null;

      return mapGamesDbToMetadata(data.data.games[0], data.include);
    } catch {
      return null;
    }
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey || !options.theGamesDbId) return null;

    try {
      const url = `${GAMESDB_BASE}/Games/ByGameID?id=${options.theGamesDbId}&apikey=${apiKey}&fields=overview,release_date,developers,publishers,genres,platform,rating,coop,players,youtube,alternates&include=boxart,platform,genre,developer,publisher`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const data: GamesDbResponse = await res.json();

      if (!data.data?.games || data.data.games.length === 0) return null;

      return mapGamesDbToMetadata(data.data.games[0], data.include);
    } catch {
      return null;
    }
  },
};

export { mapGamesDbToMetadata, normalizePlatform };
