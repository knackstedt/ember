import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CommandDefinition,
  CommandCategory,
  COMMAND_DEFINITIONS,
} from "../../../../shared/commands";

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
  { id: "south", label: "A / ✕ / B" },
  { id: "east", label: "B / ○ / A" },
  { id: "north", label: "Y / △ / X" },
  { id: "west", label: "X / □ / Y" },
  { id: "select", label: "Select / Back / View" },
  { id: "start", label: "Start / Menu" },
  { id: "left_bumper", label: "L1 / LB" },
  { id: "right_bumper", label: "R1 / RB" },
  { id: "dpad_up", label: "D-Pad Up" },
  { id: "dpad_down", label: "D-Pad Down" },
  { id: "dpad_left", label: "D-Pad Left" },
  { id: "dpad_right", label: "D-Pad Right" },
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
  else if (key.length === 1) displayKey = key.toUpperCase();

  parts.push(displayKey);
  return parts.join("+");
}

interface KeybindEditorProps {
  keybinds: Record<string, string>;
  controllerMap: Record<string, string>;
  onChangeKeybind: (cmdId: string, shortcut: string | undefined) => void;
  onChangeController: (cmdId: string, button: string | undefined) => void;
  onResetAll: () => void;
}

export const KeybindEditor: React.FC<KeybindEditorProps> = ({
  keybinds,
  controllerMap,
  onChangeKeybind,
  onChangeController,
  onResetAll,
}) => {
  const [search, setSearch] = useState("");
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [recordingControllerFor, setRecordingControllerFor] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  /* Keyboard shortcut capture */
  useEffect(() => {
    if (!recordingFor) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setRecordingFor(null);
        return;
      }
      const shortcut = normalizeShortcut(e);
      if (shortcut) {
        onChangeKeybind(recordingFor, shortcut);
      }
      setRecordingFor(null);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [recordingFor, onChangeKeybind]);

  const handleControllerPick = useCallback(
    (cmdId: string, buttonId: string) => {
      onChangeController(cmdId, buttonId);
      setRecordingControllerFor(null);
    },
    [onChangeController],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Search + Reset */}
      <div className="flex items-center gap-3">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search commands..."
          className="flex-1 px-3 py-2 rounded text-sm"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            outline: "none",
          }}
        />
        <button
          onClick={onResetAll}
          className="px-3 py-2 rounded text-sm font-medium"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-dim)",
          }}
        >
          Reset All
        </button>
      </div>

      {/* Command list */}
      <div
        className="flex flex-col gap-1 rounded overflow-hidden"
        style={{
          border: "1px solid var(--color-border)",
          maxHeight: "60vh",
          overflowY: "auto",
        }}
      >
        {grouped.map(({ category, commands }) => (
          <React.Fragment key={category}>
            <div
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{
                background: "var(--color-surface-raised)",
                color: "var(--color-text-dim)",
              }}
            >
              {CATEGORY_LABELS[category]}
            </div>
            {commands.map((cmd) => {
              const customKb = keybinds[cmd.id];
              const customCtrl = controllerMap[cmd.id];
              const isRecordingKb = recordingFor === cmd.id;
              const isRecordingCtrl = recordingControllerFor === cmd.id;

              return (
                <div
                  key={cmd.id}
                  className="flex items-center gap-3 px-3 py-2"
                  style={{
                    borderBottom: "1px solid var(--color-border)",
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
                  <div className="flex items-center gap-1">
                    {isRecordingKb ? (
                      <span
                        className="px-2 py-1 rounded text-xs animate-pulse"
                        style={{
                          background: "var(--color-accent)",
                          color: "var(--color-bg)",
                        }}
                      >
                        Press keys...
                      </span>
                    ) : (
                      <>
                        <kbd
                          className="px-2 py-1 rounded text-xs font-mono cursor-pointer"
                          style={{
                            background: customKb
                              ? "var(--color-accent)"
                              : "var(--color-surface-raised)",
                            color: customKb
                              ? "var(--color-bg)"
                              : "var(--color-text-dim)",
                            border: `1px solid ${customKb ? "var(--color-accent)" : "var(--color-border)"}`,
                          }}
                          onClick={() => setRecordingFor(cmd.id)}
                          title="Click to record new shortcut"
                        >
                          {customKb ?? cmd.defaultShortcut ?? "—"}
                        </kbd>
                        {(customKb || cmd.defaultShortcut) && (
                          <button
                            onClick={() => onChangeKeybind(cmd.id, undefined)}
                            className="text-xs px-1 rounded"
                            style={{ color: "var(--color-text-dim)" }}
                            title="Clear shortcut"
                          >
                            ✕
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Controller button */}
                  <div className="relative">
                    {isRecordingCtrl ? (
                      <div
                        className="absolute right-0 top-8 z-20 flex flex-col gap-0.5 p-1 rounded"
                        style={{
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                          minWidth: 160,
                        }}
                      >
                        {CONTROLLER_BUTTONS.map((btn) => (
                          <button
                            key={btn.id}
                            onClick={() => handleControllerPick(cmd.id, btn.id)}
                            className="text-left px-2 py-1 rounded text-xs"
                            style={{
                              color: "var(--color-text)",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                              (e.target as HTMLElement).style.background =
                                "var(--color-surface-raised)";
                            }}
                            onMouseLeave={(e) => {
                              (e.target as HTMLElement).style.background =
                                "transparent";
                            }}
                          >
                            {btn.label}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            onChangeController(cmd.id, undefined);
                            setRecordingControllerFor(null);
                          }}
                          className="text-left px-2 py-1 rounded text-xs"
                          style={{
                            color: "var(--color-text-dim)",
                            background: "transparent",
                            border: "none",
                            borderTop: "1px solid var(--color-border)",
                            cursor: "pointer",
                          }}
                        >
                          Clear mapping
                        </button>
                        <button
                          onClick={() => setRecordingControllerFor(null)}
                          className="text-left px-2 py-1 rounded text-xs"
                          style={{
                            color: "var(--color-text-dim)",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                    <button
                      onClick={() =>
                        setRecordingControllerFor(
                          recordingControllerFor === cmd.id ? null : cmd.id,
                        )
                      }
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{
                        background: customCtrl
                          ? "var(--color-accent)"
                          : "var(--color-surface-raised)",
                        color: customCtrl
                          ? "var(--color-bg)"
                          : "var(--color-text-dim)",
                        border: `1px solid ${customCtrl ? "var(--color-accent)" : "var(--color-border)"}`,
                        cursor: "pointer",
                        minWidth: 80,
                      }}
                      title="Click to assign controller button"
                    >
                      {customCtrl
                        ? CONTROLLER_BUTTONS.find((b) => b.id === customCtrl)
                            ?.label ?? customCtrl
                        : "🎮 —"}
                    </button>
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}

        {filtered.length === 0 && (
          <div
            className="px-3 py-6 text-center text-sm"
            style={{ color: "var(--color-text-dim)" }}
          >
            No commands found
          </div>
        )}
      </div>
    </div>
  );
};
