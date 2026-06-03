/**
 * LaunchBox Games Database Metadata Provider
 * Covers: Both modern and retro games
 * Provides: Metadata, artwork
 * Access: API key (free)
 * API Docs: https://gamesdb.launchbox-app.com/api/
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource } from './types';

const LAUNCHBOX_BASE = 'https://gamesdb.launchbox-app.com/api';

interface LaunchBoxGame {
  ID: number;
  GameTitle: string;
  Overview?: string;
  ReleaseDate?: string;
  Genre?: string;
  Platform?: string;
  Developer?: string;
  Publisher?: string;
  Rating?: string;
  Coop?: string;
  Players?: string;
  YoutubeVideoID?: string;
  AlternateNames?: string[];
  Images?: {
    FileName: string;
    Type: 'Box - Front' | 'Box - Back' | 'Clear Logo' | 'Fanart' | 'Screenshot' | 'Banner' | 'Steam Grid';
    Region?: string;
  }[];
}

interface LaunchBoxSearchResponse {
  Games: LaunchBoxGame[];
}

interface LaunchBoxGameDetail extends LaunchBoxGame {
  Similar?: LaunchBoxGame[];
}

const PLATFORM_MAP: Record<string, string> = {
  'pc': 'PC',
  'windows': 'PC',
  'dos': 'MS-DOS',
  'nes': 'Nintendo Entertainment System',
  'snes': 'Super Nintendo Entertainment System',
  'n64': 'Nintendo 64',
  'gamecube': 'Nintendo GameCube',
  'wii': 'Nintendo Wii',
  'wiiu': 'Nintendo Wii U',
  'switch': 'Nintendo Switch',
  'gb': 'Nintendo Game Boy',
  'gbc': 'Nintendo Game Boy Color',
  'gba': 'Nintendo Game Boy Advance',
  'nds': 'Nintendo DS',
  '3ds': 'Nintendo 3DS',
  'genesis': 'Sega Genesis',
  'megadrive': 'Sega Genesis',
  'mastersystem': 'Sega Master System',
  'gamegear': 'Sega Game Gear',
  'saturn': 'Sega Saturn',
  'dreamcast': 'Sega Dreamcast',
  'segacd': 'Sega CD',
  '32x': 'Sega 32X',
  'psx': 'Sony PlayStation',
  'ps2': 'Sony PlayStation 2',
  'ps3': 'Sony PlayStation 3',
  'ps4': 'Sony PlayStation 4',
  'psp': 'Sony PSP',
  'psvita': 'Sony PlayStation Vita',
  'xbox': 'Microsoft Xbox',
  'xbox360': 'Microsoft Xbox 360',
  'xboxone': 'Microsoft Xbox One',
  'pce': 'NEC PC Engine',
  'tg16': 'NEC TurboGrafx-16',
  'pcecd': 'NEC PC Engine CD',
  'neogeo': 'Neo Geo',
  'neogeoaes': 'Neo Geo AES',
  'neogeocd': 'Neo Geo CD',
  'ngp': 'Neo Geo Pocket',
  'ngpc': 'Neo Geo Pocket Color',
  'arcade': 'Arcade',
  'mame': 'Arcade',
  'atari2600': 'Atari 2600',
  'atari5200': 'Atari 5200',
  'atari7800': 'Atari 7800',
  'lynx': 'Atari Lynx',
  'jaguar': 'Atari Jaguar',
  '3do': '3DO Interactive Multiplayer',
  'cdi': 'Philips CD-i',
  'c64': 'Commodore 64',
  'amiga': 'Commodore Amiga',
  'msx': 'MSX',
};

function normalizePlatform(platform?: string): string | undefined {
  if (!platform) return undefined;
  const normalized = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PLATFORM_MAP[normalized];
}

function mapLaunchBoxToMetadata(game: LaunchBoxGame): GameMetadata {
  const releaseYear = game.ReleaseDate
    ? new Date(game.ReleaseDate).getFullYear()
    : undefined;

  // Parse player count
  let playerCount: { min: number; max: number } | undefined;
  if (game.Players) {
    const match = game.Players.match(/(\d+)(?:\+?|-(\d+))?/);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = match[2] ? parseInt(match[2], 10) : (game.Players.includes('+') ? min : min);
      playerCount = { min, max };
    }
  }

  // Find images
  let coverUrl: string | undefined;
  let bannerUrl: string | undefined;
  let iconUrl: string | undefined;
  const screenshots: string[] = [];

  game.Images?.forEach(img => {
    const url = `https://images.launchbox-app.com/${img.FileName}`;

    switch (img.Type) {
      case 'Box - Front':
        if (!coverUrl) coverUrl = url;
        break;
      case 'Clear Logo':
        if (!iconUrl) iconUrl = url;
        break;
      case 'Fanart':
      case 'Banner':
        if (!bannerUrl) bannerUrl = url;
        break;
      case 'Screenshot':
        screenshots.push(url);
        break;
      case 'Steam Grid':
        if (!coverUrl) coverUrl = url;
        break;
    }
  });

  // YouTube video
  const videos = game.YoutubeVideoID ? [{
    type: 'trailer' as const,
    url: `https://www.youtube.com/watch?v=${game.YoutubeVideoID}`,
    thumbnailUrl: `https://img.youtube.com/vi/${game.YoutubeVideoID}/hqdefault.jpg`,
    source: 'LaunchBox',
  }] : undefined;

  const source: MetadataSource = {
    name: 'LaunchBox DB',
    type: 'primary',
    confidence: 0.87,
    fieldCoverage: ['title', 'description', 'releaseDate', 'developer', 'publisher', 'genres', 'coverUrl'],
  };

  return {
    title: game.GameTitle,
    description: game.Overview,
    releaseDate: game.ReleaseDate,
    releaseYear,
    developer: game.Developer,
    publisher: game.Publisher,
    genres: game.Genre ? game.Genre.split(',').map(g => g.trim()) : undefined,
    coverUrl,
    bannerUrl,
    iconUrl,
    screenshots: screenshots.length > 0 ? screenshots : undefined,
    videos,
    playerCount,
    platforms: game.Platform ? [game.Platform] : undefined,
    launchBoxDbId: String(game.ID),
    sources: [source],
  };
}

export const LaunchBoxProvider: MetadataProvider = {
  name: 'LaunchBox DB',
  type: 'primary',
  priority: 82,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    return !!apiKey;
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    try {
      const platform = normalizePlatform(options.platform);

      // Build search URL
      let url = `${LAUNCHBOX_BASE}/Games/ByGameName?apikey=${apiKey}&name=${encodeURIComponent(options.title)}`;

      if (platform) {
        url += `&platform=${encodeURIComponent(platform)}`;
      }

      const res = await fetch(url);
      if (!res.ok) return null;

      const data: LaunchBoxSearchResponse = await res.json();

      if (!data.Games || data.Games.length === 0) return null;

      // Return first match
      return mapLaunchBoxToMetadata(data.Games[0]);
    } catch (err) {
      console.error('[LaunchBox] Search error:', err);
      return null;
    }
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey || !options.launchBoxDbId) return null;

    try {
      const url = `${LAUNCHBOX_BASE}/Games/ByGameID?apikey=${apiKey}&id=${options.launchBoxDbId}`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const data: LaunchBoxGameDetail = await res.json();

      return mapLaunchBoxToMetadata(data);
    } catch {
      return null;
    }
  },
};

export { mapLaunchBoxToMetadata, normalizePlatform };
