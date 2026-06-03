/**
 * Steam Web API and SteamSpy Provider
 * Covers: Steam games
 * Provides: Achievements, player counts, metadata
 * Access: API key (free for Steam Web API, SteamSpy is free endpoint)
 * API Docs:
 * - Steam: https://partner.steamgames.com/doc/webapi
 * - SteamSpy: https://steamspy.com/api.php
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource, GameAchievement } from './types';

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAMSPY_BASE = 'https://steamspy.com/api.php';
const STEAM_STORE_BASE = 'https://store.steampowered.com/api';

// Steam Web API Interfaces
interface SteamAppDetails {
  [appId: string]: {
    success: boolean;
    data?: {
      name: string;
      type: string;
      short_description?: string;
      detailed_description?: string;
      developers?: string[];
      publishers?: string[];
      release_date?: { date?: string; coming_soon: boolean };
      genres?: { id: string; description: string }[];
      categories?: { id: number; description: string }[];
      metacritic?: { score: number; url?: string };
      header_image?: string;
      capsule_image?: string;
      background?: string;
      movies?: {
        id: number;
        name: string;
        thumbnail: string;
        webm?: { '480': string; max: string };
        mp4?: { '480': string; max: string };
      }[];
      platforms?: { windows: boolean; mac: boolean; linux: boolean };
      achievements?: {
        total: number;
        highlighted?: { name: string; path: string }[];
      };
      player_count?: number;
    };
  };
}

interface SteamAchievement {
  name: string;
  defaultvalue: number;
  displayName: string;
  hidden: number;
  description?: string;
  icon: string;
  icongray: string;
}

interface SteamAchievementSchema {
  game?: {
    gameName: string;
    gameVersion: string;
    availableGameStats?: {
      achievements?: SteamAchievement[];
    };
  };
}

interface SteamSpyData {
  appid: number;
  name: string;
  developer: string;
  publisher: string;
  score_rank?: string;
  owners: string;
  average_forever: number;
  average_2weeks: number;
  median_forever: number;
  median_2weeks: number;
  ccu: number; // current concurrent users
  price?: string;
  initialprice?: string;
  discount?: string;
  positive: number;
  negative: number;
  userscore: number;
  genre?: string;
  languages?: string;
}

/**
 * Get Steam app details from store API
 */
async function getSteamAppDetails(appId: number): Promise<SteamAppDetails[string]['data'] | null> {
  try {
    const res = await fetch(`${STEAM_STORE_BASE}/appdetails?appids=${appId}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return null;

    const data: SteamAppDetails = await res.json();
    return data[String(appId)]?.data || null;
  } catch {
    return null;
  }
}

/**
 * Get Steam achievements schema
 */
async function getSteamAchievements(appId: number, apiKey: string): Promise<SteamAchievement[] | null> {
  try {
    const res = await fetch(
      `${STEAM_API_BASE}/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appId}`
    );

    if (!res.ok) return null;

    const data: SteamAchievementSchema = await res.json();
    return data.game?.availableGameStats?.achievements || null;
  } catch {
    return null;
  }
}

/**
 * Get global achievement percentages (for rarity calculation)
 */
async function getAchievementPercentages(appId: number): Promise<Map<string, number> | null> {
  try {
    const res = await fetch(
      `${STEAM_API_BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`
    );

    if (!res.ok) return null;

    const data = await res.json();
    const percentages = new Map<string, number>();

    data.achievementpercentages?.achievements?.forEach((ach: { name: string; percent: number }) => {
      percentages.set(ach.name, ach.percent);
    });

    return percentages;
  } catch {
    return null;
  }
}

/**
 * Get SteamSpy data
 */
async function getSteamSpyData(appId: number): Promise<SteamSpyData | null> {
  try {
    const res = await fetch(`${STEAMSPY_BASE}?request=appdetails&appid=${appId}`);

    if (!res.ok) return null;

    return res.json();
  } catch {
    return null;
  }
}

/**
 * Parse SteamSpy owner count
 */
function parseOwners(ownersStr: string): { min: number; max: number } | undefined {
  const match = ownersStr.match(/(\d+),?(\d*)\.\.(\d+),?(\d*)/);
  if (!match) return undefined;

  const min = parseInt(match[1] + (match[2] || ''), 10);
  const max = parseInt(match[3] + (match[4] || ''), 10);

  return { min, max };
}

function mapSteamAchievement(
  ach: SteamAchievement,
  rarityPercent?: number
): GameAchievement {
  let rarity: GameAchievement['rarity'] = 'common';
  if (rarityPercent !== undefined) {
    if (rarityPercent < 5) rarity = 'epic';
    else if (rarityPercent < 15) rarity = 'rare';
    else if (rarityPercent < 30) rarity = 'uncommon';
  }

  return {
    id: ach.name,
    name: ach.displayName,
    description: ach.description,
    iconUrl: ach.icon,
    iconLockedUrl: ach.icongray,
    rarity,
  };
}

interface SteamMetadata {
  title: string;
  description?: string;
  developer?: string;
  publisher?: string;
  genres?: string[];
  releaseDate?: string;
  releaseYear?: number;
  coverUrl?: string;
  bannerUrl?: string;
  backgroundUrl?: string;
  videos?: GameMetadata['videos'];
  achievements?: GameAchievement[];
  achievementCount?: number;
  metacriticScore?: number;
  steamReviewScore?: number;
  steamOwnersEstimate?: number;
  currentPlayers?: number;
  playerCount?: { min: number; max: number };
  platforms?: string[];
  categories?: string[];
}

async function fetchSteamMetadata(
  appId: number,
  apiKey?: string
): Promise<SteamMetadata | null> {
  // Fetch both Steam and SteamSpy data in parallel
  const [appDetails, spyData] = await Promise.all([
    getSteamAppDetails(appId),
    getSteamSpyData(appId),
  ]);

  if (!appDetails && !spyData) return null;

  // Fetch achievements if API key provided
  let achievements: GameAchievement[] | undefined;
  let achievementCount: number | undefined;

  if (apiKey) {
    const [achSchema, achPercentages] = await Promise.all([
      getSteamAchievements(appId, apiKey),
      getAchievementPercentages(appId),
    ]);

    if (achSchema) {
      achievements = achSchema.map(ach =>
        mapSteamAchievement(ach, achPercentages?.get(ach.name))
      );
      achievementCount = achievements.length;
    }
  }

  // Use Steam data as primary, SteamSpy as fallback/supplement
  const title = appDetails?.name || spyData?.name || '';
  const description = appDetails?.short_description;
  const developer = appDetails?.developers?.[0] || spyData?.developer;
  const publisher = appDetails?.publishers?.[0] || spyData?.publisher;

  const releaseDate = appDetails?.release_date?.date;
  const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : undefined;

  const genres = appDetails?.genres?.map(g => g.description) ||
    (spyData?.genre ? spyData.genre.split(',').map(g => g.trim()) : undefined);

  // Images
  const coverUrl = appDetails?.capsule_image || appDetails?.header_image;
  const bannerUrl = appDetails?.header_image;
  const backgroundUrl = appDetails?.background;

  // Videos
  const videos = appDetails?.movies?.map(m => ({
    type: 'trailer' as const,
    name: m.name,
    url: m.webm?.max || m.mp4?.max || `https://steamcdn-a.akamaihd.net/steam/apps/${m.id}/movie_max.mp4`,
    thumbnailUrl: m.thumbnail,
    source: 'Steam',
  }));

  // Scores and stats
  const metacriticScore = appDetails?.metacritic?.score;
  const steamReviewScore = spyData?.userscore ? Math.round(spyData.userscore * 100) : undefined;
  const steamOwnersEstimate = spyData?.owners ? parseOwners(spyData.owners)?.max : undefined;
  const currentPlayers = spyData?.ccu;

  // Player count from SteamSpy average playtime
  let playerCount: { min: number; max: number } | undefined;
  if (spyData) {
    // Estimate based on categories
    const hasMultiplayer = appDetails?.categories?.some(c =>
      c.description.toLowerCase().includes('multiplayer') ||
      c.description.toLowerCase().includes('co-op')
    );
    if (hasMultiplayer) {
      playerCount = { min: 1, max: 4 }; // Default assumption
    }
  }

  // Platforms
  const platforms: string[] = [];
  if (appDetails?.platforms?.windows) platforms.push('Windows');
  if (appDetails?.platforms?.mac) platforms.push('macOS');
  if (appDetails?.platforms?.linux) platforms.push('Linux');

  // Categories
  const categories = appDetails?.categories?.map(c => c.description);

  return {
    title,
    description,
    developer,
    publisher,
    genres,
    releaseDate,
    releaseYear,
    coverUrl,
    bannerUrl,
    backgroundUrl,
    videos,
    achievements,
    achievementCount,
    metacriticScore,
    steamReviewScore,
    steamOwnersEstimate,
    currentPlayers,
    playerCount,
    platforms: platforms.length > 0 ? platforms : undefined,
    categories,
  };
}

function mapSteamToMetadata(steamData: SteamMetadata): GameMetadata {
  const source: MetadataSource = {
    name: 'Steam',
    type: 'supplementary',
    confidence: 0.95,
    fieldCoverage: ['title', 'description', 'developer', 'publisher', 'genres', 'releaseDate', 'coverUrl', 'videos', 'achievements', 'metacriticScore', 'steamReviewScore'],
  };

  return {
    title: steamData.title,
    description: steamData.description,
    developer: steamData.developer,
    publisher: steamData.publisher,
    genres: steamData.genres,
    releaseDate: steamData.releaseDate,
    releaseYear: steamData.releaseYear,
    coverUrl: steamData.coverUrl,
    bannerUrl: steamData.bannerUrl,
    videos: steamData.videos,
    achievements: steamData.achievements,
    achievementCount: steamData.achievementCount,
    metacriticScore: steamData.metacriticScore,
    steamReviewScore: steamData.steamReviewScore,
    steamAppId: steamData.currentPlayers, // Not really, but for tracking
    steamOwnersEstimate: steamData.steamOwnersEstimate,
    platforms: steamData.platforms,
    playerCount: steamData.playerCount,
    sources: [source],
  };
}

export const SteamWebAPIProvider: MetadataProvider = {
  name: 'Steam Web API',
  type: 'supplementary',
  priority: 95,
  requiresApiKey: false, // Works without, but achievements need API key

  isAvailable(): boolean {
    return true; // Store API is public
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    // Steam Web API doesn't have a good search endpoint for games
    // You'd typically search via Steam store or use external search
    // This provider is mainly for fetching by Steam App ID
    return null;
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!options.steamAppId) return null;

    try {
      const steamData = await fetchSteamMetadata(options.steamAppId, apiKey);
      if (!steamData) return null;

      return mapSteamToMetadata(steamData);
    } catch (err) {
      console.error('[Steam API] Fetch error:', err);
      return null;
    }
  },
};

// Export utility functions for testing and direct use
export {
  getSteamAppDetails,
  getSteamAchievements,
  getAchievementPercentages,
  getSteamSpyData,
  fetchSteamMetadata,
  mapSteamToMetadata,
  mapSteamAchievement,
  parseOwners,
};
export type { SteamAppDetails, SteamSpyData, SteamAchievement, SteamMetadata };
