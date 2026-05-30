import { create } from 'zustand'
import { AppSettings, ThemeName } from '../../../shared/types'

interface SettingsState {
  settings: AppSettings | null
  loading: boolean
  load: () => Promise<void>
  update: (partial: Partial<AppSettings>) => Promise<void>
  setTheme: (theme: ThemeName) => void
}

const defaults: AppSettings = {
  theme: 'dark-oled',
  fullscreen: false,
  defaultTab: 'gaming',
  moviePaths: [],
  musicPaths: [],
  romPaths: [],
  gamePaths: [],
  enableAnalytics: false,
  startOnBoot: false,
  hardwareAcceleration: true
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: true,

  load: async () => {
    try {
      const s = await window.htpc.settings.get()
      document.documentElement.setAttribute('data-theme', s.theme)
      set({ settings: s, loading: false })
    } catch {
      set({ settings: defaults, loading: false })
    }
  },

  update: async (partial) => {
    const current = get().settings ?? defaults
    const next = { ...current, ...partial }
    await window.htpc.settings.set(partial)
    if (partial.theme) {
      document.documentElement.setAttribute('data-theme', partial.theme)
    }
    set({ settings: next })
  },

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    get().update({ theme })
  }
}))
