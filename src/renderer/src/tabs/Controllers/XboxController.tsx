import React from "react";

interface XboxControllerProps {
  highlightCode?: string | null;
  learnCode?: string | null;
}

const BUTTON_POSITIONS: Record<
  string,
  { cx: number; cy: number; r: number; label: string; color?: string }
> = {
  south: { cx: 302, cy: 135, r: 11, label: "A", color: "#5bba47" },
  east: { cx: 320, cy: 118, r: 11, label: "B", color: "#e05252" },
  west: { cx: 284, cy: 118, r: 11, label: "X", color: "#5b9bd5" },
  north: { cx: 302, cy: 102, r: 11, label: "Y", color: "#f0c040" },
  left_bumper: { cx: 120, cy: 62, r: 9, label: "LB", color: undefined },
  right_bumper: { cx: 280, cy: 62, r: 9, label: "RB", color: undefined },
  select: { cx: 168, cy: 110, r: 8, label: "⧉", color: undefined },
  start: { cx: 232, cy: 110, r: 8, label: "≡", color: undefined },
  home: { cx: 200, cy: 108, r: 12, label: "⬤", color: "#3a8cd4" },
  left_thumb: { cx: 140, cy: 148, r: 10, label: "LS", color: undefined },
  right_thumb: { cx: 260, cy: 148, r: 10, label: "RS", color: undefined },
  dpad_up: { cx: 200, cy: 96, r: 7, label: "▲", color: undefined },
  dpad_down: { cx: 200, cy: 122, r: 7, label: "▼", color: undefined },
  dpad_left: { cx: 186, cy: 109, r: 7, label: "◀", color: undefined },
  dpad_right: { cx: 214, cy: 109, r: 7, label: "▶", color: undefined },
};

const TRIGGER_POSITIONS: Record<
  string,
  { x: number; y: number; w: number; h: number; label: string }
> = {
  left_trigger: { x: 90, y: 30, w: 56, h: 22, label: "LT" },
  right_trigger: { x: 254, y: 30, w: 56, h: 22, label: "RT" },
};

export const XboxController: React.FC<XboxControllerProps> = ({
  highlightCode,
  learnCode,
}) => {
  const accentCode = learnCode ?? highlightCode;

  return (
    <svg
      viewBox="60 20 280 160"
      width="100%"
      height="auto"
      style={{ maxWidth: 380, display: "block", margin: "0 auto" }}
      aria-label="Xbox controller diagram"
    >
      {/* Body */}
      <path
        d="M 100 60 Q 95 45 120 38 L 160 32 Q 185 28 200 30 Q 215 28 240 32 L 280 38 Q 305 45 300 60
           L 320 120 Q 340 155 315 170 Q 285 185 260 170 L 240 160 Q 220 155 200 155 Q 180 155 160 160
           L 140 170 Q 115 185 85 170 Q 60 155 80 120 Z"
        fill="var(--color-surface-raised)"
        stroke="var(--color-border)"
        strokeWidth="2"
      />

      {/* Triggers */}
      {Object.entries(TRIGGER_POSITIONS).map(([code, t]) => {
        const active = accentCode === code;
        return (
          <g key={code}>
            <rect
              x={t.x}
              y={t.y}
              width={t.w}
              height={t.h}
              rx="4"
              fill={active ? "var(--color-accent)" : "var(--color-surface)"}
              stroke={active ? "var(--color-accent)" : "var(--color-border)"}
              strokeWidth="1.5"
              opacity={active ? 1 : 0.85}
            />
            <text
              x={t.x + t.w / 2}
              y={t.y + t.h / 2 + 4}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill={active ? "var(--color-bg)" : "var(--color-text-dim)"}
            >
              {t.label}
            </text>
          </g>
        );
      })}

      {/* Face buttons + d-pad + thumbsticks */}
      {Object.entries(BUTTON_POSITIONS).map(([code, b]) => {
        const active = accentCode === code;
        const baseColor = active
          ? (b.color ?? "var(--color-accent)")
          : "var(--color-surface)";
        const borderColor = active
          ? (b.color ?? "var(--color-accent)")
          : "var(--color-border)";
        return (
          <g key={code}>
            <circle
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              fill={baseColor}
              stroke={borderColor}
              strokeWidth="1.5"
              opacity={active ? 1 : 0.8}
            />
            <text
              x={b.cx}
              y={b.cy + 4}
              textAnchor="middle"
              fontSize={b.r < 9 ? 7 : 8}
              fontWeight="700"
              fill={active ? "#fff" : "var(--color-text-dim)"}
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
