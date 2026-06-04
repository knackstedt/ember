import React from "react";
import { useSettingsStore } from "../../store/settings.store";
import { FlashAspectRatio, FlashCanvasSize, FlashUpscaleStyle, GamePlatform } from "../../../../shared/types";
import { getFlashSettings } from "./shared";

export const EmulatorsTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  if (!settings) return null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
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
              <option value="none">None (pixel-perfect)</option>
              <option value="smooth">Smooth (bilinear)</option>
              <option value="hqx">hqx (pixel art scaler)</option>
              <option value="xbrz">xBRZ (high-quality pixel art)</option>
            </select>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Emulators
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
              Default Shader (Global)
            </label>
            <select
              value={settings.defaultEmulatorShader ?? ""}
              onChange={(e) => update({ defaultEmulatorShader: e.target.value })}
              className="w-full text-sm px-2 py-1.5 rounded"
              style={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                outline: "none",
              }}
            >
              <option value="">None</option>
              <option value="2xSal.glsl">2xSal</option>
              <option value="4xBR.glsl">4xBR</option>
              <option value="6xBRZ.glsl">6xBRZ</option>
              <option value="crt-easymode.glsl">CRT Easymode</option>
              <option value="crt-geom.glsl">CRT Geom</option>
              <option value="dot.glsl">Dot</option>
              <option value="lcd.glsl">LCD</option>
              <option value="ntsc.glsl">NTSC</option>
              <option value="sharp-bilinear.glsl">Sharp Bilinear</option>
              <option value="supereagle.glsl">Super Eagle</option>
              <option value="xbrz.glsl">xBRZ</option>
            </select>
          </div>
          {(
            [
              ["nes", "NES"],
              ["snes", "SNES"],
              ["gb", "Game Boy"],
              ["gba", "GBA"],
            ] as [GamePlatform, string][]
          ).map(([platform, label]) => (
            <div key={platform}>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                {label} Default Shader
              </label>
              <select
                value={settings.emulatorShaders?.[platform] ?? ""}
                onChange={(e) => {
                  const next = { ...settings.emulatorShaders, [platform]: e.target.value || undefined };
                  update({ emulatorShaders: next });
                }}
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
              >
                <option value="">Inherit (use global default)</option>
                <option value="2xSal.glsl">2xSal</option>
                <option value="4xBR.glsl">4xBR</option>
                <option value="6xBRZ.glsl">6xBRZ</option>
                <option value="crt-easymode.glsl">CRT Easymode</option>
                <option value="crt-geom.glsl">CRT Geom</option>
                <option value="dot.glsl">Dot</option>
                <option value="lcd.glsl">LCD</option>
                <option value="ntsc.glsl">NTSC</option>
                <option value="sharp-bilinear.glsl">Sharp Bilinear</option>
                <option value="supereagle.glsl">Super Eagle</option>
                <option value="xbrz.glsl">xBRZ</option>
              </select>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
