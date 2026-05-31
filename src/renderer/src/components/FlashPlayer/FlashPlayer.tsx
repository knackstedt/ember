import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFlashPlayerStore } from "../../store/flashPlayer.store";
import { useSettingsStore } from "../../store/settings.store";
import {
  FlashSettings,
  FlashAspectRatio,
  FlashCanvasSize,
  FlashUpscaleStyle,
  FlashControllerMap,
  NormalizedInputEvent,
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

function getFlashSettings(settings: unknown): FlashSettings {
  const s = (settings ?? {}) as Partial<FlashSettings>;
  return {
    ...DEFAULT_FLASH_SETTINGS,
    ...s,
    controllerMap: {
      ...DEFAULT_FLASH_SETTINGS.controllerMap,
      ...s.controllerMap,
    },
  };
}

declare global {
  interface Window {
    RufflePlayer?: {
      newest: () => {
        createPlayer: () => RufflePlayerInstance;
      };
    };
  }
}

interface RufflePlayerInstance {
  id: string;
  load: (options: { url?: string; base?: string; data?: Uint8Array | ArrayBuffer }) => Promise<void>;
  style: CSSStyleDeclaration;
  classList: DOMTokenList;
}

const CANVAS_PRESETS: Record<Exclude<FlashCanvasSize, "window" | "custom">, [number, number]> = {
  "550x400": [550, 400],
  "640x480": [640, 480],
  "800x600": [800, 600],
  "1024x768": [1024, 768],
};

const KEY_OPTIONS = [
  { label: "Space", value: "Space" },
  { label: "Enter", value: "Enter" },
  { label: "Escape", value: "Escape" },
  { label: "Tab", value: "Tab" },
  { label: "Shift", value: "ShiftLeft" },
  { label: "Ctrl", value: "ControlLeft" },
  { label: "Alt", value: "AltLeft" },
  { label: "Arrow Up", value: "ArrowUp" },
  { label: "Arrow Down", value: "ArrowDown" },
  { label: "Arrow Left", value: "ArrowLeft" },
  { label: "Arrow Right", value: "ArrowRight" },
  { label: "W", value: "KeyW" },
  { label: "A", value: "KeyA" },
  { label: "S", value: "KeyS" },
  { label: "D", value: "KeyD" },
  { label: "Q", value: "KeyQ" },
  { label: "E", value: "KeyE" },
  { label: "Z", value: "KeyZ" },
  { label: "X", value: "KeyX" },
  { label: "C", value: "KeyC" },
  { label: "1", value: "Digit1" },
  { label: "2", value: "Digit2" },
  { label: "3", value: "Digit3" },
  { label: "None", value: "" },
];

function dispatchKey(code: string, type: "keydown" | "keyup", target?: HTMLElement | null): void {
  if (!code) return;
  const event = new KeyboardEvent(type, {
    code,
    key: code,
    bubbles: true,
    cancelable: true,
  });
  (target ?? window).dispatchEvent(event);
}

function dispatchMouseMove(dx: number, dy: number): void {
  const event = new MouseEvent("mousemove", {
    movementX: dx,
    movementY: dy,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

function dispatchMouseButton(down: boolean): void {
  const event = new MouseEvent(down ? "mousedown" : "mouseup", {
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

function useRuffleScript(): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (window.RufflePlayer) {
      setLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "./ruffle/ruffle.js";
    script.onload = () => setLoaded(true);
    script.onerror = () => console.error("[FlashPlayer] Failed to load Ruffle");
    document.head.appendChild(script);
    // Keep script loaded permanently; removing it can leave stale globals
  }, []);
  return loaded;
}

export const FlashPlayer: React.FC = () => {
  const { open, swfPath, title, settingsVisible, toggleSettings, close } =
    useFlashPlayerStore();
  const settings = useSettingsStore((s) => s.settings);
  const flashSettings = getFlashSettings(settings?.flashSettings);

  const containerRef = useRef<HTMLDivElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<RufflePlayerInstance | null>(null);
  const ruffleLoaded = useRuffleScript();

  const [localSettings, setLocalSettings] = useState<FlashSettings>(flashSettings);

  useEffect(() => {
    setLocalSettings(flashSettings);
  }, [settings?.flashSettings]);

  const saveSettings = useCallback(
    (partial: Partial<FlashSettings>) => {
      const next = { ...localSettings, ...partial };
      setLocalSettings(next);
      void useSettingsStore.getState().update({ flashSettings: next });
    },
    [localSettings],
  );

  // Create / destroy Ruffle player
  useEffect(() => {
    if (!open || !ruffleLoaded || !playerContainerRef.current) return;
    if (!window.RufflePlayer) return;

    const ruffle = window.RufflePlayer.newest();
    const player = ruffle.createPlayer();
    player.id = "ruffle-player-instance";
    playerContainerRef.current.appendChild(player as unknown as Node);
    playerRef.current = player;

    void (async () => {
      try {
        const data = await window.htpc.files.read(swfPath);
        if (data && data.byteLength > 0) {
          void player.load({ data });
        } else {
          console.error("[FlashPlayer] Failed to read SWF file:", swfPath);
        }
      } catch (err) {
        console.error("[FlashPlayer] Error loading SWF:", err);
      }
    })();

    return () => {
      try {
        // Attempt to destroy the player instance before removing from DOM
        (player as any).destroy?.();
        (player as any).remove?.();
      } catch {
        /* ignore */
      }
      playerContainerRef.current?.removeChild(player as unknown as Node);
      playerRef.current = null;
    };
  }, [open, ruffleLoaded, swfPath]);

  // Apply aspect ratio / canvas size / upscale styles
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const container = containerRef.current;
    if (!container) return;

    const el = player as unknown as HTMLElement;

    // Upscale style
    if (localSettings.upscaleStyle === "pixelate") {
      el.style.imageRendering = "pixelated";
    } else if (localSettings.upscaleStyle === "gaussian") {
      el.style.imageRendering = "auto";
      // Gaussian blur is applied via a CSS filter on the container
    } else {
      el.style.imageRendering = "auto";
    }

    // Canvas size
    let width: number | undefined;
    let height: number | undefined;
    if (localSettings.canvasSize === "window") {
      width = undefined;
      height = undefined;
    } else if (localSettings.canvasSize === "custom") {
      width = localSettings.customWidth;
      height = localSettings.customHeight;
    } else {
      const preset = CANVAS_PRESETS[localSettings.canvasSize];
      if (preset) {
        width = preset[0];
        height = preset[1];
      }
    }

    if (width && height) {
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
    } else {
      el.style.width = "100%";
      el.style.height = "100%";
    }

    // Aspect ratio constraints on container
    if (localSettings.aspectRatio === "free") {
      container.style.aspectRatio = "";
    } else {
      container.style.aspectRatio = localSettings.aspectRatio;
    }
  }, [localSettings]);

  // Controller input mapping
  useEffect(() => {
    if (!open) return;

    const heldKeys = new Set<string>();
    const axisState = { left_x: 0, left_y: 0, right_z: 0, right_y: 0 };
    let mouseRaf: number | null = null;
    let lastMouseTime = 0;

    const playerEl = playerRef.current as unknown as HTMLElement | null;

    const onEvent = (ev: NormalizedInputEvent) => {
      if (ev.source !== "gamepad") return;

      if (ev.type === "button_press" || ev.type === "button_release") {
        const action = ev.action ?? "";
        const code = localSettings.controllerMap[action as keyof FlashControllerMap];
        if (code) {
          if (ev.type === "button_press") {
            if (!heldKeys.has(code)) {
              heldKeys.add(code);
              dispatchKey(code, "keydown", playerEl);
            }
          } else {
            if (heldKeys.has(code)) {
              heldKeys.delete(code);
              dispatchKey(code, "keyup", playerEl);
            }
          }
        }

        // South = left mouse click when stick-to-mouse is on
        if (localSettings.stickToMouse && action === "south") {
          dispatchMouseButton(ev.type === "button_press");
        }
      }

      if (ev.type === "axis" && localSettings.stickToMouse) {
        const axis = ev.axis ?? "";
        const value = ev.value ?? 0;
        // Linux gamepad axes are -32767..32767; deadzone at ~4000
        const DEADZONE = 4000;
        const norm =
          Math.abs(value) < DEADZONE
            ? 0
            : value / 32767;

        if (axis === "left_x") axisState.left_x = norm;
        if (axis === "left_y") axisState.left_y = norm;
        if (axis === "right_z") axisState.right_x = norm;
        if (axis === "right_y") axisState.right_y = norm;
      }
    };

    const unsub = window.htpc.input.onEvent(onEvent);

    // Mouse movement loop for analog sticks
    const mouseLoop = (time: number) => {
      if (!open) return;
      const dt = time - lastMouseTime;
      lastMouseTime = time;
      if (dt > 0 && localSettings.stickToMouse) {
        const sens = localSettings.stickSensitivity * 8;
        const dx = (axisState.left_x + axisState.right_z) * sens;
        const dy = (axisState.left_y + axisState.right_y) * sens;
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          dispatchMouseMove(dx, dy);
        }
      }
      mouseRaf = requestAnimationFrame(mouseLoop);
    };
    mouseRaf = requestAnimationFrame(mouseLoop);

    return () => {
      unsub();
      if (mouseRaf) cancelAnimationFrame(mouseRaf);
      // Release any held keys
      heldKeys.forEach((code) => dispatchKey(code, "keyup", playerEl));
      heldKeys.clear();
    };
  }, [open, localSettings]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.stopPropagation();
        if (settingsVisible) {
          toggleSettings();
        } else {
          close();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, settingsVisible, toggleSettings, close]);

  if (!open) return null;

  const upscaleFilter =
    localSettings.upscaleStyle === "gaussian"
      ? "blur(0.6px)"
      : localSettings.upscaleStyle === "pixelate"
        ? ""
        : "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Ruffle player container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: upscaleFilter,
        }}
      >
        <div
          ref={playerContainerRef}
          style={{
            width: localSettings.canvasSize === "window" ? "100%" : undefined,
            height: localSettings.canvasSize === "window" ? "100%" : undefined,
          }}
        />
      </div>

      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)",
          zIndex: 2,
        }}
      >
        <span
          className="text-sm font-medium truncate"
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          {title}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSettings}
            className="px-3 py-1.5 rounded text-xs font-medium hover:bg-white/20 transition-colors"
            style={{ color: "#fff", background: "rgba(255,255,255,0.1)" }}
          >
            Settings
          </button>
          <button
            onClick={close}
            className="px-3 py-1.5 rounded text-xs font-medium hover:bg-white/20 transition-colors"
            style={{ color: "#fff", background: "rgba(255,255,255,0.1)" }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {settingsVisible && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: 48,
              right: 16,
              width: 340,
              maxHeight: "calc(100vh - 64px)",
              overflowY: "auto",
              background: "var(--color-surface-raised, #1a1a1a)",
              border: "1px solid var(--color-border, #333)",
              borderRadius: 12,
              padding: 16,
              zIndex: 3,
              color: "var(--color-text, #fff)",
            }}
            className="gpu-scroll"
          >
            <h3 className="text-sm font-semibold mb-4">Flash Player Settings</h3>

            {/* Aspect Ratio */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Aspect Ratio
              </label>
              <select
                value={localSettings.aspectRatio}
                onChange={(e) =>
                  saveSettings({ aspectRatio: e.target.value as FlashAspectRatio })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-bg, #000)",
                  border: "1px solid var(--color-border, #333)",
                  color: "var(--color-text, #fff)",
                  outline: "none",
                }}
              >
                <option value="free">Free (fill window)</option>
                <option value="4:3">4:3</option>
                <option value="16:9">16:9</option>
                <option value="16:10">16:10</option>
              </select>
            </div>

            {/* Canvas Size */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Canvas Size
              </label>
              <select
                value={localSettings.canvasSize}
                onChange={(e) =>
                  saveSettings({ canvasSize: e.target.value as FlashCanvasSize })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-bg, #000)",
                  border: "1px solid var(--color-border, #333)",
                  color: "var(--color-text, #fff)",
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
              {localSettings.canvasSize === "custom" && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={3840}
                    value={localSettings.customWidth}
                    onChange={(e) =>
                      saveSettings({ customWidth: parseInt(e.target.value) || 1 })
                    }
                    placeholder="Width"
                    className="flex-1 text-sm px-2 py-1.5 rounded"
                    style={{
                      background: "var(--color-bg, #000)",
                      border: "1px solid var(--color-border, #333)",
                      color: "var(--color-text, #fff)",
                      outline: "none",
                    }}
                  />
                  <input
                    type="number"
                    min={1}
                    max={2160}
                    value={localSettings.customHeight}
                    onChange={(e) =>
                      saveSettings({ customHeight: parseInt(e.target.value) || 1 })
                    }
                    placeholder="Height"
                    className="flex-1 text-sm px-2 py-1.5 rounded"
                    style={{
                      background: "var(--color-bg, #000)",
                      border: "1px solid var(--color-border, #333)",
                      color: "var(--color-text, #fff)",
                      outline: "none",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Upscale Style */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Upscaling Style
              </label>
              <select
                value={localSettings.upscaleStyle}
                onChange={(e) =>
                  saveSettings({ upscaleStyle: e.target.value as FlashUpscaleStyle })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-bg, #000)",
                  border: "1px solid var(--color-border, #333)",
                  color: "var(--color-text, #fff)",
                  outline: "none",
                }}
              >
                <option value="none">None (Smooth)</option>
                <option value="gaussian">Gaussian (Soft blur)</option>
                <option value="pixelate">Pixelate (Crisp pixels)</option>
              </select>
            </div>

            {/* Controller Input Mapping */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Controller Button Mapping
              </label>
              <div className="flex flex-col gap-1.5">
                {(
                  [
                    { key: "south", label: "A / South" },
                    { key: "east", label: "B / East" },
                    { key: "north", label: "X / North" },
                    { key: "west", label: "Y / West" },
                    { key: "left_bumper", label: "L1" },
                    { key: "right_bumper", label: "R1" },
                    { key: "select", label: "Select / Back" },
                    { key: "start", label: "Start" },
                    { key: "dpad_up", label: "D-Pad Up" },
                    { key: "dpad_down", label: "D-Pad Down" },
                    { key: "dpad_left", label: "D-Pad Left" },
                    { key: "dpad_right", label: "D-Pad Right" },
                  ] as { key: keyof FlashControllerMap; label: string }[]
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                      {label}
                    </span>
                    <select
                      value={localSettings.controllerMap[key]}
                      onChange={(e) =>
                        saveSettings({
                          controllerMap: {
                            ...localSettings.controllerMap,
                            [key]: e.target.value,
                          },
                        })
                      }
                      className="text-xs px-1.5 py-1 rounded"
                      style={{
                        background: "var(--color-bg, #000)",
                        border: "1px solid var(--color-border, #333)",
                        color: "var(--color-text, #fff)",
                        outline: "none",
                        minWidth: 120,
                      }}
                    >
                      {KEY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Stick to Mouse */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                  Stick to Mouse
                </span>
                <button
                  onClick={() => saveSettings({ stickToMouse: !localSettings.stickToMouse })}
                  className="w-9 h-5 rounded-full relative transition-colors"
                  style={{
                    background: localSettings.stickToMouse
                      ? "var(--color-accent, #0af)"
                      : "var(--color-surface-raised, #333)",
                  }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                    style={{
                      left: localSettings.stickToMouse ? "1.1rem" : "0.125rem",
                    }}
                  />
                </button>
              </div>
              {localSettings.stickToMouse && (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                    Sensitivity
                  </span>
                  <input
                    type="range"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={localSettings.stickSensitivity}
                    onChange={(e) =>
                      saveSettings({ stickSensitivity: parseFloat(e.target.value) })
                    }
                    className="flex-1 h-1 cursor-pointer"
                    style={{ accentColor: "var(--color-accent, #0af)" }}
                  />
                  <span className="text-xs tabular-nums w-8 text-right">
                    {localSettings.stickSensitivity.toFixed(1)}x
                  </span>
                </div>
              )}
            </div>

            {/* AI Upscaling */}
            <div className="mb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
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
              <p className="text-[10px] mt-1" style={{ color: "var(--color-text-dim)" }}>
                AI-powered upscaling will be available in a future update.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
