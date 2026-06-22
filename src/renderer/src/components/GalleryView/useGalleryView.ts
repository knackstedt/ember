import { GalleryView } from "../../../../shared/types";
import { useSettingsStore } from "../../store/settings.store";

export function useGalleryView(): GalleryView {
  const settings = useSettingsStore((s) => s.settings);
  const view = settings?.galleryView ?? "theme-default";
  return view === "theme-default" ? "grid" : view;
}

export function useIsNeonGrid(): boolean {
  const settings = useSettingsStore((s) => s.settings);
  const view = settings?.galleryView ?? "theme-default";
  const theme = settings?.theme ?? "ember";

  return theme === "neon-cyberpunk" && (view === "theme-default" || view === "grid");
}

export function getThemeDefaultGalleryView(): GalleryView {
  return "grid";
}
