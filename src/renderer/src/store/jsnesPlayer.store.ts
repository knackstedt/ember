import { create } from "zustand";

export interface JsnesPlayerStore {
  open: boolean;
  romPath: string;
  title: string;
  gameId: string;
  launch(romPath: string, title: string, gameId: string): void;
  close(): void;
}

export const useJsnesPlayerStore = create<JsnesPlayerStore>((set, get) => ({
  open: false,
  romPath: "",
  title: "",
  gameId: "",

  launch(romPath, title, gameId) {
    set({ open: true, romPath, title, gameId });
    window.htpc.games.playTime.start(gameId).catch(() => {});
  },

  close() {
    const { gameId } = get();
    if (gameId) {
      window.htpc.games.playTime.stop(gameId).catch(() => {});
    }
    set({ open: false, romPath: "", title: "", gameId: "" });
  },
}));
