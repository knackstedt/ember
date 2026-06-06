import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../store/settings.store";
import { KeybindEditor } from "../../components/KeybindEditor/KeybindEditor";
import { Keyboard, Gamepad2, AlertCircle, Info } from "lucide-react";

export const InputTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [activeSection, setActiveSection] = useState<"keyboard" | "controller">("keyboard");

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
    </div>
  );
};
