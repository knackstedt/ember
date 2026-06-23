import React, { useEffect, useState } from "react";
import { useGamesStore } from "../../../store/games.store";
import { Game, GamePlatform } from "@shared/types";
import { Clock, Play, Gamepad2 } from "lucide-react";

const PLATFORM_COLORS: Record<GamePlatform, string> = {
  steam: "#1b2838",
  gog: "#86328a",
  lutris: "#ff9900",
  heroic: "#e0e0e0",
  "dolphin-gc": "#5c2d91",
  "dolphin-wii": "#5c2d91",
  nes: "#c0392b",
  snes: "#8e44ad",
  gb: "#27ae60",
  gba: "#2980b9",
  n64: "#f39c12",
  genesis: "#34495e",
  sms: "#16a085",
  gamegear: "#2c3e50",
  pce: "#e67e22",
  psx: "#2c3e50",
  ps2: "#3498db",
  ps3: "#9b59b6",
  psp: "#1abc9c",
  xbox360: "#27ae60",
  nds: "#c0392b",
  dreamcast: "#e74c3c",
  flash: "#f1c40f",
  dos: "#95a5a6",
  windows: "#3498db",
  desktop: "#7f8c8d",
  itch: "#fa5c5c",
  unknown: "#7f8c8d",
};

function formatPlayTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export const RecentGamesWidget: React.FC<{ title?: string; maxItems?: number }> = ({
  title,
  maxItems = 5,
}) => {
  const games = useGamesStore((s) => s.games);
  const [recent, setRecent] = useState<Game[]>([]);

  useEffect(() => {
    const sorted = [...games]
      .filter((g) => g.lastPlayed && g.lastPlayed > 0)
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
      .slice(0, maxItems);
    setRecent(sorted);
  }, [games, maxItems]);

  const launch = async (g: Game) => {
    try {
      await window.htpc.games.launch(g);
    } catch (err: any) {
      console.error("[dashboard] failed to launch game:", err);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1 text-[12px] font-medium opacity-50 uppercase tracking-wider">
          <Clock size={10} />
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
        {recent.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm opacity-40">
            No recent games
          </div>
        )}
        {recent.map((g) => (
          <button
            key={g.id}
            onClick={() => launch(g)}
            className="group flex items-center gap-2 px-1.5 py-1 rounded-xl text-left text-sm transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: "var(--surface-1)",
              border: "1px solid transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.boxShadow = "var(--shadow-card)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div className="relative flex-shrink-0">
              {g.coverUrl ? (
                <img src={g.coverUrl} alt="" className="w-8 h-10 object-cover rounded-lg" loading="lazy" />
              ) : (
                <div className="w-8 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--surface-0)" }}>
                  <Gamepad2 size={14} className="opacity-40" />
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--accent)" }}>
                <Play size={7} style={{ color: "var(--surface-base)" }} />
              </div>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0">
              <div className="truncate font-medium text-xs">{g.title}</div>
              <div className="flex items-center gap-1">
                <span className="text-[12px] px-1 py-0.5 rounded font-medium uppercase" style={{ background: PLATFORM_COLORS[g.platform] ?? "#7f8c8d", color: "#fff" }}>
                  {g.platform}
                </span>
                <span className="text-[12px] opacity-40">{timeAgo(g.lastPlayed!)}</span>
              </div>
              {g.playTime && g.playTime > 0 && (
                <span className="text-[12px] opacity-30">{formatPlayTime(g.playTime)} played</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
