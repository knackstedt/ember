import { create } from 'zustand'

export interface VideoPlayerStore {
  src: string | null
  title: string
  open(src: string, title: string): void
  close(): void
}

export const useVideoPlayerStore = create<VideoPlayerStore>((set) => ({
  src: null,
  title: '',

  open(src, title) {
    set({ src, title })
  },

  close() {
    set({ src: null, title: '' })
  }
}))
