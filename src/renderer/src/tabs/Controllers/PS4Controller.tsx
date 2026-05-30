import React from 'react'

interface PS4ControllerProps {
  highlightCode?: string | null
  learnCode?: string | null
}

const BUTTON_POSITIONS: Record<string, { cx: number; cy: number; r: number; label: string; color?: string }> = {
  south:         { cx: 302, cy: 133, r: 11, label: '✕', color: '#6fa8e0' },
  east:          { cx: 320, cy: 116, r: 11, label: '○', color: '#e05252' },
  west:          { cx: 284, cy: 116, r: 11, label: '□', color: '#d499e8' },
  north:         { cx: 302, cy:  99, r: 11, label: '△', color: '#5bbfaa' },
  left_bumper:   { cx: 120, cy:  60, r:  9, label: 'L1', color: undefined },
  right_bumper:  { cx: 280, cy:  60, r:  9, label: 'R1', color: undefined },
  select:        { cx: 166, cy: 108, r:  8, label: 'SH', color: undefined },
  start:         { cx: 234, cy: 108, r:  8, label: 'OP', color: undefined },
  home:          { cx: 200, cy: 106, r: 11, label: 'PS', color: '#3a8cd4' },
  left_thumb:    { cx: 148, cy: 152, r: 10, label: 'L3', color: undefined },
  right_thumb:   { cx: 252, cy: 152, r: 10, label: 'R3', color: undefined },
  dpad_up:       { cx: 200, cy:  92, r:  7, label: '▲',  color: undefined },
  dpad_down:     { cx: 200, cy: 118, r:  7, label: '▼',  color: undefined },
  dpad_left:     { cx: 186, cy: 105, r:  7, label: '◀',  color: undefined },
  dpad_right:    { cx: 214, cy: 105, r:  7, label: '▶',  color: undefined },
  touchpad:      { cx: 200, cy: 120, r: 14, label: '▭',   color: '#4a4a5a' },
}

const TRIGGER_POSITIONS: Record<string, { x: number; y: number; w: number; h: number; label: string }> = {
  left_trigger:  { x:  88, y: 28, w: 56, h: 22, label: 'L2' },
  right_trigger: { x: 256, y: 28, w: 56, h: 22, label: 'R2' },
}

export const PS4Controller: React.FC<PS4ControllerProps> = ({ highlightCode, learnCode }) => {
  const accentCode = learnCode ?? highlightCode

  return (
    <svg
      viewBox="60 18 280 162"
      width="100%"
      height="auto"
      style={{ maxWidth: 380, display: 'block', margin: '0 auto' }}
      aria-label="PS4 controller diagram"
    >
      {/* Body — PS4 has a lighter bar / more rectangular shape */}
      <path
        d="M 100 58 Q 92 42 122 36 L 160 30 Q 185 26 200 28 Q 215 26 240 30 L 278 36 Q 308 42 300 58
           L 318 118 Q 338 152 312 168 Q 282 183 258 168 L 240 158 Q 220 153 200 153 Q 180 153 160 158
           L 142 168 Q 118 183 88 168 Q 62 152 82 118 Z"
        fill="var(--color-surface-raised)"
        stroke="var(--color-border)"
        strokeWidth="2"
      />
      {/* Light bar */}
      <rect x="178" y="28" width="44" height="5" rx="2"
        fill="#3a8cd4" opacity="0.7" />

      {/* Triggers */}
      {Object.entries(TRIGGER_POSITIONS).map(([code, t]) => {
        const active = accentCode === code
        return (
          <g key={code}>
            <rect
              x={t.x} y={t.y} width={t.w} height={t.h} rx="4"
              fill={active ? 'var(--color-accent)' : 'var(--color-surface)'}
              stroke={active ? 'var(--color-accent)' : 'var(--color-border)'}
              strokeWidth="1.5"
              opacity={active ? 1 : 0.85}
            />
            <text
              x={t.x + t.w / 2} y={t.y + t.h / 2 + 4}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill={active ? 'var(--color-bg)' : 'var(--color-text-dim)'}
            >
              {t.label}
            </text>
          </g>
        )
      })}

      {/* Face buttons + d-pad + thumbsticks */}
      {Object.entries(BUTTON_POSITIONS).map(([code, b]) => {
        const active = accentCode === code
        const baseColor = active ? (b.color ?? 'var(--color-accent)') : (b.color ? `${b.color}33` : 'var(--color-surface)')
        const borderColor = active ? (b.color ?? 'var(--color-accent)') : (b.color ?? 'var(--color-border)')
        return (
          <g key={code}>
            <circle
              cx={b.cx} cy={b.cy} r={b.r}
              fill={baseColor}
              stroke={borderColor}
              strokeWidth="1.5"
              opacity={active ? 1 : 0.85}
            />
            <text
              x={b.cx} y={b.cy + 4}
              textAnchor="middle"
              fontSize={b.r < 9 ? 7 : b.r > 12 ? 9 : 8}
              fontWeight="700"
              fill={active ? '#fff' : (b.color ?? 'var(--color-text-dim)')}
            >
              {b.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
