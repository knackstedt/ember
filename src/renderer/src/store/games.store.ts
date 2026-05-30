import { create } from 'zustand'
import { Game, GamePlatform } from '../../../shared/types'

interface GamesState {
  games: Game[]
  loading: boolean
  scanning: boolean
  activeFilter: GamePlatform | 'all' | 'couch-coop' | 'favorites'
  searchQuery: string
  load: () => Promise<void>
  scan: () => Promise<void>
  setFilter: (filter: GamesState['activeFilter']) => void
  setSearch: (q: string) => void
  toggleFavorite: (id: string) => Promise<void>
  setTags: (id: string, tags: string[]) => Promise<void>
  filtered: () => Game[]
}

export const useGamesStore = create<GamesState>((set, get) => ({
  games: [],
  loading: false,
  scanning: false,
  activeFilter: 'all',
  searchQuery: '',

  load: async () => {
    set({ loading: true })
    try {
      const games = await window.htpc.games.list()
      set({ games, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  scan: async () => {
    set({ scanning: true })
    try {
      const games = await window.htpc.games.scan()
      set({ games, scanning: false })
    } catch {
      set({ scanning: false })
    }
  },

  setFilter: (filter) => set({ activeFilter: filter }),
  setSearch: (searchQuery) => set({ searchQuery }),

  toggleFavorite: async (id) => {
    const game = get().games.find((g) => g.id === id)
    if (!game) return
    const next = !game.isFavorite
    await window.htpc.games.favorite(id, next)
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, isFavorite: next } : g))
    }))
  },

  setTags: async (id, tags) => {
    await window.htpc.games.tag(id, tags)
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, tags } : g))
    }))
  },

  filtered: () => {
    const { games, activeFilter, searchQuery } = get()
    let result = games

    switch (activeFilter) {
      case 'all': break
      case 'favorites': result = result.filter((g) => g.isFavorite); break
      case 'couch-coop':
        result = result.filter((g) => g.playerCount && g.playerCount.max >= 2)
        break
      default:
        result = result.filter((g) => g.platform === activeFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.developer?.toLowerCase().includes(q) ||
          g.tags?.some((t) => t.toLowerCase().includes(q))
      )
    }

    return result
  }
}))
