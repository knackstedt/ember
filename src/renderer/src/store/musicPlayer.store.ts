import { create } from "zustand";
import { MusicTrack, AudioTags } from "../../../shared/types";
import { resolveMediaUrl } from "../../../shared/path-utils";
import { useSettingsStore } from "./settings.store";

const STORAGE_KEY = "ember:music-player";

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
  updateTrackMetadata(id: string, tags: AudioTags): void;
  updateTrackFilePath(id: string, filePath: string): void;
  setBladeCollapsed(collapsed: boolean): void;
  toggleBlade(): void;
  loadPersisted(): void;
}

export const audio = new Audio();

function loadAndPlay(track: MusicTrack, autoplay: boolean): void {
  const url = resolveMediaUrl(track.filePath);
  audio.src = url ?? "";
  audio.load();
  if (autoplay) void audio.play();
}

function loadTrack(track: MusicTrack): void {
  const url = resolveMediaUrl(track.filePath);
  audio.src = url ?? "";
  audio.load();
}

interface PersistedQueue {
  queue: MusicTrack[];
  currentIndex: number;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
  bladeCollapsed: boolean;
}

function saveQueueState(state: PersistedQueue): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadQueueState(): PersistedQueue | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedQueue;
      if (Array.isArray(parsed.queue)) return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export const useMusicPlayerStore = create<MusicPlayerStore>((set, get) => {

  audio.ontimeupdate = () => set({ position: audio.currentTime });
  audio.ondurationchange = () =>
    set({ duration: isFinite(audio.duration) ? audio.duration : 0 });
  let errorCount = 0;
  audio.onplay = () => { errorCount = 0; set({ playing: true }); };
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
  audio.onerror = () => {
    errorCount++;
    if (errorCount >= 3) {
      console.error("[musicPlayer] Stopped after 3 consecutive load errors");
      set({ playing: false });
      return;
    }
    get().next();
  };

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
      saveQueueState({
        queue: tracks,
        currentIndex: startIndex,
        shuffle: get().shuffle,
        repeat: get().repeat,
        bladeCollapsed: get().bladeCollapsed,
      });
      if (tracks.length > 0) {
        loadAndPlay(tracks[startIndex], true);
        void window.htpc.music.setLastPlayed(tracks[startIndex].id, Date.now());
      }
    },

    addToQueue(tracks) {
      const { queue } = get();
      if (queue.length === 0) {
        get().play(tracks, 0);
        return;
      }
      const next = [...queue, ...tracks];
      set({ queue: next });
      saveQueueState({
        queue: next,
        currentIndex: get().currentIndex,
        shuffle: get().shuffle,
        repeat: get().repeat,
        bladeCollapsed: get().bladeCollapsed,
      });
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
      saveQueueState({
        queue: newQueue,
        currentIndex: get().currentIndex,
        shuffle: get().shuffle,
        repeat: get().repeat,
        bladeCollapsed: get().bladeCollapsed,
      });
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
      saveQueueState({
        queue: get().queue,
        currentIndex: nextIndex,
        shuffle: get().shuffle,
        repeat: get().repeat,
        bladeCollapsed: get().bladeCollapsed,
      });
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
      saveQueueState({
        queue: get().queue,
        currentIndex: prevIndex,
        shuffle: get().shuffle,
        repeat: get().repeat,
        bladeCollapsed: get().bladeCollapsed,
      });
      loadAndPlay(queue[prevIndex], true);
    },

    setVolume(v) {
      audio.volume = v;
      set({ volume: v });
      void useSettingsStore.getState().update({ volume: v });
    },

    toggleShuffle() {
      set((s) => ({ shuffle: !s.shuffle }));
      const state = get();
      saveQueueState({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
        bladeCollapsed: state.bladeCollapsed,
      });
    },

    toggleRepeat() {
      set((s) => ({
        repeat:
          s.repeat === "none" ? "all" : s.repeat === "all" ? "one" : "none",
      }));
      const state = get();
      saveQueueState({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
        bladeCollapsed: state.bladeCollapsed,
      });
    },

    updateTrackCover(id, url) {
      set((s) => ({
        queue: s.queue.map((t) =>
          t.id === id ? { ...t, albumArtUrl: url } : t,
        ),
      }));
      const state = get();
      saveQueueState({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
        bladeCollapsed: state.bladeCollapsed,
      });
    },

    updateTrackMetadata(id, tags) {
      set((s) => ({
        queue: s.queue.map((t) =>
          t.id === id
            ? {
                ...t,
                title: tags.title ?? t.title,
                artist: tags.artist ?? t.artist,
                album: tags.album ?? t.album,
                albumArtist: tags.albumArtist ?? t.albumArtist,
                genre: tags.genre ?? t.genre,
                year: tags.year ?? t.year,
                trackNumber: tags.trackNumber ?? t.trackNumber,
                discNumber: tags.discNumber ?? t.discNumber,
              }
            : t,
        ),
      }));
      const state = get();
      saveQueueState({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
        bladeCollapsed: state.bladeCollapsed,
      });
    },

    updateTrackFilePath(id, filePath) {
      set((s) => ({
        queue: s.queue.map((t) => (t.id === id ? { ...t, filePath } : t)),
      }));
      const state = get();
      saveQueueState({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
        bladeCollapsed: state.bladeCollapsed,
      });
    },

    setBladeCollapsed(collapsed) {
      set({ bladeCollapsed: collapsed });
      const state = get();
      saveQueueState({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
        bladeCollapsed: state.bladeCollapsed,
      });
    },

    toggleBlade() {
      set((s) => ({ bladeCollapsed: !s.bladeCollapsed }));
      const state = get();
      saveQueueState({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
        bladeCollapsed: state.bladeCollapsed,
      });
    },

    loadPersisted() {
      const savedVolume = useSettingsStore.getState().settings?.volume ?? 1;
      audio.volume = savedVolume;

      const saved = loadQueueState();
      if (saved) {
        set({
          queue: saved.queue,
          currentIndex: saved.currentIndex,
          shuffle: saved.shuffle,
          repeat: saved.repeat,
          bladeCollapsed: saved.bladeCollapsed,
          volume: savedVolume,
        });
        if (saved.queue.length > 0 && saved.currentIndex >= 0 && saved.currentIndex < saved.queue.length) {
          loadTrack(saved.queue[saved.currentIndex]);
        }
      } else {
        set({ volume: savedVolume });
      }
    },
  };
});
