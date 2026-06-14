import React from "react";
import { PSXIcon, PSCircleIcon, PSSquareIcon, PSTriangleIcon } from "./PlayStationIcons";

interface PS4ControllerProps {
  highlightCode?: string | null;
  learnCode?: string | null;
  pressedCodes?: string[];
  axes?: Record<string, number>;
}

/* ── helpers ── */
function normAxis(v: number | undefined): number {
  if (v === undefined) return 0;
  if (Math.abs(v) <= 1) return v;
  return v / 32767;
}

function triggerNorm(v: number | undefined): number {
  if (v === undefined) return 0;
  if (v >= 0 && v <= 1) return v;
  if (v >= 0 && v <= 255) return v / 255;
  if (v >= 0 && v <= 1023) return v / 1023;
  return Math.max(0, v / 32767);
}

/* ── geometry ── */
const BODY = {
  d: `M 125 36
      C 112 36, 100 42, 92 52
      C 84 62, 78 78, 76 96
      C 74 114, 78 134, 88 152
      C 98 170, 114 180, 132 182
      C 150 184, 170 178, 186 170
      C 194 166, 198 162, 200 160
      C 202 162, 206 166, 214 170
      C 230 178, 250 184, 268 182
      C 286 180, 302 170, 312 152
      C 322 134, 326 114, 324 96
      C 322 78, 316 62, 308 52
      C 300 42, 288 36, 275 36
      C 255 32, 228 28, 200 26
      C 172 28, 145 32, 125 36
      Z`,
};

/* Upper-right diamond */
const FACE = {
  north: { cx: 294, cy: 82,  r: 11, Icon: PSTriangleIcon },
  south: { cx: 294, cy: 114, r: 11, Icon: PSXIcon },
  west:  { cx: 278, cy: 98, r: 11, Icon: PSSquareIcon },
  east:  { cx: 310, cy: 98, r: 11, Icon: PSCircleIcon },
};

/* Top shoulder buttons */
const BUMPERS = {
  left_bumper:  { cx: 118, cy: 52, r: 9, label: "L1" },
  right_bumper: { cx: 282, cy: 52, r: 9, label: "R1" },
};

/* Center */
const CENTER = {
  select: { cx: 170, cy: 100, r: 8, label: "SH" },
  home:   { cx: 200, cy: 98, r: 11, label: "PS", color: "#3a8cd4" },
  start:  { cx: 230, cy: 100, r: 8, label: "OP" },
};

/* Touchpad above center */
const TOUCHPAD = { cx: 200, cy: 68, w: 48, h: 16, label: "Touch" };

/* D-pad — plus shape, upper-left */
const DPAD = {
  cx: 126,
  cy: 82,
  armLen: 16,
  armThick: 12,
};

/* Lower-left / lower-right sticks */
const THUMB_BASE = {
  left:  { cx: 134, cy: 142, r: 18 },
  right: { cx: 266, cy: 142, r: 18 },
};

const THUMB = {
  left_thumb:  { cx: 134, cy: 142, r: 10, label: "L3" },
  right_thumb: { cx: 266, cy: 142, r: 10, label: "R3" },
};

/* Triggers */
const TRIGGER = {
  left_trigger:  { x: 92,  y: 18, w: 52, h: 24, label: "L2", barX: 114, barY: 2, barW: 8, barH: 18 },
  right_trigger: { x: 256, y: 18, w: 52, h: 24, label: "R2", barX: 278, barY: 2, barW: 8, barH: 18 },
};

export const PS4Controller: React.FC<PS4ControllerProps> = ({
  highlightCode,
  learnCode,
  pressedCodes,
  axes,
}) => {
  const accentCode = learnCode ?? highlightCode;
  const pressedSet = new Set(pressedCodes ?? []);

  /* Stick offsets */
  const lsX = normAxis(axes?.left_x)  * 10;
  const lsY = normAxis(axes?.left_y)  * 10;
  const rsX = normAxis(axes?.right_x) * 10;
  const rsY = normAxis(axes?.right_y) * 10;

  /* Trigger depths */
  const ltDepth = triggerNorm(axes?.left_trigger);
  const rtDepth = triggerNorm(axes?.right_trigger);

  /* D-pad — read from both button states AND axis values */
  const dpadUp    = pressedSet.has("dpad_up")    || (axes?.dpad_y ?? 0) < 0;
  const dpadDown  = pressedSet.has("dpad_down")  || (axes?.dpad_y ?? 0) > 0;
  const dpadLeft  = pressedSet.has("dpad_left")  || (axes?.dpad_x ?? 0) < 0;
  const dpadRight = pressedSet.has("dpad_right") || (axes?.dpad_x ?? 0) > 0;

  const armFill   = (on: boolean) => on ? "var(--color-accent)" : "var(--color-surface)";
  const armStroke = (on: boolean) => on ? "var(--color-accent)" : "var(--color-border)";

  const { cx, cy, armLen, armThick } = DPAD;
  const halfT = armThick / 2;

  return (
    <svg
      viewBox="60 0 280 190"
      width="100%"
      height="auto"
      style={{ maxWidth: 420, display: "block", margin: "0 auto" }}
      aria-label="PS4 controller diagram"
    >
      {/* Body */}
      <path
        d={BODY.d}
        fill="var(--color-surface-raised)"
        stroke="var(--color-border)"
        strokeWidth="2"
      />

      {/* Light bar */}
      <rect x="178" y="8" width="44" height="5" rx="2" fill="#3a8cd4" opacity="0.7" />

      {/* ── Triggers ── */}
      {Object.entries(TRIGGER).map(([code, t]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        const depth = code === "left_trigger" ? ltDepth : rtDepth;
        return (
          <g key={code}>
            <rect
              x={t.x} y={t.y} width={t.w} height={t.h} rx="4"
              fill={ active ? "var(--color-accent)" : isPressed ? "color-mix(in srgb, var(--color-accent) 35%, var(--color-surface))" : "var(--color-surface)" }
              stroke={ active ? "var(--color-accent)" : isPressed ? "var(--color-accent)" : "var(--color-border)" }
              strokeWidth="1.5"
              opacity={active || isPressed ? 1 : 0.85}
            />
            <text x={t.x + t.w / 2} y={t.y + t.h / 2 + 4} textAnchor="middle" fontSize="9" fontWeight="600" fill={active ? "var(--color-bg)" : "var(--color-text-dim)"}>
              {t.label}
            </text>
            <rect x={t.barX} y={t.barY} width={t.barW} height={t.barH} rx="2" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1" />
            <rect x={t.barX} y={t.barY + t.barH * (1 - depth)} width={t.barW} height={t.barH * depth} rx="2" fill="var(--color-accent)" opacity={0.85} />
          </g>
        );
      })}

      {/* ── Bumpers ── */}
      {Object.entries(BUMPERS).map(([code, b]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        return (
          <g key={code}>
            <circle cx={b.cx} cy={b.cy} r={b.r}
              fill={ active ? "var(--color-accent)" : isPressed ? "color-mix(in srgb, var(--color-accent) 35%, var(--color-surface))" : "var(--color-surface)" }
              stroke={ active ? "var(--color-accent)" : isPressed ? "var(--color-accent)" : "var(--color-border)" }
              strokeWidth="1.5"
              opacity={active || isPressed ? 1 : 0.85}
            />
            <text x={b.cx} y={b.cy + 4} textAnchor="middle" fontSize="8" fontWeight="700" fill={active ? "#fff" : "var(--color-text-dim)"}>
              {b.label}
            </text>
          </g>
        );
      })}

      {/* ── Touchpad ── */}
      <g>
        <rect
          x={TOUCHPAD.cx - TOUCHPAD.w / 2} y={TOUCHPAD.cy - TOUCHPAD.h / 2}
          width={TOUCHPAD.w} height={TOUCHPAD.h} rx="4"
          fill={pressedSet.has("touchpad") ? "color-mix(in srgb, var(--color-accent) 35%, var(--color-surface))" : "var(--color-surface)"}
          stroke={pressedSet.has("touchpad") ? "var(--color-accent)" : "var(--color-border)"}
          strokeWidth="1.5" opacity={pressedSet.has("touchpad") ? 0.9 : 0.7}
        />
        <text x={TOUCHPAD.cx} y={TOUCHPAD.cy + 3.5} textAnchor="middle" fontSize="8" fontWeight="700" fill={pressedSet.has("touchpad") ? "#fff" : "var(--color-text-dim)"}>
          {TOUCHPAD.label}
        </text>
      </g>

      {/* ── D-Pad: proper plus shape with per-direction highlight ── */}
      <g>
        {/* Base vertical bar — always default */}
        <rect
          x={cx - halfT} y={cy - armLen}
          width={armThick} height={armLen * 2}
          rx="2"
          fill={armFill(false)}
          stroke={armStroke(false)}
          strokeWidth="1.5"
        />
        {/* Base horizontal bar — always default */}
        <rect
          x={cx - armLen} y={cy - halfT}
          width={armLen * 2} height={armThick}
          rx="2"
          fill={armFill(false)}
          stroke={armStroke(false)}
          strokeWidth="1.5"
        />
        {/* Up arm */}
        <rect
          x={cx - halfT} y={cy - armLen}
          width={armThick} height={armLen}
          rx="2"
          fill={armFill(dpadUp)}
          stroke={armStroke(dpadUp)}
          strokeWidth="1.5"
        />
        {/* Down arm */}
        <rect
          x={cx - halfT} y={cy}
          width={armThick} height={armLen}
          rx="2"
          fill={armFill(dpadDown)}
          stroke={armStroke(dpadDown)}
          strokeWidth="1.5"
        />
        {/* Left arm */}
        <rect
          x={cx - armLen} y={cy - halfT}
          width={armLen} height={armThick}
          rx="2"
          fill={armFill(dpadLeft)}
          stroke={armStroke(dpadLeft)}
          strokeWidth="1.5"
        />
        {/* Right arm */}
        <rect
          x={cx} y={cy - halfT}
          width={armLen} height={armThick}
          rx="2"
          fill={armFill(dpadRight)}
          stroke={armStroke(dpadRight)}
          strokeWidth="1.5"
        />
      </g>

      {/* ── Center buttons ── */}
      {Object.entries(CENTER).map(([code, b]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        const color = (b as { color?: string }).color;
        const baseColor = active ? (color ?? "var(--color-accent)") : isPressed ? (color ?? "var(--color-accent)") : "var(--color-surface)";
        const borderColor = active ? (color ?? "var(--color-accent)") : isPressed ? (color ?? "var(--color-accent)") : "var(--color-border)";
        return (
          <g key={code}>
            <circle cx={b.cx} cy={b.cy} r={b.r} fill={baseColor} stroke={borderColor} strokeWidth="1.5" opacity={active ? 1 : isPressed ? 0.9 : 0.8} />
            <text x={b.cx} y={b.cy + 3.5} textAnchor="middle" fontSize={b.r < 9 ? 7 : 8} fontWeight="700" fill={active || isPressed ? "#fff" : "var(--color-text-dim)"}>
              {b.label}
            </text>
          </g>
        );
      })}

      {/* ── Thumbstick bases ── */}
      <circle cx={THUMB_BASE.left.cx} cy={THUMB_BASE.left.cy} r={THUMB_BASE.left.r} fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1.5" opacity={0.6} />
      <circle cx={THUMB_BASE.right.cx} cy={THUMB_BASE.right.cy} r={THUMB_BASE.right.r} fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1.5" opacity={0.6} />

      {/* ── Moving thumbsticks ── */}
      <g transform={`translate(${lsX}, ${lsY})`}>
        <circle cx={THUMB.left_thumb.cx} cy={THUMB.left_thumb.cy} r={THUMB.left_thumb.r}
          fill={pressedSet.has("left_thumb") ? "var(--color-accent)" : "var(--color-surface)"}
          stroke={pressedSet.has("left_thumb") ? "var(--color-accent)" : "var(--color-border)"} strokeWidth="1.5" />
        <text x={THUMB.left_thumb.cx} y={THUMB.left_thumb.cy + 4} textAnchor="middle" fontSize="8" fontWeight="700" fill={pressedSet.has("left_thumb") ? "#fff" : "var(--color-text-dim)"}>
          {THUMB.left_thumb.label}
        </text>
      </g>

      <g transform={`translate(${rsX}, ${rsY})`}>
        <circle cx={THUMB.right_thumb.cx} cy={THUMB.right_thumb.cy} r={THUMB.right_thumb.r}
          fill={pressedSet.has("right_thumb") ? "var(--color-accent)" : "var(--color-surface)"}
          stroke={pressedSet.has("right_thumb") ? "var(--color-accent)" : "var(--color-border)"} strokeWidth="1.5" />
        <text x={THUMB.right_thumb.cx} y={THUMB.right_thumb.cy + 4} textAnchor="middle" fontSize="8" fontWeight="700" fill={pressedSet.has("right_thumb") ? "#fff" : "var(--color-text-dim)"}>
          {THUMB.right_thumb.label}
        </text>
      </g>

      {/* ── Face buttons ── */}
      {Object.entries(FACE).map(([code, b]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        const baseColor = active ? "var(--color-accent)" : isPressed ? "var(--color-accent)" : "var(--color-surface)";
        const borderColor = active ? "var(--color-accent)" : isPressed ? "var(--color-accent)" : "var(--color-border)";
        const iconColor = active || isPressed ? "#fff" : "var(--color-text-dim)";
        const { Icon } = b as unknown as { Icon: React.FC<{ size?: number; color?: string }> };
        return (
          <g key={code}>
            <circle cx={b.cx} cy={b.cy} r={b.r} fill={baseColor} stroke={borderColor} strokeWidth="1.5" opacity={active ? 1 : isPressed ? 0.9 : 0.8} />
            <g transform={`translate(${b.cx - 5}, ${b.cy - 5})`}>
              <Icon size={10} color={iconColor} />
            </g>
          </g>
        );
      })}
    </svg>
  );
};
