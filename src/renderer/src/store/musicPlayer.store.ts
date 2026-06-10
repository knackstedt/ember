import { create } from "zustand";
import { MusicTrack } from "../../../shared/types";
import { resolveMediaUrl } from "../../../shared/path-utils";

export interface MusicPlayerStore {
  queue: MusicTrack[];
  currentIndex: number;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
  bladeCollapsed: boolean;
  play(tracks: MusicTrack[], startIndex?: number): void;
  addToQueue(tracks: MusicTrack[]): void;
  queueNext(tracks: MusicTrack[]): void;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
  next(): void;
  prev(): void;
  setVolume(v: number): void;
  toggleShuffle(): void;
  toggleRepeat(): void;
  updateTrackCover(id: string, url: string): void;
  setBladeCollapsed(collapsed: boolean): void;
  toggleBlade(): void;
}

const audio = new Audio();

function loadAndPlay(track: MusicTrack, autoplay: boolean): void {
  const url = resolveMediaUrl(track.filePath);
  audio.src = url ? encodeURIComponent(url) : "";
  audio.load();
  if (autoplay) void audio.play();
}

export const useMusicPlayerStore = create<MusicPlayerStore>((set, get) => {
  audio.ontimeupdate = () => set({ position: audio.currentTime });
  audio.ondurationchange = () =>
    set({ duration: isFinite(audio.duration) ? audio.duration : 0 });
  audio.onplay = () => set({ playing: true });
  audio.onpause = () => set({ playing: false });
  audio.onended = () => {
    const { repeat } = get();
    if (repeat === "one") {
      audio.currentTime = 0;
      void audio.play();
    } else {
      get().next();
    }
  };
  audio.onerror = () => get().next();

  return {
    queue: [],
    currentIndex: 0,
    playing: false,
    position: 0,
    duration: 0,
    volume: 1,
    shuffle: false,
    repeat: "none",
    bladeCollapsed: false,

    play(tracks, startIndex = 0) {
      set({
        queue: tracks,
        currentIndex: startIndex,
        position: 0,
        duration: 0,
      });
      if (tracks.length > 0) loadAndPlay(tracks[startIndex], true);
    },

    addToQueue(tracks) {
      const { queue } = get();
      if (queue.length === 0) {
        get().play(tracks, 0);
        return;
      }
      set({ queue: [...queue, ...tracks] });
    },

    queueNext(tracks) {
      const { queue, currentIndex } = get();
      if (queue.length === 0) {
        get().play(tracks, 0);
        return;
      }
      const insertAt = currentIndex + 1;
      const newQueue = [
        ...queue.slice(0, insertAt),
        ...tracks,
        ...queue.slice(insertAt),
      ];
      set({ queue: newQueue });
    },

    pause() {
      audio.pause();
    },

    resume() {
      void audio.play();
    },

    seek(seconds) {
      audio.currentTime = seconds;
      set({ position: seconds });
    },

    next() {
      const { queue, currentIndex, shuffle, repeat } = get();
      if (!queue.length) return;
      let nextIndex: number;
      if (shuffle) {
        nextIndex = Math.floor(Math.random() * queue.length);
      } else {
        nextIndex = currentIndex + 1;
        if (nextIndex >= queue.length) {
          if (repeat === "all") {
            nextIndex = 0;
          } else {
            audio.pause();
            set({ playing: false, position: 0 });
            return;
          }
        }
      }
      set({ currentIndex: nextIndex, position: 0, duration: 0 });
      loadAndPlay(queue[nextIndex], true);
    },

    prev() {
      const { queue, currentIndex } = get();
      if (!queue.length) return;
      if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
      }
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
      set({ currentIndex: prevIndex, position: 0, duration: 0 });
      loadAndPlay(queue[prevIndex], true);
    },

    setVolume(v) {
      audio.volume = v;
      set({ volume: v });
    },

    toggleShuffle() {
      set((s) => ({ shuffle: !s.shuffle }));
    },

    toggleRepeat() {
      set((s) => ({
        repeat:
          s.repeat === "none" ? "all" : s.repeat === "all" ? "one" : "none",
      }));
    },

    updateTrackCover(id, url) {
      set((s) => ({
        queue: s.queue.map((t) =>
          t.id === id ? { ...t, albumArtUrl: url } : t,
        ),
      }));
    },

    setBladeCollapsed(collapsed) {
      set({ bladeCollapsed: collapsed });
    },

    toggleBlade() {
      set((s) => ({ bladeCollapsed: !s.bladeCollapsed }));
    },
  };
});
