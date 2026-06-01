import { create } from "zustand";
import { Game, GamePlatform } from "../../../shared/types";

interface GamesState {
  games: Game[];
  loading: boolean;
  scanning: boolean;
  activeFilter: GamePlatform | "all" | "couch-coop" | "favorites";
  searchQuery: string;
  regeneratingIds: Set<string>;
  pendingThumbnailIds: Set<string>;
  load: () => Promise<void>;
  scan: () => Promise<void>;
  setFilter: (filter: GamesState["activeFilter"]) => void;
  setSearch: (q: string) => void;
  toggleFavorite: (id: string) => Promise<void>;
  setTags: (id: string, tags: string[]) => Promise<void>;
  hide: (id: string) => Promise<void>;
  loadThumbnail: (id: string) => Promise<void>;
  regenerateThumbnail: (id: string) => Promise<void>;
  filtered: () => Game[];
}

export const useGamesStore = create<GamesState>((set, get) => ({
  games: [],
  loading: false,
  scanning: false,
  activeFilter: "all",
  searchQuery: "",
  regeneratingIds: new Set(),
  pendingThumbnailIds: new Set(),

  load: async () => {
    set({ loading: true });
    try {
      const games = await window.htpc.games.list();
      set({ games, loading: false });
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

  setFilter: (filter) => set({ activeFilter: filter }),
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

  loadThumbnail: async (id) => {
    const game = get().games.find((g) => g.id === id);
    if (!game || game.coverUrl || game.platform !== "flash") return;
    if (get().pendingThumbnailIds.has(id)) return;
    set((s) => {
      const next = new Set(s.pendingThumbnailIds);
      next.add(id);
      return { pendingThumbnailIds: next };
    });
    try {
      const url = await window.htpc.games.loadThumbnail(game);
      if (url) {
        set((s) => ({
          games: s.games.map((g) =>
            g.id === id ? { ...g, coverUrl: url } : g,
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
        set((s) => ({
          games: s.games.map((g) =>
            g.id === id ? { ...g, coverUrl: busted } : g,
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

  filtered: () => {
    const { games, activeFilter, searchQuery } = get();
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
