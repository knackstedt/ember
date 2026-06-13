import React from "react";
import xboxSvgUrl from "./xbox.svg";

interface XboxControllerProps {
  highlightCode?: string | null;
  learnCode?: string | null;
  pressedCodes?: string[];
  axes?: Record<string, number>;
}

/* ── tunable constants ── */
const STICK_TRAVEL = 28; // max pixel distance sticks move from center



/* ── global styles ── */
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

/* ── overlay positions (tuned to xbox.svg viewBox 0 0 580 580) ── */

/* Upper-right diamond */
const FACE = {
  north: { cx: 438, cy: 174, r: 19, label: "Y", color: "#f0c040", labelCx: 438, labelCy: 179 },
  south: { cx: 438, cy: 252, r: 19, label: "A", color: "#5bba47", labelCx: 438, labelCy: 257 },
  west:  { cx: 400, cy: 212, r: 19, label: "X", color: "#5b9bd5", labelCx: 400, labelCy: 217 },
  east:  { cx: 479, cy: 212, r: 19, label: "B", color: "#e05252", labelCx: 479, labelCy: 217 },
};

/* Top shoulder buttons */
const BUMPERS = {
  left_bumper:  { cx: 140, cy: 105, r: 24, label: "LB", labelCx: 140, labelCy: 110 },
  right_bumper: { cx: 440, cy: 105, r: 24, label: "RB", labelCx: 440, labelCy: 110 },
};

/* Center button shapes */
const CENTER = {
  select: { cx: 249, cy: 211, r: 11, label: "View" },
  home:   { cx: 290, cy: 148, r: 20, label: "Xbox", color: "#3a8cd4" },
  start:  { cx: 332, cy: 211, r: 11, label: "Menu" },
};

/* Floating label positions for View / Menu (and Home if you want) */
const CENTER_LABELS = {
  select: { cx: 249, cy: 215.5 },
  home:   { cx: 290, cy: 152.5 },
  start:  { cx: 332, cy: 215.5 },
};

/* D-pad — plus shape with configurable dead space in the center */
const DPAD = {
  cx: 216,
  cy: 305,
  armLen: 38,
  armThick: 26,
  deadR: 14, // dead-space radius from center; arms stop here, leaving a hole
};

/* Upper-left / lower-right sticks (asymmetric Xbox layout) */
const THUMB_BASE = {
  left:  { cx: 142, cy: 210, r: 50, labelCx: 142, labelCy: 215 },
  right: { cx: 365, cy: 300, r: 50, labelCx: 365, labelCy: 305 },
};

const THUMB = {
  left_thumb:  { cx: 142, cy: 210, r: 28, label: "LS", labelCx: 142, labelCy: 215 },
  right_thumb: { cx: 365, cy: 300, r: 28, label: "RS", labelCx: 365, labelCy: 305 },
};

/* Triggers */
const TRIGGER = {
  left_trigger:  { x: 106,  y: 30, w: 64, h: 42, label: "LT", labelCx: 138, labelCy: 55, barX: 176, barY: 30, barW: 10, barH: 42 },
  right_trigger: { x: 418, y: 30, w: 64, h: 42, label: "RT", labelCx: 450, labelCy: 55, barX: 402, barY: 30, barW: 10, barH: 42 },
};

/* ── helpers ──
 * Axis values are normalised upstream:
 *   - Sticks: -1..1
 *   - Triggers: 0..1
 */

function normAxis(v: number | undefined): number {
  if (v === undefined) return 0;
  return Math.max(-1, Math.min(1, v));
}

function triggerNorm(v: number | undefined): number {
  if (v === undefined) return 0;
  return Math.max(0, Math.min(1, v));
}

export const XboxController: React.FC<XboxControllerProps> = ({
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

  /* D-pad — read from both button states AND axis values */
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
      viewBox="0 0 580.032 580.032"
      width="100%"
      height="auto"
      style={{ maxWidth: 520, display: "block", margin: "0 auto" }}
      aria-label="Xbox controller diagram"
    >
      {/* ── Background controller image ── */}
      <image
        href={xboxSvgUrl}
        x="0"
        y="0"
        width="580.032"
        height="580.032"
        preserveAspectRatio="xMidYMid meet"
      />

      {/* ── Triggers ── */}
      {Object.entries(TRIGGER).map(([code, t]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        const depth = code === "left_trigger" ? ltDepth : rtDepth;
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
            {/* trigger depth bar */}
            <rect
              x={t.barX} y={t.barY}
              width={t.barW} height={t.barH}
              rx={STYLES.triggerBar.rx}
              fill={STYLES.colors.surface}
              stroke={STYLES.colors.border}
              strokeWidth={STYLES.triggerBar.strokeWidth}
            />
            <rect
              x={t.barX} y={t.barY + t.barH * (1 - depth)}
              width={t.barW} height={t.barH * depth}
              rx={STYLES.triggerBar.rx}
              fill={STYLES.colors.active}
              opacity={STYLES.triggerBar.fillOpacity}
            />
          </g>
        );
      })}

      {/* ── Bumpers ── */}
      {Object.entries(BUMPERS).map(([code, b]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        return (
          <g key={code}>
            <circle
              cx={b.cx} cy={b.cy} r={b.r}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active || isPressed ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
            />
            <text
              x={b.labelCx} y={b.labelCy}
              textAnchor="middle"
              fontSize={STYLES.label.fontSize}
              fontWeight={STYLES.label.fontWeight}
              fill={active ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {/* ── D-Pad: four arms with configurable dead space in the center ── */}
      <g>
        {/* Up arm */}
        <rect
          x={cx - halfT}
          y={cy - armLen}
          width={armThick}
          height={armLen - deadR}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadUp)}
          stroke={armStroke(dpadUp)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Down arm */}
        <rect
          x={cx - halfT}
          y={cy + deadR}
          width={armThick}
          height={armLen - deadR}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadDown)}
          stroke={armStroke(dpadDown)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Left arm */}
        <rect
          x={cx - armLen}
          y={cy - halfT}
          width={armLen - deadR}
          height={armThick}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadLeft)}
          stroke={armStroke(dpadLeft)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Right arm */}
        <rect
          x={cx + deadR}
          y={cy - halfT}
          width={armLen - deadR}
          height={armThick}
          rx={STYLES.dpad.rx}
          fill={armFill(dpadRight)}
          stroke={armStroke(dpadRight)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
      </g>

      {/* ── Center buttons ── */}
      {Object.entries(CENTER).map(([code, b]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        const color = (b as { color?: string }).color;
        const fillColor = active
          ? (color ?? STYLES.colors.active)
          : isPressed
            ? (color ?? STYLES.colors.active)
            : STYLES.colors.surface;
        const strokeColor = active
          ? (color ?? STYLES.colors.active)
          : isPressed
            ? (color ?? STYLES.colors.active)
            : STYLES.colors.border;
        const lbl = CENTER_LABELS[code as keyof typeof CENTER_LABELS];
        return (
          <g key={code}>
            <circle
              cx={b.cx} cy={b.cy} r={b.r}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active ? STYLES.circle.activeOpacity : isPressed ? 0.9 : STYLES.circle.inactiveOpacity}
            />
            <text
              x={lbl.cx} y={lbl.cy}
              textAnchor="middle"
              fontSize={b.r < 12 ? 9 : 10}
              fontWeight={STYLES.label.fontWeight}
              fill={active || isPressed ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {/* ── Thumbstick bases ── */}
      <circle
        cx={THUMB_BASE.left.cx} cy={THUMB_BASE.left.cy} r={THUMB_BASE.left.r}
        fill={STYLES.colors.surface}
        stroke={STYLES.colors.border}
        strokeWidth={STYLES.thumbBase.strokeWidth}
        opacity={STYLES.thumbBase.opacity}
      />
      <circle
        cx={THUMB_BASE.right.cx} cy={THUMB_BASE.right.cy} r={THUMB_BASE.right.r}
        fill={STYLES.colors.surface}
        stroke={STYLES.colors.border}
        strokeWidth={STYLES.thumbBase.strokeWidth}
        opacity={STYLES.thumbBase.opacity}
      />

      {/* ── Moving thumbsticks ── */}
      <g transform={`translate(${lsX}, ${lsY})`}>
        <circle
          cx={THUMB.left_thumb.cx} cy={THUMB.left_thumb.cy} r={THUMB.left_thumb.r}
          fill={pressedSet.has("left_thumb") ? STYLES.colors.active : STYLES.colors.surface}
          stroke={pressedSet.has("left_thumb") ? STYLES.colors.active : STYLES.colors.border}
          strokeWidth={STYLES.circle.strokeWidth}
        />
        <text
          x={THUMB.left_thumb.labelCx} y={THUMB.left_thumb.labelCy}
          textAnchor="middle"
          fontSize={10}
          fontWeight={STYLES.label.fontWeight}
          fill={pressedSet.has("left_thumb") ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {THUMB.left_thumb.label}
        </text>
      </g>

      <g transform={`translate(${rsX}, ${rsY})`}>
        <circle
          cx={THUMB.right_thumb.cx} cy={THUMB.right_thumb.cy} r={THUMB.right_thumb.r}
          fill={pressedSet.has("right_thumb") ? STYLES.colors.active : STYLES.colors.surface}
          stroke={pressedSet.has("right_thumb") ? STYLES.colors.active : STYLES.colors.border}
          strokeWidth={STYLES.circle.strokeWidth}
        />
        <text
          x={THUMB.right_thumb.labelCx} y={THUMB.right_thumb.labelCy}
          textAnchor="middle"
          fontSize={10}
          fontWeight={STYLES.label.fontWeight}
          fill={pressedSet.has("right_thumb") ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {THUMB.right_thumb.label}
        </text>
      </g>

      {/* ── Face buttons ── */}
      {Object.entries(FACE).map(([code, b]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        const baseColor = active
          ? (b.color ?? STYLES.colors.active)
          : isPressed
            ? (b.color ?? STYLES.colors.active)
            : STYLES.colors.surface;
        const borderColor = active
          ? (b.color ?? STYLES.colors.active)
          : isPressed
            ? (b.color ?? STYLES.colors.active)
            : STYLES.colors.border;
        return (
          <g key={code}>
            <circle
              cx={b.cx} cy={b.cy} r={b.r}
              fill={baseColor}
              stroke={borderColor}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active ? STYLES.circle.activeOpacity : isPressed ? 0.9 : STYLES.circle.inactiveOpacity}
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
    </svg>
  );
};
