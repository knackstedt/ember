import { create } from "zustand";
import { ThemeRegistration } from "../../../shared/types";

interface ThemesState {
  themes: ThemeRegistration[];
  loading: boolean;
  load: () => Promise<void>;
}

export const useThemesStore = create<ThemesState>((set) => ({
  themes: [],
  loading: true,
  load: async () => {
    try {
      const themes = await window.htpc.themes.list();
      set({ themes, loading: false });
    } catch {
      set({ themes: [], loading: false });
    }
  },
}));
