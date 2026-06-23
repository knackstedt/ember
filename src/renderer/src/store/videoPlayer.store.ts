import { create } from "zustand";

export interface VideoPlayerStore {
  src: string | null;
  title: string;
  movieId: string | null;
  watchProgress: number | null;
  subtitleTrackId: number | null;
  audioTrackId: number | null;
  playbackSpeed: number | null;
  open(
    src: string,
    title: string,
    movieId?: string,
    watchProgress?: number,
    subtitleTrackId?: number | null,
    audioTrackId?: number | null,
    playbackSpeed?: number | null,
  ): void;
  close(): void;
}

export const useVideoPlayerStore = create<VideoPlayerStore>((set) => ({
  src: null,
  title: "",
  movieId: null,
  watchProgress: null,
  subtitleTrackId: null,
  audioTrackId: null,
  playbackSpeed: null,

  open(src, title, movieId, watchProgress, subtitleTrackId, audioTrackId, playbackSpeed) {
    set({
      src,
      title,
      movieId: movieId ?? null,
      watchProgress: watchProgress ?? null,
      subtitleTrackId: subtitleTrackId ?? null,
      audioTrackId: audioTrackId ?? null,
      playbackSpeed: playbackSpeed ?? null,
    });
  },

  close() {
    set({ src: null, title: "", movieId: null, watchProgress: null, subtitleTrackId: null, audioTrackId: null, playbackSpeed: null });
  },
}));
