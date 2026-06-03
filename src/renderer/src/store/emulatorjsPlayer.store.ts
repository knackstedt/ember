import { create } from "zustand";
import { GamePlatform } from "../../../shared/types";

export interface EmulatorJSPlayerStore {
  open: boolean;
  romPath: string;
  title: string;
  platform: GamePlatform;
  shader: string;
  launch(romPath: string, title: string, platform: GamePlatform, shader?: string): void;
  close(): void;
}

export const useEmulatorjsPlayerStore = create<EmulatorJSPlayerStore>((set) => ({
  open: false,
  romPath: "",
  title: "",
  platform: "snes",
  shader: "",

  launch(romPath, title, platform, shader = "") {
    set({ open: true, romPath, title, platform, shader });
  },

  close() {
    set({ open: false, romPath: "", title: "", platform: "snes", shader: "" });
  },
}));
