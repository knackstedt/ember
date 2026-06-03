/**
 * Unified Metadata Service
 * Aggregates results from all metadata providers
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource } from './types';
import { getSettings } from '../settings.service';

// Import all providers
import { IGDBProvider } from './igdb.service';
import { TheGamesDbProvider } from './thegamesdb.service';
import { MobyGamesProvider } from './mobygames.service';
import { OpenCriticProvider } from './opencritic.service';
import { ScreenScraperProvider } from './screenscraper.service';
import { OpenVGDBProvider } from './openvgdb.service';
import { MameProvider } from './mame.service';
import { RetroAchievementsProvider } from './retroachievements.service';
import { LaunchBoxProvider } from './launchbox.service';
import { SteamGridDBProvider } from './steamgriddb.service';
import { FanartTVProvider } from './fanarttv.service';
import { YouTubeProvider } from './youtube.service';
import { PCGamingWikiProvider } from './pcgamingwiki.service';
import { SteamWebAPIProvider } from './steamapi.service';

// Import existing providers from their original locations
import { searchGame as rawgSearchGame, getGameDetail as rawgGetGameDetail } from '../rawg.service';
import { getProtonRating } from '../protondb.service';

// RAWG adapter to match MetadataProvider interface
const RAWGAdapter: MetadataProvider = {
  name: 'RAWG',
  type: 'primary',
  priority: 78,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    return !!apiKey;
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    const rawgGame = await rawgSearchGame(options.title, apiKey);
    if (!rawgGame) return null;

    const source: MetadataSource = {
      name: 'RAWG',
      type: 'primary',
      confidence: 0.82,
      fieldCoverage: ['title', 'description', 'releaseDate', 'genres', 'coverUrl', 'rating'],
    };

    return {
      title: rawgGame.name,
      description: rawgGame.description_raw,
      releaseDate: rawgGame.released,
      releaseYear: rawgGame.released ? new Date(rawgGame.released).getFullYear() : undefined,
      developer: rawgGame.developers?.[0]?.name,
      publisher: rawgGame.publishers?.[0]?.name,
      genres: rawgGame.genres?.map(g => g.name),
      coverUrl: rawgGame.background_image,
      rating: rawgGame.rating ? rawgGame.rating * 2 : undefined, // RAWG is 0-5, we use 0-10
      metacriticScore: rawgGame.metacritic,
      playtime: rawgGame.playtime,
      rawgSlug: rawgGame.slug,
      platforms: rawgGame.platforms?.map(p => p.platform.name),
      sources: [source],
    };
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey || !options.rawgSlug) return null;

    const rawgGame = await rawgGetGameDetail(options.rawgSlug, apiKey);
    if (!rawgGame) return null;

    const source: MetadataSource = {
      name: 'RAWG',
      type: 'primary',
      confidence: 0.82,
      fieldCoverage: ['title', 'description', 'releaseDate', 'genres', 'coverUrl', 'rating'],
    };

    return {
      title: rawgGame.name,
      description: rawgGame.description_raw,
      releaseDate: rawgGame.released,
      releaseYear: rawgGame.released ? new Date(rawgGame.released).getFullYear() : undefined,
      developer: rawgGame.developers?.[0]?.name,
      publisher: rawgGame.publishers?.[0]?.name,
      genres: rawgGame.genres?.map(g => g.name),
      coverUrl: rawgGame.background_image,
      rating: rawgGame.rating ? rawgGame.rating * 2 : undefined,
      metacriticScore: rawgGame.metacritic,
      playtime: rawgGame.playtime,
      rawgSlug: rawgGame.slug,
      platforms: rawgGame.platforms?.map(p => p.platform.name),
      sources: [source],
    };
  },
};

// ProtonDB adapter
const ProtonDBAdapter: MetadataProvider = {
  name: 'ProtonDB',
  type: 'supplementary',
  priority: 50,
  requiresApiKey: false,

  isAvailable(): boolean {
    return true;
  },

  async search(options: MetadataSearchOptions): Promise<GameMetadata | null> {
    // ProtonDB requires Steam App ID, can't search by title alone
    return null;
  },

  async fetch(options: MetadataFetchOptions): Promise<GameMetadata | null> {
    if (!options.steamAppId) return null;

    const rating = await getProtonRating(options.steamAppId);
    if (rating === 'unknown') return null;

    const source: MetadataSource = {
      name: 'ProtonDB',
      type: 'supplementary',
      confidence: 0.9,
      fieldCoverage: ['protonRating'],
    };

    return {
      title: '',
      protonRating: rating,
      sources: [source],
    };
  },
};

// Registry of all providers
const ALL_PROVIDERS: MetadataProvider[] = [
  IGDBProvider,
  TheGamesDbProvider,
  MobyGamesProvider,
  OpenCriticProvider,
  ScreenScraperProvider,
  OpenVGDBProvider,
  MameProvider,
  RetroAchievementsProvider,
  LaunchBoxProvider,
  SteamGridDBProvider,
  FanartTVProvider,
  YouTubeProvider,
  PCGamingWikiProvider,
  SteamWebAPIProvider,
  RAWGAdapter,
  ProtonDBAdapter,
];

// Provider groups by type
const PRIMARY_PROVIDERS = ALL_PROVIDERS.filter(p => p.type === 'primary');
const RETRO_PROVIDERS = ALL_PROVIDERS.filter(p => p.type === 'retro');
const ARTWORK_PROVIDERS = ALL_PROVIDERS.filter(p => p.type === 'artwork');
const VIDEO_PROVIDERS = ALL_PROVIDERS.filter(p => p.type === 'video');
const SUPPLEMENTARY_PROVIDERS = ALL_PROVIDERS.filter(p => p.type === 'supplementary');

// Settings interface for API keys
interface MetadataApiKeys {
  igdbClientId?: string;
  igdbClientSecret?: string;
  theGamesDbApiKey?: string;
  mobyGamesApiKey?: string;
  openCriticApiKey?: string;
  screenScraperDevId?: string;
  screenScraperDevPassword?: string;
  screenScraperUsername?: string;
  screenScraperPassword?: string;
  retroAchievementsApiKey?: string;
  launchBoxApiKey?: string;
  steamGridDbApiKey?: string;
  fanartTvApiKey?: string;
  youtubeApiKey?: string;
  rawgApiKey?: string;
  steamApiKey?: string;
}

/**
 * Get API keys from settings
 */
async function getApiKeys(): Promise<MetadataApiKeys> {
  const settings = await getSettings();

  return {
    rawgApiKey: settings.rawgApiKey,
    // Other API keys would be stored in settings or env
    // For now, we'll use a convention where they might be in settings
    // or could be extended later
  };
}

/**
 * Build composite API key strings for providers that need multiple credentials
 */
function buildCompositeKeys(keys: MetadataApiKeys): Record<string, string> {
  return {
    igdb: keys.igdbClientId && keys.igdbClientSecret
      ? `${keys.igdbClientId}:${keys.igdbClientSecret}`
      : '',
    screenScraper: keys.screenScraperDevId && keys.screenScraperDevPassword
      ? keys.screenScraperUsername && keys.screenScraperPassword
        ? `${keys.screenScraperDevId}:${keys.screenScraperDevPassword}:${keys.screenScraperUsername}:${keys.screenScraperPassword}`
        : `${keys.screenScraperDevId}:${keys.screenScraperDevPassword}`
      : '',
  };
}

/**
 * Merge metadata from multiple sources
 * Uses priority and confidence to determine which fields to keep
 */
function mergeMetadata(results: GameMetadata[]): GameMetadata {
  if (results.length === 0) {
    return {
      title: '',
      sources: [],
    };
  }

  if (results.length === 1) {
    return results[0];
  }

  // Sort by confidence (highest first)
  const sorted = [...results].sort((a, b) => {
    const aConf = a.sources[0]?.confidence || 0;
    const bConf = b.sources[0]?.confidence || 0;
    return bConf - aConf;
  });

  const merged: GameMetadata = {
    title: sorted[0].title,
    sources: [],
  };

  // Track which sources contributed
  const allSources: MetadataSource[] = [];

  // Merge fields, preferring higher confidence sources
  for (const result of sorted) {
    allSources.push(...result.sources);

    if (result.description && !merged.description) merged.description = result.description;
    if (result.releaseDate && !merged.releaseDate) merged.releaseDate = result.releaseDate;
    if (result.releaseYear && !merged.releaseYear) merged.releaseYear = result.releaseYear;
    if (result.developer && !merged.developer) merged.developer = result.developer;
    if (result.publisher && !merged.publisher) merged.publisher = result.publisher;
    if (result.genres && !merged.genres) merged.genres = result.genres;
    if (result.tags && !merged.tags) merged.tags = result.tags;
    if (result.rating && !merged.rating) merged.rating = result.rating;
    if (result.ratingCount && !merged.ratingCount) merged.ratingCount = result.ratingCount;
    if (result.metacriticScore && !merged.metacriticScore) merged.metacriticScore = result.metacriticScore;
    if (result.openCriticScore && !merged.openCriticScore) merged.openCriticScore = result.openCriticScore;

    // Artwork - prefer higher quality sources
    if (result.coverUrl && !merged.coverUrl) merged.coverUrl = result.coverUrl;
    if (result.bannerUrl && !merged.bannerUrl) merged.bannerUrl = result.bannerUrl;
    if (result.iconUrl && !merged.iconUrl) merged.iconUrl = result.iconUrl;

    // Combine screenshots from multiple sources
    if (result.screenshots) {
      merged.screenshots = [...(merged.screenshots || []), ...result.screenshots];
    }

    // Combine videos
    if (result.videos) {
      merged.videos = [...(merged.videos || []), ...result.videos];
    }

    if (result.platforms && !merged.platforms) merged.platforms = result.platforms;
    if (result.playerCount && !merged.playerCount) merged.playerCount = result.playerCount;
    if (result.playtime && !merged.playtime) merged.playtime = result.playtime;

    // External IDs
    if (result.steamAppId && !merged.steamAppId) merged.steamAppId = result.steamAppId;
    if (result.igdbId && !merged.igdbId) merged.igdbId = result.igdbId;
    if (result.rawgSlug && !merged.rawgSlug) merged.rawgSlug = result.rawgSlug;
    if (result.mobyGamesId && !merged.mobyGamesId) merged.mobyGamesId = result.mobyGamesId;
    if (result.theGamesDbId && !merged.theGamesDbId) merged.theGamesDbId = result.theGamesDbId;
    if (result.launchBoxDbId && !merged.launchBoxDbId) merged.launchBoxDbId = result.launchBoxDbId;

    // ROM/Retro specific
    if (result.romHash && !merged.romHash) merged.romHash = result.romHash;
    if (result.romHashType && !merged.romHashType) merged.romHashType = result.romHashType;
    if (result.region && !merged.region) merged.region = result.region;
    if (result.language && !merged.language) merged.language = result.language;
    if (result.serialNumber && !merged.serialNumber) merged.serialNumber = result.serialNumber;

    // Achievements
    if (result.achievementCount && !merged.achievementCount) merged.achievementCount = result.achievementCount;
    if (result.achievements && !merged.achievements) merged.achievements = result.achievements;

    // Linux/Proton
    if (result.protonRating && !merged.protonRating) merged.protonRating = result.protonRating;
    if (result.protondbReports && !merged.protondbReports) merged.protondbReports = result.protondbReports;

    // PCGamingWiki
    if (result.pcgwEngine && !merged.pcgwEngine) merged.pcgwEngine = result.pcgwEngine;
    if (result.pcgwSeries && !merged.pcgwSeries) merged.pcgwSeries = result.pcgwSeries;

    // Steam specific
    if (result.steamReviewScore && !merged.steamReviewScore) merged.steamReviewScore = result.steamReviewScore;
    if (result.steamOwnersEstimate && !merged.steamOwnersEstimate) merged.steamOwnersEstimate = result.steamOwnersEstimate;
  }

  // Deduplicate sources
  merged.sources = allSources.filter((source, index, self) =>
    index === self.findIndex(s => s.name === source.name)
  );

  // Deduplicate screenshots
  if (merged.screenshots) {
    merged.screenshots = [...new Set(merged.screenshots)];
  }

  // Deduplicate videos by URL
  if (merged.videos) {
    const seen = new Set<string>();
    merged.videos = merged.videos.filter(v => {
      if (seen.has(v.url)) return false;
      seen.add(v.url);
      return true;
    });
  }

  return merged;
}

/**
 * Search for game metadata across all available providers
 */
export async function searchGameMetadata(
  options: MetadataSearchOptions,
  preferredSources?: ('primary' | 'retro' | 'artwork' | 'video' | 'supplementary')[]
): Promise<GameMetadata> {
  const apiKeys = await getApiKeys();
  const compositeKeys = buildCompositeKeys(apiKeys);

  // Determine which providers to use
  let providersToUse: MetadataProvider[] = [];

  if (preferredSources) {
    providersToUse = ALL_PROVIDERS.filter(p => preferredSources.includes(p.type));
  } else {
    // Default: use all available providers
    providersToUse = ALL_PROVIDERS;
  }

  // Filter to available providers with API keys
  const availableProviders = providersToUse.filter(p => {
    if (!p.requiresApiKey) return p.isAvailable();

    let apiKey: string | undefined;

    // Map provider names to their API keys
    switch (p.name) {
      case 'IGDB': apiKey = compositeKeys.igdb; break;
      case 'TheGamesDB': apiKey = apiKeys.theGamesDbApiKey; break;
      case 'MobyGames': apiKey = apiKeys.mobyGamesApiKey; break;
      case 'OpenCritic': apiKey = apiKeys.openCriticApiKey; break;
      case 'ScreenScraper': apiKey = compositeKeys.screenScraper; break;
      case 'RetroAchievements': apiKey = apiKeys.retroAchievementsApiKey; break;
      case 'LaunchBox DB': apiKey = apiKeys.launchBoxApiKey; break;
      case 'SteamGridDB': apiKey = apiKeys.steamGridDbApiKey; break;
      case 'Fanart.tv': apiKey = apiKeys.fanartTvApiKey; break;
      case 'YouTube': apiKey = apiKeys.youtubeApiKey; break;
      case 'RAWG': apiKey = apiKeys.rawgApiKey; break;
      case 'Steam Web API': apiKey = apiKeys.steamApiKey; break;
      default: apiKey = undefined;
    }

    return p.isAvailable(apiKey);
  });

  // Execute searches in parallel with timeout
  const searchPromises = availableProviders.map(async provider => {
    try {
      let apiKey: string | undefined;

      switch (provider.name) {
        case 'IGDB': apiKey = compositeKeys.igdb; break;
        case 'TheGamesDB': apiKey = apiKeys.theGamesDbApiKey; break;
        case 'MobyGames': apiKey = apiKeys.mobyGamesApiKey; break;
        case 'OpenCritic': apiKey = apiKeys.openCriticApiKey; break;
        case 'ScreenScraper': apiKey = compositeKeys.screenScraper; break;
        case 'RetroAchievements': apiKey = apiKeys.retroAchievementsApiKey; break;
        case 'LaunchBox DB': apiKey = apiKeys.launchBoxApiKey; break;
        case 'SteamGridDB': apiKey = apiKeys.steamGridDbApiKey; break;
        case 'Fanart.tv': apiKey = apiKeys.fanartTvApiKey; break;
        case 'YouTube': apiKey = apiKeys.youtubeApiKey; break;
        case 'RAWG': apiKey = apiKeys.rawgApiKey; break;
        case 'Steam Web API': apiKey = apiKeys.steamApiKey; break;
      }

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 10000)
      );

      const result = await Promise.race([
        provider.search(options, apiKey),
        timeoutPromise,
      ]);

      return result;
    } catch (err) {
      console.warn(`[MetadataService] ${provider.name} search failed:`, err);
      return null;
    }
  });

  const results = await Promise.all(searchPromises);
  const validResults = results.filter((r): r is GameMetadata => r !== null);

  return mergeMetadata(validResults);
}

/**
 * Fetch metadata by known external IDs
 */
export async function fetchGameMetadata(
  options: MetadataFetchOptions,
  preferredSources?: ('primary' | 'retro' | 'artwork' | 'video' | 'supplementary')[]
): Promise<GameMetadata> {
  const apiKeys = await getApiKeys();
  const compositeKeys = buildCompositeKeys(apiKeys);

  let providersToUse = ALL_PROVIDERS;
  if (preferredSources) {
    providersToUse = ALL_PROVIDERS.filter(p => preferredSources.includes(p.type));
  }

  // Only use providers that support fetch
  const fetchableProviders = providersToUse.filter(p => p.fetch);

  const fetchPromises = fetchableProviders.map(async provider => {
    if (!provider.fetch) return null;

    try {
      let apiKey: string | undefined;

      switch (provider.name) {
        case 'IGDB': apiKey = compositeKeys.igdb; break;
        case 'TheGamesDB': apiKey = apiKeys.theGamesDbApiKey; break;
        case 'MobyGames': apiKey = apiKeys.mobyGamesApiKey; break;
        case 'OpenCritic': apiKey = apiKeys.openCriticApiKey; break;
        case 'RetroAchievements': apiKey = apiKeys.retroAchievementsApiKey; break;
        case 'LaunchBox DB': apiKey = apiKeys.launchBoxApiKey; break;
        case 'SteamGridDB': apiKey = apiKeys.steamGridDbApiKey; break;
        case 'Fanart.tv': apiKey = apiKeys.fanartTvApiKey; break;
        case 'RAWG': apiKey = apiKeys.rawgApiKey; break;
        case 'Steam Web API': apiKey = apiKeys.steamApiKey; break;
        case 'ProtonDB': apiKey = undefined; break;
        case 'PCGamingWiki': apiKey = undefined; break;
      }

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 10000)
      );

      const result = await Promise.race([
        provider.fetch(options, apiKey),
        timeoutPromise,
      ]);

      return result;
    } catch (err) {
      console.warn(`[MetadataService] ${provider.name} fetch failed:`, err);
      return null;
    }
  });

  const results = await Promise.all(fetchPromises);
  const validResults = results.filter((r): r is GameMetadata => r !== null);

  return mergeMetadata(validResults);
}

/**
 * Quick metadata lookup for a game title
 * Uses only fast/primary sources
 */
export async function quickMetadataLookup(
  title: string,
  platform?: string
): Promise<GameMetadata> {
  return searchGameMetadata(
    { title, platform },
    ['primary', 'supplementary']
  );
}

/**
 * Full metadata enrichment for a game
 * Uses all available sources including artwork and video
 */
export async function enrichGameMetadata(
  title: string,
  platform?: string,
  steamAppId?: number
): Promise<GameMetadata> {
  const options: MetadataSearchOptions = { title, platform, steamAppId };

  // First, do a basic search
  const basicMetadata = await searchGameMetadata(options);

  // If we have a Steam App ID, also fetch Steam-specific data
  if (steamAppId || basicMetadata.steamAppId) {
    const steamId = steamAppId || basicMetadata.steamAppId;
    const steamMetadata = await fetchGameMetadata({ steamAppId: steamId });

    // Merge Steam data
    return mergeMetadata([basicMetadata, steamMetadata]);
  }

  return basicMetadata;
}

/**
 * Get list of available providers
 */
export function getAvailableProviders(): string[] {
  return ALL_PROVIDERS.map(p => p.name);
}

/**
 * Get providers by type
 */
export function getProvidersByType(type: MetadataProvider['type']): string[] {
  return ALL_PROVIDERS.filter(p => p.type === type).map(p => p.name);
}

// Re-export types
export * from './types';

// Re-export individual providers for direct use
export {
  IGDBProvider,
  TheGamesDbProvider,
  MobyGamesProvider,
  OpenCriticProvider,
  ScreenScraperProvider,
  OpenVGDBProvider,
  MameProvider,
  RetroAchievementsProvider,
  LaunchBoxProvider,
  SteamGridDBProvider,
  FanartTVProvider,
  YouTubeProvider,
  PCGamingWikiProvider,
  SteamWebAPIProvider,
  RAWGAdapter,
  ProtonDBAdapter,
};
