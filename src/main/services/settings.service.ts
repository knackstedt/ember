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
  enableAnalytics: false,
  startOnBoot: false,
  hardwareAcceleration: true,
  disabledTabs: [],
  dailyBackground: { enabled: false, source: "bing" },
  background: { type: "theme" },
  defaultEmulatorShader: "",
  emulatorShaders: {},
  commandKeybinds: {},
  commandControllerMap: {},
  streamingExtensions: [],
  streamingExtensionPromptDismissed: [],
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const result = await SettingsRepo.getAll();
    return { ...DEFAULTS, ...result } as AppSettings;
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await SettingsRepo.set(key, value);
}

export async function setSettings(
  partial: Partial<AppSettings>,
): Promise<void> {
  await SettingsRepo.setBatch(partial);
}
