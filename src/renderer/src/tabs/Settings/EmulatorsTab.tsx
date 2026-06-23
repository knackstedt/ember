import React from "react";
import { useSettingsStore } from "../../store/settings.store";
import { FlashAspectRatio, FlashCanvasSize, FlashUpscaleStyle, GamePlatform } from "../../../../shared/types";
import { getFlashSettings } from "./shared";
import { Settings, ExternalLink } from "lucide-react";

export const EmulatorsTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  if (!settings) return null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Flash Player
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
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
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
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
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
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
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
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
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
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
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
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
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            >
              <option value="none">None (pixel-perfect)</option>
              <option value="smooth">Smooth (bilinear)</option>
              <option value="hqx">hqx (pixel art scaler)</option>
              <option value="xbrz">xBRZ (high-quality pixel art)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Thumbnail Concurrency
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.flashThumbnailConcurrency ?? 4}
              onChange={(e) =>
                update({
                  flashThumbnailConcurrency: Math.max(1, Math.min(10, parseInt(e.target.value) || 4)),
                })
              }
              className="w-full text-sm px-2 py-1.5 rounded"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Max number of flash games to thumbnail at once (1–10)
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Emulators
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Default Shader (Global)
            </label>
            <select
              value={settings.defaultEmulatorShader ?? ""}
              onChange={(e) => update({ defaultEmulatorShader: e.target.value })}
              className="w-full text-sm px-2 py-1.5 rounded"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
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
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                {label} Default Shader
              </label>
              <select
                value={settings.emulatorShaders?.[platform] ?? ""}
                onChange={(e) => {
                  const next = { ...settings.emulatorShaders, [platform]: e.target.value };
                  update({ emulatorShaders: next });
                }}
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
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

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Dolphin Emulator
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Dolphin Settings
            </label>
            <button
              onClick={async () => {
                console.log("Dolphin settings button clicked");
                try {
                  if (!window.htpc?.dolphin?.openSettings) {
                    console.error("window.htpc.dolphin.openSettings is not available");
                    alert("Dolphin settings function not available. Please restart the application.");
                    return;
                  }
                  const success = await window.htpc.dolphin.openSettings();
                  console.log("Dolphin settings result:", success);
                  if (!success) {
                    alert("Dolphin emulator not found. Please install it via Flatpak (org.DolphinEmu.dolphin-emu) or your system package manager.");
                  }
                } catch (error) {
                  console.error("Failed to open Dolphin settings:", error);
                  alert("Failed to open Dolphin settings: " + (error as Error).message);
                }
              }}
              className="w-full text-sm px-3 py-2 rounded flex items-center justify-center gap-2"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              <Settings size={16} />
              <span>Open Dolphin Settings</span>
            </button>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Default Post-Processing Effect
            </label>
            <select
              value={settings.dolphinPostProcessing ?? ""}
              onChange={(e) => update({ dolphinPostProcessing: e.target.value || undefined })}
              className="w-full text-sm px-2 py-1.5 rounded"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            >
              <option value="">None (Off)</option>
              <option value="auto">Auto (Recommended)</option>
              <option value="off">Force Off</option>
              <option value="ssao">SSAO</option>
              <option value="ssao">SSAO</option>
              <option value="anaglyph">Anaglyph 3D</option>
              <option value="3d">Side-by-Side 3D</option>
              <option value="top-bottom">Top-and-Bottom 3D</option>
              <option value="lineart">Lineart</option>
              <option value="bloom">Bloom</option>
              <option value="scanlines">Scanlines</option>
              <option value="ambient">Ambient Occlusion</option>
              <option value="vignette">Vignette</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Dolphin Configuration
            </label>
            <button
              onClick={async () => {
                console.log("Dolphin config button clicked");
                try {
                  if (!window.htpc?.dolphin?.openConfig) {
                    console.error("window.htpc.dolphin.openConfig is not available");
                    alert("Dolphin config function not available. Please restart the application.");
                    return;
                  }
                  const success = await window.htpc.dolphin.openConfig();
                  console.log("Dolphin config result:", success);
                  if (!success) {
                    alert("Dolphin configuration directory not found. Please ensure Dolphin is installed and has been run at least once.");
                  }
                } catch (error) {
                  console.error("Failed to open Dolphin config:", error);
                  alert("Failed to open Dolphin config: " + (error as Error).message);
                }
              }}
              className="w-full text-sm px-3 py-2 rounded flex items-center justify-center gap-2"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              <ExternalLink size={16} />
              <span>Open Dolphin Config Directory</span>
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Controller Mappings
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Controller Mapping Configuration
            </label>
            <button
              onClick={async () => {
                console.log("Controller mapping button clicked");
                try {
                  if (!window.htpc?.controller?.openMapping) {
                    console.error("window.htpc.controller.openMapping is not available");
                    alert("Controller mapping function not available. Please restart the application.");
                    return;
                  }
                  await window.htpc.controller.openMapping();
                  // For now, navigate to Input tab since that's where controller mapping is handled
                  // In the future, this could open a dedicated controller mapping UI
                  alert("Controller mapping is configured in the Input tab. Please navigate there to set up your controllers.");
                } catch (error) {
                  console.error("Failed to open controller mapping:", error);
                  alert("Failed to open controller mapping: " + (error as Error).message);
                }
              }}
              className="w-full text-sm px-3 py-2 rounded flex items-center justify-center gap-2"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              <Settings size={16} />
              <span>Configure Controller Mappings</span>
            </button>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Reset Controller Mappings
            </label>
            <button
              onClick={async () => {
                console.log("Reset controller mappings button clicked");
                try {
                  if (!window.htpc?.controller?.resetMappings) {
                    console.error("window.htpc.controller.resetMappings is not available");
                    alert("Controller reset function not available. Please restart the application.");
                    return;
                  }
                  await window.htpc.controller.resetMappings();
                  alert("All controller mappings have been reset.");
                } catch (error) {
                  console.error("Failed to reset controller mappings:", error);
                  alert("Failed to reset controller mappings: " + (error as Error).message);
                }
              }}
              className="w-full text-sm px-3 py-2 rounded"
              style={{
                background: "#ff444420",
                border: "1px solid #ff444430",
                color: "#ff4444",
              }}
            >
              Reset All Mappings
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
