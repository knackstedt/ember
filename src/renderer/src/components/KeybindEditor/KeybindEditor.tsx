import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Gamepad2, Keyboard, AlertCircle } from "lucide-react";
import {
  CommandDefinition,
  CommandCategory,
  COMMAND_DEFINITIONS,
} from "../../../../shared/commands";
import { useCommandsStore } from "../../store/commands.store";

const CATEGORY_ORDER: CommandCategory[] = [
  "global",
  "navigation",
  "gaming",
  "movies",
  "music",
  "tv",
  "player",
  "visual",
  "settings",
];

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  global: "Global",
  navigation: "Navigation",
  gaming: "Gaming",
  movies: "Movies",
  music: "Music",
  tv: "TV Shows",
  player: "Player",
  visual: "Visual",
  settings: "Settings",
};

const CONTROLLER_BUTTONS = [
  { id: "south", label: "A / X / B" },
  { id: "east", label: "B / O / A" },
  { id: "north", label: "Y / Δ / X" },
  { id: "west", label: "X / [] / Y" },
  { id: "select", label: "Select / Back / View" },
  { id: "start", label: "Start / Menu" },
  { id: "left_bumper", label: "L1 / LB" },
  { id: "right_bumper", label: "R1 / RB" },
  { id: "dpad_up", label: "D-Pad Up" },
  { id: "dpad_down", label: "D-Pad Down" },
  { id: "dpad_left", label: "D-Pad Left" },
  { id: "dpad_right", label: "D-Pad Right" },
  { id: "left_trigger", label: "LT / L2" },
  { id: "right_trigger", label: "RT / R2" },
  { id: "left_thumb", label: "LS / L3" },
  { id: "right_thumb", label: "RS / R3" },
  { id: "home", label: "Home / Xbox / PS" },
];

function normalizeShortcut(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");

  const key = e.key;
  if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") {
    return parts.join("+");
  }

  // Use key names for special keys, literal for others
  let displayKey = key;
  if (key.startsWith("F") && key.length > 1 && /^F\d+$/.test(key)) {
    displayKey = key;
  } else if (key === "Escape") displayKey = "Escape";
  else if (key === "Enter") displayKey = "Enter";
  else if (key === "Tab") displayKey = "Tab";
  else if (key === "Backspace") displayKey = "Backspace";
  else if (key === "Delete") displayKey = "Delete";
  else if (key === "ArrowUp") displayKey = "ArrowUp";
  else if (key === "ArrowDown") displayKey = "ArrowDown";
  else if (key === "ArrowLeft") displayKey = "ArrowLeft";
  else if (key === "ArrowRight") displayKey = "ArrowRight";
  else if (key === " ") displayKey = "Space";
  else if (key === "PageUp") displayKey = "PageUp";
  else if (key === "PageDown") displayKey = "PageDown";
  else if (key === "Home") displayKey = "Home";
  else if (key === "End") displayKey = "End";
  else if (key === "Insert") displayKey = "Insert";
  else if (key.length === 1) displayKey = key.toUpperCase();

  parts.push(displayKey);
  return parts.join("+");
}

interface KeybindEditorProps {
  keybinds: Record<string, string>;
  controllerMap: Record<string, string>;
  activeTab?: "keyboard" | "controller";
  onChangeKeybind: (cmdId: string, shortcut: string | undefined) => void;
  onChangeController: (cmdId: string, button: string | undefined) => void;
  onResetAll: () => void;
}

export const KeybindEditor: React.FC<KeybindEditorProps> = ({
  keybinds,
  controllerMap,
  activeTab = "keyboard",
  onChangeKeybind,
  onChangeController,
  onResetAll,
}) => {
  const [search, setSearch] = useState("");
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [recordingControllerFor, setRecordingControllerFor] = useState<string | null>(null);
  const [pressedKeys, setPressedKeys] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Detect duplicate keybinds (overmapping)
  const duplicateKeybinds = useMemo(() => {
    const keyToCommands: Record<string, string[]> = {};
    Object.entries(keybinds).forEach(([cmdId, shortcut]) => {
      if (!shortcut) return;
      if (!keyToCommands[shortcut]) {
        keyToCommands[shortcut] = [];
      }
      keyToCommands[shortcut].push(cmdId);
    });
    return Object.fromEntries(
      Object.entries(keyToCommands).filter(([_, cmds]) => cmds.length > 1)
    );
  }, [keybinds]);

  // Detect duplicate controller mappings
  const duplicateControllerMappings = useMemo(() => {
    const buttonToCommands: Record<string, string[]> = {};
    Object.entries(controllerMap).forEach(([cmdId, button]) => {
      if (!button) return;
      if (!buttonToCommands[button]) {
        buttonToCommands[button] = [];
      }
      buttonToCommands[button].push(cmdId);
    });
    return Object.fromEntries(
      Object.entries(buttonToCommands).filter(([_, cmds]) => cmds.length > 1)
    );
  }, [controllerMap]);

  const filtered = COMMAND_DEFINITIONS.filter((cmd) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      (cmd.description ?? "").toLowerCase().includes(q)
    );
  });

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    commands: filtered.filter((c) => c.category === cat),
  })).filter((g) => g.commands.length > 0);

  /* Keyboard shortcut capture with real-time preview */
  const capturedShortcutRef = useRef<string | null>(null);

  useEffect(() => {
    if (!recordingFor) return;

    // Reset captured shortcut when starting a new recording
    capturedShortcutRef.current = null;

    const keyDownHandler = (e: KeyboardEvent) => {
      e.preventDefault();

      if (e.key === "Escape") {
        setRecordingFor(null);
        setPressedKeys([]);
        capturedShortcutRef.current = null;
        return;
      }

      // Build preview of current combination
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Meta");

      // Don't add modifier keys to the combination itself
      if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        let displayKey = e.key;
        if (e.key === " ") displayKey = "Space";
        else if (e.key.length === 1) displayKey = e.key.toUpperCase();
        parts.push(displayKey);

        // Capture the shortcut but DON'T save yet - wait for keyup
        const shortcut = parts.join("+");
        capturedShortcutRef.current = shortcut;
        setPressedKeys(parts);
        return;
      }

      setPressedKeys(parts);
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      e.preventDefault();

      // When all modifier keys are released
      if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        const shortcut = capturedShortcutRef.current;
        // Only save if we captured a valid shortcut (with a non-modifier key)
        if (shortcut && shortcut !== "Escape") {
          onChangeKeybind(recordingFor, shortcut);
        }
        setRecordingFor(null);
        setPressedKeys([]);
        capturedShortcutRef.current = null;
      }
    };

    window.addEventListener("keydown", keyDownHandler, { capture: true });
    window.addEventListener("keyup", keyUpHandler, { capture: true });

    return () => {
      window.removeEventListener("keydown", keyDownHandler, { capture: true });
      window.removeEventListener("keyup", keyUpHandler, { capture: true });
    };
  }, [recordingFor, onChangeKeybind]);

  /* Suspend command execution while recording to prevent triggering commands */
  useEffect(() => {
    const { suspendCommands, resumeCommands } = useCommandsStore.getState();

    if (recordingFor) {
      suspendCommands();
    } else {
      resumeCommands();
    }

    // Cleanup: always resume commands when component unmounts or recording stops
    return () => {
      resumeCommands();
    };
  }, [recordingFor]);

  const handleControllerPick = useCallback(
    (cmdId: string, buttonId: string) => {
      onChangeController(cmdId, buttonId);
      setRecordingControllerFor(null);
    },
    [onChangeController],
  );

  const isDuplicateKeybind = (shortcut: string | undefined, cmdId: string) => {
    if (!shortcut) return false;
    const duplicates = duplicateKeybinds[shortcut];
    return duplicates && duplicates.length > 1 && duplicates.includes(cmdId);
  };

  const isDuplicateController = (button: string | undefined, cmdId: string) => {
    if (!button) return false;
    const duplicates = duplicateControllerMappings[button];
    return duplicates && duplicates.length > 1 && duplicates.includes(cmdId);
  };

  const showKeyboard = activeTab === "keyboard";
  const showController = activeTab === "controller";

  return (
    <div className="flex flex-col gap-4">
      {/* Search + Reset */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands..."
            className="w-full px-3 py-2 rounded text-sm pl-9"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              outline: "none",
            }}
          />
          <Keyboard
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-dim)" }}
          />
        </div>
        <motion.button
          onClick={onResetAll}
          className="px-3 py-2 rounded text-sm font-medium"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-dim)",
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Reset All
        </motion.button>
      </div>

      {/* Duplicate warnings summary */}
      {(Object.keys(duplicateKeybinds).length > 0 || Object.keys(duplicateControllerMappings).length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-2 p-3 rounded-[var(--radius-card)]"
          style={{
            background: "color-mix(in srgb, #ff9800 15%, var(--color-surface-raised))",
            border: "1px solid #ff980040",
          }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={16} style={{ color: "#ff9800" }} />
            <span className="text-sm font-medium" style={{ color: "#ffb74d" }}>
              Duplicate mappings detected
            </span>
          </div>
        </motion.div>
      )}

      {/* Command list */}
      <div
        className="flex flex-col gap-1 rounded-[var(--radius-card)] overflow-hidden"
        style={{
          border: "1px solid var(--color-border)",
          maxHeight: "60vh",
          overflowY: "auto",
        }}
      >
        {grouped.map(({ category, commands }) => (
          <React.Fragment key={category}>
            <div
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider sticky top-0"
              style={{
                background: "var(--color-surface-raised)",
                color: "var(--color-text-dim)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {CATEGORY_LABELS[category]}
            </div>
            {commands.map((cmd) => {
              const customKb = keybinds[cmd.id];
              const customCtrl = controllerMap[cmd.id];
              const isRecordingKb = recordingFor === cmd.id;
              const isRecordingCtrl = recordingControllerFor === cmd.id;
              const kbDuplicate = isDuplicateKeybind(customKb, cmd.id);
              const ctrlDuplicate = isDuplicateController(customCtrl, cmd.id);

              return (
                <motion.div
                  key={cmd.id}
                  layout
                  className="flex items-center gap-3 px-3 py-2.5"
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--color-text)" }}
                    >
                      {cmd.label}
                    </div>
                    {cmd.description && (
                      <div
                        className="text-xs truncate"
                        style={{ color: "var(--color-text-dim)" }}
                      >
                        {cmd.description}
                      </div>
                    )}
                  </div>

                  {/* Keyboard shortcut */}
                  {showKeyboard && (
                    <div className="flex items-center gap-1">
                      {isRecordingKb ? (
                        <motion.span
                          initial={{ scale: 0.9 }}
                          animate={{ scale: 1 }}
                          className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-2"
                          style={{
                            background: "var(--color-accent)",
                            color: "var(--color-bg)",
                          }}
                        >
                          <span className="animate-pulse">
                            {pressedKeys.length > 0 ? pressedKeys.join("+") : "Press keys..."}
                          </span>
                        </motion.span>
                      ) : (
                        <>
                          <motion.kbd
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-2.5 py-1.5 rounded text-xs font-mono cursor-pointer transition-colors"
                            style={{
                              background: customKb
                                ? kbDuplicate
                                  ? "color-mix(in srgb, #ff9800 70%, var(--color-accent))"
                                  : "var(--color-accent)"
                                : "var(--color-surface-raised)",
                              color: customKb
                                ? "var(--color-bg)"
                                : "var(--color-text-dim)",
                              border: `1px solid ${customKb
                                ? kbDuplicate ? "#ff9800" : "var(--color-accent)"
                                : "var(--color-border)"}`,
                              boxShadow: customKb
                                ? "0 2px 4px rgba(0,0,0,0.2)"
                                : "none",
                            }}
                            onClick={() => setRecordingFor(cmd.id)}
                            title={kbDuplicate ? "Duplicate mapping! Click to change" : "Click to record new shortcut"}
                          >
                            {customKb ?? cmd.defaultShortcut ?? "—"}
                          </motion.kbd>
                          {(customKb || cmd.defaultShortcut) && (
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => onChangeKeybind(cmd.id, undefined)}
                              className="p-1 rounded"
                              style={{
                                color: "var(--color-text-dim)",
                                background: "transparent",
                              }}
                              title="Clear shortcut"
                            >
                              <X size={14} />
                            </motion.button>
                          )}
                          {kbDuplicate && (
                            <AlertCircle size={14} style={{ color: "#ff9800" }} />
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Controller button */}
                  {showController && (
                    <div className="relative">
                      <AnimatePresence>
                        {isRecordingCtrl && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 5 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 5 }}
                            className="absolute right-0 top-10 z-20 flex flex-col gap-0.5 p-2 rounded-[var(--radius-card)]"
                            style={{
                              background: "var(--color-surface)",
                              border: "1px solid var(--color-border)",
                              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                              minWidth: 180,
                              maxHeight: 300,
                              overflowY: "auto",
                            }}
                          >
                            <div className="text-xs font-medium px-2 py-1" style={{ color: "var(--color-text-dim)" }}>
                              Select button
                            </div>
                            {CONTROLLER_BUTTONS.map((btn) => (
                              <motion.button
                                key={btn.id}
                                whileHover={{ backgroundColor: "var(--color-surface-raised)" }}
                                onClick={() => handleControllerPick(cmd.id, btn.id)}
                                className="text-left px-2 py-1.5 rounded text-xs flex items-center justify-between"
                                style={{
                                  color: "var(--color-text)",
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                }}
                              >
                                <span>{btn.label}</span>
                                {controllerMap[cmd.id] === btn.id && (
                                  <span style={{ color: "var(--color-accent)" }}>✓</span>
                                )}
                              </motion.button>
                            ))}
                            <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />
                            <motion.button
                              whileHover={{ backgroundColor: "var(--color-surface-raised)" }}
                              onClick={() => {
                                onChangeController(cmd.id, undefined);
                                setRecordingControllerFor(null);
                              }}
                              className="text-left px-2 py-1.5 rounded text-xs"
                              style={{
                                color: "var(--color-text-dim)",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                              }}
                            >
                              Clear mapping
                            </motion.button>
                            <motion.button
                              whileHover={{ backgroundColor: "var(--color-surface-raised)" }}
                              onClick={() => setRecordingControllerFor(null)}
                              className="text-left px-2 py-1.5 rounded text-xs"
                              style={{
                                color: "var(--color-text-dim)",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() =>
                          setRecordingControllerFor(
                            recordingControllerFor === cmd.id ? null : cmd.id,
                          )
                        }
                        className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-colors"
                        style={{
                          background: customCtrl
                            ? ctrlDuplicate
                              ? "color-mix(in srgb, #ff9800 70%, var(--color-accent))"
                              : "var(--color-accent)"
                            : "var(--color-surface-raised)",
                          color: customCtrl
                            ? "var(--color-bg)"
                            : "var(--color-text-dim)",
                          border: `1px solid ${customCtrl
                            ? ctrlDuplicate ? "#ff9800" : "var(--color-accent)"
                            : "var(--color-border)"}`,
                          cursor: "pointer",
                          minWidth: 100,
                          boxShadow: customCtrl
                            ? "0 2px 4px rgba(0,0,0,0.2)"
                            : "none",
                        }}
                        title={ctrlDuplicate ? "Duplicate mapping! Click to change" : "Click to assign controller button"}
                      >
                        <Gamepad2 size={14} />
                        <span>
                          {customCtrl
                            ? CONTROLLER_BUTTONS.find((b) => b.id === customCtrl)
                                ?.label ?? customCtrl
                            : "—"}
                        </span>
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </React.Fragment>
        ))}

        {filtered.length === 0 && (
          <div
            className="px-3 py-8 text-center text-sm flex flex-col items-center gap-2"
            style={{ color: "var(--color-text-dim)" }}
          >
            <Keyboard size={24} style={{ opacity: 0.5 }} />
            No commands found
          </div>
        )}
      </div>
    </div>
  );
};
