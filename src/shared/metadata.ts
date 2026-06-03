/**
 * Unified metadata types for all game metadata sources
 * Shared between main and renderer processes
 */

export interface GameMetadata {
  // Basic info
  title: string;
  description?: string;
  releaseDate?: string;
  releaseYear?: number;

  // Developer/Publisher
  developer?: string;
  publisher?: string;

  // Genres and tags
  genres?: string[];
  tags?: string[];

  // Ratings
  rating?: number;
  ratingCount?: number;
  metacriticScore?: number;
  openCriticScore?: number;

  // Media
  coverUrl?: string;
  bannerUrl?: string;
  iconUrl?: string;
  screenshots?: string[];
  videos?: GameVideo[];

  // Game specifics
  platforms?: string[];
  playerCount?: { min: number; max: number };
  playtime?: number;

  // External IDs
  steamAppId?: number;
  igdbId?: number;
  rawgSlug?: string;
  mobyGamesId?: number;
  theGamesDbId?: number;
  launchBoxDbId?: string;

  // Source tracking
  sources: MetadataSource[];

  // Retro/ROM specific
  romHash?: string;
  romHashType?: 'crc32' | 'md5' | 'sha1';
  region?: string;
  language?: string;
  serialNumber?: string;

  // Achievements
  achievementCount?: number;
  achievements?: GameAchievement[];

  // Linux/Proton compatibility
  protonRating?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'borked' | 'unknown';
  protondbReports?: number;

  // PC Gaming Wiki
  pcgwPageId?: number;
  pcgwEngine?: string;
  pcgwSeries?: string;
  pcgwSteamAppId?: number;

  // Steam specific
  steamReviewScore?: number;
  steamOwnersEstimate?: number;
}

export interface GameVideo {
  type: 'trailer' | 'gameplay' | 'review' | 'other';
  name?: string;
  url: string;
  thumbnailUrl?: string;
  source: string;
}

export interface GameAchievement {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  iconLockedUrl?: string;
  points?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic';
}

export interface MetadataSource {
  name: string;
  type: 'primary' | 'retro' | 'artwork' | 'video' | 'supplementary';
  confidence: number; // 0-1
  fieldCoverage: string[]; // which fields this source provided
}

export interface MetadataSearchOptions {
  title: string;
  platform?: string;
  releaseYear?: number;
  developer?: string;
  steamAppId?: number;
  romPath?: string;
  romHash?: string;
}

export interface MetadataFetchOptions {
  steamAppId?: number;
  igdbId?: number;
  rawgSlug?: string;
  mobyGamesId?: number;
  theGamesDbId?: number;
  launchBoxDbId?: string;
}

export interface MetadataProvider {
  readonly name: string;
  readonly type: 'primary' | 'retro' | 'artwork' | 'video' | 'supplementary';
  readonly priority: number; // Higher = more preferred when merging
  readonly requiresApiKey: boolean;

  isAvailable(apiKey?: string): boolean;
  search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null>;
  fetch?(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null>;
}

// Hash types for ROM verification
export interface RomHashInfo {
  crc32?: string;
  md5?: string;
  sha1?: string;
}

// DAT file entry structure
export interface DatEntry {
  name: string;
  description?: string;
  romName: string;
  size: number;
  crc32?: string;
  md5?: string;
  sha1?: string;
  serial?: string;
  region?: string;
  language?: string;
  developer?: string;
  publisher?: string;
  releaseYear?: number;
}
