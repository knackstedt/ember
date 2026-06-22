import React from "react";
import { N64ControllerBg } from "./N64ControllerBg";

interface N64ControllerProps {
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

/* ── tunables ── */
const STICK_TRAVEL = 30;

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
    inactiveFill: "var(--text-secondary)",
  },
  triggerLabel: {
    fontSize: 12,
    fontWeight: 700,
    activeFill: "var(--surface-base)",
    inactiveFill: "var(--text-secondary)",
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
    active: "var(--accent)",
    surface: "var(--surface-0)",
    surfaceRaised: "var(--surface-1)",
    border: "var(--border-default)",
    bg: "var(--surface-base)",
    textDim: "var(--text-secondary)",
    pressedMix: "color-mix(in srgb, var(--accent) 35%, var(--surface-0))",
  },
};

/* ── overlay positions (tuned to n64.svg viewBox 0 0 587.029 587.028) ── */

/* Center analog stick */
const THUMB_BASE = {
  left: { cx: 293.5, cy: 325, r: 58 },
};

const THUMB = {
  left_thumb: { cx: 293.5, cy: 325, r: 34, label: "Stick", labelCx: 293.5, labelCy: 330 },
};

/* D-pad — plus shape, left side */
const DPAD = {
  cx: 113,
  cy: 185,
  armLen: 48,
  armThick: 32,
  deadR: 16,
};

/* Face buttons — A (big blue), B (small green), C-pad (yellow cluster) */
const FACE = {
  /* A — big blue */
  south: { cx: 440, cy: 248, r: 30, label: "A", color: "#2d7dd2", labelCx: 440, labelCy: 253 },
  /* B — small green */
  east:  { cx: 402, cy: 206, r: 22, label: "B", color: "#5bba47", labelCx: 402, labelCy: 211 },
};

const C_PAD = {
  c_up:    { cx: 485, cy: 135, r: 14, label: "C↑", color: "#f0c040", labelCx: 485, labelCy: 139 },
  c_down:  { cx: 485, cy: 203, r: 14, label: "C↓", color: "#f0c040", labelCx: 485, labelCy: 207 },
  c_left:  { cx: 451, cy: 169, r: 14, label: "C←", color: "#f0c040", labelCx: 451, labelCy: 173 },
  c_right: { cx: 519, cy: 169, r: 14, label: "C→", color: "#f0c040", labelCx: 519, labelCy: 173 },
};

/* Start — center-top */
const START_BTN = { cx: 293.5, cy: 211, r: 18, label: "Start", labelCx: 293.5, labelCy: 214 };

/* Top shoulder buttons */
const TRIGGER = {
  left_bumper:  { x: 45,  y: 50, w: 80, h: 32, label: "L", labelCx: 85,  labelCy: 70 },
  right_bumper: { x: 462, y: 50, w: 80, h: 32, label: "R", labelCx: 502, labelCy: 70 },
};

/* Z trigger — back right shoulder */
const Z_BTN = { x: 140, y: 322, w: 42, h: 78, rx: 8, label: "Z", color: "#9b59b6", labelCx: 162, labelCy: 365 };

export const N64Controller: React.FC<N64ControllerProps> = ({
  highlightCode,
  learnCode,
  pressedCodes,
  axes,
}) => {
  const accentCode = learnCode ?? highlightCode;
  const pressedSet = new Set(pressedCodes ?? []);

  /* Stick offsets */
  const lsX = normAxis(axes?.left_x) * STICK_TRAVEL;
  const lsY = normAxis(axes?.left_y) * STICK_TRAVEL;

  /* D-pad */
  const dpadUp    = pressedSet.has("dpad_up")    || (axes?.dpad_y ?? 0) < 0;
  const dpadDown  = pressedSet.has("dpad_down")  || (axes?.dpad_y ?? 0) > 0;
  const dpadLeft  = pressedSet.has("dpad_left")  || (axes?.dpad_x ?? 0) < 0;
  const dpadRight = pressedSet.has("dpad_right") || (axes?.dpad_x ?? 0) > 0;

  const { cx, cy, armLen, armThick, deadR } = DPAD;
  const halfT = armThick / 2;

  const baseFill = (active: boolean, pressed: boolean) =>
    active
      ? STYLES.colors.active
      : pressed
        ? STYLES.colors.pressedMix
        : STYLES.colors.surface;

  const baseStroke = (active: boolean, pressed: boolean) =>
    active || pressed ? STYLES.colors.active : STYLES.colors.border;

  const armFill   = (on: boolean) => on ? STYLES.colors.active : STYLES.colors.surface;
  const armStroke = (on: boolean) => on ? STYLES.colors.active : STYLES.colors.border;

  return (
    <svg
      viewBox="0 0 587.029 587.028"
      width="100%"
      height="auto"
      style={{ maxWidth: 520, display: "block", margin: "0 auto" }}
      aria-label="N64 controller diagram"
    >
      {/* ── Background controller image ── */}
      <N64ControllerBg />

      {/* ── Shoulders (L / R) ── */}
      {Object.entries(TRIGGER).map(([code, t]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        return (
          <g key={code}>
            <rect
              x={t.x} y={t.y} width={t.w} height={t.h}
              rx={STYLES.rect.rx}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth={STYLES.rect.strokeWidth}
              opacity={active || isPressed ? STYLES.rect.activeOpacity : STYLES.rect.inactiveOpacity}
            />
            <text
              x={t.labelCx} y={t.labelCy}
              textAnchor="middle"
              fontSize={STYLES.triggerLabel.fontSize}
              fontWeight={STYLES.triggerLabel.fontWeight}
              fill={active ? STYLES.triggerLabel.activeFill : STYLES.triggerLabel.inactiveFill}
            >
              {t.label}
            </text>
          </g>
        );
      })}

      {/* ── Z trigger ── */}
      <g>
        <rect
          x={Z_BTN.x} y={Z_BTN.y} width={Z_BTN.w} height={Z_BTN.h} rx={Z_BTN.rx}
          fill={baseFill(accentCode === "z", pressedSet.has("z"))}
          stroke={baseStroke(accentCode === "z", pressedSet.has("z"))}
          strokeWidth={STYLES.rect.strokeWidth}
          opacity={accentCode === "z" || pressedSet.has("z") ? STYLES.rect.activeOpacity : STYLES.rect.inactiveOpacity}
        />
        <text
          x={Z_BTN.labelCx} y={Z_BTN.labelCy}
          textAnchor="middle"
          fontSize={STYLES.label.fontSize}
          fontWeight={STYLES.label.fontWeight}
          fill={accentCode === "z" ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {Z_BTN.label}
        </text>
      </g>

      {/* ── Start button ── */}
      <g>
        <circle
          cx={START_BTN.cx} cy={START_BTN.cy} r={START_BTN.r}
          fill={baseFill(accentCode === "start", pressedSet.has("start"))}
          stroke={baseStroke(accentCode === "start", pressedSet.has("start"))}
          strokeWidth={STYLES.circle.strokeWidth}
          opacity={accentCode === "start" || pressedSet.has("start") ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
        />
        <text
          x={START_BTN.labelCx} y={START_BTN.labelCy}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill={accentCode === "start" ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {START_BTN.label}
        </text>
      </g>

      {/* ── D-Pad ── */}
      <g>
        {/* Base vertical top */}
        <rect
          x={cx - halfT} y={cy - armLen}
          width={armThick} height={armLen - deadR}
          rx={STYLES.dpad.rx}
          fill={armFill(false)}
          stroke={armStroke(false)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Base vertical bottom */}
        <rect
          x={cx - halfT} y={cy + deadR}
          width={armThick} height={armLen - deadR}
          rx={STYLES.dpad.rx}
          fill={armFill(false)}
          stroke={armStroke(false)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Base horizontal left */}
        <rect
          x={cx - armLen} y={cy - halfT}
          width={armLen - deadR} height={armThick}
          rx={STYLES.dpad.rx}
          fill={armFill(false)}
          stroke={armStroke(false)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Base horizontal right */}
        <rect
          x={cx + deadR} y={cy - halfT}
          width={armLen - deadR} height={armThick}
          rx={STYLES.dpad.rx}
          fill={armFill(false)}
          stroke={armStroke(false)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />

        {/* Active arms */}
        <rect
          x={cx - halfT} y={cy - armLen}
          width={armThick} height={armLen - deadR}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadUp)}
          stroke={armStroke(dpadUp)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        <rect
          x={cx - halfT} y={cy + deadR}
          width={armThick} height={armLen - deadR}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadDown)}
          stroke={armStroke(dpadDown)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        <rect
          x={cx - armLen} y={cy - halfT}
          width={armLen - deadR} height={armThick}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadLeft)}
          stroke={armStroke(dpadLeft)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        <rect
          x={cx + deadR} y={cy - halfT}
          width={armLen - deadR} height={armThick}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadRight)}
          stroke={armStroke(dpadRight)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
      </g>

      {/* ── C-Pad ── */}
      {Object.entries(C_PAD).map(([code, btn]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        return (
          <g key={code}>
            <circle
              cx={btn.cx} cy={btn.cy} r={btn.r}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active || isPressed ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
            />
            <text
              x={btn.labelCx} y={btn.labelCy}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              fill={active ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {btn.label}
            </text>
          </g>
        );
      })}

      {/* ── Face buttons (A / B) ── */}
      {Object.entries(FACE).map(([code, btn]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        return (
          <g key={code}>
            <circle
              cx={btn.cx} cy={btn.cy} r={btn.r}
              fill={active ? STYLES.colors.active : isPressed ? STYLES.colors.pressedMix : btn.color}
              stroke={baseStroke(active, isPressed)}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active || isPressed ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
            />
            <text
              x={btn.labelCx} y={btn.labelCy}
              textAnchor="middle"
              fontSize={STYLES.label.fontSize}
              fontWeight={STYLES.label.fontWeight}
              fill={active ? STYLES.label.activeFill : "#fff"}
            >
              {btn.label}
            </text>
          </g>
        );
      })}

      {/* ── Thumb stick base + cap ── */}
      <g>
        <circle
          cx={THUMB_BASE.left.cx}
          cy={THUMB_BASE.left.cy}
          r={THUMB_BASE.left.r}
          fill="none"
          stroke={STYLES.colors.border}
          strokeWidth={STYLES.thumbBase.strokeWidth}
          opacity={STYLES.thumbBase.opacity}
        />
        <circle
          cx={THUMB.left_thumb.cx + lsX}
          cy={THUMB.left_thumb.cy + lsY}
          r={THUMB.left_thumb.r}
          fill={baseFill(accentCode === "left_thumb", pressedSet.has("left_thumb"))}
          stroke={baseStroke(accentCode === "left_thumb", pressedSet.has("left_thumb"))}
          strokeWidth={STYLES.circle.strokeWidth}
          opacity={accentCode === "left_thumb" || pressedSet.has("left_thumb") ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
        />
        <text
          x={THUMB.left_thumb.labelCx + lsX}
          y={THUMB.left_thumb.labelCy + lsY}
          textAnchor="middle"
          fontSize={STYLES.label.fontSize}
          fontWeight={STYLES.label.fontWeight}
          fill={accentCode === "left_thumb" ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {THUMB.left_thumb.label}
        </text>
      </g>
    </svg>
  );
};
