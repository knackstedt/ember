import React from "react";
import { Cloud, Sun, CloudRain, Snowflake, Wind, Droplets, Thermometer, CloudLightning } from "lucide-react";

const CONDITIONS = [
  { icon: Sun, label: "Sunny", temp: 24, feel: 26, wind: 8, humidity: 42, forecast: [26, 28, 24, 22] },
  { icon: Cloud, label: "Cloudy", temp: 18, feel: 16, wind: 14, humidity: 68, forecast: [19, 20, 17, 16] },
  { icon: CloudRain, label: "Rainy", temp: 15, feel: 13, wind: 22, humidity: 82, forecast: [16, 14, 13, 12] },
  { icon: Snowflake, label: "Snow", temp: -2, feel: -5, wind: 18, humidity: 55, forecast: [-1, -3, -5, -4] },
  { icon: CloudLightning, label: "Storm", temp: 21, feel: 23, wind: 30, humidity: 90, forecast: [22, 20, 19, 21] },
];

export const WeatherWidget: React.FC<{
  title?: string;
  config?: Record<string, unknown>;
}> = ({ title, config }) => {
  const location = (config?.location as string) || "Local";
  const condition = CONDITIONS[location.length % CONDITIONS.length];
  const Icon = condition.icon;
  const forecastLabels = ["Now", "+3h", "+6h", "+9h"];

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1 text-[10px] font-medium opacity-50 uppercase tracking-wider">
          <Thermometer size={10} />
          {title}
        </div>
      )}

      <div className="flex-1 flex flex-col gap-1.5 min-h-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="p-1.5 rounded-xl" style={{ background: "var(--color-surface-raised)" }}>
              <Icon size={24} style={{ color: "var(--color-accent)" }} />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold tabular-nums leading-none">{condition.temp}°</span>
              <span className="text-[10px] opacity-50">{condition.label}</span>
            </div>
          </div>
          <div className="flex flex-col gap-0 text-[10px] opacity-50 text-right">
            <span>{location}</span>
            <span>Feels {condition.feel}°</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-0.5 text-[10px] opacity-50">
            <Wind size={10} /> {condition.wind} km/h
          </span>
          <span className="flex items-center gap-0.5 text-[10px] opacity-50">
            <Droplets size={10} /> {condition.humidity}%
          </span>
        </div>

        <div className="flex-1 flex items-stretch gap-1.5 min-h-0">
          {condition.forecast.map((temp, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-center gap-0.5 p-1 rounded-lg" style={{ background: "var(--color-surface-raised)" }}>
              <span className="text-[9px] opacity-40">{forecastLabels[i]}</span>
              <span className="text-sm font-semibold">{temp}°</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
