import { create } from "zustand";
import { Game, GamePlatform, GameEmulatorConfig, WineRunner } from "../../../shared/types";

interface GamesState {
  games: Game[];
  loading: boolean;
  scanning: boolean;
  remoteScanning: boolean;
  activeFilter: GamePlatform | "all" | "couch-coop" | "favorites";
  consoleFilter: GamePlatform | "all";
  searchQuery: string;
  regeneratingIds: Set<string>;
  pendingThumbnailIds: Set<string>;
  coreVersion: number;
  load: () => Promise<void>;
  scan: () => Promise<void>;
  refreshCores: () => void;
  setFilter: (filter: GamesState["activeFilter"]) => void;
  setConsoleFilter: (filter: GamesState["consoleFilter"]) => void;
  setSearch: (q: string) => void;
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
  activeFilter: "all",
  consoleFilter: "all",
  searchQuery: "",
  regeneratingIds: new Set(),
  pendingThumbnailIds: new Set(),
  coreVersion: 0,

  load: async () => {
    set({ loading: true });
    try {
      const games = await window.htpc.games.list();
      set((state) => ({
        games: mergeGames(state.games, games),
        loading: false,
      }));
    } catch {
      set({ loading: false });
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

  setFilter: (filter) => set({ activeFilter: filter }),
  setConsoleFilter: (filter) => set({ consoleFilter: filter }),
  setSearch: (searchQuery) => set({ searchQuery }),

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
    const { games, activeFilter, consoleFilter, searchQuery } = get();
    let result = games.filter((g) => !g.hidden);

    switch (activeFilter) {
      case "all":
        break;
      case "favorites":
        result = result.filter((g) => g.isFavorite);
        break;
      case "couch-coop":
        result = result.filter((g) => g.playerCount && g.playerCount.max >= 2);
        break;
      default:
        result = result.filter((g) => g.platform === activeFilter);
    }

    if (consoleFilter !== "all") {
      result = result.filter((g) => g.platform === consoleFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.developer?.toLowerCase().includes(q) ||
          g.tags?.some((t) => t.toLowerCase().includes(q)),
      );
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
