import { create } from "zustand";
import { GamePlatform } from "../../../shared/types";

export interface EmulatorJSPlayerStore {
  open: boolean;
  romPath: string;
  title: string;
  platform: GamePlatform;
  launch(romPath: string, title: string, platform: GamePlatform): void;
  close(): void;
}

export const useEmulatorjsPlayerStore = create<EmulatorJSPlayerStore>((set) => ({
  open: false,
  romPath: "",
  title: "",
  platform: "snes",

  launch(romPath, title, platform) {
    set({ open: true, romPath, title, platform });
  },

  close() {
    set({ open: false, romPath: "", title: "", platform: "snes" });
  },
}));
