import { create } from "zustand";
import { Movie, MusicTrack, TVShow } from "../../../shared/types";
import { useMusicPlayerStore } from "./musicPlayer.store";
import { useCoverCacheStore } from "./coverCache.store";

interface MoviesState {
  movies: Movie[];
  loading: boolean;
  scanning: boolean;
  searchQuery: string;
  activeGenre: string | null;
  activeYear: number | null;
  showFavoritesOnly: boolean;
  regeneratingIds: Set<string>;
  load: () => Promise<void>;
  scan: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  setTags: (id: string, tags: string[]) => Promise<void>;
  setSearch: (q: string) => void;
  setGenre: (g: string | null) => void;
  setYear: (y: number | null) => void;
  toggleFavoritesFilter: () => void;
  updateProgress: (id: string, progress: number | null) => void;
  hide: (id: string) => Promise<void>;
  regenerateThumbnail: (id: string) => Promise<void>;
  filtered: () => Movie[];
}

export const useMoviesStore = create<MoviesState>((set, get) => ({
  movies: [],
  loading: false,
  scanning: false,
  searchQuery: "",
  activeGenre: null,
  activeYear: null,
  showFavoritesOnly: false,
  regeneratingIds: new Set(),

  load: async () => {
    set({ loading: true });
    const movies = await window.htpc.movies.list().catch(() => []);
    set({ movies, loading: false });
  },

  scan: async () => {
    if (get().scanning) return;
    set({ scanning: true });
    try {
      await window.htpc.movies.scan().catch(() => []);
      await get().load();
    } catch {
      /* scan errors already logged in main */
    } finally {
      set({ scanning: false });
    }
  },

  toggleFavorite: async (id) => {
    const movie = get().movies.find((m) => m.id === id);
    if (!movie) return;
    const next = !movie.isFavorite;
    await window.htpc.movies.favorite(id, next);
    set((s) => ({
      movies: s.movies.map((m) =>
        m.id === id ? { ...m, isFavorite: next } : m,
      ),
    }));
  },

  setTags: async (id, tags) => {
    await window.htpc.movies.tag(id, tags);
    set((s) => ({
      movies: s.movies.map((m) => (m.id === id ? { ...m, tags } : m)),
    }));
  },

  setSearch: (searchQuery) => set({ searchQuery }),
  setGenre: (activeGenre) => set({ activeGenre }),
  setYear: (activeYear) => set({ activeYear }),
  toggleFavoritesFilter: () =>
    set((s) => ({ showFavoritesOnly: !s.showFavoritesOnly })),

  hide: async (id) => {
    await window.htpc.movies.hide(id, true);
    set((s) => ({
      movies: s.movies.filter((m) => m.id !== id),
    }));
  },

  regenerateThumbnail: async (id) => {
    const movie = get().movies.find((m) => m.id === id);
    if (!movie) return;
    set((s) => {
      const next = new Set(s.regeneratingIds);
      next.add(id);
      return { regeneratingIds: next };
    });
    try {
      const coverUrl = await window.htpc.movies.regenerateThumbnail(movie);
      if (coverUrl) {
        const busted = `${coverUrl}#t=${Date.now()}`;
        set((s) => ({
          movies: s.movies.map((m) =>
            m.id === id ? { ...m, coverUrl: busted } : m,
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

  updateProgress: (id, progress) => {
    set((s) => ({
      movies: s.movies.map((m) =>
        m.id === id
          ? {
              ...m,
              watchProgress: progress ?? undefined,
              lastPlayed: Date.now(),
            }
          : m,
      ),
    }));
  },

  filtered: () => {
    const { movies, searchQuery, activeGenre, activeYear, showFavoritesOnly } =
      get();
    let r = movies.filter((m) => !m.hidden);
    if (showFavoritesOnly) r = r.filter((m) => m.isFavorite);
    if (activeGenre) r = r.filter((m) => m.genres?.includes(activeGenre));
    if (activeYear) r = r.filter((m) => m.releaseYear === activeYear);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.director?.toLowerCase().includes(q),
      );
    }
    return r;
  },
}));

interface MusicState {
  tracks: MusicTrack[];
  loading: boolean;
  scanning: boolean;
  searchQuery: string;
  activeArtist: string | null;
  activeAlbum: string | null;
  activeGenre: string | null;
  activeYear: number | null;
  artistThumbnails: Record<string, string>;
  artistThumbnailsLoading: Record<string, boolean>;
  artistThumbnailsFailed: Record<string, number>;
  load: () => Promise<void>;
  scan: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  setTags: (id: string, tags: string[]) => Promise<void>;
  setSearch: (q: string) => void;
  setArtist: (a: string | null) => void;
  setAlbum: (a: string | null) => void;
  setGenre: (g: string | null) => void;
  setYear: (y: number | null) => void;
  searchCoverArt: (id: string) => Promise<void>;
  pickCoverImage: (id: string) => Promise<void>;
  loadThumbnail: (id: string) => Promise<void>;
  loadArtistThumbnail: (artist: string) => Promise<void>;
  hide: (id: string) => Promise<void>;
  filtered: () => MusicTrack[];
}

export const useMusicStore = create<MusicState>((set, get) => ({
  tracks: [],
  loading: false,
  scanning: false,
  searchQuery: "",
  activeArtist: null,
  activeAlbum: null,
  activeGenre: null,
  activeYear: null,
  artistThumbnails: {},
  artistThumbnailsLoading: {},
  artistThumbnailsFailed: {},

  load: async () => {
    set({ loading: true });
    const tracks = await window.htpc.music.list().catch(() => []);
    set({ tracks, loading: false });
  },

  scan: async () => {
    if (get().scanning) return;
    set({ scanning: true });
    try {
      await window.htpc.music.scan().catch(() => []);
      await get().load();
    } catch {
      /* scan errors already logged in main */
    } finally {
      set({ scanning: false });
    }
  },

  toggleFavorite: async (id) => {
    const track = get().tracks.find((t) => t.id === id);
    if (!track) return;
    const next = !track.isFavorite;
    await window.htpc.music.favorite(id, next);
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === id ? { ...t, isFavorite: next } : t,
      ),
    }));
  },

  setTags: async (id, tags) => {
    await window.htpc.music.tag(id, tags);
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, tags } : t)),
    }));
  },

  setSearch: (searchQuery) => set({ searchQuery }),
  setArtist: (activeArtist) => set({ activeArtist }),
  setAlbum: (activeAlbum) => set({ activeAlbum }),
  setGenre: (activeGenre) => set({ activeGenre }),
  setYear: (activeYear) => set({ activeYear }),

  searchCoverArt: async (id) => {
    const track = get().tracks.find((t) => t.id === id);
    if (!track) return;
    const url = await window.htpc.music.searchCoverArt(track);
    if (!url) return;
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === id ? { ...t, albumArtUrl: url } : t,
      ),
    }));
    useMusicPlayerStore.getState().updateTrackCover(id, url);
  },

  pickCoverImage: async (id) => {
    const track = get().tracks.find((t) => t.id === id);
    if (!track) return;
    const url = await window.htpc.music.pickCoverImage(track);
    if (!url) return;
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === id ? { ...t, albumArtUrl: url } : t,
      ),
    }));
    useMusicPlayerStore.getState().updateTrackCover(id, url);
  },

  loadThumbnail: async (id) => {
    const track = get().tracks.find((t) => t.id === id);
    if (!track || track.albumArtUrl) return;
    const url = await window.htpc.music.loadThumbnail(track);
    if (!url) return;
    useCoverCacheStore.getState().setUrl(id, url);
    useMusicPlayerStore.getState().updateTrackCover(id, url);
  },

  loadArtistThumbnail: async (artist) => {
    if (!artist || get().artistThumbnails[artist] || get().artistThumbnailsLoading[artist] || get().artistThumbnailsFailed[artist]) return;
    set((s) => ({
      artistThumbnailsLoading: { ...s.artistThumbnailsLoading, [artist]: true },
    }));
    const url = await window.htpc.music.artistThumbnail(artist);
    set((s) => ({
      artistThumbnailsLoading: { ...s.artistThumbnailsLoading, [artist]: false },
      ...(url
        ? { artistThumbnails: { ...s.artistThumbnails, [artist]: url } }
        : { artistThumbnailsFailed: { ...s.artistThumbnailsFailed, [artist]: Date.now() } }),
    }));
  },

  hide: async (id) => {
    await window.htpc.music.hide(id, true);
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== id),
    }));
  },

  filtered: () => {
    const {
      tracks,
      searchQuery,
      activeArtist,
      activeAlbum,
      activeGenre,
      activeYear,
    } = get();
    let r = tracks.filter((t) => !t.hidden);
    if (activeArtist)
      r = r.filter(
        (t) => t.artist?.toLowerCase() === activeArtist.toLowerCase(),
      );
    if (activeAlbum) r = r.filter((t) => t.album === activeAlbum);
    if (activeGenre) r = r.filter((t) => t.genre === activeGenre);
    if (activeYear) r = r.filter((t) => t.year === activeYear);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q),
      );
    }
    return r;
  },
}));

interface TvState {
  shows: TVShow[];
  loading: boolean;
  scanning: boolean;
  searchQuery: string;
  regeneratingIds: Set<string>;
  load: () => Promise<void>;
  scan: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  setTags: (id: string, tags: string[]) => Promise<void>;
  setSearch: (q: string) => void;
  hide: (id: string) => Promise<void>;
  regenerateThumbnail: (id: string) => Promise<void>;
  filtered: () => TVShow[];
}

export const useTvStore = create<TvState>((set, get) => ({
  shows: [],
  loading: false,
  scanning: false,
  searchQuery: "",
  regeneratingIds: new Set(),

  load: async () => {
    set({ loading: true });
    const shows = await window.htpc.tv.list().catch(() => []);
    set({ shows, loading: false });
  },

  scan: async () => {
    if (get().scanning) return;
    set({ scanning: true });
    try {
      await window.htpc.tv.scan().catch(() => []);
      await get().load();
    } catch {
      /* scan errors already logged in main */
    } finally {
      set({ scanning: false });
    }
  },

  toggleFavorite: async (id) => {
    const show = get().shows.find((s) => s.id === id);
    if (!show) return;
    const next = !show.isFavorite;
    await window.htpc.tv.favorite(id, next);
    set((s) => ({
      shows: s.shows.map((sh) =>
        sh.id === id ? { ...sh, isFavorite: next } : sh,
      ),
    }));
  },

  setTags: async (id, tags) => {
    await window.htpc.tv.tag(id, tags);
    set((s) => ({
      shows: s.shows.map((sh) => (sh.id === id ? { ...sh, tags } : sh)),
    }));
  },

  hide: async (id) => {
    await window.htpc.tv.hide(id, true);
    set((s) => ({
      shows: s.shows.filter((sh) => sh.id !== id),
    }));
  },

  regenerateThumbnail: async (id) => {
    const show = get().shows.find((s) => s.id === id);
    if (!show) return;
    set((s) => {
      const next = new Set(s.regeneratingIds);
      next.add(id);
      return { regeneratingIds: next };
    });
    try {
      const coverUrl = await window.htpc.tv.regenerateThumbnail(show);
      if (coverUrl) {
        const busted = `${coverUrl}#t=${Date.now()}`;
        set((s) => ({
          shows: s.shows.map((sh) =>
            sh.id === id ? { ...sh, coverUrl: busted } : sh,
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

  setSearch: (searchQuery) => set({ searchQuery }),

  filtered: () => {
    const { shows, searchQuery } = get();
    let r = shows.filter((s) => !s.hidden);
    if (!searchQuery.trim()) return r;
    const q = searchQuery.toLowerCase();
    return r.filter((s) => s.title.toLowerCase().includes(q));
  },
}));
