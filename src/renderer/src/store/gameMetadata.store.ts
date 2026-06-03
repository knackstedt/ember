/**
 * Lazy Game Metadata Store
 * Fetches extended metadata on-demand when viewing game details
 * Separates high-priority metadata (scanned immediately) from low-rate-limit services (fetched lazily)
 */

import { create } from "zustand";
import { GameMetadata } from "../../../main/services/metadata/types";

// Metadata that should be fetched immediately during scan (high rate limits or no API key required)
export const IMMEDIATE_METADATA_SOURCES = [
  "IGDB",
  "TheGamesDB",
  "Steam", // Steam Web API
  "PCGamingWiki",
  "OpenVGDB",
  "MAME",
  "DAT Files", // Local
];

// Metadata that should be fetched lazily when viewing details (low rate limits or expensive APIs)
export const LAZY_METADATA_SOURCES = [
  "MobyGames", // 360 requests/hour
  "OpenCritic", // Lower rate limits
  "ScreenScraper", // Requires auth for high limits
  "RetroAchievements", // API limits
  "LaunchBox DB", // API key required
  "SteamGridDB", // Artwork
  "Fanart.tv", // Artwork
  "YouTube", // Video quota
];

interface GameMetadataState {
  // Cache of fetched metadata by game ID
  metadataCache: Map<string, Partial<GameMetadata>>;

  // Track which games are currently loading
  loadingGames: Set<string>;

  // Track which games have completed loading all lazy sources
  fullyLoadedGames: Set<string>;

  // Fetch immediate metadata (during scan)
  fetchImmediateMetadata: (gameId: string, title: string, platform?: string, steamAppId?: number) => Promise<void>;

  // Fetch lazy metadata (when viewing details)
  fetchLazyMetadata: (gameId: string, title: string, platform?: string, steamAppId?: number) => Promise<void>;

  // Fetch specific metadata types
  fetchAchievements: (gameId: string, consoleId?: number) => Promise<void>;
  fetchArtwork: (gameId: string, steamAppId?: number, theGamesDbId?: string) => Promise<void>;
  fetchVideos: (gameId: string, title: string) => Promise<void>;

  // Get cached metadata for a game
  getMetadata: (gameId: string) => Partial<GameMetadata> | undefined;

  // Check if game is loading
  isLoading: (gameId: string) => boolean;

  // Check if game has fully loaded all sources
  isFullyLoaded: (gameId: string) => boolean;

  // Clear cache
  clearCache: () => void;

  // Preload metadata for multiple games (immediate sources only)
  preloadMetadata: (games: Array<{ id: string; title: string; platform?: string; steamAppId?: number }>) => Promise<void>;
}

export const useGameMetadataStore = create<GameMetadataState>((set, get) => ({
  metadataCache: new Map(),
  loadingGames: new Set(),
  fullyLoadedGames: new Set(),

  fetchImmediateMetadata: async (gameId, title, platform, steamAppId) => {
    if (get().loadingGames.has(gameId)) return;

    // Check if we already have immediate metadata
    const cached = get().metadataCache.get(gameId);
    if (cached && cached.sources?.some(s => IMMEDIATE_METADATA_SOURCES.includes(s.name))) {
      return;
    }

    set((s) => {
      const next = new Set(s.loadingGames);
      next.add(gameId);
      return { loadingGames: next };
    });

    try {
      // Fetch only from immediate sources (quick metadata lookup)
      const metadata = await window.htpc.games.quickMetadata(title, platform);

      if (metadata) {
        set((s) => {
          const newCache = new Map(s.metadataCache);
          const existing = newCache.get(gameId) || {};
          newCache.set(gameId, { ...existing, ...metadata });
          return { metadataCache: newCache };
        });
      }
    } catch (err) {
      console.warn("Failed to fetch immediate metadata:", err);
    } finally {
      set((s) => {
        const next = new Set(s.loadingGames);
        next.delete(gameId);
        return { loadingGames: next };
      });
    }
  },

  fetchLazyMetadata: async (gameId, title, platform, steamAppId) => {
    if (get().loadingGames.has(gameId)) return;
    if (get().fullyLoadedGames.has(gameId)) return;

    set((s) => {
      const next = new Set(s.loadingGames);
      next.add(gameId);
      return { loadingGames: next };
    });

    try {
      // Fetch full metadata from all sources
      const metadata = await window.htpc.games.searchMetadata(title, platform, steamAppId);

      if (metadata) {
        set((s) => {
          const newCache = new Map(s.metadataCache);
          const existing = newCache.get(gameId) || {};
          newCache.set(gameId, { ...existing, ...metadata });
          return { metadataCache: newCache };
        });
      }

      set((s) => {
        const next = new Set(s.fullyLoadedGames);
        next.add(gameId);
        return { fullyLoadedGames: next };
      });
    } catch (err) {
      console.warn("Failed to fetch lazy metadata:", err);
    } finally {
      set((s) => {
        const next = new Set(s.loadingGames);
        next.delete(gameId);
        return { loadingGames: next };
      });
    }
  },

  fetchAchievements: async (gameId, consoleId) => {
    if (!consoleId) return;

    const cached = get().metadataCache.get(gameId);
    if (cached?.achievements) return;

    set((s) => {
      const next = new Set(s.loadingGames);
      next.add(`${gameId}:achievements`);
      return { loadingGames: next };
    });

    try {
      // Fetch achievements specifically from RetroAchievements
      // This would need a specific IPC handler
      // For now, this is a placeholder for future implementation
    } catch (err) {
      console.warn("Failed to fetch achievements:", err);
    } finally {
      set((s) => {
        const next = new Set(s.loadingGames);
        next.delete(`${gameId}:achievements`);
        return { loadingGames: next };
      });
    }
  },

  fetchArtwork: async (gameId, steamAppId, theGamesDbId) => {
    const cached = get().metadataCache.get(gameId);
    if (cached?.coverUrl && cached?.bannerUrl) return;

    try {
      // Fetch artwork from SteamGridDB and Fanart.tv
      // This would fetch additional artwork beyond what's already cached
    } catch (err) {
      console.warn("Failed to fetch artwork:", err);
    }
  },

  fetchVideos: async (gameId, title) => {
    const cached = get().metadataCache.get(gameId);
    if (cached?.videos && cached.videos.length > 0) return;

    try {
      // Fetch videos from YouTube
      // This would be called specifically when the user wants to see videos
    } catch (err) {
      console.warn("Failed to fetch videos:", err);
    }
  },

  getMetadata: (gameId) => {
    return get().metadataCache.get(gameId);
  },

  isLoading: (gameId) => {
    return get().loadingGames.has(gameId) || get().loadingGames.has(`${gameId}:achievements`);
  },

  isFullyLoaded: (gameId) => {
    return get().fullyLoadedGames.has(gameId);
  },

  clearCache: () => {
    set({
      metadataCache: new Map(),
      loadingGames: new Set(),
      fullyLoadedGames: new Set(),
    });
  },

  preloadMetadata: async (games) => {
    // Preload metadata for immediate sources only
    const promises = games.map(async (game) => {
      const cached = get().metadataCache.get(game.id);
      if (cached) return;

      await get().fetchImmediateMetadata(game.id, game.title, game.platform, game.steamAppId);
    });

    // Process in batches to avoid overwhelming the APIs
    const batchSize = 5;
    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize);
      await Promise.allSettled(batch);
      // Small delay between batches
      if (i + batchSize < promises.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  },
}));
