import { create } from "zustand";
import { Game, GamePlatform, GameEmulatorConfig, WineRunner } from "../../../shared/types";
import {
  type GamingNavItem,
  type GamingLibraryFilter,
  type GamingPlayerCountFilter,
  type GamingMultiplayerTypeFilter,
  type GamingPlayStatusFilter,
  type GamingCompletionFilter,
  NAV_PLATFORM_GROUPS,
} from "../tabs/Gaming/types";

interface GamesState {
  games: Game[];
  loading: boolean;
  scanning: boolean;
  remoteScanning: boolean;
  activeNav: GamingNavItem;
  activeFilter: GamePlatform | "all" | "couch-coop" | "favorites";
  consoleFilter: GamePlatform | "all";
  searchQuery: string;
  libraryFilter: GamingLibraryFilter;
  playerCountFilter: GamingPlayerCountFilter;
  multiplayerTypeFilter: GamingMultiplayerTypeFilter;
  playStatusFilter: GamingPlayStatusFilter;
  completionFilter: GamingCompletionFilter;
  regeneratingIds: Set<string>;
  pendingThumbnailIds: Set<string>;
  coreVersion: number;
  load: () => Promise<void>;
  query: (odataQuery: string) => Promise<{ results: Game[]; count?: number }>;
  scan: () => Promise<void>;
  refreshCores: () => void;
  setActiveNav: (nav: GamingNavItem) => void;
  setFilter: (filter: GamesState["activeFilter"]) => void;
  setConsoleFilter: (filter: GamesState["consoleFilter"]) => void;
  setSearch: (q: string) => void;
  setLibraryFilter: (filter: GamingLibraryFilter) => void;
  setPlayerCountFilter: (filter: GamingPlayerCountFilter) => void;
  setMultiplayerTypeFilter: (filter: GamingMultiplayerTypeFilter) => void;
  setPlayStatusFilter: (filter: GamingPlayStatusFilter) => void;
  setCompletionFilter: (filter: GamingCompletionFilter) => void;
  toggleFavorite: (id: string) => Promise<void>;
  setTags: (id: string, tags: string[]) => Promise<void>;
  hide: (id: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
  uninstall: (game: Game) => Promise<{ success: boolean; error?: string; method?: string }>;
  loadThumbnail: (id: string) => Promise<void>;
  regenerateThumbnail: (id: string) => Promise<void>;
  getEmulatorConfig: (id: string) => Promise<GameEmulatorConfig>;
  setEmulatorConfig: (id: string, config: GameEmulatorConfig) => Promise<void>;
  setWineRunner: (id: string, runner: WineRunner) => Promise<void>;
  setWineCustomCommand: (id: string, command: string | null) => Promise<void>;
  setUmuCustomCommand: (id: string, command: string | null) => Promise<void>;
  setSessionConfig: (id: string, config: {
    launchCommand?: string | null;
    launchArgs?: string[] | null;
    launchWorkingDir?: string | null;
    launchEnv?: Record<string, string> | null;
    sessionHooks?: import("../../../shared/types").SessionHook[] | null;
  }) => Promise<void>;
  updateLastPlayed: (id: string, timestamp?: number) => void;
  filtered: () => Game[];
}

const ACTIVE_FILTER_TO_NAV: Partial<Record<GamesState["activeFilter"], GamingNavItem>> = {
  all: "all",
  favorites: "favorites",
  "couch-coop": "couch-coop",
  steam: "steam",
  gog: "gog",
  heroic: "epic",
  lutris: "lutris",
  itch: "itch",
  windows: "windows",
  desktop: "other",
};

const PLATFORM_TO_NAV: Partial<Record<GamePlatform, GamingNavItem>> = {
  steam: "steam",
  gog: "gog",
  heroic: "epic",
  lutris: "lutris",
  itch: "itch",
  "dolphin-gc": "nintendo",
  "dolphin-wii": "nintendo",
  nes: "nintendo",
  snes: "nintendo",
  gb: "nintendo",
  gba: "nintendo",
  n64: "nintendo",
  nds: "nintendo",
  psx: "playstation",
  genesis: "retro",
  sms: "retro",
  gamegear: "retro",
  dreamcast: "retro",
  pce: "retro",
  dos: "retro",
  flash: "web",
  html5: "web",
  unity: "web",
  windows: "windows",
  desktop: "other",
};

function shallowEqualGame(a: Game, b: Game): boolean {
  const keys = Object.keys(a) as (keyof Game)[];
  for (const key of keys) {
    if (key === "tags" || key === "sessionHooks") {
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

function mergeGames(existing: Game[], incoming: Game[]): Game[] {
  if (existing.length === 0) return incoming;
  const existingMap = new Map(existing.map((g) => [g.id, g]));
  const nextGames: Game[] = [];
  let changed = false;
  for (const incomingGame of incoming) {
    const existingGame = existingMap.get(incomingGame.id);
    if (!existingGame) {
      nextGames.push(incomingGame);
      changed = true;
    } else if (!shallowEqualGame(existingGame, incomingGame)) {
      nextGames.push(incomingGame);
      changed = true;
    } else {
      nextGames.push(existingGame);
    }
  }
  if (!changed && nextGames.length === existing.length) return existing;
  return nextGames;
}

export const useGamesStore = create<GamesState>((set, get) => ({
  games: [],
  loading: false,
  scanning: false,
  remoteScanning: false,
  activeNav: "all",
  activeFilter: "all",
  consoleFilter: "all",
  searchQuery: "",
  libraryFilter: "all",
  playerCountFilter: "all",
  multiplayerTypeFilter: "all",
  playStatusFilter: "all",
  completionFilter: "all",
  regeneratingIds: new Set(),
  pendingThumbnailIds: new Set(),
  coreVersion: 0,

  load: async () => {
    set({ loading: true });
    try {
      const odata =
        "$select=id,title,platform,execPath,romPath,wineRunner,coverUrl,bannerUrl,description,genres,releaseYear,developer,publisher,playerCount,protonRating,steamAppId,rawgSlug,isFavorite,tags,lastPlayed,playTime,rating,hidden,sourceLocation,missing,source,launchCommand,launchArgs,launchWorkingDir,launchEnv,sessionHooks,compressedRomPath,compressionFormat,installPath,mainExe,osPlatform,engine,engineVersion,graphicsApi,entrypoints&$orderby=title asc";
      const result = await window.htpc.db.query<Game>("game", odata);
      set((state) => ({
        games: mergeGames(state.games, result.results),
        loading: false,
      }));
    } catch {
      set({ loading: false });
    }
  },

  query: async (odataQuery: string) => {
    set({ loading: true });
    try {
      const result = await window.htpc.db.query<Game>("game", odataQuery);
      set({ loading: false });
      return result;
    } catch {
      set({ loading: false });
      return { results: [] as Game[], count: undefined };
    }
  },

  scan: async () => {
    if (get().scanning) return;
    set({ scanning: true });
    try {
      await window.htpc.games.scan();
      await get().load();
    } catch {
      /* scan errors already logged in main */
    } finally {
      set({ scanning: false });
    }
  },

  refreshCores: () => set((s) => ({ coreVersion: s.coreVersion + 1 })),

  setActiveNav: (nav) => set({ activeNav: nav, consoleFilter: "all" }),
  setFilter: (filter) => {
    const nav = ACTIVE_FILTER_TO_NAV[filter] ?? "all";
    set({ activeFilter: filter, activeNav: nav, consoleFilter: "all" });
  },
  setConsoleFilter: (filter) => {
    const nav = filter === "all" ? get().activeNav : (PLATFORM_TO_NAV[filter] ?? get().activeNav);
    set({ consoleFilter: filter, activeNav: nav });
  },
  setSearch: (searchQuery) => set({ searchQuery }),
  setLibraryFilter: (filter) => set({ libraryFilter: filter }),
  setPlayerCountFilter: (filter) => set({ playerCountFilter: filter }),
  setMultiplayerTypeFilter: (filter) => set({ multiplayerTypeFilter: filter }),
  setPlayStatusFilter: (filter) => set({ playStatusFilter: filter }),
  setCompletionFilter: (filter) => set({ completionFilter: filter }),

  toggleFavorite: async (id) => {
    const game = get().games.find((g) => g.id === id);
    if (!game) return;
    const next = !game.isFavorite;
    await window.htpc.games.favorite(id, next);
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, isFavorite: next } : g)),
    }));
  },

  setTags: async (id, tags) => {
    await window.htpc.games.tag(id, tags);
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, tags } : g)),
    }));
  },

  hide: async (id) => {
    await window.htpc.games.hide(id, true);
    set((s) => ({
      games: s.games.filter((g) => g.id !== id),
    }));
  },

  delete: async (id) => {
    await window.htpc.games.delete(id);
    set((s) => ({
      games: s.games.filter((g) => g.id !== id),
    }));
  },

  uninstall: async (game) => {
    const result = await window.htpc.games.uninstall(game);
    if (result.success) {
      set((s) => ({
        games: s.games.filter((g) => g.id !== game.id),
      }));
    }
    return result;
  },

  loadThumbnail: async (id) => {
    const game = get().games.find((g) => g.id === id);
    const libretroPlatforms = new Set<GamePlatform>([
      "nes", "snes", "gb", "gba", "n64", "genesis", "sms",
      "gamegear", "pce", "psx", "dreamcast", "nds", "dos",
    ]);
    const isLibretro = libretroPlatforms.has(game?.platform as GamePlatform);
    if (!game || game.coverUrl || (game.platform !== "flash" && !isLibretro)) return;
    if (get().pendingThumbnailIds.has(id)) return;
    set((s) => {
      const next = new Set(s.pendingThumbnailIds);
      next.add(id);
      return { pendingThumbnailIds: next };
    });
    try {
      const url = await window.htpc.games.loadThumbnail(game);
      if (url) {
        const isBroken = url.includes("-broken.svg");
        set((s) => ({
          games: s.games.map((g) =>
            g.id === id ? { ...g, coverUrl: url, corrupt: isBroken } : g,
          ),
        }));
      }
    } finally {
      set((s) => {
        const next = new Set(s.pendingThumbnailIds);
        next.delete(id);
        return { pendingThumbnailIds: next };
      });
    }
  },

  regenerateThumbnail: async (id) => {
    const game = get().games.find((g) => g.id === id);
    if (!game) return;
    set((s) => {
      const next = new Set(s.regeneratingIds);
      next.add(id);
      return { regeneratingIds: next };
    });
    try {
      const url = await window.htpc.games.regenerateThumbnail(game);
      if (url) {
        const busted = `${url}#t=${Date.now()}`;
        const isBroken = url.includes("-broken.svg");
        set((s) => ({
          games: s.games.map((g) =>
            g.id === id ? { ...g, coverUrl: busted, corrupt: isBroken } : g,
          ),
        }));
      }
    } finally {
      set((s) => {
        const next = new Set(s.regeneratingIds);
        next.delete(id);
        return { regeneratingIds: next };
      });
    }
  },

  getEmulatorConfig: async (id) => {
    return window.htpc.games.emulatorConfig.get(id);
  },

  setEmulatorConfig: async (id, config) => {
    await window.htpc.games.emulatorConfig.set(id, config);
  },

  setWineRunner: async (id, runner) => {
    await window.htpc.games.wineConfig.set(id, { wineRunner: runner });
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, wineRunner: runner } : g)),
    }));
  },

  setWineCustomCommand: async (id, command) => {
    await window.htpc.games.wineConfig.set(id, { wineCustomCommand: command });
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, wineCustomCommand: command ?? undefined } : g)),
    }));
  },

  setUmuCustomCommand: async (id, command) => {
    await window.htpc.games.wineConfig.set(id, { umuCustomCommand: command });
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, umuCustomCommand: command ?? undefined } : g)),
    }));
  },

  setSessionConfig: async (id, config) => {
    await window.htpc.games.sessionConfig.set(id, config);
    set((s) => ({
      games: s.games.map((g) =>
        g.id === id
          ? {
              ...g,
              ...(config.launchCommand !== undefined && { launchCommand: config.launchCommand ?? undefined }),
              ...(config.launchArgs !== undefined && { launchArgs: config.launchArgs ?? undefined }),
              ...(config.launchWorkingDir !== undefined && { launchWorkingDir: config.launchWorkingDir ?? undefined }),
              ...(config.launchEnv !== undefined && { launchEnv: config.launchEnv ?? undefined }),
              ...(config.sessionHooks !== undefined && { sessionHooks: config.sessionHooks ?? undefined }),
            }
          : g,
      ),
    }));
  },

  updateLastPlayed: (id, timestamp = Date.now()) => {
    set((s) => ({
      games: s.games.map((g) =>
        g.id === id ? { ...g, lastPlayed: timestamp } : g,
      ),
    }));
  },

  filtered: () => {
    const {
      games,
      activeNav,
      activeFilter,
      consoleFilter,
      searchQuery,
      libraryFilter,
      playerCountFilter,
      multiplayerTypeFilter,
      playStatusFilter,
      completionFilter,
    } = get();
    let result = games.filter((g) => !g.hidden);

    // Nav/platform filtering
    switch (activeNav) {
      case "all":
        break;
      case "favorites":
        result = result.filter((g) => g.isFavorite);
        break;
      case "couch-coop":
        result = result.filter((g) => g.playerCount && g.playerCount.max >= 2);
        break;
      default: {
        const platforms = NAV_PLATFORM_GROUPS[activeNav];
        if (platforms.length > 0) {
          result = result.filter((g) => platforms.includes(g.platform));
        }
        break;
      }
    }

    // Legacy consoleFilter support
    if (consoleFilter !== "all") {
      result = result.filter((g) => g.platform === consoleFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.developer?.toLowerCase().includes(q) ||
          g.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Library filter (installed vs uninstalled) for online platforms
    if (libraryFilter !== "all") {
      result = result.filter((g) => {
        const hasPath = !!(g.execPath || g.romPath);
        const isMissing = g.missing === true;
        if (libraryFilter === "installed") {
          return hasPath && !isMissing;
        }
        return !hasPath || isMissing;
      });
    }

    // Player count filter
    if (playerCountFilter !== "all") {
      result = result.filter((g) => {
        const max = g.playerCount?.max;
        if (max === undefined) return false;
        switch (playerCountFilter) {
          case "1":
            return max === 1;
          case "2":
            return max === 2;
          case "4":
            return max === 4;
          case "4+":
            return max >= 4;
        }
        return true;
      });
    }

    // Multiplayer type filter
    if (multiplayerTypeFilter !== "all") {
      result = result.filter((g) => {
        const max = g.playerCount?.max ?? 1;
        if (multiplayerTypeFilter === "single") {
          return max === 1;
        }
        return max >= 2;
      });
    }

    // Play status filter
    if (playStatusFilter !== "all") {
      result = result.filter((g) => {
        const hasPlayed = !!g.lastPlayed && g.lastPlayed > 0;
        return playStatusFilter === "played" ? hasPlayed : !hasPlayed;
      });
    }

    // Completion filter. The backend does not yet track earned achievements,
    // so "completed" is treated as games with substantial playtime (>2h).
    if (completionFilter !== "all") {
      result = result.filter((g) => {
        const substantial = (g.playTime ?? 0) > 120;
        return completionFilter === "completed" ? substantial : !substantial;
      });
    }

    return result;
  },
}));

// Listen for background scan triggers from main process
if (window.htpc.onScanTrigger) {
  window.htpc.onScanTrigger((payload) => {
    if (payload.types.includes("games")) {
      void useGamesStore.getState().scan();
    }
  });
}

// Refresh store when a background scan completes (catches missing marks)
if (window.htpc.onBackgroundScanComplete) {
  window.htpc.onBackgroundScanComplete((payload) => {
    if (payload.type === "games") {
      void useGamesStore.getState().load();
    }
  });
}
