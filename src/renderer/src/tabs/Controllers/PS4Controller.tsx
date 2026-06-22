import React from "react";
import { PS4ControllerBg } from "./PS4ControllerBg";
import { PSXIcon, PSCircleIcon, PSSquareIcon, PSTriangleIcon } from "./PlayStationIcons";

interface PS4ControllerProps {
  highlightCode?: string | null;
  learnCode?: string | null;
  pressedCodes?: string[];
  axes?: Record<string, number>;
  touchpadX?: number;
  touchpadY?: number;
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
    inactiveFill: "var(--text-secondary)",
  },
  triggerLabel: {
    fontSize: 12,
    fontWeight: 700,
    activeFill: "var(--surface-base)",
    inactiveFill: "var(--text-secondary)",
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
    active: "var(--accent)",
    surface: "var(--surface-0)",
    surfaceRaised: "var(--surface-1)",
    border: "var(--border-default)",
    bg: "var(--surface-base)",
    textDim: "var(--text-secondary)",
    pressedMix: "color-mix(in srgb, var(--accent) 35%, var(--surface-0))",
  },
};

/* ── overlay positions (tuned to ps4.svg viewBox 0 0 575.395 575.395) ── */

/* Upper-right diamond — SQUARE and TRIANGLE swapped */
const FACE = {
  north: { cx: 466.5, cy: 230.598, r: 22, label: "△", color: "#5b9bd5", labelCx: 466.5, labelCy: 236.5, Icon: PSSquareIcon },
  south: { cx: 466.5, cy: 310.776, r: 22, label: "✕", color: "#e05252", labelCx: 466.5, labelCy: 316.5, Icon: PSXIcon },
  west:  { cx: 426.408, cy: 270.69, r: 22, label: "□", color: "#f0c040", labelCx: 426.408, labelCy: 276.5, Icon: PSTriangleIcon },
  east:  { cx: 506.592, cy: 270.69, r: 22, label: "○", color: "#5bba47", labelCx: 506.592, labelCy: 276.5, Icon: PSCircleIcon },
};

/* Top shoulder buttons */
const BUMPERS = {
  left_bumper:  { cx: 120, cy: 185, r: 24, label: "L1", labelCx: 120, labelCy: 190 },
  right_bumper: { cx: 455, cy: 185, r: 24, label: "R1", labelCx: 455, labelCy: 190 },
};

/* Center button shapes */
const CENTER = {
  select: { cx: 170, cy: 217, r: 14, label: "SH" },
  home:   { cx: 287, cy: 345, r: 26, label: "PS", color: "#3a8cd4" },
  start:  { cx: 405, cy: 217, r: 14, label: "OP" },
};

/* Touchpad above center */
const TOUCHPAD = { cx: 287.5, cy: 240, w: 185, h: 100, rx: 9 };

/* D-pad — plus shape with configurable dead space in the center */
const DPAD = {
  cx: 106,
  cy: 274,
  armLen: 48,
  armThick: 34,
  deadR: 14,
};

/* Sticks */
const THUMB_BASE = {
  left:  { cx: 190.892, cy: 354, r: 50 },
  right: { cx: 378.482, cy: 354, r: 50 },
};

const THUMB = {
  left_thumb:  { cx: 190.892, cy: 354, r: 28, label: "L3", labelCx: 190.892, labelCy: 332 },
  right_thumb: { cx: 378.482, cy: 354, r: 28, label: "R3", labelCx: 378.482, labelCy: 332 },
};

/* Triggers */
const TRIGGER = {
  left_trigger:  { x: 55, y: 125, w: 80, h: 55, label: "L2", labelCx: 95, labelCy: 155, barX: 130, barY: 125, barW: 12, barH: 55 },
  right_trigger: { x: 440, y: 125, w: 80, h: 55, label: "R2", labelCx: 480, labelCy: 155, barX: 433, barY: 125, barW: 12, barH: 55 },
};

export const PS4Controller: React.FC<PS4ControllerProps> = React.memo(({
  highlightCode,
  learnCode,
  pressedCodes,
  axes,
  touchpadX,
  touchpadY,
}) => {
  const accentCode = learnCode ?? highlightCode;
  const pressedSet = React.useMemo(() => new Set(pressedCodes ?? []), [pressedCodes]);

  /* Stick offsets */
  const lsX = normAxis(axes?.left_x)  * 28;
  const lsY = normAxis(axes?.left_y)  * 28;
  const rsX = normAxis(axes?.right_x) * 28;
  const rsY = normAxis(axes?.right_y) * 28;

  /* Trigger depths */
  const ltDepth = triggerNorm(axes?.left_trigger);
  const rtDepth = triggerNorm(axes?.right_trigger);

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

  /* Touchpad state */
  const touchpadPressed = pressedSet.has("touchpad");
  const hasTouch = touchpadX !== undefined && touchpadY !== undefined;

  return (
    <svg
      viewBox="0 0 575.395 575.395"
      width="100%"
      height="auto"
      style={{ maxWidth: 520, display: "block", margin: "0 auto" }}
      aria-label="PS4 controller diagram"
    >
      {/* ── Background controller image ── */}
      <PS4ControllerBg />

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

      {/* ── Touchpad ── */}
      <g>
        <rect
          x={TOUCHPAD.cx - TOUCHPAD.w / 2}
          y={TOUCHPAD.cy - TOUCHPAD.h / 2}
          width={TOUCHPAD.w}
          height={TOUCHPAD.h}
          rx={TOUCHPAD.rx}
          fill={touchpadPressed ? baseFill(false, true) : STYLES.colors.surface}
          stroke={touchpadPressed ? STYLES.colors.active : STYLES.colors.border}
          strokeWidth={STYLES.rect.strokeWidth}
          opacity={touchpadPressed ? STYLES.rect.activeOpacity : 0.7}
        />
        {/* Touch indicator */}
        {hasTouch && (
          <circle
            cx={TOUCHPAD.cx + (touchpadX! - 0.5) * TOUCHPAD.w}
            cy={TOUCHPAD.cy + (touchpadY! - 0.5) * TOUCHPAD.h}
            r={6}
            fill={STYLES.colors.active}
            opacity={0.9}
          />
        )}
        {/* Click indicator ring */}
        {touchpadPressed && (
          <rect
            x={TOUCHPAD.cx - TOUCHPAD.w / 2 + 3}
            y={TOUCHPAD.cy - TOUCHPAD.h / 2 + 3}
            width={TOUCHPAD.w - 6}
            height={TOUCHPAD.h - 6}
            rx={TOUCHPAD.rx - 3}
            fill="none"
            stroke={STYLES.colors.active}
            strokeWidth={2}
            opacity={0.8}
          />
        )}
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

      {/* ── Center buttons (Share / PS / Options) ── */}
      {Object.entries(CENTER).map(([code, c]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        return (
          <g key={code}>
            <circle
              cx={c.cx} cy={c.cy} r={c.r}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active || isPressed ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
            />
            <text
              x={c.cx} y={c.cy + 5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill={active ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {c.label}
            </text>
          </g>
        );
      })}

      {/* ── Face buttons ── */}
      {Object.entries(FACE).map(([code, f]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        const Icon = f.Icon;
        return (
          <g key={code}>
            <circle
              cx={f.cx} cy={f.cy} r={f.r}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active || isPressed ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
            />
            <g transform={`translate(${f.cx - 10}, ${f.cy - 10})`}>
              <Icon size={20} color={active ? "#fff" : "var(--text-secondary)"} />
            </g>
          </g>
        );
      })}

      {/* ── Thumbstick bases ── */}
      {Object.entries(THUMB_BASE).map(([side, base]) => (
        <circle
          key={`base-${side}`}
          cx={base.cx} cy={base.cy} r={base.r}
          fill="none"
          stroke={STYLES.colors.border}
          strokeWidth={STYLES.thumbBase.strokeWidth}
          opacity={STYLES.thumbBase.opacity}
        />
      ))}

      {/* ── Thumbsticks ── */}
      {Object.entries(THUMB).map(([code, t]) => {
        const active = accentCode === code;
        const isPressed = pressedSet.has(code);
        const offsetX = code === "left_thumb" ? lsX : rsX;
        const offsetY = code === "left_thumb" ? lsY : rsY;
        return (
          <g key={code}>
            <circle
              cx={t.cx + offsetX}
              cy={t.cy + offsetY}
              r={t.r}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active || isPressed ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
            />
            <text
              x={t.cx + offsetX}
              y={t.cy + offsetY + 5}
              textAnchor="middle"
              fontSize={STYLES.label.fontSize}
              fontWeight={STYLES.label.fontWeight}
              fill={active ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {t.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
});

PS4Controller.displayName = "PS4Controller";
