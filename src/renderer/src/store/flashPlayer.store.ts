import { create } from "zustand";

export interface FlashPlayerStore {
  open: boolean;
  swfPath: string;
  title: string;
  gameId: string;
  settingsVisible: boolean;
  launch(swfPath: string, title: string, gameId: string): void;
  close(): void;
  toggleSettings(): void;
}

export const useFlashPlayerStore = create<FlashPlayerStore>((set, get) => ({
  open: false,
  swfPath: "",
  title: "",
  gameId: "",
  settingsVisible: false,

  launch(swfPath, title, gameId) {
    set({ open: true, swfPath, title, gameId, settingsVisible: false });
    window.htpc.games.playTime.start(gameId).catch(() => {});
  },

  close() {
    const { gameId } = get();
    if (gameId) {
      window.htpc.games.playTime.stop(gameId).catch(() => {});
    }
    set({ open: false, swfPath: "", title: "", gameId: "" });
  },

  toggleSettings() {
    set((s) => ({ settingsVisible: !s.settingsVisible }));
  },
}));
