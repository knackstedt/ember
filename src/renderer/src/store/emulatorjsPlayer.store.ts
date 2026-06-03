import { create } from "zustand";
import { GamePlatform } from "../../../shared/types";

export interface EmulatorJSPlayerStore {
  open: boolean;
  romPath: string;
  title: string;
  platform: GamePlatform;
  shader: string;
  gameId: string;
  launch(romPath: string, title: string, platform: GamePlatform, gameId: string, shader?: string): void;
  close(): void;
}

export const useEmulatorjsPlayerStore = create<EmulatorJSPlayerStore>((set, get) => ({
  open: false,
  romPath: "",
  title: "",
  platform: "snes",
  shader: "",
  gameId: "",

  launch(romPath, title, platform, gameId, shader = "") {
    set({ open: true, romPath, title, platform, shader, gameId });
    window.htpc.games.playTime.start(gameId).catch(() => {});
  },

  close() {
    const { gameId } = get();
    if (gameId) {
      window.htpc.games.playTime.stop(gameId).catch(() => {});
    }
    set({ open: false, romPath: "", title: "", platform: "snes", shader: "", gameId: "" });
  },
}));
