import React from "react";
import { motion } from "framer-motion";
import { Gamepad2, Film, Music, Tv } from "lucide-react";
import { useSettingsStore } from "../../store/settings.store";
import { TabId, DailyBackgroundSource } from "../../../../shared/types";
import { THEMES, Toggle, Field } from "./shared";

export const AppearanceTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  if (!settings) return null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" data-nav-orientation="horizontal">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
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
      </section>

      <section className="flex flex-col gap-4">
        <Toggle
          label="Start Fullscreen"
          value={settings.fullscreen}
          onChange={(v) => update({ fullscreen: v })}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Tabs
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Choose which tabs are visible in the navigation bar.
        </p>
        {(
          [
            ["gaming", "Gaming", Gamepad2],
            ["movies", "Movies", Film],
            ["music", "Music", Music],
            ["tv-shows", "TV Shows", Tv],
            ["controllers", "Controllers", Gamepad2],
          ] as [TabId, string, React.ComponentType<{ size?: number }>]
        ).map(([id, label, Icon]) => {
          const disabled = settings.disabledTabs.includes(id);
          return (
            <div key={id} className="flex items-center justify-between py-1">
              <span className="text-sm flex items-center gap-1.5" style={{ color: "var(--color-text)" }}>
                <Icon size={16} /> {label}
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
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
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
    </div>
  );
};
