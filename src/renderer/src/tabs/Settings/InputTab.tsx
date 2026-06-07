import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../store/settings.store";
import { KeybindEditor } from "../../components/KeybindEditor/KeybindEditor";
import { Keyboard, Gamepad2, AlertCircle, Info, Mouse, Globe, Sliders } from "lucide-react";

export const InputTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [activeSection, setActiveSection] = useState<"keyboard" | "controller" | "browser">("keyboard");

  if (!settings) return null;

  // Check for overmapping (same key mapped to multiple commands)
  const overmappedKeys = useMemo(() => {
    const keybinds = settings.commandKeybinds ?? {};
    const keyToCommands: Record<string, string[]> = {};

    Object.entries(keybinds).forEach(([cmdId, shortcut]) => {
      if (!shortcut) return;
      if (!keyToCommands[shortcut]) {
        keyToCommands[shortcut] = [];
      }
      keyToCommands[shortcut].push(cmdId);
    });

    return Object.entries(keyToCommands)
      .filter(([_, cmdIds]) => cmdIds.length > 1)
      .map(([key, cmdIds]) => ({ key, cmdIds }));
  }, [settings.commandKeybinds]);

  // Check for overmapped controller buttons
  const overmappedButtons = useMemo(() => {
    const controllerMap = settings.commandControllerMap ?? {};
    const buttonToCommands: Record<string, string[]> = {};

    Object.entries(controllerMap).forEach(([cmdId, button]) => {
      if (!button) return;
      if (!buttonToCommands[button]) {
        buttonToCommands[button] = [];
      }
      buttonToCommands[button].push(cmdId);
    });

    return Object.entries(buttonToCommands)
      .filter(([_, cmdIds]) => cmdIds.length > 1)
      .map(([button, cmdIds]) => ({ button, cmdIds }));
  }, [settings.commandControllerMap]);

  const hasOvermapping = overmappedKeys.length > 0 || overmappedButtons.length > 0;

  // Memoize callbacks to prevent effect re-runs during keybind recording
  const handleChangeKeybind = useCallback((cmdId: string, shortcut: string | undefined) => {
    const next = { ...(settings.commandKeybinds ?? {}) };
    if (shortcut) next[cmdId] = shortcut;
    else delete next[cmdId];
    update({ commandKeybinds: next });
  }, [settings.commandKeybinds, update]);

  const handleChangeController = useCallback((cmdId: string, button: string | undefined) => {
    const next = { ...(settings.commandControllerMap ?? {}) };
    if (button) next[cmdId] = button;
    else delete next[cmdId];
    update({ commandControllerMap: next });
  }, [settings.commandControllerMap, update]);

  const handleResetAll = useCallback(() => {
    update({ commandKeybinds: {}, commandControllerMap: {} });
  }, [update]);

  const handleBrowserSettingChange = useCallback((key: keyof NonNullable<typeof settings.controllerBrowser>, value: any) => {
    const current = settings.controllerBrowser ?? {
      snapToElement: true,
      snapDistance: 50,
      snapSelectors: ["button", "a", "input", "textarea", "select", "[role='button']"],
      mouseSpeed: 0.5,
      swapRightStickAxes: false,
      buttonRemapping: {},
    };
    update({
      controllerBrowser: {
        ...current,
        [key]: value,
      },
    });
  }, [settings, update]);

  return (
    <div className="flex flex-col gap-6">
      {/* Section Tabs */}
      <section className="flex flex-col gap-4" data-nav-orientation="horizontal">
        <div className="flex gap-2 p-1 rounded-[var(--radius-card)]" style={{ background: "var(--color-surface-raised)" }}>
          <motion.button
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
          style={{
            background: activeSection === "keyboard" ? "var(--color-accent)" : "transparent",
            color: activeSection === "keyboard" ? "var(--color-bg)" : "var(--color-text)",
          }}
          onClick={() => setActiveSection("keyboard")}
          whileTap={{ scale: 0.98 }}
        >
          <Keyboard size={16} />
          Keyboard
        </motion.button>
        <motion.button
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
          style={{
            background: activeSection === "controller" ? "var(--color-accent)" : "transparent",
            color: activeSection === "controller" ? "var(--color-bg)" : "var(--color-text)",
          }}
          onClick={() => setActiveSection("controller")}
          whileTap={{ scale: 0.98 }}
        >
          <Gamepad2 size={16} />
          Controller
        </motion.button>
        <motion.button
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
          style={{
            background: activeSection === "browser" ? "var(--color-accent)" : "transparent",
            color: activeSection === "browser" ? "var(--color-bg)" : "var(--color-text)",
          }}
          onClick={() => setActiveSection("browser")}
          whileTap={{ scale: 0.98 }}
        >
          <Globe size={16} />
          Browser
        </motion.button>
      </div>
      </section>

      {/* Overmapping Warnings */}
      <AnimatePresence>
        {hasOvermapping && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-2 p-4 rounded-[var(--radius-card)]"
            style={{
              background: "color-mix(in srgb, #ff4444 15%, var(--color-surface-raised))",
              border: "1px solid #ff444430",
            }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={18} style={{ color: "#ff4444" }} />
              <span className="font-medium" style={{ color: "#ff6666" }}>
                Overmapping Detected
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
              Multiple commands are mapped to the same {overmappedKeys.length > 0 && overmappedButtons.length > 0 ? "keys and buttons" : overmappedKeys.length > 0 ? "keys" : "buttons"}. This may cause unexpected behavior.
            </p>
            {overmappedKeys.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {overmappedKeys.map(({ key, cmdIds }) => (
                  <div key={key} className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                    <span className="font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface)" }}>{key}</span>
                    {" → "}
                    {cmdIds.length} commands
                  </div>
                ))}
              </div>
            )}
            {overmappedButtons.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {overmappedButtons.map(({ button, cmdIds }) => (
                  <div key={button} className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                    <span className="font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface)" }}>{button}</span>
                    {" → "}
                    {cmdIds.length} commands
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Box */}
      <div className="flex items-start gap-3 p-3 rounded-[var(--radius-card)]" style={{ background: "var(--color-surface-raised)" }}>
        <Info size={16} style={{ color: "var(--color-accent)", marginTop: 2 }} />
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Click a shortcut to record a new keyboard combination. Press <kbd className="px-1 py-0.5 rounded text-xs font-mono" style={{ background: "var(--color-surface)" }}>Escape</kbd> to cancel recording.
          For controller, click the button column to assign or change a gamepad button.
        </p>
      </div>

      {/* Keybind Editor */}
      {activeSection !== "browser" && (
        <section className="flex flex-col gap-4">
          <KeybindEditor
            keybinds={settings.commandKeybinds ?? {}}
            controllerMap={settings.commandControllerMap ?? {}}
            activeTab={activeSection}
            onChangeKeybind={handleChangeKeybind}
            onChangeController={handleChangeController}
            onResetAll={handleResetAll}
          />
        </section>
      )}

      {/* Browser Controller Settings */}
      {activeSection === "browser" && (
        <section className="flex flex-col gap-6">
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-card)]" style={{ background: "var(--color-surface-raised)" }}>
            <Info size={16} style={{ color: "var(--color-accent)", marginTop: 2 }} />
            <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
              Configure controller navigation for web browsers (Store tab). Right stick moves mouse, A/RT left click, X/LT right click, B back, Y forward, left stick scroll, D-pad arrows, bumpers tab navigation.
            </p>
          </div>

          {/* Snap to Element */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Mouse size={16} style={{ color: "var(--color-accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Snap to Element
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.controllerBrowser?.snapToElement ?? true}
                  onChange={(e) => handleBrowserSettingChange("snapToElement", e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: "var(--color-accent)" }}
                />
                <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
                  Enable snap-to-element on left click
                </span>
              </label>
            </div>
          </div>

          {/* Snap Distance */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sliders size={16} style={{ color: "var(--color-accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Snap Distance
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={settings.controllerBrowser?.snapDistance ?? 50}
                onChange={(e) => handleBrowserSettingChange("snapDistance", parseInt(e.target.value))}
                className="flex-1 h-2 rounded-lg cursor-pointer"
                style={{ accentColor: "var(--color-accent)" }}
              />
              <span className="text-sm w-12 text-right" style={{ color: "var(--color-text-dim)" }}>
                {settings.controllerBrowser?.snapDistance ?? 50}px
              </span>
            </div>
          </div>

          {/* Mouse Speed */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Gamepad2 size={16} style={{ color: "var(--color-accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Mouse Speed
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.1"
                max="3.0"
                step="0.1"
                value={settings.controllerBrowser?.mouseSpeed ?? 0.5}
                onChange={(e) => handleBrowserSettingChange("mouseSpeed", parseFloat(e.target.value))}
                className="flex-1 h-2 rounded-lg cursor-pointer"
                style={{ accentColor: "var(--color-accent)" }}
              />
              <span className="text-sm w-12 text-right" style={{ color: "var(--color-text-dim)" }}>
                {settings.controllerBrowser?.mouseSpeed ?? 0.5}x
              </span>
            </div>
          </div>

          {/* Swap Right Stick Axes */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Gamepad2 size={16} style={{ color: "var(--color-accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Right Stick Axis Mapping
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.controllerBrowser?.swapRightStickAxes ?? false}
                  onChange={(e) => handleBrowserSettingChange("swapRightStickAxes", e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: "var(--color-accent)" }}
                />
                <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
                  Swap axes (try this if cursor moves wrong direction)
                </span>
              </label>
            </div>
            <p className="text-xs" style={{ color: "var(--color-text-dim)" }}>
              Default: axis 2 = horizontal, axis 3 = vertical. Enable to swap to axis 3 = horizontal, axis 2 = vertical.
            </p>
          </div>

          {/* Snap Selectors */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Globe size={16} style={{ color: "var(--color-accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Snap CSS Selectors
              </span>
            </div>
            <textarea
              value={(settings.controllerBrowser?.snapSelectors ?? ["button", "a", "input", "textarea", "select", "[role='button']"]).join("\n")}
              onChange={(e) => {
                const selectors = e.target.value.split("\n").filter(s => s.trim());
                handleBrowserSettingChange("snapSelectors", selectors);
              }}
              placeholder="button&#10;a&#10;input&#10;textarea&#10;select&#10;[role='button']"
              className="w-full p-3 rounded-[var(--radius-card)] text-sm font-mono resize-none"
              style={{
                background: "var(--color-surface)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                minHeight: "120px",
              }}
              rows={6}
            />
            <p className="text-xs" style={{ color: "var(--color-text-dim)" }}>
              CSS selectors for elements to snap to (one per line)
            </p>
          </div>
        </section>
      )}
    </div>
  );
};
