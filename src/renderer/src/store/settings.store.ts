import { create } from "zustand";
import { AppSettings, ThemeName } from "../../../shared/types";

interface SettingsState {
  settings: AppSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<AppSettings>) => Promise<void>;
  setTheme: (theme: ThemeName) => void;
}

const defaults: AppSettings = {
  theme: "dark-oled",
  fullscreen: false,
  defaultTab: "gaming",
  moviePaths: [],
  musicPaths: [],
  romPaths: [],
  gamePaths: [],
  enableAnalytics: false,
  startOnBoot: false,
  hardwareAcceleration: true,
  disabledTabs: [],
  dailyBackground: { enabled: false, source: "bing" },
  defaultEmulatorShader: "",
  emulatorShaders: {},
  flashSettings: {
    aspectRatio: "free",
    canvasSize: "window",
    customWidth: 800,
    customHeight: 600,
    upscaleStyle: "none",
    controllerMap: {
      south: "Space",
      east: "Escape",
      north: "KeyE",
      west: "KeyQ",
      left_bumper: "ShiftLeft",
      right_bumper: "ShiftRight",
      select: "Tab",
      start: "Enter",
      dpad_up: "ArrowUp",
      dpad_down: "ArrowDown",
      dpad_left: "ArrowLeft",
      dpad_right: "ArrowRight",
    },
    stickToMouse: true,
    stickSensitivity: 1.0,
    aiUpscaling: false,
  },
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: true,

  load: async () => {
    try {
      const s = await window.htpc.settings.get();
      document.documentElement.setAttribute("data-theme", s.theme);
      set({ settings: s, loading: false });
    } catch {
      document.documentElement.setAttribute("data-theme", defaults.theme);
      set({ settings: defaults, loading: false });
    }
  },

  update: async (partial) => {
    const current = get().settings ?? defaults;
    const next = { ...current, ...partial };
    await window.htpc.settings.set(partial);
    if (partial.theme) {
      document.documentElement.setAttribute("data-theme", partial.theme);
    }
    set({ settings: next });
  },

  setTheme: (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    get().update({ theme });
  },
}));
