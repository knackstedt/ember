import { create } from "zustand";
import { Playlist } from "../../../shared/types";

interface PlaylistsState {
  playlists: Playlist[];
  loading: boolean;
  load: () => Promise<void>;
  create: (name: string, description?: string, trackIds?: string[]) => Promise<Playlist>;
  update: (id: string, partial: Partial<Omit<Playlist, "id" | "createdAt" | "updatedAt">>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  addTracks: (id: string, trackIds: string[]) => Promise<void>;
  removeTracks: (id: string, trackIds: string[]) => Promise<void>;
  reorder: (id: string, trackIds: string[]) => Promise<void>;
}

export const usePlaylistsStore = create<PlaylistsState>((set, get) => ({
  playlists: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const playlists = await window.htpc.playlist.list().catch(() => [] as Playlist[]);
      set({ playlists, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  create: async (name, description, trackIds = []) => {
    const now = Date.now();
    const playlist: Playlist = {
      id: `pl_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      description,
      trackIds,
      createdAt: now,
      updatedAt: now,
    };
    const created = await window.htpc.playlist.create(playlist);
    set((s) => ({ playlists: [...s.playlists, created] }));
    return created;
  },

  update: async (id, partial) => {
    const updated = await window.htpc.playlist.update(id, partial);
    set((s) => ({
      playlists: s.playlists.map((p) => (p.id === id ? updated : p)),
    }));
  },

  delete: async (id) => {
    await window.htpc.playlist.delete(id);
    set((s) => ({
      playlists: s.playlists.filter((p) => p.id !== id),
    }));
  },

  addTracks: async (id, trackIds) => {
    const updated = await window.htpc.playlist.addTracks(id, trackIds);
    if (updated) {
      set((s) => ({
        playlists: s.playlists.map((p) => (p.id === id ? updated : p)),
      }));
    }
  },

  removeTracks: async (id, trackIds) => {
    const updated = await window.htpc.playlist.removeTracks(id, trackIds);
    if (updated) {
      set((s) => ({
        playlists: s.playlists.map((p) => (p.id === id ? updated : p)),
      }));
    }
  },

  reorder: async (id, trackIds) => {
    const updated = await window.htpc.playlist.reorder(id, trackIds);
    if (updated) {
      set((s) => ({
        playlists: s.playlists.map((p) => (p.id === id ? updated : p)),
      }));
    }
  },
}));
