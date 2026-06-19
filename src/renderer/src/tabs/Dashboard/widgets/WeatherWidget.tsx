import React from "react";
import { Cloud, Sun, CloudRain, Snowflake, Wind, Droplets } from "lucide-react";

export const WeatherWidget: React.FC<{
  title?: string;
  config?: Record<string, unknown>;
}> = ({ title, config }) => {
  const location = (config?.location as string) || "Local";

  // Placeholder weather display — could be wired to a real weather API
  const conditions = [
    { icon: Sun, label: "Sunny", temp: "24°" },
    { icon: Cloud, label: "Cloudy", temp: "18°" },
    { icon: CloudRain, label: "Rainy", temp: "15°" },
    { icon: Snowflake, label: "Snow", temp: "-2°" },
  ];
  const condition = conditions[location.length % conditions.length];
  const Icon = condition.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      {title && (
        <span className="text-[10px] font-medium opacity-60 uppercase tracking-wider">
          {title}
        </span>
      )}
      <div className="flex items-center gap-2">
        <Icon size={24} style={{ color: "var(--color-accent)" }} />
        <span className="text-xl font-bold">{condition.temp}</span>
      </div>
      <span className="text-xs opacity-60">{condition.label}</span>
      <span className="text-[10px] opacity-40">{location}</span>
      <div className="flex items-center gap-2 text-[10px] opacity-50">
        <span className="flex items-center gap-0.5">
          <Wind size={10} /> 12 km/h
        </span>
        <span className="flex items-center gap-0.5">
          <Droplets size={10} /> 45%
        </span>
      </div>
    </div>
  );
};
