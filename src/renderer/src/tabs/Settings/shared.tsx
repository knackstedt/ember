import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import {
  ThemeName,
  FlashAspectRatio,
  FlashCanvasSize,
  FlashUpscaleStyle,
  FlashSettings,
} from "../../../../shared/types";

export const DEFAULT_FLASH_SETTINGS: FlashSettings = {
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

export function getFlashSettings(settings?: Partial<FlashSettings>): FlashSettings {
  return { ...DEFAULT_FLASH_SETTINGS, ...settings };
}

export const THEMES: { id: ThemeName; label: string; preview: string }[] = [
  { id: "dark-oled", label: "Dark OLED", preview: "#000" },
  {
    id: "glassmorphism",
    label: "Glassmorphism",
    preview: "linear-gradient(135deg,#0d1117,#1e3a5f)",
  },
  {
    id: "neon-cyberpunk",
    label: "Neon Cyberpunk",
    preview: "linear-gradient(135deg,#07070f,#ff2d78)",
  },
  {
    id: "terminal-tui",
    label: "Terminal TUI",
    preview: "linear-gradient(135deg,#0c0c0c,#004400)",
  },
  { id: "custom", label: "Custom", preview: "var(--color-surface-raised)" },
];

export function PathList({
  label,
  paths,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  paths: string[];
  onChange: (p: string[]) => void;
  placeholder?: string;
  hint?: string;
}): React.ReactElement {
  const [newPath, setNewPath] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-sm font-medium"
        style={{ color: "var(--color-text)" }}
      >
        {label}
      </label>
      {hint && (
        <p
          className="text-xs"
          style={{
            color: "var(--color-text-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          ↪ auto-scans: {hint}
        </p>
      )}
      {paths.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span
            className="flex-1 text-sm px-3 py-1.5 rounded"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {p}
          </span>
          <button
            onClick={() => onChange(paths.filter((_, j) => j !== i))}
            className="px-2 py-1 text-xs rounded"
            style={{
              background: "#ff444420",
              color: "#ff4444",
              border: "1px solid #ff444430",
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder={placeholder ?? "/path/to/folder"}
          className="flex-1 text-sm px-3 py-1.5 rounded"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            fontFamily: "var(--font-mono)",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newPath.trim()) {
              onChange([...paths, newPath.trim()]);
              setNewPath("");
            }
          }}
        />
        <motion.button
          className="px-3 py-1.5 rounded text-sm"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg)",
          }}
          onClick={() => {
            if (newPath.trim()) {
              onChange([...paths, newPath.trim()]);
              setNewPath("");
            }
          }}
          whileTap={{ scale: 0.96 }}
        >
          Add
        </motion.button>
        <motion.button
          className="px-3 py-1.5 rounded text-sm"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={async () => {
            const dir = await window.htpc.openDirectory();
            if (dir) onChange([...paths, dir]);
          }}
          whileTap={{ scale: 0.96 }}
        >
          Browse…
        </motion.button>
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-sm font-medium"
        style={{ color: "var(--color-text)" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 rounded text-sm"
        style={{
          background: "var(--color-surface-raised)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
          outline: "none",
        }}
      />
    </div>
  );
}

export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm" style={{ color: "var(--color-text)" }}>
          {label}
        </span>
        {description && (
          <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
            {description}
          </span>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="w-11 h-6 rounded-full transition-colors relative"
        style={{
          background: value
            ? "var(--color-accent)"
            : "var(--color-surface-raised)",
          border: "1px solid var(--color-border)",
        }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
          style={{
            background: "white",
            left: value ? "1.25rem" : "0.125rem",
            transform: "translateX(0)",
          }}
        />
      </button>
    </div>
  );
}
