import React, { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { subscribeControllerEvents } from "../../hooks/useControllerWorker";

interface OnScreenKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit?: (value: string) => void;
  label?: string;
  /** When set, only respond to events from this controller device */
  deviceId?: string;
  /** HTML input type (used for password masking) */
  inputType?: string;
  /** Accent hue for this controller's keyboard */
  hue?: number;
  /** Optional value masking function (e.g. for password dots) */
  maskValue?: (value: string, inputType: string) => string;
}

type KeyMode = "normal" | "shift" | "symbol";

const ROWS: Record<KeyMode, string[][]> = {
  normal: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
    [" ", "DEL", "OK"],
  ],
  shift: [
    ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
    [" ", "DEL", "OK"],
  ],
  symbol: [
    ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
    ["-", "_", "=", "+", "[", "]", "{", "}", "\\", "|"],
    [";", ":", "'", "\"", ",", ".", "<", ">", "/", "?"],
    ["~", "`", "\u00A3", "\u20AC", "\u00A5", "\u00A9", "\u00AE", "\u2122"],
    [" ", "DEL", "OK"],
  ],
};

const MODE_CYCLE: KeyMode[] = ["normal", "shift", "symbol"];

export const OnScreenKeyboard: React.FC<OnScreenKeyboardProps> = ({
  value,
  onChange,
  onClose,
  onSubmit,
  label,
  deviceId,
  inputType = "text",
  hue = 22,
  maskValue,
}) => {
  const [mode, setMode] = useState<KeyMode>("normal");
  const [focusedKey, setFocusedKey] = useState<[number, number]>([0, 0]);
  const rows = ROWS[mode];

  const accentColor = `hsl(${hue}, 100%, 60%)`;

  const handleKey = useCallback(
    (key: string) => {
      if (key === "DEL") {
        onChange(value.slice(0, -1));
      } else if (key === "OK") {
        onClose();
      } else if (key === " ") {
        onChange(value + " ");
      } else {
        onChange(value + key);
        if (mode === "shift") setMode("normal");
      }
    },
    [value, onChange, onClose, mode],
  );

  const focusedKeyRef = useRef<[number, number]>(focusedKey);
  focusedKeyRef.current = focusedKey;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const valueRef = useRef(value);
  valueRef.current = value;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;

  // Axis navigation state (left stick emulates dpad with cooldown)
  const axisNavCooldownRef = useRef(0);

  useEffect(() => {
    const AXIS_NAV_COOLDOWN_MS = 180;
    const AXIS_NAV_THRESHOLD = 0.5;

    const unsub = subscribeControllerEvents((ev) => {
      if (deviceId && ev.deviceId !== deviceId) return;

      // Axis navigation (left stick + dpad axes)
      if (ev.type === "axis") {
        const navAxes = ["left_x", "left_y", "dpad_x", "dpad_y"];
        if (!navAxes.includes(ev.axis)) return;
        const now = Date.now();
        if (now - axisNavCooldownRef.current < AXIS_NAV_COOLDOWN_MS) return;

        const r = rowsRef.current;
        const [row, col] = focusedKeyRef.current;
        const getRowLen = (ri: number): number =>
          r[ri].length + (ri === r.length - 1 ? 1 : 0);

        let next: [number, number] | null = null;

        if (ev.axis === "left_y" || ev.axis === "dpad_y") {
          if (ev.value < -AXIS_NAV_THRESHOLD) {
            const newRow = Math.max(0, row - 1);
            next = [newRow, Math.min(col, getRowLen(newRow) - 1)];
          } else if (ev.value > AXIS_NAV_THRESHOLD) {
            const newRow = Math.min(r.length - 1, row + 1);
            next = [newRow, Math.min(col, getRowLen(newRow) - 1)];
          }
        } else if (ev.axis === "left_x" || ev.axis === "dpad_x") {
          if (ev.value < -AXIS_NAV_THRESHOLD) {
            next = [row, Math.max(0, col - 1)];
          } else if (ev.value > AXIS_NAV_THRESHOLD) {
            next = [row, Math.min(getRowLen(row) - 1, col + 1)];
          }
        }

        if (next) {
          axisNavCooldownRef.current = now;
          focusedKeyRef.current = next;
          setFocusedKey(next);
        }
        return;
      }

      // Button press handling
      if (ev.type !== "button_press") return;
      const r = rowsRef.current;
      const [row, col] = focusedKeyRef.current;
      const getRowLen = (ri: number): number =>
        r[ri].length + (ri === r.length - 1 ? 1 : 0);

      if (ev.action === "dpad_up") {
        const newRow = Math.max(0, row - 1);
        const next: [number, number] = [
          newRow,
          Math.min(col, getRowLen(newRow) - 1),
        ];
        focusedKeyRef.current = next;
        setFocusedKey(next);
      } else if (ev.action === "dpad_down") {
        const newRow = Math.min(r.length - 1, row + 1);
        const next: [number, number] = [
          newRow,
          Math.min(col, getRowLen(newRow) - 1),
        ];
        focusedKeyRef.current = next;
        setFocusedKey(next);
      } else if (ev.action === "dpad_left") {
        const next: [number, number] = [row, Math.max(0, col - 1)];
        focusedKeyRef.current = next;
        setFocusedKey(next);
      } else if (ev.action === "dpad_right") {
        const next: [number, number] = [
          row,
          Math.min(getRowLen(row) - 1, col + 1),
        ];
        focusedKeyRef.current = next;
        setFocusedKey(next);
      } else if (ev.action === "south") {
        if (row === r.length - 1 && col === 0) {
          // Cycle mode on SHIFT position
          const idx = MODE_CYCLE.indexOf(modeRef.current);
          setModeRef.current(MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]);
        } else {
          const keyCol = row === r.length - 1 ? col - 1 : col;
          handleKeyRef.current(r[row][keyCol]);
        }
      } else if (ev.action === "east") {
        onCloseRef.current();
      } else if (ev.action === "west") {
        handleKeyRef.current("DEL");
      } else if (ev.action === "start") {
        onSubmitRef.current?.(valueRef.current);
      } else if (ev.action === "select") {
        onCloseRef.current();
      } else if (ev.action === "left_bumper") {
        const idx = MODE_CYCLE.indexOf(modeRef.current);
        setModeRef.current(MODE_CYCLE[(idx - 1 + MODE_CYCLE.length) % MODE_CYCLE.length]);
      } else if (ev.action === "right_bumper") {
        const idx = MODE_CYCLE.indexOf(modeRef.current);
        setModeRef.current(MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]);
      }
    });
    return () => { unsub(); };
  }, [deviceId]);

  const displayValue = maskValue
    ? maskValue(value, inputType)
    : value || "_";

  const modeLabel = mode === "normal" ? "abc" : mode === "shift" ? "ABC" : "!#";

  return (
    <motion.div
      data-controller-osk="true"
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="pointer-events-auto p-3 rounded-[var(--radius-panel)]"
      style={{
        background: "var(--surface-2)",
        backdropFilter: "blur(var(--blur-panel))",
        border: `1px solid ${accentColor}`,
        boxShadow: `0 0 20px ${accentColor}33`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: accentColor }}
        />
        {label && (
          <div
            className="text-sm opacity-60"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </div>
        )}
        <div className="ml-auto text-xs opacity-40 font-mono" style={{ color: "var(--text-secondary)" }}>
          {modeLabel}
        </div>
      </div>

      <div
        className="mb-3 px-3 py-2 rounded-[var(--radius-card)] font-mono text-base truncate"
        style={{
          background: "var(--surface-1)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-default)",
          minHeight: "2.5rem",
        }}
      >
        {displayValue}
      </div>

      <div className="flex flex-col gap-2 items-center">
        {rows.map((row, ri) => (
          <div key={ri} className="flex gap-1.5 justify-center">
            {ri === rows.length - 1 && (
              <motion.button
                className="px-4 py-2.5 rounded text-sm font-bold transition-transform"
                style={{
                  background: mode !== "normal"
                    ? accentColor
                    : "var(--surface-1)",
                  color: mode !== "normal" ? "var(--surface-base)" : "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  minWidth: "3rem",
                  ...(focusedKey[0] === rows.length - 1 && focusedKey[1] === 0
                    ? { boxShadow: `0 0 0 2px ${accentColor}`, transform: "scale(1.1)" }
                    : {}),
                }}
                onClick={() => {
                  const idx = MODE_CYCLE.indexOf(mode);
                  setMode(MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]);
                }}
                whileTap={{ scale: 0.92 }}
              >
                {modeLabel}
              </motion.button>
            )}
            {row.map((key, ki) => {
              const isFocused =
                focusedKey[0] === ri &&
                focusedKey[1] === (ri === rows.length - 1 ? ki + 1 : ki);
              return (
                <motion.button
                  key={key}
                  className="px-3 py-2.5 rounded text-sm font-medium transition-transform"
                  style={{
                    background:
                      key === "OK"
                        ? accentColor
                        : "var(--surface-1)",
                    color:
                      key === "OK" ? "var(--surface-base)" : "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                    minWidth: key === " " ? "8rem" : "2.5rem",
                    ...(isFocused
                      ? { boxShadow: `0 0 0 2px ${accentColor}`, transform: "scale(1.1)" }
                      : {}),
                  }}
                  onClick={() => handleKey(key)}
                  whileTap={{ scale: 0.92 }}
                >
                  {key === " " ? "SPACE" : key}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Controller button hints bar */}
      <div
        className="mt-3 flex items-center justify-between px-1 text-[10px] uppercase tracking-wider"
        style={{ color: "var(--text-secondary)", opacity: 0.5 }}
      >
        <div className="flex gap-3">
          <span><span style={{ color: accentColor }}>A</span> Type</span>
          <span><span style={{ color: accentColor }}>X</span> Del</span>
          <span><span style={{ color: accentColor }}>B</span> Close</span>
        </div>
        <div className="flex gap-3">
          <span><span style={{ color: accentColor }}>LB</span> Prev</span>
          <span><span style={{ color: accentColor }}>RB</span> Next</span>
          <span><span style={{ color: accentColor }}>Start</span> Submit</span>
        </div>
      </div>
    </motion.div>
  );
};

interface OskInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  showOskFromGamepad?: boolean;
}

export const OskInput: React.FC<OskInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
  style,
  showOskFromGamepad = false,
}) => {
  const [showOsk, setShowOsk] = useState(false);

  return (
    <>
      <input
        type="text"
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit?.(value)}
        onFocus={() => {
          if (showOskFromGamepad) setShowOsk(true);
        }}
        placeholder={placeholder}
        style={{
          background: "var(--surface-1)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: "0.5rem 0.75rem",
          width: "100%",
          outline: "none",
          ...style,
        }}
      />
      <AnimatePresence>
        {showOsk && (
          <OnScreenKeyboard
            value={value}
            onChange={onChange}
            onClose={() => setShowOsk(false)}
            onSubmit={onSubmit}
            label={placeholder}
          />
        )}
      </AnimatePresence>
    </>
  );
};
