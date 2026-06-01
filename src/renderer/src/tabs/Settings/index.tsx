import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../store/settings.store";
import {
  ThemeName,
  FlashAspectRatio,
  FlashCanvasSize,
  FlashUpscaleStyle,
  FlashSettings,
  TabId,
  DailyBackgroundSource,
} from "../../../../shared/types";

const DEFAULT_FLASH_SETTINGS: FlashSettings = {
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
};

function getFlashSettings(settings?: Partial<FlashSettings>): FlashSettings {
  return { ...DEFAULT_FLASH_SETTINGS, ...settings };
}

const THEMES: { id: ThemeName; label: string; preview: string }[] = [
  { id: "dark-oled", label: "Dark OLED", preview: "#000" },
  {
    id: "glassmorphism",
    label: "Glassmorphism",
    preview: "linear-gradient(135deg,#0d1117,#1e3a5f)",
  },
  {
    id: "neon-cyberpunk",
    label: "Neon Cyberpunk",
    preview: "linear-gradient(135deg,#07070f,#ff2d78)",
  },
  {
    id: "terminal-tui",
    label: "Terminal TUI",
    preview: "linear-gradient(135deg,#0c0c0c,#004400)",
  },
  { id: "custom", label: "Custom", preview: "var(--color-surface-raised)" },
];

function PathList({
  label,
  paths,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  paths: string[];
  onChange: (p: string[]) => void;
  placeholder?: string;
  hint?: string;
}): React.ReactElement {
  const [newPath, setNewPath] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-sm font-medium"
        style={{ color: "var(--color-text)" }}
      >
        {label}
      </label>
      {hint && (
        <p
          className="text-xs"
          style={{
            color: "var(--color-text-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          ↪ auto-scans: {hint}
        </p>
      )}
      {paths.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span
            className="flex-1 text-sm px-3 py-1.5 rounded"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {p}
          </span>
          <button
            onClick={() => onChange(paths.filter((_, j) => j !== i))}
            className="px-2 py-1 text-xs rounded"
            style={{
              background: "#ff444420",
              color: "#ff4444",
              border: "1px solid #ff444430",
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder={placeholder ?? "/path/to/folder"}
          className="flex-1 text-sm px-3 py-1.5 rounded"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            fontFamily: "var(--font-mono)",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newPath.trim()) {
              onChange([...paths, newPath.trim()]);
              setNewPath("");
            }
          }}
        />
        <motion.button
          className="px-3 py-1.5 rounded text-sm"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg)",
          }}
          onClick={() => {
            if (newPath.trim()) {
              onChange([...paths, newPath.trim()]);
              setNewPath("");
            }
          }}
          whileTap={{ scale: 0.96 }}
        >
          Add
        </motion.button>
        <motion.button
          className="px-3 py-1.5 rounded text-sm"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={async () => {
            const dir = await window.htpc.openDirectory();
            if (dir) onChange([...paths, dir]);
          }}
          whileTap={{ scale: 0.96 }}
        >
          Browse…
        </motion.button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-sm font-medium"
        style={{ color: "var(--color-text)" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 rounded text-sm"
        style={{
          background: "var(--color-surface-raised)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
          outline: "none",
        }}
      />
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm" style={{ color: "var(--color-text)" }}>
        {label}
      </span>
      <button
        onClick={() => onChange(!value)}
        className="w-11 h-6 rounded-full transition-colors relative"
        style={{
          background: value
            ? "var(--color-accent)"
            : "var(--color-surface-raised)",
          border: "1px solid var(--color-border)",
        }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
          style={{
            background: "white",
            left: value ? "1.25rem" : "0.125rem",
            transform: "translateX(0)",
          }}
        />
      </button>
    </div>
  );
}

export const SettingsTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [clearConfirm, setClearConfirm] = useState(false);
  const [xdgDefaults, setXdgDefaults] = useState<{
    videosDir: string;
    musicDir: string;
  } | null>(null);

  useEffect(() => {
    window.htpc.app
      .getXdgDefaults()
      .then(setXdgDefaults)
      .catch(() => {});
  }, []);

  if (!settings) return null;

  return (
    <div className="h-full overflow-y-auto gpu-scroll">
      <div className="max-w-2xl mx-auto p-6 flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Appearance
          </h2>
          <div>
            <label
              className="text-sm font-medium mb-3 block"
              style={{ color: "var(--color-text)" }}
            >
              Theme
            </label>
            <div className="grid grid-cols-5 gap-3">
              {THEMES.map((t) => (
                <motion.button
                  key={t.id}
                  className="flex flex-col items-center gap-2 p-2 rounded-[var(--radius-card)]"
                  style={{
                    border: `2px solid ${settings.theme === t.id ? "var(--color-accent)" : "var(--color-border)"}`,
                    background: "var(--color-surface-raised)",
                    boxShadow:
                      settings.theme === t.id ? "var(--shadow-glow)" : "none",
                  }}
                  onClick={() => update({ theme: t.id })}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div
                    className="w-full h-12 rounded"
                    style={{ background: t.preview }}
                  />
                  <span
                    className="text-xs text-center"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    {t.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
          <Toggle
            label="Start Fullscreen"
            value={settings.fullscreen}
            onChange={(v) => update({ fullscreen: v })}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Tabs
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Choose which tabs are visible in the navigation bar.
          </p>
          {(
            [
              ["gaming", "Gaming", "🎮"],
              ["movies", "Movies", "🎬"],
              ["music", "Music", "🎵"],
              ["tv-shows", "TV Shows", "📺"],
              ["controllers", "Controllers", "🕹"],
            ] as [TabId, string, string][]
          ).map(([id, label, icon]) => {
            const disabled = settings.disabledTabs.includes(id);
            return (
              <div key={id} className="flex items-center justify-between py-1">
                <span className="text-sm" style={{ color: "var(--color-text)" }}>
                  {icon} {label}
                </span>
                <button
                  onClick={() =>
                    update({
                      disabledTabs: disabled
                        ? settings.disabledTabs.filter((t) => t !== id)
                        : [...settings.disabledTabs, id],
                    })
                  }
                  className="w-11 h-6 rounded-full transition-colors relative"
                  style={{
                    background: !disabled
                      ? "var(--color-accent)"
                      : "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
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

        <section className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Daily Background
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Fetches a new wallpaper image every day and layers it behind the
            theme canvas.
          </p>
          <Toggle
            label="Enable Daily Background"
            value={settings.dailyBackground.enabled}
            onChange={(v) =>
              update({
                dailyBackground: {
                  ...settings.dailyBackground,
                  enabled: v,
                },
              })
            }
          />
          {settings.dailyBackground.enabled && (
            <div className="flex flex-col gap-3">
              <div>
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  Source
                </label>
                <select
                  value={settings.dailyBackground.source}
                  onChange={(e) =>
                    update({
                      dailyBackground: {
                        ...settings.dailyBackground,
                        source: e.target.value as DailyBackgroundSource,
                      },
                    })
                  }
                  className="w-full text-sm px-2 py-1.5 rounded"
                  style={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                >
                  <option value="bing">Bing Wallpaper of the Day</option>
                  <option value="unsplash">Unsplash Random</option>
                  <option value="picsum">Picsum Random</option>
                  <option value="custom">Custom URL</option>
                </select>
              </div>
              {settings.dailyBackground.source === "custom" && (
                <Field
                  label="Custom Image URL"
                  value={settings.dailyBackground.customUrl ?? ""}
                  onChange={(v) =>
                    update({
                      dailyBackground: {
                        ...settings.dailyBackground,
                        customUrl: v,
                      },
                    })
                  }
                  placeholder="https://example.com/wallpaper.jpg"
                />
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Media Directories
          </h2>
          <PathList
            label="Movie Paths"
            paths={settings.moviePaths}
            onChange={(p) => update({ moviePaths: p })}
            placeholder={xdgDefaults?.videosDir}
            hint={xdgDefaults?.videosDir}
          />
          <PathList
            label="Music Paths"
            paths={settings.musicPaths}
            onChange={(p) => update({ musicPaths: p })}
            placeholder={xdgDefaults?.musicDir}
            hint={xdgDefaults?.musicDir}
          />
          <PathList
            label="ROM Paths"
            paths={settings.romPaths}
            onChange={(p) => update({ romPaths: p })}
          />
          <PathList
            label="Game Paths"
            paths={settings.gamePaths}
            onChange={(p) => update({ gamePaths: p })}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            API Keys
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Optional. Improves metadata quality and rate limits.
          </p>
          <Field
            label="TMDB API Key"
            value={settings.tmdbApiKey ?? ""}
            onChange={(v) => update({ tmdbApiKey: v })}
            placeholder="eyJ…"
            type="password"
          />
          <Field
            label="RAWG API Key"
            value={settings.rawgApiKey ?? ""}
            onChange={(v) => update({ rawgApiKey: v })}
            placeholder="Optional"
            type="password"
          />
          <Field
            label="AcoustID API Key"
            value={settings.acoustidApiKey ?? ""}
            onChange={(v) => update({ acoustidApiKey: v })}
            placeholder="Optional"
            type="password"
          />
        </section>

        <section className="flex flex-col gap-2">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            General
          </h2>
          <Toggle
            label="Start on Boot"
            value={settings.startOnBoot}
            onChange={(v) => update({ startOnBoot: v })}
          />
          <Toggle
            label="Hardware Acceleration"
            value={settings.hardwareAcceleration}
            onChange={(v) => update({ hardwareAcceleration: v })}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Flash Player
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Default Aspect Ratio
              </label>
              <select
                value={settings.flashSettings?.aspectRatio ?? "free"}
                onChange={(e) =>
                  update({
                    flashSettings: {
                      ...getFlashSettings(settings.flashSettings),
                      aspectRatio: e.target.value as FlashAspectRatio,
                    },
                  })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
              >
                <option value="free">Free (fill window)</option>
                <option value="4:3">4:3</option>
                <option value="16:9">16:9</option>
                <option value="16:10">16:10</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Default Canvas Size
              </label>
              <select
                value={settings.flashSettings?.canvasSize ?? "window"}
                onChange={(e) =>
                  update({
                    flashSettings: {
                      ...getFlashSettings(settings.flashSettings),
                      canvasSize: e.target.value as FlashCanvasSize,
                    },
                  })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
              >
                <option value="window">Fit Window</option>
                <option value="550x400">550x400 (Common Flash)</option>
                <option value="640x480">640x480 (VGA)</option>
                <option value="800x600">800x600 (SVGA)</option>
                <option value="1024x768">1024x768 (XGA)</option>
                <option value="custom">Custom…</option>
              </select>
              {(settings.flashSettings?.canvasSize ?? "window") === "custom" && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={3840}
                    value={settings.flashSettings?.customWidth ?? 800}
                    onChange={(e) =>
                      update({
                        flashSettings: {
                          ...getFlashSettings(settings.flashSettings),
                          customWidth: parseInt(e.target.value) || 1,
                        },
                      })
                    }
                    placeholder="Width"
                    className="flex-1 text-sm px-2 py-1.5 rounded"
                    style={{
                      background: "var(--color-surface-raised)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text)",
                      outline: "none",
                    }}
                  />
                  <input
                    type="number"
                    min={1}
                    max={2160}
                    value={settings.flashSettings?.customHeight ?? 600}
                    onChange={(e) =>
                      update({
                        flashSettings: {
                          ...getFlashSettings(settings.flashSettings),
                          customHeight: parseInt(e.target.value) || 1,
                        },
                      })
                    }
                    placeholder="Height"
                    className="flex-1 text-sm px-2 py-1.5 rounded"
                    style={{
                      background: "var(--color-surface-raised)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text)",
                      outline: "none",
                    }}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Default Upscaling Style
              </label>
              <select
                value={settings.flashSettings?.upscaleStyle ?? "none"}
                onChange={(e) =>
                  update({
                    flashSettings: {
                      ...getFlashSettings(settings.flashSettings),
                      upscaleStyle: e.target.value as FlashUpscaleStyle,
                    },
                  })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
              >
                <option value="none">None (Smooth)</option>
                <option value="gaussian">Gaussian (Soft blur)</option>
                <option value="pixelate">Pixelate (Crisp pixels)</option>
              </select>
            </div>
            <Toggle
              label="Stick to Mouse"
              value={settings.flashSettings?.stickToMouse ?? true}
              onChange={(v) =>
                update({
                  flashSettings: {
                    ...getFlashSettings(settings.flashSettings),
                    stickToMouse: v,
                  },
                })
              }
            />
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                AI Upscaling (Experimental)
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  background: "#ffaa0020",
                  color: "#ffaa00",
                  border: "1px solid #ffaa0030",
                }}
              >
                Coming Soon
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Danger Zone
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Removes all scanned games, movies, music, and TV shows from the
            database. Your settings and file paths will be preserved.
          </p>
          <AnimatePresence mode="wait">
            {clearConfirm ? (
              <motion.div
                key="confirm"
                className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
              >
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  Permanently delete all scanned data?
                </span>
                <div className="flex gap-2">
                  <motion.button
                    className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "#e05252",
                      color: "#fff",
                    }}
                    onClick={async () => {
                      await window.htpc.db.clear();
                      await window.htpc.app.restart();
                    }}
                    whileTap={{ scale: 0.96 }}
                  >
                    Confirm
                  </motion.button>
                  <motion.button
                    className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "var(--color-surface-raised)",
                      color: "var(--color-text)",
                      border: "1px solid var(--color-border)",
                    }}
                    onClick={() => setClearConfirm(false)}
                    whileTap={{ scale: 0.96 }}
                  >
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="clear"
                className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  background: "#ff444420",
                  color: "#ff4444",
                  border: "1px solid #ff444430",
                }}
                onClick={() => setClearConfirm(true)}
                whileTap={{ scale: 0.96 }}
              >
                Clear All Data
              </motion.button>
            )}
          </AnimatePresence>
        </section>

        <section className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Plugins
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Drop TypeScript files or folders into{" "}
            <code
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                background: "var(--color-surface-raised)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ~/.config/htpc/plugins/
            </code>
          </p>
          <motion.button
            className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
            onClick={() => window.htpc.plugins.reload()}
            whileTap={{ scale: 0.96 }}
          >
            ↺ Reload Plugins
          </motion.button>
        </section>
      </div>
    </div>
  );
};
