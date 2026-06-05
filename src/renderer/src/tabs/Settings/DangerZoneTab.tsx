import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../store/settings.store";
import { KeybindEditor } from "../../components/KeybindEditor/KeybindEditor";
import { Toggle } from "./shared";

export const DangerZoneTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);

  if (!settings) return null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
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
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Keybinds & Controller
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Click a shortcut to record a new keyboard combination. Click the controller button to assign a gamepad button.
        </p>
        <KeybindEditor
          keybinds={settings.commandKeybinds ?? {}}
          controllerMap={settings.commandControllerMap ?? {}}
          onChangeKeybind={(cmdId, shortcut) => {
            const next = { ...(settings.commandKeybinds ?? {}) };
            if (shortcut) next[cmdId] = shortcut;
            else delete next[cmdId];
            update({ commandKeybinds: next });
          }}
          onChangeController={(cmdId, button) => {
            const next = { ...(settings.commandControllerMap ?? {}) };
            if (button) next[cmdId] = button;
            else delete next[cmdId];
            update({ commandControllerMap: next });
          }}
          onResetAll={() => {
            update({ commandKeybinds: {}, commandControllerMap: {} });
          }}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Danger Zone
        </h2>

        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Removes all scanned games, movies, music, and TV shows from the
            database. Your settings and file paths will be preserved.
          </p>
          <AnimatePresence mode="wait">
            {clearConfirm ? (
              <motion.div
                key="clear-confirm"
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
                Clear Game Data
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Resets all configuration, keybinds, controller mappings, collections,
            and library data. Your actual game and media files will not be touched.
          </p>
          <AnimatePresence mode="wait">
            {clearAllConfirm ? (
              <motion.div
                key="clear-all-confirm"
                className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
              >
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  Reset everything to factory defaults?
                </span>
                <div className="flex gap-2">
                  <motion.button
                    className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "#e05252",
                      color: "#fff",
                    }}
                    onClick={async () => {
                      await window.htpc.db.clearAll();
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
                    onClick={() => setClearAllConfirm(false)}
                    whileTap={{ scale: 0.96 }}
                  >
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="clear-all"
                className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  background: "#ff444420",
                  color: "#ff4444",
                  border: "1px solid #ff444430",
                }}
                onClick={() => setClearAllConfirm(true)}
                whileTap={{ scale: 0.96 }}
              >
                Clear All Data
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
};
