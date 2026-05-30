import { create } from 'zustand'
import { Movie, MusicTrack, TVShow } from '../../../shared/types'

interface MoviesState {
  movies: Movie[]
  loading: boolean
  searchQuery: string
  activeGenre: string | null
  activeYear: number | null
  showFavoritesOnly: boolean
  load: () => Promise<void>
  scan: () => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  setTags: (id: string, tags: string[]) => Promise<void>
  setSearch: (q: string) => void
  setGenre: (g: string | null) => void
  setYear: (y: number | null) => void
  toggleFavoritesFilter: () => void
  filtered: () => Movie[]
}

export const useMoviesStore = create<MoviesState>((set, get) => ({
  movies: [],
  loading: false,
  searchQuery: '',
  activeGenre: null,
  activeYear: null,
  showFavoritesOnly: false,

  load: async () => {
    set({ loading: true })
    const movies = await window.htpc.movies.list().catch(() => [])
    set({ movies, loading: false })
  },

  scan: async () => {
    set({ loading: true })
    const movies = await window.htpc.movies.scan().catch(() => [])
    set({ movies, loading: false })
  },

  toggleFavorite: async (id) => {
    const movie = get().movies.find((m) => m.id === id)
    if (!movie) return
    const next = !movie.isFavorite
    await window.htpc.movies.favorite(id, next)
    set((s) => ({ movies: s.movies.map((m) => (m.id === id ? { ...m, isFavorite: next } : m)) }))
  },

  setTags: async (id, tags) => {
    await window.htpc.movies.tag(id, tags)
    set((s) => ({ movies: s.movies.map((m) => (m.id === id ? { ...m, tags } : m)) }))
  },

  setSearch: (searchQuery) => set({ searchQuery }),
  setGenre: (activeGenre) => set({ activeGenre }),
  setYear: (activeYear) => set({ activeYear }),
  toggleFavoritesFilter: () => set((s) => ({ showFavoritesOnly: !s.showFavoritesOnly })),

  filtered: () => {
    const { movies, searchQuery, activeGenre, activeYear, showFavoritesOnly } = get()
    let r = movies
    if (showFavoritesOnly) r = r.filter((m) => m.isFavorite)
    if (activeGenre) r = r.filter((m) => m.genres?.includes(activeGenre))
    if (activeYear) r = r.filter((m) => m.releaseYear === activeYear)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      r = r.filter((m) => m.title.toLowerCase().includes(q) || m.director?.toLowerCase().includes(q))
    }
    return r
  }
}))

interface MusicState {
  tracks: MusicTrack[]
  loading: boolean
  searchQuery: string
  activeArtist: string | null
  activeAlbum: string | null
  activeGenre: string | null
  activeYear: number | null
  load: () => Promise<void>
  scan: () => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  setTags: (id: string, tags: string[]) => Promise<void>
  setSearch: (q: string) => void
  setArtist: (a: string | null) => void
  setAlbum: (a: string | null) => void
  setGenre: (g: string | null) => void
  setYear: (y: number | null) => void
  filtered: () => MusicTrack[]
}

export const useMusicStore = create<MusicState>((set, get) => ({
  tracks: [],
  loading: false,
  searchQuery: '',
  activeArtist: null,
  activeAlbum: null,
  activeGenre: null,
  activeYear: null,

  load: async () => {
    set({ loading: true })
    const tracks = await window.htpc.music.list().catch(() => [])
    set({ tracks, loading: false })
  },

  scan: async () => {
    set({ loading: true })
    const tracks = await window.htpc.music.scan().catch(() => [])
    set({ tracks, loading: false })
  },

  toggleFavorite: async (id) => {
    const track = get().tracks.find((t) => t.id === id)
    if (!track) return
    const next = !track.isFavorite
    await window.htpc.music.favorite(id, next)
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, isFavorite: next } : t)) }))
  },

  setTags: async (id, tags) => {
    await window.htpc.music.tag(id, tags)
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, tags } : t)) }))
  },

  setSearch: (searchQuery) => set({ searchQuery }),
  setArtist: (activeArtist) => set({ activeArtist }),
  setAlbum: (activeAlbum) => set({ activeAlbum }),
  setGenre: (activeGenre) => set({ activeGenre }),
  setYear: (activeYear) => set({ activeYear }),

  filtered: () => {
    const { tracks, searchQuery, activeArtist, activeAlbum, activeGenre, activeYear } = get()
    let r = tracks
    if (activeArtist) r = r.filter((t) => t.artist === activeArtist)
    if (activeAlbum) r = r.filter((t) => t.album === activeAlbum)
    if (activeGenre) r = r.filter((t) => t.genre === activeGenre)
    if (activeYear) r = r.filter((t) => t.year === activeYear)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      r = r.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q)
      )
    }
    return r
  }
}))

interface TvState {
  shows: TVShow[]
  loading: boolean
  searchQuery: string
  load: () => Promise<void>
  scan: () => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  setTags: (id: string, tags: string[]) => Promise<void>
  setSearch: (q: string) => void
  filtered: () => TVShow[]
}

export const useTvStore = create<TvState>((set, get) => ({
  shows: [],
  loading: false,
  searchQuery: '',

  load: async () => {
    set({ loading: true })
    const shows = await window.htpc.tv.list().catch(() => [])
    set({ shows, loading: false })
  },

  scan: async () => {
    set({ loading: true })
    const shows = await window.htpc.tv.scan().catch(() => [])
    set({ shows, loading: false })
  },

  toggleFavorite: async (id) => {
    const show = get().shows.find((s) => s.id === id)
    if (!show) return
    const next = !show.isFavorite
    await window.htpc.tv.favorite(id, next)
    set((s) => ({ shows: s.shows.map((sh) => (sh.id === id ? { ...sh, isFavorite: next } : sh)) }))
  },

  setTags: async (id, tags) => {
    await window.htpc.tv.tag(id, tags)
    set((s) => ({ shows: s.shows.map((sh) => (sh.id === id ? { ...sh, tags } : sh)) }))
  },

  setSearch: (searchQuery) => set({ searchQuery }),

  filtered: () => {
    const { shows, searchQuery } = get()
    if (!searchQuery.trim()) return shows
    const q = searchQuery.toLowerCase()
    return shows.filter((s) => s.title.toLowerCase().includes(q))
  }
}))
