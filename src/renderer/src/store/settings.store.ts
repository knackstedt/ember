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
  background: "theme",
  defaultEmulatorShader: "",
  emulatorShaders: {},
  commandKeybinds: {},
  commandControllerMap: {},
  streamingExtensions: [],
  streamingExtensionPromptDismissed: [],
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
    filter: "none",
    filterIntensity: 1.0,
    pixelateSize: 4,
    ditherLevels: 4,
  },
  controllerBrowser: {
    snapToElement: true,
    snapDistance: 50,
    snapSelectors: ["button", "a", "input", "textarea", "select", "[role='button']"],
    mouseSpeed: 0.5,
    swapRightStickAxes: false,
    buttonRemapping: {},
  },
  galleryView: "theme-default",
  flashThumbnailConcurrency: 4,
  volume: 1,
  dashboardLayout: {
    widgets: [
      { id: "widget-recent-games", type: "recent-games", title: "Recently Played" },
      { id: "widget-favorites", type: "favorite-games", title: "Favorites" },
      { id: "widget-clock", type: "clock", title: "Clock" },
      { id: "widget-system", type: "system-info", title: "System" },
    ],
    grid: [
      { i: "widget-recent-games", x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
      { i: "widget-favorites", x: 6, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
      { i: "widget-clock", x: 0, y: 4, w: 3, h: 2, minW: 2, minH: 2 },
      { i: "widget-system", x: 3, y: 4, w: 3, h: 2, minW: 2, minH: 2 },
    ],
  },
  disabledScanSources: [],
  corruptedFilesPolicy: "warn",
  updateCheckFrequency: "week",
  updateAutoDownload: true,
  updateAutoInstall: false,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: true,

  load: async () => {
    try {
      const s = await window.htpc.settings.get();
      const merged = { ...defaults, ...s };
      document.documentElement.setAttribute("data-theme", merged.theme);
      set({ settings: merged, loading: false });
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
