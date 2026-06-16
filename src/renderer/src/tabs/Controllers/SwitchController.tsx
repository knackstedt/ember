import React from "react";
import { SwitchControllerBg } from "./SwitchControllerBg";

interface SwitchControllerProps {
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
  return Math.max(0, v / 32767);
}

/* ── tunables ── */
const STICK_TRAVEL = 22;

/* ── styles ── */
const STYLES = {
  circle: {
    strokeWidth: 2,
    activeOpacity: 1,
    inactiveOpacity: 0.85,
  },
  rect: {
    rx: 6,
    strokeWidth: 2,
    activeOpacity: 1,
    inactiveOpacity: 0.85,
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    activeFill: "#fff",
    inactiveFill: "var(--color-text-dim)",
  },
  triggerLabel: {
    fontSize: 11,
    fontWeight: 700,
    activeFill: "var(--color-bg)",
    inactiveFill: "var(--color-text-dim)",
  },
  triggerBar: {
    rx: 3,
    strokeWidth: 1.5,
    fillOpacity: 0.9,
  },
  thumbBase: {
    strokeWidth: 2,
    opacity: 0.55,
  },
  dpad: {
    rx: 3,
    strokeWidth: 2,
  },
  colors: {
    active: "var(--color-accent)",
    surface: "var(--color-surface)",
    surfaceRaised: "var(--color-surface-raised)",
    border: "var(--color-border)",
    bg: "var(--color-bg)",
    textDim: "var(--color-text-dim)",
    pressedMix: "color-mix(in srgb, var(--color-accent) 35%, var(--color-surface))",
  },
};

/* ── overlay positions (tuned to switch.svg viewBox 0 0 583.569 583.569) ── */

/* Upper-right diamond — Nintendo layout:
 *     X (north)
 * Y (west)   A (east)
 *     B (south)
 */
const FACE = {
  north: { cx: 401, cy: 272, r: 14, label: "X", color: "#5b9bd5", labelCx: 401, labelCy: 276 },
  east:  { cx: 439, cy: 309, r: 14, label: "A", color: "#e05252", labelCx: 439, labelCy: 313 },
  west:  { cx: 364, cy: 309, r: 14, label: "Y", color: "#5bba47", labelCx: 364, labelCy: 313 },
  south: { cx: 401, cy: 346, r: 14, label: "B", color: "#f0c040", labelCx: 401, labelCy: 350 },
};

/* Top shoulder buttons (L / R) */
const BUMPERS = {
  left_bumper:  { cx: 105, cy: 92, r: 14, label: "L", labelCx: 105, labelCy: 96 },
  right_bumper: { cx: 475, cy: 92, r: 14, label: "R", labelCx: 475, labelCy: 96 },
};

/* Center buttons */
const CENTER = {
  select: { cx: 243, cy: 238, r: 9, label: "−" },
  home:   { cx: 292, cy: 238, r: 11, label: "⌂", color: "#3a8cd4" },
  start:  { cx: 341, cy: 238, r: 9, label: "+" },
};

/* Capture button (bottom-left of center) */
const CAPTURE_BTN = { cx: 292, cy: 308, r: 10, label: "□", labelCx: 292, labelCy: 311 };

/* D-pad — plus shape, lower-left */
const DPAD = {
  cx: 221,
  cy: 299,
  armLen: 20,
  armThick: 14,
};

/* Sticks: left upper-left, right lower-right */
const THUMB_BASE = {
  left:  { cx: 118, cy: 216, r: 30 },
  right: { cx: 466, cy: 216, r: 30 },
};

const THUMB = {
  left_thumb:  { cx: 118, cy: 216, r: 18, label: "LS", labelCx: 118, labelCy: 220 },
  right_thumb: { cx: 466, cy: 216, r: 18, label: "RS", labelCx: 466, labelCy: 220 },
};

/* Triggers (ZL / ZR) */
const TRIGGER = {
  left_trigger:  { x: 62,  y: 58, w: 72, h: 32, label: "ZL", labelCx: 98,  labelCy: 80, barX: 86,  barY: 46, barW: 8, barH: 28 },
  right_trigger: { x: 448, y: 58, w: 72, h: 32, label: "ZR", labelCx: 484, labelCy: 80, barX: 488, barY: 46, barW: 8, barH: 28 },
};

export const SwitchController: React.FC<SwitchControllerProps> = ({
  highlightCode,
  learnCode,
  pressedCodes,
  axes,
}) => {
  const accentCode = learnCode ?? highlightCode;
  const pressedSet = new Set(pressedCodes ?? []);

  /* Stick offsets */
  const lsX = normAxis(axes?.left_x)  * STICK_TRAVEL;
  const lsY = normAxis(axes?.left_y)  * STICK_TRAVEL;
  const rsX = normAxis(axes?.right_x) * STICK_TRAVEL;
  const rsY = normAxis(axes?.right_y) * STICK_TRAVEL;

  /* Trigger depths */
  const ltDepth = triggerNorm(axes?.left_trigger);
  const rtDepth = triggerNorm(axes?.right_trigger);

  /* D-pad */
  const dpadUp    = pressedSet.has("dpad_up")    || (axes?.dpad_y ?? 0) < 0;
  const dpadDown  = pressedSet.has("dpad_down")  || (axes?.dpad_y ?? 0) > 0;
  const dpadLeft  = pressedSet.has("dpad_left")  || (axes?.dpad_x ?? 0) < 0;
  const dpadRight = pressedSet.has("dpad_right") || (axes?.dpad_x ?? 0) > 0;

  const armFill   = (on: boolean) => on ? STYLES.colors.active : STYLES.colors.surface;
  const armStroke = (on: boolean) => on ? STYLES.colors.active : STYLES.colors.border;

  const { cx, cy, armLen, armThick } = DPAD;
  const halfT = armThick / 2;

  const baseFill = (active: boolean, pressed: boolean) =>
    active
      ? STYLES.colors.active
      : pressed
        ? STYLES.colors.pressedMix
        : STYLES.colors.surface;

  const baseStroke = (active: boolean, pressed: boolean) =>
    active || pressed ? STYLES.colors.active : STYLES.colors.border;

  return (
    <svg
      viewBox="0 0 583.569 583.569"
      width="100%"
      height="auto"
      style={{ maxWidth: 520, display: "block", margin: "0 auto" }}
      aria-label="Switch Pro Controller diagram"
    >
      {/* ── Background controller image ── */}
      <SwitchControllerBg />

      {/* ── Triggers (ZL / ZR) ── */}
      {Object.entries(TRIGGER).map(([code, t]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        const depth = code === "left_trigger" ? ltDepth : rtDepth;
        return (
          <g key={code}>
            <rect
              x={t.x} y={t.y} width={t.w} height={t.h} rx="4"
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth="1.5"
              opacity={active || isPressed ? 1 : 0.85}
            />
            <text x={t.labelCx} y={t.labelCy} textAnchor="middle" fontSize={STYLES.triggerLabel.fontSize} fontWeight={STYLES.triggerLabel.fontWeight} fill={active ? STYLES.triggerLabel.activeFill : STYLES.triggerLabel.inactiveFill}>
              {t.label}
            </text>
            <rect x={t.barX} y={t.barY} width={t.barW} height={t.barH} rx="2" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1" />
            <rect x={t.barX} y={t.barY + t.barH * (1 - depth)} width={t.barW} height={t.barH * depth} rx="2" fill="var(--color-accent)" opacity={STYLES.triggerBar.fillOpacity} />
          </g>
        );
      })}

      {/* ── Bumpers (L / R) ── */}
      {Object.entries(BUMPERS).map(([code, b]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        return (
          <g key={code}>
            <circle cx={b.cx} cy={b.cy} r={b.r}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth="1.5"
              opacity={active || isPressed ? 1 : 0.85}
            />
            <text x={b.labelCx} y={b.labelCy} textAnchor="middle" fontSize="9" fontWeight="700" fill={active ? "#fff" : "var(--color-text-dim)"}>
              {b.label}
            </text>
          </g>
        );
      })}

      {/* ── D-Pad ── */}
      <g>
        <rect
          x={cx - halfT} y={cy - armLen}
          width={armThick} height={armLen * 2}
          rx="2"
          fill={armFill(false)}
          stroke={armStroke(false)}
          strokeWidth="1.5"
        />
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

      {/* ── Left stick ── */}
      <g>
        <circle cx={THUMB_BASE.left.cx} cy={THUMB_BASE.left.cy} r={THUMB_BASE.left.r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={STYLES.thumbBase.strokeWidth}
          opacity={STYLES.thumbBase.opacity}
        />
        <circle
          cx={THUMB.left_thumb.cx + lsX} cy={THUMB.left_thumb.cy + lsY} r={THUMB.left_thumb.r}
          fill={baseFill(accentCode === "left_thumb", pressedSet.has("left_thumb"))}
          stroke={baseStroke(accentCode === "left_thumb", pressedSet.has("left_thumb"))}
          strokeWidth="1.5"
          opacity={accentCode === "left_thumb" || pressedSet.has("left_thumb") ? 1 : 0.9}
        />
        <text x={THUMB.left_thumb.labelCx + lsX} y={THUMB.left_thumb.labelCy + lsY} textAnchor="middle" fontSize="8" fontWeight="700" fill={accentCode === "left_thumb" ? "#fff" : "var(--color-text-dim)"}>
          {THUMB.left_thumb.label}
        </text>
      </g>

      {/* ── Right stick ── */}
      <g>
        <circle cx={THUMB_BASE.right.cx} cy={THUMB_BASE.right.cy} r={THUMB_BASE.right.r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={STYLES.thumbBase.strokeWidth}
          opacity={STYLES.thumbBase.opacity}
        />
        <circle
          cx={THUMB.right_thumb.cx + rsX} cy={THUMB.right_thumb.cy + rsY} r={THUMB.right_thumb.r}
          fill={baseFill(accentCode === "right_thumb", pressedSet.has("right_thumb"))}
          stroke={baseStroke(accentCode === "right_thumb", pressedSet.has("right_thumb"))}
          strokeWidth="1.5"
          opacity={accentCode === "right_thumb" || pressedSet.has("right_thumb") ? 1 : 0.9}
        />
        <text x={THUMB.right_thumb.labelCx + rsX} y={THUMB.right_thumb.labelCy + rsY} textAnchor="middle" fontSize="8" fontWeight="700" fill={accentCode === "right_thumb" ? "#fff" : "var(--color-text-dim)"}>
          {THUMB.right_thumb.label}
        </text>
      </g>

      {/* ── Face buttons (Nintendo diamond) ── */}
      {Object.entries(FACE).map(([code, b]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        return (
          <g key={code}>
            <circle
              cx={b.cx} cy={b.cy} r={b.r}
              fill={active ? STYLES.colors.active : isPressed ? b.color : STYLES.colors.surface}
              stroke={active || isPressed ? STYLES.colors.active : STYLES.colors.border}
              strokeWidth="1.5"
              opacity={active || isPressed ? 1 : 0.9}
            />
            <text
              x={b.labelCx} y={b.labelCy}
              textAnchor="middle"
              fontSize={STYLES.label.fontSize}
              fontWeight={STYLES.label.fontWeight}
              fill={active || isPressed ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {/* ── Center buttons (−, Home, +) ── */}
      {Object.entries(CENTER).map(([code, b]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        return (
          <g key={code}>
            <circle
              cx={b.cx} cy={b.cy} r={b.r}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth="1.5"
              opacity={active || isPressed ? 1 : 0.85}
            />
            <text
              x={b.cx} y={b.cy + 4}
              textAnchor="middle"
              fontSize={code === "home" ? 11 : 9}
              fontWeight="700"
              fill={active || isPressed ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {/* ── Capture button ── */}
      <g>
        <circle
          cx={CAPTURE_BTN.cx} cy={CAPTURE_BTN.cy} r={CAPTURE_BTN.r}
          fill={baseFill(accentCode === "capture", pressedSet.has("capture"))}
          stroke={baseStroke(accentCode === "capture", pressedSet.has("capture"))}
          strokeWidth="1.5"
          opacity={accentCode === "capture" || pressedSet.has("capture") ? 1 : 0.85}
        />
        <text
          x={CAPTURE_BTN.labelCx} y={CAPTURE_BTN.labelCy}
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fill={accentCode === "capture" || pressedSet.has("capture") ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {CAPTURE_BTN.label}
        </text>
      </g>
    </svg>
  );
};
