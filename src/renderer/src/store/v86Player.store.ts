import { create } from "zustand";

export interface V86PlayerStore {
  open: boolean;
  romPath: string;
  title: string;
  launch(romPath: string, title: string): void;
  close(): void;
}

export const useV86PlayerStore = create<V86PlayerStore>((set) => ({
  open: false,
  romPath: "",
  title: "",

  launch(romPath, title) {
    set({ open: true, romPath, title });
  },

  close() {
    set({ open: false, romPath: "", title: "" });
  },
}));
