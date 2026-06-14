import React from "react";
import { GameCubeControllerBg } from "./GameCubeControllerBg";

interface GameCubeControllerProps {
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
const STICK_TRAVEL = 20;

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
    fontSize: 14,
    fontWeight: 800,
    activeFill: "#fff",
    inactiveFill: "var(--color-text-dim)",
  },
  triggerLabel: {
    fontSize: 12,
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

/* ── overlay positions (tuned to gamecube.svg viewBox 0 0 585.781 585.782) ── */

/* Left side stick */
const THUMB_BASE = {
  left:  { cx: 105, cy: 275, r: 60 },
  right: { cx: 394, cy: 412, r: 50 },
};

const THUMB = {
  left_thumb:  { cx: 105, cy: 275, r: 36, label: "LS", labelCx: 105, labelCy: 280 },
  right_thumb: { cx: 395, cy: 412, r: 28, label: "CS", labelCx: 395, labelCy: 418 },
};

/* D-pad — plus shape, left-lower side */
const DPAD = {
  cx: 189,
  cy: 411,
  armLen: 48,
  armThick: 30,
  deadR: 18,
};

/* Right-side diamond (GameCube layout) */
const FACE = {
  /* A — big green */
  south: { cx: 480, cy: 280, r: 36, label: "A", color: "#5bba47", labelCx: 480, labelCy: 280 },
  /* B — small red, below A */
  east:  { cx: 409, cy: 312, r: 24, label: "B", color: "#e05252", labelCx: 409, labelCy: 316 },
  /* X — small grey, above-right */
  north: { cx: 546, cy: 265, r: 14, label: "X", color: "#5b9bd5", labelCx: 546, labelCy: 270 },
  /* Y — small grey, left of A */
  west:  { cx: 459, cy: 213, r: 14, label: "Y", color: "#f0c040", labelCx: 459, labelCy: 218 },
};

/* Z — right shoulder, behind R */
const Z_BTN = { cx: 495, cy: 165, r: 18, label: "Z", color: "#9b59b6", labelCx: 495, labelCy: 170 };

/* Start — small, center-top */
const START_BTN = { cx: 293, cy: 272, r: 18, label: "Start", labelCx: 293, labelCy: 275 };

/* Top shoulder buttons (digital on generic adapters) */
const TRIGGER = {
  left_trigger_btn:  { x: 55,  y: 105, w: 75, h: 35, label: "L", labelCx: 92,  labelCy: 125 },
  right_trigger_btn: { x: 456, y: 105, w: 75, h: 35, label: "R", labelCx: 493, labelCy: 125 },
};

export const GameCubeController: React.FC<GameCubeControllerProps> = ({
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
      viewBox="0 0 585.781 585.782"
      width="100%"
      height="auto"
      style={{ maxWidth: 520, display: "block", margin: "0 auto" }}
      aria-label="GameCube controller diagram"
    >
      {/* ── Background controller image ── */}
      <GameCubeControllerBg />

      {/* ── Triggers (L / R) ── */}
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

      {/* ── Z button ── */}
      <g>
        <circle
          cx={Z_BTN.cx} cy={Z_BTN.cy} r={Z_BTN.r}
          fill={baseFill(accentCode === "z", pressedSet.has("z"))}
          stroke={baseStroke(accentCode === "z", pressedSet.has("z"))}
          strokeWidth={STYLES.circle.strokeWidth}
          opacity={accentCode === "z" || pressedSet.has("z") ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
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
        {/* Up arm */}
        <rect
          x={cx - halfT} y={cy - armLen}
          width={armThick} height={armLen - deadR}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadUp)}
          stroke={armStroke(dpadUp)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Down arm */}
        <rect
          x={cx - halfT} y={cy + deadR}
          width={armThick} height={armLen - deadR}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadDown)}
          stroke={armStroke(dpadDown)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Left arm */}
        <rect
          x={cx - armLen} y={cy - halfT}
          width={armLen - deadR} height={armThick}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadLeft)}
          stroke={armStroke(dpadLeft)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Right arm */}
        <rect
          x={cx + deadR} y={cy - halfT}
          width={armLen - deadR} height={armThick}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadRight)}
          stroke={armStroke(dpadRight)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
      </g>

      {/* ── Stick bases ── */}
      {Object.entries(THUMB_BASE).map(([side, b]) => {
        const active = accentCode === `${side}_thumb`;
        const isPressed = pressedSet.has(`${side}_thumb`);
        return (
          <g key={side}>
            <circle
              cx={b.cx} cy={b.cy} r={b.r}
              fill="none"
              stroke={active || isPressed ? STYLES.colors.active : STYLES.colors.border}
              strokeWidth={STYLES.thumbBase.strokeWidth}
              opacity={STYLES.thumbBase.opacity}
            />
          </g>
        );
      })}

      {/* ── Left stick ── */}
      <g>
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

      {/* ── C-stick ── */}
      <g>
        <circle
          cx={THUMB.right_thumb.cx + rsX}
          cy={THUMB.right_thumb.cy + rsY}
          r={THUMB.right_thumb.r}
          fill={baseFill(accentCode === "right_thumb", pressedSet.has("right_thumb"))}
          stroke={baseStroke(accentCode === "right_thumb", pressedSet.has("right_thumb"))}
          strokeWidth={STYLES.circle.strokeWidth}
          opacity={accentCode === "right_thumb" || pressedSet.has("right_thumb") ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
        />
        <text
          x={THUMB.right_thumb.labelCx + rsX}
          y={THUMB.right_thumb.labelCy + rsY}
          textAnchor="middle"
          fontSize={STYLES.label.fontSize}
          fontWeight={STYLES.label.fontWeight}
          fill={accentCode === "right_thumb" ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {THUMB.right_thumb.label}
        </text>
      </g>

      {/* ── Face buttons ── */}
      {Object.entries(FACE).map(([code, btn]) => {
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
              fontSize={btn.r > 18 ? STYLES.label.fontSize : 11}
              fontWeight={STYLES.label.fontWeight}
              fill={active ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {btn.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
