/**
 * SteamGridDB Artwork Provider
 * Covers: Both modern and retro games (Steam and non-Steam)
 * Provides: Grid artwork, hero images, logos, icons
 * Access: API key (free)
 * API Docs: https://www.steamgriddb.com/api/v2
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource } from './types';

const STEAMGRIDDB_BASE = 'https://www.steamgriddb.com/api/v2';

interface SteamGridDBSearchResult {
  id: number;
  name: string;
  types: string[];
  verified: boolean;
}

interface SteamGridDBImage {
  id: number;
  score: number;
  style: string;
  url: string;
  thumb: string;
  tags: string[];
  author: {
    name: string;
    steam64: string;
    avatar: string;
  };
}

interface SteamGridDBSearchResponse {
  success: boolean;
  data: SteamGridDBSearchResult[];
}

interface SteamGridDBImagesResponse {
  success: boolean;
  data: SteamGridDBImage[];
}

// Image types supported by SteamGridDB
const IMAGE_TYPES = ['grids', 'heroes', 'logos', 'icons'] as const;
type ImageType = typeof IMAGE_TYPES[number];

// Grid styles (dimensions)
const GRID_STYLES = {
  '460x215': 'standard',      // Steam standard
  '920x430': 'standard2x',    // Steam standard 2x
  '600x900': 'portrait',      // Steam portrait
  '342x482': 'alternate',     // Alternate
  '660x930': 'alternate2x',   // Alternate 2x
};

async function steamGridDBRequest(endpoint: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${STEAMGRIDDB_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Invalid SteamGridDB API key');
    }
    if (res.status === 429) {
      throw new Error('SteamGridDB rate limit exceeded');
    }
    throw new Error(`SteamGridDB API error: ${res.status}`);
  }

  return res.json();
}

async function searchGameId(title: string, apiKey: string): Promise<number | null> {
  try {
    const data = await steamGridDBRequest(
      `/search/autocomplete/${encodeURIComponent(title)}`,
      apiKey
    ) as SteamGridDBSearchResponse;

    if (!data.success || !data.data || data.data.length === 0) return null;

    // Prefer verified results
    const verified = data.data.find(r => r.verified);
    return verified?.id || data.data[0].id;
  } catch {
    return null;
  }
}

async function getImages(
  gameId: number,
  type: ImageType,
  apiKey: string,
  styles?: string[]
): Promise<SteamGridDBImage[]> {
  try {
    let endpoint = `/${type}/game/${gameId}`;

    // Add style filters if specified
    if (styles && styles.length > 0) {
      endpoint += `?styles=${styles.join(',')}`;
    }

    const data = await steamGridDBRequest(endpoint, apiKey) as SteamGridDBImagesResponse;

    if (!data.success || !data.data) return [];

    // Sort by score (highest first)
    return data.data.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

interface SteamGridDBMetadata {
  coverUrl?: string;
  bannerUrl?: string;
  iconUrl?: string;
  logoUrl?: string;
  gridImages?: string[];
  heroImages?: string[];
  logoImages?: string[];
  iconImages?: string[];
}

async function fetchAllArtwork(
  gameId: number,
  apiKey: string
): Promise<SteamGridDBMetadata> {
  const [grids, heroes, logos, icons] = await Promise.all([
    getImages(gameId, 'grids', apiKey, ['alternate', 'alternate2x']),
    getImages(gameId, 'heroes', apiKey),
    getImages(gameId, 'logos', apiKey),
    getImages(gameId, 'icons', apiKey),
  ]);

  return {
    coverUrl: grids[0]?.url,
    bannerUrl: heroes[0]?.url,
    iconUrl: icons[0]?.url,
    logoUrl: logos[0]?.url,
    gridImages: grids.map(g => g.url),
    heroImages: heroes.map(h => h.url),
    logoImages: logos.map(l => l.url),
    iconImages: icons.map(i => i.url),
  };
}

function mapSteamGridDBToMetadata(
  title: string,
  artwork: SteamGridDBMetadata
): GameMetadata {
  const source: MetadataSource = {
    name: 'SteamGridDB',
    type: 'artwork',
    confidence: 0.8,
    fieldCoverage: ['coverUrl', 'bannerUrl', 'iconUrl'],
  };

  return {
    title,
    coverUrl: artwork.coverUrl,
    bannerUrl: artwork.bannerUrl,
    iconUrl: artwork.iconUrl,
    sources: [source],
  };
}

export const SteamGridDBProvider: MetadataProvider = {
  name: 'SteamGridDB',
  type: 'artwork',
  priority: 70,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    return !!apiKey;
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    try {
      const gameId = await searchGameId(options.title, apiKey);
      if (!gameId) return null;

      const artwork = await fetchAllArtwork(gameId, apiKey);

      return mapSteamGridDBToMetadata(options.title, artwork);
    } catch (err) {
      console.error('[SteamGridDB] Search error:', err);
      return null;
    }
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    try {
      // SteamGridDB can search by Steam App ID
      if (options.steamAppId) {
        const images = await getImages(options.steamAppId, 'grids', apiKey);
        if (images.length > 0) {
          return mapSteamGridDBToMetadata('', {
            coverUrl: images[0]?.url,
            gridImages: images.map(i => i.url),
          });
        }
      }
      return null;
    } catch {
      return null;
    }
  },
};

// Export utility functions for testing and direct use
export {
  searchGameId,
  getImages,
  fetchAllArtwork,
  mapSteamGridDBToMetadata,
  IMAGE_TYPES,
  GRID_STYLES,
};
export type { SteamGridDBImage, SteamGridDBMetadata, ImageType };
