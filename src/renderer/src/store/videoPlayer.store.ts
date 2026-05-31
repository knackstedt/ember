import { create } from "zustand";

export interface VideoPlayerStore {
  src: string | null;
  title: string;
  movieId: string | null;
  watchProgress: number | null;
  open(
    src: string,
    title: string,
    movieId?: string,
    watchProgress?: number,
  ): void;
  close(): void;
}

export const useVideoPlayerStore = create<VideoPlayerStore>((set) => ({
  src: null,
  title: "",
  movieId: null,
  watchProgress: null,

  open(src, title, movieId, watchProgress) {
    set({
      src,
      title,
      movieId: movieId ?? null,
      watchProgress: watchProgress ?? null,
    });
  },

  close() {
    set({ src: null, title: "", movieId: null, watchProgress: null });
  },
}));
