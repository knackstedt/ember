import { getDb } from "../db";
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
  defaultEmulatorShader: "",
  emulatorShaders: {},
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const db = getDb();
    const rows = await db.query<[{ key: string; value: unknown }[]]>(
      "SELECT key, value FROM setting",
    );
    const result: Record<string, unknown> = {};
    for (const row of rows[0] ?? []) {
      result[row.key] = row.value;
    }
    return { ...DEFAULTS, ...result } as AppSettings;
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  const db = getDb();
  await db.query(
    "UPSERT setting SET key = $key, value = $value WHERE key = $key",
    {
      key,
      value,
    },
  );
}

export async function setSettings(
  partial: Partial<AppSettings>,
): Promise<void> {
  for (const [key, value] of Object.entries(partial)) {
    await setSetting(
      key as keyof AppSettings,
      value as AppSettings[keyof AppSettings],
    );
  }
}
