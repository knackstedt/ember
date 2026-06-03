/**
 * OpenCritic Metadata Provider
 * Covers: Modern PC and console games
 * Provides: Metadata (ratings, reviews)
 * Access: Free (API key required but free tier available)
 * API Docs: https://docs.opencritic.com/
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource } from './types';

const OPENCRITIC_BASE = 'https://api.opencritic.com/api';

interface OpenCriticGame {
  id: number;
  name: string;
  description?: string;
  firstReleaseDate?: string;
  tier?: 'CriticsRecommend' | 'Strong' | 'Good' | 'Fair' | 'Weak' | 'NotRATED';
  averageScore?: number;
  percentRecommended?: number;
  numReviews?: number;
  numTopCriticReviews?: number;
  topCriticScore?: number;
  platforms?: { id: number; name: string; shortName?: string }[];
  genres?: { id: number; name: string }[];
  companies?: { id: number; name: string; type: string }[];
  images?: { url: string; caption?: string }[];
  logo?: { url: string };
  banner?: { url: string };
  boxArt?: { url: string };
  verticalLogo?: { url: string };
}

interface OpenCriticSearchResult {
  id: number;
  name: string;
  averageScore?: number;
  tier?: string;
  firstReleaseDate?: string;
}

async function opencriticRequest(endpoint: string, apiKey?: string, options?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-RapidAPI-Key'] = apiKey;
  }

  return fetch(`${OPENCRITIC_BASE}${endpoint}`, {
    ...options,
    headers,
  });
}

function mapOpenCriticToMetadata(game: OpenCriticGame): GameMetadata {
  const developers: string[] = [];
  const publishers: string[] = [];

  game.companies?.forEach(company => {
    if (company.type === 'DEVELOPER') developers.push(company.name);
    if (company.type === 'PUBLISHER') publishers.push(company.name);
  });

  const releaseDate = game.firstReleaseDate;
  const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : undefined;

  const source: MetadataSource = {
    name: 'OpenCritic',
    type: 'primary',
    confidence: 0.88,
    fieldCoverage: ['title', 'description', 'releaseDate', 'rating', 'openCriticScore', 'developer', 'publisher'],
  };

  return {
    title: game.name,
    description: game.description,
    releaseDate,
    releaseYear,
    developer: developers[0],
    publisher: publishers[0],
    genres: game.genres?.map(g => g.name),
    rating: game.averageScore ? game.averageScore / 10 : undefined,
    ratingCount: game.numReviews,
    openCriticScore: game.averageScore ? Math.round(game.averageScore) : undefined,
    coverUrl: game.boxArt?.url || game.verticalLogo?.url || game.logo?.url,
    bannerUrl: game.banner?.url,
    screenshots: game.images?.map(img => img.url),
    platforms: game.platforms?.map(p => p.name),
    sources: [source],
  };
}

export const OpenCriticProvider: MetadataProvider = {
  name: 'OpenCritic',
  type: 'primary',
  priority: 75,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    // OpenCritic can work without API key but with rate limits
    return true;
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    try {
      // Search for games
      const res = await opencriticRequest(
        `/meta/search?criteria=${encodeURIComponent(options.title)}`,
        apiKey
      );

      if (!res.ok) return null;

      const results: OpenCriticSearchResult[] = await res.json();

      if (!results || results.length === 0) return null;

      // Find best match
      let bestMatch = results[0];

      // If platform specified, try to find matching platform
      if (options.platform) {
        const platformMatch = results.find(r =>
          bestMatch.name.toLowerCase().includes(options.title!.toLowerCase()) ||
          options.title!.toLowerCase().includes(r.name.toLowerCase())
        );
        if (platformMatch) bestMatch = platformMatch;
      }

      // Fetch full details
      const detailRes = await opencriticRequest(`/game/${bestMatch.id}`, apiKey);
      if (!detailRes.ok) {
        // Return basic info from search if detail fetch fails
        const source: MetadataSource = {
          name: 'OpenCritic',
          type: 'primary',
          confidence: 0.7,
          fieldCoverage: ['title', 'openCriticScore'],
        };

        return {
          title: bestMatch.name,
          releaseYear: bestMatch.firstReleaseDate ? new Date(bestMatch.firstReleaseDate).getFullYear() : undefined,
          openCriticScore: bestMatch.averageScore ? Math.round(bestMatch.averageScore) : undefined,
          sources: [source],
        };
      }

      const game: OpenCriticGame = await detailRes.json();
      return mapOpenCriticToMetadata(game);
    } catch (err) {
      console.error('[OpenCritic] Search error:', err);
      return null;
    }
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    // OpenCritic doesn't have a direct fetch by external ID, but we could try by name
    return null;
  },
};

export { mapOpenCriticToMetadata };
