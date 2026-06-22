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
  FlashFilterType,
  NormalizedInputEvent,
} from "../../../../shared/types";
import { FlashFilterEngine } from "./FlashFilterEngine";
import { BUILT_IN_FILTERS } from "./builtInFilters";
import { subscribeControllerEvents } from "../../hooks/useControllerWorker";

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
  filter: "none",
  filterIntensity: 1.0,
  pixelateSize: 4,
  ditherLevels: 4,
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
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const filterEngineRef = useRef<FlashFilterEngine | null>(null);
  const ruffleLoaded = useRuffleScript();

  const [localSettings, setLocalSettings] = useState<FlashSettings>(flashSettings);
  const [customFilters, setCustomFilters] = useState<{ id: string; name: string; content: string }[]>([]);

  useEffect(() => {
    setLocalSettings(flashSettings);
  }, [settings?.flashSettings]);

  const saveSettings = useCallback(
    (partial: Partial<FlashSettings>) => {
      const next = { ...localSettings, ...partial };
      setLocalSettings(next);
    },
    [localSettings],
  );

  // Debounced persist to disk so sliders don't spam writes / re-renders
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedPersist = useCallback(
    (next: FlashSettings) => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = setTimeout(() => {
        void useSettingsStore.getState().update({ flashSettings: next });
      }, 300);
    },
    [],
  );

  useEffect(() => {
    debouncedPersist(localSettings);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [localSettings, debouncedPersist]);

  // Load custom filters from user data directory
  useEffect(() => {
    if (!open) return;
    void window.htpc.flashFilters.list().then(setCustomFilters).catch(() => setCustomFilters([]));
  }, [open]);

  // Find the Ruffle source canvas inside the player container
  const findRuffleCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!playerContainerRef.current) return null;
    const container = playerContainerRef.current;
    // Ruffle may render inside shadow DOM or as a direct child
    const canvas = container.querySelector("canvas");
    if (canvas) return canvas as HTMLCanvasElement;
    // Search inside shadow roots if present
    const shadowHost = container.querySelector("*[shadowroot], ruffle-object, ruffle-embed, ruffle-player");
    if (shadowHost && (shadowHost as HTMLElement).shadowRoot) {
      const shadowCanvas = (shadowHost as HTMLElement).shadowRoot!.querySelector("canvas");
      if (shadowCanvas) return shadowCanvas as HTMLCanvasElement;
    }
    return null;
  }, []);

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

    // Give Ruffle time to create its canvas, then wire up the filter engine
    const connectTimeout = setTimeout(() => {
      const sourceCanvas = findRuffleCanvas();
      const displayCanvas = displayCanvasRef.current;
      if (sourceCanvas && displayCanvas && !filterEngineRef.current) {
        const engine = new FlashFilterEngine(displayCanvas);
        engine.setSourceCanvas(sourceCanvas);
        filterEngineRef.current = engine;
        // Apply current filter
        if (localSettings.filter === "none") {
          engine.stop();
          sourceCanvas.style.opacity = "1";
          displayCanvas.style.opacity = "0";
        } else {
          sourceCanvas.style.opacity = "0";
          displayCanvas.style.opacity = "1";
          if (localSettings.filter === "custom" && localSettings.customFilterId) {
            const custom = customFilters.find((f) => f.id === localSettings.customFilterId);
            if (custom) engine.setFilter(custom.id, custom.content);
          } else {
            engine.setFilter(localSettings.filter);
          }
          engine.setIntensity(localSettings.filterIntensity);
        }
      }
    }, 800);

    return () => {
      clearTimeout(connectTimeout);
      try {
        (player as any).destroy?.();
        (player as any).remove?.();
      } catch {
        /* ignore */
      }
      try {
        if ((player as unknown as Node).parentNode === playerContainerRef.current) {
          playerContainerRef.current?.removeChild(player as unknown as Node);
        }
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      filterEngineRef.current?.dispose();
      filterEngineRef.current = null;
    };
  }, [open, ruffleLoaded, swfPath, findRuffleCanvas]);

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

  // Apply filter changes to the engine
  useEffect(() => {
    const engine = filterEngineRef.current;
    if (!engine) return;

    const sourceCanvas = findRuffleCanvas();
    if (sourceCanvas) engine.setSourceCanvas(sourceCanvas);

    if (localSettings.filter === "none") {
      engine.stop();
      // Show original, hide overlay
      const source = findRuffleCanvas();
      if (source) source.style.opacity = "1";
      if (displayCanvasRef.current) displayCanvasRef.current.style.opacity = "0";
      return;
    }

    // Hide original, show overlay
    const source = findRuffleCanvas();
    if (source) source.style.opacity = "0";
    if (displayCanvasRef.current) displayCanvasRef.current.style.opacity = "1";
    engine.start();

    if (localSettings.filter === "custom" && localSettings.customFilterId) {
      const custom = customFilters.find((f) => f.id === localSettings.customFilterId);
      if (custom) engine.setFilter(custom.id, custom.content);
    } else {
      engine.setFilter(localSettings.filter);
    }
    engine.setIntensity(localSettings.filterIntensity);
    engine.setPixelateSize(localSettings.pixelateSize);
    engine.setDitherLevels(localSettings.ditherLevels);
  }, [localSettings.filter, localSettings.filterIntensity, localSettings.customFilterId, localSettings.pixelateSize, localSettings.ditherLevels, customFilters, findRuffleCanvas]);

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
        if (axis === "right_z") axisState.right_z = norm;
        if (axis === "right_y") axisState.right_y = norm;
      }
    };

    const unsub = subscribeControllerEvents(onEvent);

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
          position: "relative",
        }}
      >
        <div
          ref={playerContainerRef}
          style={{
            width: localSettings.canvasSize === "window" ? "100%" : undefined,
            height: localSettings.canvasSize === "window" ? "100%" : undefined,
          }}
        />
        <canvas
          ref={displayCanvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: localSettings.filter === "none" ? 0 : 1,
            pointerEvents: "none",
            zIndex: 1,
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
              background: "var(--surface-1, #1a1a1a)",
              border: "1px solid var(--border-default, #333)",
              borderRadius: 12,
              padding: 16,
              zIndex: 3,
              color: "var(--text-primary, #fff)",
            }}
            className="gpu-scroll"
          >
            <h3 className="text-sm font-semibold mb-4">Flash Player Settings</h3>

            {/* Aspect Ratio */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                Aspect Ratio
              </label>
              <select
                value={localSettings.aspectRatio}
                onChange={(e) =>
                  saveSettings({ aspectRatio: e.target.value as FlashAspectRatio })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--surface-base, #000)",
                  border: "1px solid var(--border-default, #333)",
                  color: "var(--text-primary, #fff)",
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
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                Canvas Size
              </label>
              <select
                value={localSettings.canvasSize}
                onChange={(e) =>
                  saveSettings({ canvasSize: e.target.value as FlashCanvasSize })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--surface-base, #000)",
                  border: "1px solid var(--border-default, #333)",
                  color: "var(--text-primary, #fff)",
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
                      background: "var(--surface-base, #000)",
                      border: "1px solid var(--border-default, #333)",
                      color: "var(--text-primary, #fff)",
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
                      background: "var(--surface-base, #000)",
                      border: "1px solid var(--border-default, #333)",
                      color: "var(--text-primary, #fff)",
                      outline: "none",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Upscale Style */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                Upscaling Style
              </label>
              <select
                value={localSettings.upscaleStyle}
                onChange={(e) =>
                  saveSettings({ upscaleStyle: e.target.value as FlashUpscaleStyle })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--surface-base, #000)",
                  border: "1px solid var(--border-default, #333)",
                  color: "var(--text-primary, #fff)",
                  outline: "none",
                }}
              >
                <option value="none">None (Smooth)</option>
                <option value="gaussian">Gaussian (Soft blur)</option>
                <option value="pixelate">Pixelate (Crisp pixels)</option>
              </select>
            </div>

            {/* Visual Filter */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                Visual Filter
              </label>
              <select
                value={localSettings.filter === "custom" && localSettings.customFilterId ? `custom:${localSettings.customFilterId}` : localSettings.filter}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.startsWith("custom:")) {
                    saveSettings({ filter: "custom", customFilterId: value.slice(7) });
                  } else {
                    saveSettings({ filter: value as FlashFilterType });
                  }
                }}
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--surface-base, #000)",
                  border: "1px solid var(--border-default, #333)",
                  color: "var(--text-primary, #fff)",
                  outline: "none",
                }}
              >
                {BUILT_IN_FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
                {customFilters.length > 0 && (
                  <optgroup label="Custom">
                    {customFilters.map((f) => (
                      <option key={f.id} value={`custom:${f.id}`}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {localSettings.filter !== "none" && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Intensity
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={localSettings.filterIntensity}
                    onChange={(e) =>
                      saveSettings({ filterIntensity: parseFloat(e.target.value) })
                    }
                    className="flex-1 h-1 cursor-pointer"
                    style={{ accentColor: "var(--accent, #0af)" }}
                  />
                  <span className="text-xs tabular-nums w-8 text-right">
                    {Math.round(localSettings.filterIntensity * 100)}%
                  </span>
                </div>
              )}
              {localSettings.filter === "pixelate" && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Block Size
                  </span>
                  <select
                    value={localSettings.pixelateSize}
                    onChange={(e) =>
                      saveSettings({ pixelateSize: parseInt(e.target.value, 10) })
                    }
                    className="text-xs px-2 py-1 rounded flex-1"
                    style={{
                      background: "var(--surface-base, #000)",
                      border: "1px solid var(--border-default, #333)",
                      color: "var(--text-primary, #fff)",
                      outline: "none",
                    }}
                  >
                    <option value={2}>2 px</option>
                    <option value={4}>4 px</option>
                    <option value={8}>8 px</option>
                    <option value={12}>12 px</option>
                    <option value={16}>16 px</option>
                  </select>
                </div>
              )}
              {localSettings.filter === "dither" && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Levels
                  </span>
                  <input
                    type="range"
                    min={2}
                    max={16}
                    step={1}
                    value={localSettings.ditherLevels}
                    onChange={(e) =>
                      saveSettings({ ditherLevels: parseInt(e.target.value, 10) })
                    }
                    className="flex-1 h-1 cursor-pointer"
                    style={{ accentColor: "var(--accent, #0af)" }}
                  />
                  <span className="text-xs tabular-nums w-8 text-right">
                    {localSettings.ditherLevels}
                  </span>
                </div>
              )}
              <button
                onClick={() => void window.htpc.flashFilters.openDir()}
                className="mt-2 w-full text-xs py-1 rounded hover:bg-white/10 transition-colors"
                style={{
                  color: "var(--text-secondary)",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px dashed var(--border-default, #333)",
                }}
              >
                Open custom filters folder
              </button>
            </div>

            {/* Controller Input Mapping */}
            <div className="mb-4">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
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
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
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
                        background: "var(--surface-base, #000)",
                        border: "1px solid var(--border-default, #333)",
                        color: "var(--text-primary, #fff)",
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
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Stick to Mouse
                </span>
                <button
                  onClick={() => saveSettings({ stickToMouse: !localSettings.stickToMouse })}
                  className="w-9 h-5 rounded-full relative transition-colors"
                  style={{
                    background: localSettings.stickToMouse
                      ? "var(--accent, #0af)"
                      : "var(--surface-1, #333)",
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
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
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
                    style={{ accentColor: "var(--accent, #0af)" }}
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
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
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
              <p className="text-[10px] mt-1" style={{ color: "var(--text-secondary)" }}>
                AI-powered upscaling will be available in a future update.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
