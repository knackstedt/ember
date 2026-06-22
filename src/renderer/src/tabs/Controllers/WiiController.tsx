import React from "react";
import { WiiControllerBg } from "./WiiControllerBg";

interface WiiControllerProps {
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
const STICK_TRAVEL = 14;

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
    fontSize: 11,
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

/* ── body paths ── */

/* Power button (top, small circle) */
const POWER_BTN = { cx: 299, cy: 38, r: 10, label: "⏻", labelCx: 299, labelCy: 41 };

/* D-pad — plus shape, upper area */
const DPAD = {
  cx: 299,
  cy: 95,
  armLen: 28,
  armThick: 18,
  deadR: 12,
};

/* A button — large central circle */
const A_BTN = { cx: 299, cy: 175, r: 32, label: "A", labelCx: 299, labelCy: 180 };

/* Row of small buttons (-, Home, +) */
const SMALL_ROW = {
  minus:  { cx: 264, cy: 225, r: 10, label: "−", labelCx: 264, labelCy: 228 },
  home:   { cx: 299, cy: 225, r: 13, label: "⌂", labelCx: 299, labelCy: 228, color: "#3a8cd4" },
  plus:   { cx: 334, cy: 225, r: 10, label: "+", labelCx: 334, labelCy: 228 },
};

/* 1 and 2 buttons */
const FACE_LOWER = {
  btn1: { cx: 299, cy: 275, r: 14, label: "1", labelCx: 299, labelCy: 278 },
  btn2: { cx: 299, cy: 318, r: 14, label: "2", labelCx: 299, labelCy: 321 },
};

/* B trigger (back trigger, shown as bar on left side) */
const B_TRIGGER = { x: 210, y: 150, w: 36, h: 60, label: "B", labelCx: 228, labelCy: 182 };

/* Nunchuk body (rounded rect, to the right of remote) */
const NUNCHUK_BODY = { x: 400, y: 120, w: 120, h: 160, rx: 16 };

/* Nunchuk analog stick */
const NUNCHUK_STICK_BASE = { cx: 460, cy: 175, r: 28 };
const NUNCHUK_STICK = { cx: 460, cy: 175, r: 18, label: "L", labelCx: 460, labelCy: 179 };

/* Nunchuk C and Z buttons */
const NUNCHUK_C = { cx: 440, cy: 240, r: 12, label: "C", labelCx: 440, labelCy: 243 };
const NUNCHUK_Z = { cx: 480, cy: 240, r: 12, label: "Z", labelCx: 480, labelCy: 243 };

/* Cable line connecting remote to nunchuk */
const CABLE = { x1: 346, y1: 200, x2: 400, y2: 200 };

export const WiiController: React.FC<WiiControllerProps> = ({
  highlightCode,
  learnCode,
  pressedCodes,
  axes,
}) => {
  const accentCode = learnCode ?? highlightCode;
  const pressedSet = new Set(pressedCodes ?? []);

  /* Stick offsets (nunchuk left stick) */
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
      viewBox="0 0 559.383 559.383"
      width="100%"
      height="auto"
      style={{ maxWidth: 520, display: "block", margin: "0 auto" }}
      aria-label="Wii Remote + Nunchuk diagram"
    >
      {/* ── Background controller image ── */}
      <WiiControllerBg />

      {/* ── Power button ── */}
      <g>
        <circle
          cx={POWER_BTN.cx}
          cy={POWER_BTN.cy}
          r={POWER_BTN.r}
          fill={baseFill(accentCode === "power", pressedSet.has("power"))}
          stroke={baseStroke(accentCode === "power", pressedSet.has("power"))}
          strokeWidth={STYLES.circle.strokeWidth}
          opacity={accentCode === "power" || pressedSet.has("power") ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
        />
        <text
          x={POWER_BTN.labelCx}
          y={POWER_BTN.labelCy}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill={accentCode === "power" ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {POWER_BTN.label}
        </text>
      </g>

      {/* ── D-Pad ── */}
      <g>
        {/* Base vertical */}
        <rect
          x={cx - halfT}
          y={cy - armLen}
          width={armThick}
          height={armLen * 2}
          rx={STYLES.dpad.rx}
          fill={armFill(false)}
          stroke={armStroke(false)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
        {/* Base horizontal */}
        <rect
          x={cx - armLen}
          y={cy - halfT}
          width={armLen * 2}
          height={armThick}
          rx={STYLES.dpad.rx}
          fill={armFill(false)}
          stroke={armStroke(false)}
          strokeWidth={STYLES.dpad.strokeWidth}
        />
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

      {/* ── A button ── */}
      <g>
        <circle
          cx={A_BTN.cx}
          cy={A_BTN.cy}
          r={A_BTN.r}
          fill={baseFill(accentCode === "south", pressedSet.has("south"))}
          stroke={baseStroke(accentCode === "south", pressedSet.has("south"))}
          strokeWidth={STYLES.circle.strokeWidth}
          opacity={accentCode === "south" || pressedSet.has("south") ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
        />
        <text
          x={A_BTN.labelCx}
          y={A_BTN.labelCy}
          textAnchor="middle"
          fontSize={STYLES.label.fontSize}
          fontWeight={STYLES.label.fontWeight}
          fill={accentCode === "south" ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {A_BTN.label}
        </text>
      </g>

      {/* ── Small row (-, Home, +) ── */}
      {Object.entries(SMALL_ROW).map(([code, b]) => {
        const actionCode = code === "minus" ? "select" : code === "home" ? "home" : "start";
        const active = accentCode === actionCode;
        const isPressed = pressedSet.has(actionCode);
        return (
          <g key={code}>
            <circle
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active || isPressed ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
            />
            <text
              x={b.labelCx}
              y={b.labelCy}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill={active ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {/* ── 1 / 2 buttons ── */}
      {Object.entries(FACE_LOWER).map(([code, b]) => {
        const actionCode = code === "btn1" ? "west" : "north";
        const active = accentCode === actionCode;
        const isPressed = pressedSet.has(actionCode);
        return (
          <g key={code}>
            <circle
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              fill={baseFill(active, isPressed)}
              stroke={baseStroke(active, isPressed)}
              strokeWidth={STYLES.circle.strokeWidth}
              opacity={active || isPressed ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
            />
            <text
              x={b.labelCx}
              y={b.labelCy}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill={active ? STYLES.label.activeFill : STYLES.label.inactiveFill}
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {/* ── B trigger ── */}
      <g>
        <rect
          x={B_TRIGGER.x}
          y={B_TRIGGER.y}
          width={B_TRIGGER.w}
          height={B_TRIGGER.h}
          rx={STYLES.rect.rx}
          fill={baseFill(accentCode === "east", pressedSet.has("east"))}
          stroke={baseStroke(accentCode === "east", pressedSet.has("east"))}
          strokeWidth={STYLES.rect.strokeWidth}
          opacity={accentCode === "east" || pressedSet.has("east") ? STYLES.rect.activeOpacity : STYLES.rect.inactiveOpacity}
        />
        <text
          x={B_TRIGGER.labelCx}
          y={B_TRIGGER.labelCy}
          textAnchor="middle"
          fontSize={STYLES.triggerLabel.fontSize}
          fontWeight={STYLES.triggerLabel.fontWeight}
          fill={accentCode === "east" ? STYLES.triggerLabel.activeFill : STYLES.triggerLabel.inactiveFill}
        >
          {B_TRIGGER.label}
        </text>
      </g>

      {/* ── Cable line ── */}
      <line
        x1={CABLE.x1}
        y1={CABLE.y1}
        x2={CABLE.x2}
        y2={CABLE.y2}
        stroke={STYLES.colors.border}
        strokeWidth="2"
        strokeDasharray="4 2"
      />

      {/* ── Nunchuk body ── */}
      <rect
        x={NUNCHUK_BODY.x}
        y={NUNCHUK_BODY.y}
        width={NUNCHUK_BODY.w}
        height={NUNCHUK_BODY.h}
        rx={NUNCHUK_BODY.rx}
        fill={STYLES.colors.surfaceRaised}
        stroke={STYLES.colors.border}
        strokeWidth="2"
      />

      {/* ── Nunchuk analog stick ── */}
      <g>
        <circle
          cx={NUNCHUK_STICK_BASE.cx}
          cy={NUNCHUK_STICK_BASE.cy}
          r={NUNCHUK_STICK_BASE.r}
          fill={STYLES.colors.surface}
          stroke={STYLES.colors.border}
          strokeWidth={STYLES.thumbBase.strokeWidth}
          opacity={STYLES.thumbBase.opacity}
        />
        <circle
          cx={NUNCHUK_STICK.cx + lsX}
          cy={NUNCHUK_STICK.cy + lsY}
          r={NUNCHUK_STICK.r}
          fill={baseFill(accentCode === "left_thumb", pressedSet.has("left_thumb"))}
          stroke={baseStroke(accentCode === "left_thumb", pressedSet.has("left_thumb"))}
          strokeWidth={STYLES.circle.strokeWidth}
          opacity={accentCode === "left_thumb" || pressedSet.has("left_thumb") ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
        />
        <text
          x={NUNCHUK_STICK.labelCx + lsX}
          y={NUNCHUK_STICK.labelCy + lsY}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill={accentCode === "left_thumb" ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {NUNCHUK_STICK.label}
        </text>
      </g>

      {/* ── Nunchuk C button ── */}
      <g>
        <circle
          cx={NUNCHUK_C.cx}
          cy={NUNCHUK_C.cy}
          r={NUNCHUK_C.r}
          fill={baseFill(accentCode === "c", pressedSet.has("c"))}
          stroke={baseStroke(accentCode === "c", pressedSet.has("c"))}
          strokeWidth={STYLES.circle.strokeWidth}
          opacity={accentCode === "c" || pressedSet.has("c") ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
        />
        <text
          x={NUNCHUK_C.labelCx}
          y={NUNCHUK_C.labelCy}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill={accentCode === "c" ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {NUNCHUK_C.label}
        </text>
      </g>

      {/* ── Nunchuk Z button ── */}
      <g>
        <circle
          cx={NUNCHUK_Z.cx}
          cy={NUNCHUK_Z.cy}
          r={NUNCHUK_Z.r}
          fill={baseFill(accentCode === "z", pressedSet.has("z"))}
          stroke={baseStroke(accentCode === "z", pressedSet.has("z"))}
          strokeWidth={STYLES.circle.strokeWidth}
          opacity={accentCode === "z" || pressedSet.has("z") ? STYLES.circle.activeOpacity : STYLES.circle.inactiveOpacity}
        />
        <text
          x={NUNCHUK_Z.labelCx}
          y={NUNCHUK_Z.labelCy}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill={accentCode === "z" ? STYLES.label.activeFill : STYLES.label.inactiveFill}
        >
          {NUNCHUK_Z.label}
        </text>
      </g>
    </svg>
  );
};
