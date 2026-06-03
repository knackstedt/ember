/**
 * IGDB Metadata Provider
 * Covers: Both modern and retro games
 * Provides: Metadata, artwork
 * Access: API key (free via Twitch Developer)
 * API Docs: https://api-docs.igdb.com/
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource } from './types';

const IGDB_BASE = 'https://api.igdb.com/v4';

// Token management for IGDB (requires Twitch OAuth)
interface IgdbToken {
  access_token: string;
  expires_at: number;
}

let cachedToken: IgdbToken | null = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expires_at > Date.now()) {
    return cachedToken.access_token;
  }

  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: 'POST' }
    );
    if (!res.ok) return null;

    const data = await res.json();
    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in * 1000) - 60000, // 1 min buffer
    };
    return cachedToken.access_token;
  } catch {
    return null;
  }
}

interface IgdbGame {
  id: number;
  name: string;
  summary?: string;
  storyline?: string;
  first_release_date?: number; // Unix timestamp
  rating?: number;
  rating_count?: number;
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  genres?: { name: string }[];
  themes?: { name: string }[];
  game_modes?: { name: string }[];
  player_perspectives?: { name: string }[];
  platforms?: { name: string }[];
  involved_companies?: {
    company: { name: string };
    developer: boolean;
    publisher: boolean;
  }[];
  cover?: { url: string };
  screenshots?: { url: string }[];
  artworks?: { url: string }[];
  videos?: { video_id: string; name?: string }[];
  game_engines?: { name: string }[];
  collection?: { name: string };
  franchises?: { name: string }[];
  external_games?: { category: number; uid: string }[];
  websites?: { category: number; url: string }[];
  game_localizations?: { region?: { name: string }; locale?: string }[];
}

// Category 1 = Steam in external_games
const STEAM_EXTERNAL_CATEGORY = 1;
// Category 13 = Steam in websites
const STEAM_WEBSITE_CATEGORY = 13;

async function igdbRequest(endpoint: string, body: string, clientId: string, accessToken: string) {
  const res = await fetch(`${IGDB_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'text/plain',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`IGDB API error: ${res.status}`);
  }

  return res.json();
}

function extractSteamAppId(game: IgdbGame): number | undefined {
  // Try external_games first
  const externalSteam = game.external_games?.find(eg => eg.category === STEAM_EXTERNAL_CATEGORY);
  if (externalSteam?.uid) {
    const parsed = parseInt(externalSteam.uid, 10);
    if (!isNaN(parsed)) return parsed;
  }

  // Try websites
  const steamWebsite = game.websites?.find(w => w.category === STEAM_WEBSITE_CATEGORY);
  if (steamWebsite?.url) {
    const match = steamWebsite.url.match(/store\.steampowered\.com\/app\/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }

  return undefined;
}

function mapIgdbToMetadata(game: IgdbGame): GameMetadata {
  const developers: string[] = [];
  const publishers: string[] = [];

  game.involved_companies?.forEach(ic => {
    if (ic.developer && ic.company?.name) developers.push(ic.company.name);
    if (ic.publisher && ic.company?.name) publishers.push(ic.company.name);
  });

  const releaseDate = game.first_release_date
    ? new Date(game.first_release_date * 1000).toISOString().split('T')[0]
    : undefined;

  const releaseYear = game.first_release_date
    ? new Date(game.first_release_date * 1000).getFullYear()
    : undefined;

  const coverUrl = game.cover?.url
    ? game.cover.url.startsWith('http') ? game.cover.url : `https:${game.cover.url.replace('thumb', 'cover_big')}`
    : undefined;

  const screenshots = game.screenshots?.map(s =>
    s.url.startsWith('http') ? s.url : `https:${s.url.replace('thumb', '1080p')}`
  );

  const videos = game.videos?.map(v => ({
    type: 'trailer' as const,
    name: v.name,
    url: `https://www.youtube.com/watch?v=${v.video_id}`,
    thumbnailUrl: `https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`,
    source: 'IGDB',
  }));

  const source: MetadataSource = {
    name: 'IGDB',
    type: 'primary',
    confidence: 0.95,
    fieldCoverage: ['title', 'description', 'releaseDate', 'rating', 'genres', 'platforms', 'coverUrl', 'screenshots'],
  };

  return {
    title: game.name,
    description: game.summary || game.storyline,
    releaseDate,
    releaseYear,
    developer: developers[0],
    genres: game.genres?.map(g => g.name),
    tags: [...(game.themes?.map(t => t.name) || []), ...(game.game_modes?.map(m => m.name) || [])],
    rating: game.rating ? game.rating / 10 : undefined,
    ratingCount: game.rating_count,
    metacriticScore: game.aggregated_rating ? Math.round(game.aggregated_rating) : undefined,
    coverUrl,
    bannerUrl: screenshots?.[0],
    screenshots,
    videos,
    platforms: game.platforms?.map(p => p.name),
    igdbId: game.id,
    steamAppId: extractSteamAppId(game),
    sources: [source],
  };
}

export const IGDBProvider: MetadataProvider = {
  name: 'IGDB',
  type: 'primary',
  priority: 100,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    // IGDB requires both client ID and client secret (format: "clientId:clientSecret")
    if (!apiKey) return false;
    return apiKey.includes(':') || apiKey.includes('|');
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    // Parse clientId and clientSecret
    let clientId: string;
    let clientSecret: string;

    if (apiKey.includes(':')) {
      [clientId, clientSecret] = apiKey.split(':');
    } else if (apiKey.includes('|')) {
      [clientId, clientSecret] = apiKey.split('|');
    } else {
      return null;
    }

    const accessToken = await getAccessToken(clientId, clientSecret);
    if (!accessToken) return null;

    try {
      const searchBody = options.platform
        ? `search "${options.title}"; fields name,summary,storyline,first_release_date,rating,rating_count,aggregated_rating,aggregated_rating_count,genres.name,themes.name,game_modes.name,player_perspectives.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,cover.url,screenshots.url,artworks.url,videos.video_id,videos.name,game_engines.name,collection.name,franchises.name,external_games.category,external_games.uid,websites.category,websites.url; where platforms.name ~ "${options.platform}"*; limit 1;`
        : `search "${options.title}"; fields name,summary,storyline,first_release_date,rating,rating_count,aggregated_rating,aggregated_rating_count,genres.name,themes.name,game_modes.name,player_perspectives.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,cover.url,screenshots.url,artworks.url,videos.video_id,videos.name,game_engines.name,collection.name,franchises.name,external_games.category,external_games.uid,websites.category,websites.url; limit 1;`;

      const games: IgdbGame[] = await igdbRequest('/games', searchBody, clientId, accessToken);

      if (!games || games.length === 0) return null;

      return mapIgdbToMetadata(games[0]);
    } catch {
      return null;
    }
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey || !options.igdbId) return null;

    let clientId: string;
    let clientSecret: string;

    if (apiKey.includes(':')) {
      [clientId, clientSecret] = apiKey.split(':');
    } else if (apiKey.includes('|')) {
      [clientId, clientSecret] = apiKey.split('|');
    } else {
      return null;
    }

    const accessToken = await getAccessToken(clientId, clientSecret);
    if (!accessToken) return null;

    try {
      const body = `fields name,summary,storyline,first_release_date,rating,rating_count,aggregated_rating,aggregated_rating_count,genres.name,themes.name,game_modes.name,player_perspectives.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,cover.url,screenshots.url,artworks.url,videos.video_id,videos.name,game_engines.name,collection.name,franchises.name,external_games.category,external_games.uid,websites.category,websites.url; where id = ${options.igdbId};`;

      const games: IgdbGame[] = await igdbRequest('/games', body, clientId, accessToken);

      if (!games || games.length === 0) return null;

      return mapIgdbToMetadata(games[0]);
    } catch {
      return null;
    }
  },
};

// Export individual functions for testing
export { getAccessToken, mapIgdbToMetadata, extractSteamAppId };
