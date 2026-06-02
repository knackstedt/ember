import { create } from "zustand";

export interface JsnesPlayerStore {
  open: boolean;
  romPath: string;
  title: string;
  launch(romPath: string, title: string): void;
  close(): void;
}

export const useJsnesPlayerStore = create<JsnesPlayerStore>((set) => ({
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
