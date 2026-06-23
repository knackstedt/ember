/**
 * Fanart.tv Artwork Provider
 * Covers: Both modern and retro games
 * Provides: HD artwork, backgrounds, clear logos
 * Access: API key (free tier available)
 * API Docs: https://fanart.tv/api/
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource } from './types';

const FANARTTV_BASE = 'https://webservice.fanart.tv/v3';

interface FanartTVGame {
  name: string;
  tgdb_id?: string;
  steam_id?: string;
  hdmusiclogo?: FanartImage[];
  musiclogo?: FanartImage[];
  hdmovieclearart?: FanartImage[];
  movieart?: FanartImage[];
  hdclearart?: FanartImage[];
  clearart?: FanartImage[];
  hdmovielogo?: FanartImage[];
  movielogo?: FanartImage[];
  hdclearlogo?: FanartImage[];
  clearlogo?: FanartImage[];
  background?: FanartImage[];
  characterart?: FanartImage[];
  banner?: FanartImage[];
}

interface FanartImage {
  id: string;
  url: string;
  likes: number;
  lang: string;
}

// For games, we use the Games section which maps to TheGamesDB IDs
// or Steam IDs for PC games

async function fanartRequest(endpoint: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${FANARTTV_BASE}${endpoint}?api_key=${apiKey}`, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Invalid Fanart.tv API key');
    }
    if (res.status === 429) {
      throw new Error('Fanart.tv rate limit exceeded');
    }
    throw new Error(`Fanart.tv API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Get artwork for a game by TheGamesDB ID
 */
async function getByTheGamesDbId(id: string, apiKey: string): Promise<FanartTVGame | null> {
  try {
    const data = await fanartRequest(`/games/${id}`, apiKey) as FanartTVGame;
    return data;
  } catch {
    return null;
  }
}

/**
 * Get artwork for a game by Steam App ID
 */
async function getBySteamId(id: number, apiKey: string): Promise<FanartTVGame | null> {
  try {
    const data = await fanartRequest(`/steam/game/${id}`, apiKey) as FanartTVGame;
    return data;
  } catch {
    return null;
  }
}

/**
 * Select best image from array based on likes and language
 */
function selectBestImage(images?: FanartImage[], preferredLang = 'en'): string | undefined {
  if (!images || images.length === 0) return undefined;

  // Sort by: language match first, then likes
  const sorted = images.sort((a, b) => {
    const aLangMatch = a.lang === preferredLang || a.lang === '00' ? 1 : 0;
    const bLangMatch = b.lang === preferredLang || b.lang === '00' ? 1 : 0;

    if (aLangMatch !== bLangMatch) return bLangMatch - aLangMatch;
    return b.likes - a.likes;
  });

  return sorted[0].url;
}

interface FanartTVMetadata {
  clearLogoUrl?: string;
  hdClearLogoUrl?: string;
  backgroundUrl?: string;
  bannerUrl?: string;
  characterArtUrl?: string;
}

function extractArtwork(game: FanartTVGame): FanartTVMetadata {
  return {
    clearLogoUrl: selectBestImage(game.clearlogo),
    hdClearLogoUrl: selectBestImage(game.hdclearlogo || game.clearlogo),
    backgroundUrl: selectBestImage(game.background),
    bannerUrl: selectBestImage(game.banner),
    characterArtUrl: selectBestImage(game.characterart),
  };
}

function mapFanartTVToMetadata(artwork: FanartTVMetadata): GameMetadata {
  const source: MetadataSource = {
    name: 'Fanart.tv',
    type: 'artwork',
    confidence: 0.85,
    fieldCoverage: ['bannerUrl', 'iconUrl'],
  };

  return {
    title: '',
    coverUrl: artwork.hdClearLogoUrl || artwork.clearLogoUrl,
    bannerUrl: artwork.backgroundUrl || artwork.bannerUrl,
    iconUrl: artwork.clearLogoUrl,
    sources: [source],
  };
}

export const FanartTVProvider: MetadataProvider = {
  name: 'Fanart.tv',
  type: 'artwork',
  priority: 72,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    return !!apiKey;
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    // Fanart.tv requires an ID from another database (TheGamesDB or Steam)
    // It doesn't have a direct search by title
    // This would need to be called after getting an ID from another provider
    return null;
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    try {
      let game: FanartTVGame | null = null;

      // Try Steam ID first (preferred for PC games)
      if (options.steamAppId) {
        game = await getBySteamId(options.steamAppId, apiKey);
      }

      // Try TheGamesDB ID
      if (!game && options.theGamesDbId) {
        game = await getByTheGamesDbId(String(options.theGamesDbId), apiKey);
      }

      if (!game) return null;

      const artwork = extractArtwork(game);
      return mapFanartTVToMetadata(artwork);
    } catch (err) {
      console.error('[Fanart.tv] Fetch error:', err);
      return null;
    }
  },
};

// Export utility functions for testing
export {
  getByTheGamesDbId,
  getBySteamId,
  selectBestImage,
  extractArtwork,
  mapFanartTVToMetadata,
};
export type { FanartImage, FanartTVGame, FanartTVMetadata };
