import React from "react";
import { useSettingsStore } from "../../store/settings.store";
import { OverlayStyle } from "../../../../shared/types";
import { Toggle } from "./shared";

export const OverlayTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  if (!settings) return null;

  const style: OverlayStyle = settings.overlayStyle ?? {
    mode: "glass",
    color: "#000000",
    opacity: 0.65,
  };

  const setStyle = (partial: Partial<OverlayStyle>) => {
    update({ overlayStyle: { ...style, ...partial } });
  };

  const reset = () => {
    update({
      overlayStyle: { mode: "glass", color: "#000000", opacity: 0.65 },
      overlayAutoShow: true,
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          In-Game Overlay
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          The overlay appears automatically when an external game starts. Press{" "}
          <kbd className="px-1 py-0.5 rounded text-xs font-mono" style={{ background: "var(--surface-0)" }}>
            F1
          </kbd>{" "}
          by default to show or hide it while playing. The shortcut and controller button can be changed in the{" "}
          <strong style={{ color: "var(--text-primary)" }}>Input</strong> tab.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Appearance
        </h2>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Mode
          </span>
          <div className="flex gap-2 p-1 rounded-[var(--radius-card)]" style={{ background: "var(--surface-1)" }}>
            <button
              onClick={() => setStyle({ mode: "glass" })}
              className="flex-1 px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
              style={{
                background: style.mode === "glass" ? "var(--accent)" : "transparent",
                color: style.mode === "glass" ? "var(--surface-base)" : "var(--text-primary)",
              }}
            >
              Glass
            </button>
            <button
              onClick={() => setStyle({ mode: "tint" })}
              className="flex-1 px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
              style={{
                background: style.mode === "tint" ? "var(--accent)" : "transparent",
                color: style.mode === "tint" ? "var(--surface-base)" : "var(--text-primary)",
              }}
            >
              Tint
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Background Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={style.color || "#000000"}
              onChange={(e) => setStyle({ color: e.target.value })}
              className="w-12 h-10 rounded cursor-pointer"
              style={{ background: "transparent", border: "1px solid var(--border-default)" }}
            />
            <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
              {style.color || "#000000"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Opacity
            </label>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {Math.round((style.opacity ?? 0.65) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={style.opacity ?? 0.65}
            onChange={(e) => setStyle({ opacity: parseFloat(e.target.value) })}
            className="w-full h-2 rounded-lg cursor-pointer"
            style={{ accentColor: "var(--accent)" }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Toggle
          label="Show overlay on game start"
          description="Automatically open the overlay when a game starts."
          value={settings.overlayAutoShow ?? true}
          onChange={(v) => update({ overlayAutoShow: v })}
        />
      </section>

      <section className="flex flex-col gap-4">
        <button
          onClick={reset}
          className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
          style={{
            background: "var(--surface-1)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
          }}
        >
          Reset to Defaults
        </button>
      </section>
    </div>
  );
};
