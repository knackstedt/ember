/**
 * MobyGames Metadata Provider
 * Covers: Both modern and retro games
 * Provides: Metadata, artwork
 * Access: API key (free tier available)
 * API Docs: https://www.mobygames.com/info/api
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource } from './types';

const MOBYGAMES_BASE = 'https://api.mobygames.com/v1';

interface MobyGame {
  game_id: number;
  title: string;
  alternate_titles?: { title: string; description?: string }[];
  description?: string;
  genres?: { genre_name: string; genre_category: string }[];
  platforms?: {
    platform_id: number;
    platform_name: string;
    first_release_date?: string;
  }[];
  rating?: string;
  coop?: boolean;
  players?: string;
  developers?: { developer_id: number; developer_name: string }[];
  publishers?: { publisher_id: number; publisher_name: string }[];
  releases?: {
    product_id: number;
    platform_id: number;
    platform_name: string;
    release_date?: string;
    region?: string;
  }[];
  cover_art?: { image_url: string; width: number; height: number; caption?: string }[];
  screenshots?: { image_url: string; width: number; height: number; caption?: string }[];
}

interface MobySearchResponse {
  games: MobyGame[];
  total_results: number;
}

const PLATFORM_MAP: Record<string, string> = {
  'pc': '74', // Windows
  'windows': '74',
  'dos': '2',
  'nes': '22',
  'snes': '9',
  'n64': '3',
  'gamecube': '14',
  'wii': '82',
  'wiiu': '132',
  'switch': '203',
  'gb': '10',
  'gbc': '10', // grouped with GB in MobyGames
  'gba': '12',
  'ds': '8',
  '3ds': '101',
  'genesis': '16',
  'megadrive': '16',
  'mastersystem': '26',
  'gamegear': '25',
  'saturn': '23',
  'dreamcast': '1',
  'psx': '6',
  'ps2': '4',
  'ps3': '107',
  'ps4': '141',
  'psp': '46',
  'psvita': '105',
  'xbox': '13',
  'xbox360': '69',
  'xboxone': '142',
  'pce': '40',
  'tg16': '40',
  'neogeo': '36',
  'neogeoaes': '36',
  'neogeocd': '54',
  'arcade': '5',
  'atari2600': '28',
  'atari5200': '33',
  'atari7800': '34',
  'atarijaguar': '17',
  'lynx': '18',
  '3do': '21',
  'cdi': '43',
  'amiga': '19',
  'c64': '27',
  'msx': '57',
  'ngp': '47',
  'ngpc': '47',
  'wonderswan': '48',
  'wonderswancolor': '48',
  'intellivision': '32',
  'colecovision': '29',
  'vectrex': '37',
};

function normalizePlatform(platform?: string): string | undefined {
  if (!platform) return undefined;
  const normalized = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PLATFORM_MAP[normalized];
}

function mapMobyToMetadata(game: MobyGame, platformId?: string): GameMetadata {
  const firstPlatform = platformId
    ? game.platforms?.find(p => String(p.platform_id) === platformId)
    : game.platforms?.[0];

  const firstRelease = platformId
    ? game.releases?.find(r => String(r.platform_id) === platformId)
    : game.releases?.[0];

  const releaseDate = firstRelease?.release_date || firstPlatform?.first_release_date;
  const releaseYear = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : undefined;

  // Extract unique genre names
  const genreSet = new Set<string>();
  game.genres?.forEach(g => genreSet.add(g.genre_name));
  const genres = Array.from(genreSet);

  // Get cover art
  const coverUrl = game.cover_art?.[0]?.image_url;

  // Get screenshots
  const screenshots = game.screenshots?.map(s => s.image_url);

  // Player count parsing
  let playerCount: { min: number; max: number } | undefined;
  if (game.players) {
    const match = game.players.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = match[2] ? parseInt(match[2], 10) : min;
      playerCount = { min, max };
    }
  }

  const source: MetadataSource = {
    name: 'MobyGames',
    type: 'primary',
    confidence: 0.9,
    fieldCoverage: ['title', 'description', 'releaseDate', 'developer', 'publisher', 'genres', 'coverUrl'],
  };

  return {
    title: game.title,
    description: game.description,
    releaseDate,
    releaseYear,
    developer: game.developers?.[0]?.developer_name,
    publisher: game.publishers?.[0]?.publisher_name,
    genres,
    coverUrl,
    bannerUrl: screenshots?.[0],
    screenshots,
    platforms: game.platforms?.map(p => p.platform_name),
    playerCount,
    mobyGamesId: game.game_id,
    sources: [source],
  };
}

export const MobyGamesProvider: MetadataProvider = {
  name: 'MobyGames',
  type: 'primary',
  priority: 85,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    return !!apiKey;
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    try {
      const platformId = normalizePlatform(options.platform);

      let url = `${MOBYGAMES_BASE}/games/search?title=${encodeURIComponent(options.title)}&api_key=${apiKey}&limit=1&format=normal`;

      if (platformId) {
        url += `&platform=${platformId}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          console.warn('[MobyGames] Rate limit exceeded');
        }
        return null;
      }

      const data: MobySearchResponse = await res.json();

      if (!data.games || data.games.length === 0) return null;

      return mapMobyToMetadata(data.games[0], platformId);
    } catch (err) {
      console.error('[MobyGames] Search error:', err);
      return null;
    }
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey || !options.mobyGamesId) return null;

    try {
      const url = `${MOBYGAMES_BASE}/games?id=${options.mobyGamesId}&api_key=${apiKey}&format=normal`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const data: MobySearchResponse = await res.json();

      if (!data.games || data.games.length === 0) return null;

      return mapMobyToMetadata(data.games[0]);
    } catch {
      return null;
    }
  },
};

export { mapMobyToMetadata, normalizePlatform };
