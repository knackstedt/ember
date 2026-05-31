import { create } from "zustand";

interface CoverCacheState {
  urls: Record<string, string>;
  setUrl: (id: string, url: string) => void;
}

export const useCoverCacheStore = create<CoverCacheState>((set) => ({
  urls: {},
  setUrl: (id, url) => set((s) => ({ urls: { ...s.urls, [id]: url } })),
}));
