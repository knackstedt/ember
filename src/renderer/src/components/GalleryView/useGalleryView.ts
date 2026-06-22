import { GalleryView, ThemeName } from "../../../../shared/types";
import { useSettingsStore } from "../../store/settings.store";

const THEME_DEFAULTS: Record<ThemeName, GalleryView> = {
  ember: "grid",
  "dark-oled": "grid",
  glassmorphism: "grid",
  "neon-cyberpunk": "grid",
  "terminal-tui": "grid",
  "synthwave-sunset": "grid",
  "deep-ocean": "grid",
  monokai: "grid",
  "warm-paper": "grid",
};

export function useGalleryView(): GalleryView {
  const settings = useSettingsStore((s) => s.settings);
  const view = settings?.galleryView ?? "theme-default";
  const theme = settings?.theme ?? "dark-oled";

  if (view === "theme-default") {
    return THEME_DEFAULTS[theme] ?? "grid";
  }
  return view;
}

export function useIsNeonGrid(): boolean {
  const settings = useSettingsStore((s) => s.settings);
  const view = settings?.galleryView ?? "theme-default";
  const theme = settings?.theme ?? "dark-oled";

  // Neon grid is the default for cyberpunk theme when set to theme-default,
  // or when explicitly using grid view on cyberpunk (we style it neon).
  return theme === "neon-cyberpunk" && (view === "theme-default" || view === "grid");
}

export function getThemeDefaultGalleryView(theme: ThemeName): GalleryView {
  return THEME_DEFAULTS[theme] ?? "grid";
}
