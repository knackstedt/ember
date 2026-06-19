import React, { useEffect, useState } from "react";

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

  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: format === "12h",
  });

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      {title && (
        <span className="text-xs font-medium opacity-60 uppercase tracking-wider">
          {title}
        </span>
      )}
      <span
        className="text-3xl font-bold tabular-nums"
        style={{ color: "var(--color-accent)" }}
      >
        {timeStr}
      </span>
      {showDate && (
        <span className="text-sm opacity-50">{dateStr}</span>
      )}
    </div>
  );
};
