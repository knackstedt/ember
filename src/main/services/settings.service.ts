import { SettingsRepo, GameRepo, MovieRepo, MusicRepo } from "../db/repository";
import { AppSettings } from "../../shared/types";

const DEFAULTS: AppSettings = {
  theme: "ember",
  fullscreen: false,
  defaultTab: "gaming",
  moviePaths: [],
  musicPaths: [],
  romPaths: [],
  gamePaths: [],
  disabledTabs: [],
  dailyBackground: { enabled: false, source: "bing" },
  background: "theme",
  defaultEmulatorShader: "",
  emulatorShaders: {},
  commandKeybinds: {},
  commandControllerMap: {},
  streamingExtensions: [],
  streamingExtensionPromptDismissed: [],
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

let cachedSettings: AppSettings | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5000;

export async function getSettings(): Promise<AppSettings> {
  if (cachedSettings && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cachedSettings;
  }
  try {
    const result = await SettingsRepo.getAll();
    cachedSettings = { ...DEFAULTS, ...result } as AppSettings;
    cacheTime = Date.now();
    return cachedSettings;
  } catch {
    return { ...DEFAULTS };
  }
}

export function invalidateSettingsCache(): void {
  cachedSettings = null;
  cacheTime = 0;
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await SettingsRepo.set(key, value);
  invalidateSettingsCache();
}

export async function setSettings(
  partial: Partial<AppSettings>,
): Promise<void> {
  await SettingsRepo.setBatch(partial);
  invalidateSettingsCache();
}

export type CorruptItemType = "game" | "movie" | "music";

/**
 * Enforce the user's corrupted-files policy for a newly-detected corrupt item.
 * warn: leave the item flagged but visible.
 * hide: flag the item and set hidden=true.
 * delete: permanently remove the library entry.
 */
export async function applyCorruptPolicy(
  id: string,
  type: CorruptItemType,
): Promise<void> {
  const settings = await getSettings();
  const policy = settings.corruptedFilesPolicy ?? "warn";
  if (policy === "warn") return;

  if (policy === "hide") {
    if (type === "game") await GameRepo.setHidden(id, true);
    else if (type === "movie") await MovieRepo.setHidden(id, true);
    else if (type === "music") await MusicRepo.setHidden(id, true);
    return;
  }

  if (policy === "delete") {
    if (type === "game") await GameRepo.delete(id);
    else if (type === "movie") await MovieRepo.delete(id);
    else if (type === "music") await MusicRepo.delete(id);
  }
}
