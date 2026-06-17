import { SettingsRepo } from "../db/repository";
import { AppSettings } from "../../shared/types";

const DEFAULTS: AppSettings = {
  theme: "dark-oled",
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
