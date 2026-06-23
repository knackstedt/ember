import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Gamepad2, Film, Music, Tv } from "lucide-react";
import { useSettingsStore } from "../../store/settings.store";
import { useThemesStore } from "../../store/themes.store";
import {
  TabId,
  BackgroundType,
  ImageFitMode,
  MatrixPreset,
  DailyBackgroundSource,
  GalleryView,
} from "../../../../shared/types";
import { Toggle, Field } from "./shared";

const BG_TYPE_LABELS: Record<BackgroundType, string> = {
  theme: "Theme Default",
  "matrix-preset": "Matrix Animation",
  daily: "Daily Wallpaper",
  image: "Custom Image",
  solid: "Solid Color",
  gradient: "Gradient",
};

const MATRIX_PRESET_LABELS: Record<MatrixPreset, string> = {
  cyberpunk: "Cyberpunk Pink",
  "ocean-blue": "Ocean Blue",
  "fire-red": "Fire Red",
  monochrome: "Monochrome",
  "purple-haze": "Purple Haze",
  "neon-pink": "Neon Pink",
  matrix: "The Matrix",
  "digital-rain": "Digital Rain",
};

const IMAGE_FIT_LABELS: Record<ImageFitMode, string> = {
  cover: "Cover",
  contain: "Contain",
  stretch: "Stretch",
  center: "Center",
  repeat: "Tile",
};

const GALLERY_VIEW_LABELS: Record<GalleryView, string> = {
  "theme-default": "Theme Default",
  grid: "Grid",
  list: "List",
  "hex-grid": "Hex Grid",
  bookshelf: "Bookshelf",
  "spread-deck": "Spread Deck",
};

export const AppearanceTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const { themes, load } = useThemesStore();

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings) return null;

  const bg = settings.background ?? { type: "theme" as BackgroundType };

  const setBg = (partial: Partial<typeof bg>) => {
    update({
      background: { ...bg, ...partial },
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" data-nav-orientation="grid" data-nav-columns="5">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Appearance
        </h2>
        <div>
          <label
            className="text-sm font-medium mb-3 block"
            style={{ color: "var(--text-primary)" }}
          >
            Theme
          </label>
          <div className="grid grid-cols-5 gap-3">
            {themes.map((t) => (
              <motion.button
                key={t.id}
                className="flex flex-col items-center gap-2 p-2 rounded-[var(--radius-card)]"
                style={{
                  border: `2px solid ${settings.theme === t.id ? "var(--accent)" : "var(--border-default)"}`,
                  background: "var(--surface-1)",
                  boxShadow:
                    settings.theme === t.id ? "var(--shadow-glow)" : "none",
                }}
                onClick={() => update({ theme: t.id })}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
              >
                {t.thumbnailUrl ? (
                  <img
                    src={t.thumbnailUrl}
                    alt={t.name}
                    className="w-full h-12 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-full h-12 rounded"
                    style={{ background: t.preview ?? "var(--surface-2)" }}
                  />
                )}
                <span
                  className="text-xs text-center"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t.name}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Toggle
          label="Start Fullscreen"
          value={settings.fullscreen ?? false}
          onChange={(v) => update({ fullscreen: v })}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Background
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Choose what appears behind the app content.
        </p>

        <div>
          <label
            className="text-xs font-medium mb-1.5 block"
            style={{ color: "var(--text-secondary)" }}
          >
            Type
          </label>
          <select
            value={bg.type}
            onChange={(e) =>
              setBg({ type: e.target.value as BackgroundType })
            }
            className="w-full text-sm px-2 py-1.5 rounded"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          >
            {(Object.keys(BG_TYPE_LABELS) as BackgroundType[]).map((k) => (
              <option key={k} value={k}>
                {BG_TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {bg.type === "matrix-preset" && (
          <div>
            <label
              className="text-xs font-medium mb-1.5 block"
              style={{ color: "var(--text-secondary)" }}
            >
              Preset
            </label>
            <select
              value={bg.matrixPreset ?? "terminal-green"}
              onChange={(e) =>
                setBg({ matrixPreset: e.target.value as MatrixPreset })
              }
              className="w-full text-sm px-2 py-1.5 rounded"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            >
              {(Object.keys(MATRIX_PRESET_LABELS) as MatrixPreset[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {MATRIX_PRESET_LABELS[k]}
                  </option>
                ),
              )}
            </select>
          </div>
        )}

        {bg.type === "daily" && (
          <div className="flex flex-col gap-3">
            <div>
              <label
                className="text-xs font-medium mb-1.5 block"
                style={{ color: "var(--text-secondary)" }}
              >
                Source
              </label>
              <select
                value={bg.dailySource ?? "bing"}
                onChange={(e) =>
                  setBg({ dailySource: e.target.value as DailyBackgroundSource })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              >
                <option value="bing">Bing Wallpaper of the Day</option>
                <option value="unsplash">Unsplash Random</option>
                <option value="picsum">Picsum Random</option>
                <option value="custom">Custom URL</option>
              </select>
            </div>
            {bg.dailySource === "custom" && (
              <Field
                label="Custom Image URL"
                value={bg.dailyCustomUrl ?? ""}
                onChange={(v) => setBg({ dailyCustomUrl: v })}
                placeholder="https://example.com/wallpaper.jpg"
              />
            )}
          </div>
        )}

        {bg.type === "image" && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Field
                  label="Image Path or URL"
                  value={bg.imagePath ?? ""}
                  onChange={(v) => setBg({ imagePath: v })}
                  placeholder="/path/to/image.jpg or https://..."
                />
              </div>
              <motion.button
                className="px-3 py-2 rounded text-sm"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
                onClick={async () => {
                  const path = await window.htpc.openFile({
                    title: "Select Background Image",
                    filters: [
                      {
                        name: "Images",
                        extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp"],
                      },
                      { name: "All Files", extensions: ["*"] },
                    ],
                  });
                  if (path) setBg({ imagePath: path.startsWith("/") ? `file://${path}` : path });
                }}
                whileTap={{ scale: 0.96 }}
              >
                Browse…
              </motion.button>
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1.5 block"
                style={{ color: "var(--text-secondary)" }}
              >
                Fit Mode
              </label>
              <select
                value={bg.imageFit ?? "cover"}
                onChange={(e) =>
                  setBg({ imageFit: e.target.value as ImageFitMode })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              >
                {(Object.keys(IMAGE_FIT_LABELS) as ImageFitMode[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {IMAGE_FIT_LABELS[k]}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
        )}

        {bg.type === "solid" && (
          <div className="flex flex-col gap-2">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Color
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={bg.solidColor ?? "#000000"}
                onChange={(e) => setBg({ solidColor: e.target.value })}
                className="w-10 h-10 rounded cursor-pointer"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  padding: 2,
                }}
              />
              <input
                type="text"
                value={bg.solidColor ?? "#000000"}
                onChange={(e) => setBg({ solidColor: e.target.value })}
                className="flex-1 text-sm px-3 py-2 rounded"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  outline: "none",
                }}
                placeholder="#000000"
              />
            </div>
          </div>
        )}

        {bg.type === "gradient" && (
          <div className="flex flex-col gap-2">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              CSS Gradient
            </label>
            <input
              type="text"
              value={bg.gradient ?? "linear-gradient(to right, #000, #333)"}
              onChange={(e) => setBg({ gradient: e.target.value })}
              className="w-full text-sm px-3 py-2 rounded"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                outline: "none",
              }}
              placeholder="linear-gradient(to right, #000, #333)"
            />
            <div
              className="w-full h-12 rounded border"
              style={{
                borderColor: "var(--border-default)",
                background: bg.gradient || "linear-gradient(to right, #000, #333)",
              }}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Gallery View
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Choose how media libraries are displayed.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(GALLERY_VIEW_LABELS) as GalleryView[]).map((v) => (
            <motion.button
              key={v}
              className="flex flex-col items-center gap-1 p-2 rounded-[var(--radius-card)]"
              style={{
                border: `2px solid ${settings.galleryView === v ? "var(--accent)" : "var(--border-default)"}`,
                background: "var(--surface-1)",
                boxShadow:
                  settings.galleryView === v ? "var(--shadow-glow)" : "none",
              }}
              onClick={() => update({ galleryView: v })}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <span
                className="text-xs text-center font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {GALLERY_VIEW_LABELS[v]}
              </span>
              {v === "theme-default" && (
                <span className="text-[12px] text-center" style={{ color: "var(--text-secondary)" }}>
                  Follows theme
                </span>
              )}
            </motion.button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Tabs
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Choose which tabs are visible in the navigation bar.
        </p>
        {(
          [
            ["gaming", "Gaming", Gamepad2],
            ["movies", "Movies", Film],
            ["music", "Music", Music],
            ["streaming", "Streaming", Tv],
            ["controllers", "Controllers", Gamepad2],
          ] as [TabId, string, React.ComponentType<{ size?: number }>][]
        ).map(([id, label, Icon]) => {
          const disabledTabs = settings.disabledTabs ?? [];
          const disabled = disabledTabs.includes(id);
          return (
            <div key={id} className="flex items-center justify-between py-1">
              <span className="text-sm flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                <Icon size={16} /> {label}
              </span>
              <button
                onClick={() =>
                  update({
                    disabledTabs: disabled
                      ? disabledTabs.filter((t) => t !== id)
                      : [...disabledTabs, id],
                  })
                }
                className="w-11 h-6 rounded-full transition-colors relative"
                style={{
                  background: !disabled
                    ? "var(--accent)"
                    : "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                  style={{
                    background: "white",
                    left: !disabled ? "1.25rem" : "0.125rem",
                  }}
                />
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
};
