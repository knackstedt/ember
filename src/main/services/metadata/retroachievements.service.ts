/**
 * RetroAchievements Metadata Provider
 * Covers: Retro ROMs with achievement support
 * Provides: Achievements, metadata
 * Access: Free account (API key required)
 * API Docs: https://api-docs.retroachievements.org/
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource, GameAchievement } from './types';

const RA_BASE = 'https://retroachievements.org/API';

interface RAGame {
  ID: number;
  Title: string;
  ConsoleID: number;
  ConsoleName: string;
  ImageIcon: string;
  ImageTitle: string;
  ImageIngame: string;
  ImageBoxArt: string;
  Publisher?: string;
  Developer?: string;
  Genre?: string;
  Released?: string;
  TotalPlayers?: number;
  TotalAchievements?: number;
  TotalPoints?: number;
  TotalTruePoints?: number;
}

interface RAAchievement {
  ID: number;
  NumAwarded: number;
  NumAwardedHardcore: number;
  Title: string;
  Description: string;
  Points: number;
  TrueRatio: number;
  Author: string;
  DateModified: string;
  DateCreated: string;
  BadgeName: string;
  DisplayOrder: number;
  MemAddr: string;
}

interface RAGameExtended extends RAGame {
  Achievements: RAAchievement[];
}

// Console ID mapping
const RA_CONSOLE_MAP: Record<string, number> = {
  'megadrive': 1,
  'genesis': 1,
  'n64': 2,
  'snes': 3,
  'gb': 4,
  'gba': 5,
  'gbc': 6,
  'nes': 7,
  'pce': 8,
  'tg16': 8,
  'segacd': 9,
  'segacd32x': 10,
  '32x': 10,
  'mastersystem': 11,
  'psx': 12,
  'atari2600': 13,
  'neogeo': 14,
  'neogeoaes': 14,
  'neogeocd': 15,
  'ngp': 17,
  'ngpc': 18,
  'gamegear': 15,
  'arcade': 27,
  'mame': 27,
  'virtualboy': 28,
  'sg1000': 33,
  'coleco': 44,
  'atari7800': 51,
  'nds': 18,
  'wii': 19,
  'wiiu': 20,
  'ps2': 21,
  'xbox': 22,
  'mame2003': 27,
  'scummvm': 123,
};

function normalizeConsoleId(platform?: string): number | undefined {
  if (!platform) return undefined;
  const normalized = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
  return RA_CONSOLE_MAP[normalized];
}

async function raRequest(endpoint: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  const queryParams = new URLSearchParams({ ...params, z: apiKey });
  const res = await fetch(`${RA_BASE}/${endpoint}?${queryParams}`);

  if (!res.ok) {
    throw new Error(`RetroAchievements API error: ${res.status}`);
  }

  return res.json();
}

function mapRAAchievement(ach: RAAchievement): GameAchievement {
  // Calculate rarity based on awarded count
  let rarity: 'common' | 'uncommon' | 'rare' | 'epic' = 'common';
  if (ach.NumAwarded < 100) rarity = 'epic';
  else if (ach.NumAwarded < 1000) rarity = 'rare';
  else if (ach.NumAwarded < 5000) rarity = 'uncommon';

  return {
    id: String(ach.ID),
    name: ach.Title,
    description: ach.Description,
    points: ach.Points,
    rarity,
    iconUrl: `https://media.retroachievements.org/Badge/${ach.BadgeName}.png`,
    iconLockedUrl: `https://media.retroachievements.org/Badge/${ach.BadgeName}_lock.png`,
  };
}

function mapRAToMetadata(game: RAGame, achievements?: RAAchievement[]): GameMetadata {
  const releaseYear = game.Released ? parseInt(game.Released, 10) : undefined;

  const source: MetadataSource = {
    name: 'RetroAchievements',
    type: 'retro',
    confidence: 0.9,
    fieldCoverage: ['title', 'releaseYear', 'developer', 'publisher', 'genres', 'coverUrl', 'achievementCount'],
  };

  const coverUrl = game.ImageBoxArt
    ? `https://media.retroachievements.org${game.ImageBoxArt}`
    : undefined;

  const bannerUrl = game.ImageTitle
    ? `https://media.retroachievements.org${game.ImageTitle}`
    : undefined;

  const iconUrl = game.ImageIcon
    ? `https://media.retroachievements.org${game.ImageIcon}`
    : undefined;

  const mappedAchievements = achievements?.map(mapRAAchievement);

  return {
    title: game.Title,
    releaseYear,
    developer: game.Developer,
    publisher: game.Publisher,
    genres: game.Genre ? game.Genre.split(',').map(g => g.trim()) : undefined,
    coverUrl,
    bannerUrl,
    iconUrl,
    achievementCount: game.TotalAchievements,
    achievements: mappedAchievements,
    platforms: [game.ConsoleName],
    sources: [source],
  };
}

export const RetroAchievementsProvider: MetadataProvider = {
  name: 'RetroAchievements',
  type: 'retro',
  priority: 92,
  requiresApiKey: true,

  isAvailable(apiKey?: string): boolean {
    return !!apiKey;
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey) return null;

    try {
      // Get console list first to validate
      const consoleId = normalizeConsoleId(options.platform);

      // Search by game list for the console
      if (consoleId) {
        const games = await raRequest(
          'API_GetGameList',
          { i: String(consoleId) },
          apiKey
        ) as RAGame[];

        // Find matching game
        const lowerTitle = options.title.toLowerCase();
        const match = games.find(g =>
          g.Title.toLowerCase() === lowerTitle ||
          g.Title.toLowerCase().includes(lowerTitle) ||
          lowerTitle.includes(g.Title.toLowerCase())
        );

        if (!match) return null;

        // Get extended info with achievements
        const extended = await raRequest(
          'API_GetGameExtended',
          { i: String(match.ID) },
          apiKey
        ) as RAGameExtended;

        return mapRAToMetadata(extended, extended.Achievements);
      }

      return null;
    } catch (err) {
      console.error('[RetroAchievements] Search error:', err);
      return null;
    }
  },

  async fetch(options: MetadataFetchOptions, apiKey?: string): Promise<GameMetadata | null> {
    if (!apiKey || !options.igdbId) return null; // Note: Would need RA game ID, not IGDB
    return null;
  },
};

export { mapRAToMetadata, mapRAAchievement, normalizeConsoleId };
