import React, { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";

interface ClockWidgetProps {
  title?: string;
  format?: "12h" | "24h";
  showDate?: boolean;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({
  title,
  format = "24h",
  showDate = true,
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const displayHours = format === "12h" ? (hours % 12 || 12) : hours;
  const ampm = format === "12h" ? (hours >= 12 ? "PM" : "AM") : "";

  const pad = (n: number) => String(n).padStart(2, "0");

  const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
  const dateStr = now.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const yearStr = now.toLocaleDateString(undefined, { year: "numeric" });

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-0 gap-1 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03] rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, var(--color-accent) 0%, transparent 70%)`,
        }}
      />

      {title && (
        <div className="flex items-center gap-1 text-[10px] font-medium opacity-50 uppercase tracking-wider z-10">
          <Clock size={10} />
          {title}
        </div>
      )}

      <div className="flex items-baseline gap-1 z-10">
        <span className="text-5xl font-bold tabular-nums leading-none" style={{ color: "var(--color-text)" }}>
          {pad(displayHours)}
        </span>
        <span className="text-5xl font-light tabular-nums leading-none animate-pulse" style={{ color: "var(--color-accent-dim)" }}>
          :
        </span>
        <span className="text-5xl font-bold tabular-nums leading-none" style={{ color: "var(--color-text)" }}>
          {pad(minutes)}
        </span>
        <span className="flex flex-col gap-0.5 ml-1">
          <span className="text-lg font-semibold tabular-nums leading-none" style={{ color: "var(--color-accent)" }}>
            {pad(seconds)}
          </span>
          {ampm && (
            <span className="text-[10px] opacity-50 uppercase leading-none">{ampm}</span>
          )}
        </span>
      </div>

      {showDate && (
        <div className="flex items-center gap-1 text-[10px] opacity-60 z-10">
          <Calendar size={10} />
          <span>{dayName}, {dateStr} {yearStr}</span>
        </div>
      )}
    </div>
  );
};
