import { create } from "zustand";

export interface PluginPlayerStore {
  open: boolean;
  url: string;
  title: string;
  gameId: string;
  pluginId: string;
  launch(url: string, title: string, gameId: string, pluginId: string): void;
  close(): void;
}

export const usePluginPlayerStore = create<PluginPlayerStore>((set, get) => ({
  open: false,
  url: "",
  title: "",
  gameId: "",
  pluginId: "",

  launch(url, title, gameId, pluginId) {
    set({ open: true, url, title, gameId, pluginId });
    window.htpc.games.playTime.start(gameId).catch(() => {});
  },

  close() {
    const { gameId } = get();
    if (gameId) {
      window.htpc.games.playTime.stop(gameId).catch(() => {});
    }
    set({ open: false, url: "", title: "", gameId: "", pluginId: "" });
  },
}));
