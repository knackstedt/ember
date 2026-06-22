import React from "react";

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  label?: string;
  valueLabel?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  color = "var(--accent)",
  height = 6,
  label,
  valueLabel,
}) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="flex flex-col gap-0.5 w-full min-h-0">
      {(label || valueLabel) && (
        <div className="flex items-center justify-between text-[9px] opacity-60">
          <span className="truncate">{label}</span>
          <span className="truncate">{valueLabel}</span>
        </div>
      )}
      <div className="w-full rounded-full overflow-hidden" style={{ height, background: "var(--surface-1)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color, opacity: 0.85 }} />
      </div>
    </div>
  );
};
