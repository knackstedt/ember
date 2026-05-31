import { create } from "zustand";

export interface FlashPlayerStore {
  open: boolean;
  swfPath: string;
  title: string;
  settingsVisible: boolean;
  launch(swfPath: string, title: string): void;
  close(): void;
  toggleSettings(): void;
}

export const useFlashPlayerStore = create<FlashPlayerStore>((set) => ({
  open: false,
  swfPath: "",
  title: "",
  settingsVisible: false,

  launch(swfPath, title) {
    set({ open: true, swfPath, title, settingsVisible: false });
  },

  close() {
    set({ open: false, swfPath: "", title: "" });
  },

  toggleSettings() {
    set((s) => ({ settingsVisible: !s.settingsVisible }));
  },
}));
