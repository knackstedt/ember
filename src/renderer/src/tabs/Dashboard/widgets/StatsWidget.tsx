import React, { useMemo } from "react";
import { useGamesStore } from "../../../store/games.store";
import { useMoviesStore, useMusicStore, useTvStore } from "../../../store/media.store";
import { Gamepad2, Film, Music, Tv } from "lucide-react";

function RingStat({
  value,
  pct,
  label,
  icon: Icon,
  color,
}: {
  value: number;
  pct: number;
  label: string;
  icon: React.ElementType;
  color: string;
}) {
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (Math.min(pct, 100) / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="relative w-11 h-11">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="var(--color-surface-raised)"
            strokeWidth="3"
          />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon size={12} style={{ color, opacity: 0.9 }} />
        </div>
      </div>
      <span className="text-lg font-bold tabular-nums leading-none">{value}</span>
      <span className="text-[9px] opacity-50 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export const StatsWidget: React.FC<{ title?: string }> = ({ title }) => {
  const games = useGamesStore((s) => s.games);
  const movies = useMoviesStore((s) => s.movies);
  const music = useMusicStore((s) => s.tracks);
  const tv = useTvStore((s) => s.shows);

  const totalPlaytime = useMemo(() => {
    const minutes = games.reduce((sum, g) => sum + (g.playTime ?? 0), 0);
    return Math.floor(minutes / 60);
  }, [games]);

  const total = games.length + movies.length + music.length + tv.length;
  const completionRate = games.length > 0 ? Math.round((games.filter((g) => g.status === "completed").length / games.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full min-h-0 gap-2 overflow-hidden">
      {title && (
        <div className="text-[10px] font-medium opacity-50 uppercase tracking-wider">
          {title}
        </div>
      )}
      <div className="flex-1 grid grid-cols-2 gap-2 min-h-0">
        <RingStat value={games.length} pct={total > 0 ? (games.length / total) * 100 : 0} label="Games" icon={Gamepad2} color="#7dd3fc" />
        <RingStat value={movies.length} pct={total > 0 ? (movies.length / total) * 100 : 0} label="Movies" icon={Film} color="#fca5a5" />
        <RingStat value={music.length} pct={total > 0 ? (music.length / total) * 100 : 0} label="Tracks" icon={Music} color="#86efac" />
        <RingStat value={tv.length} pct={total > 0 ? (tv.length / total) * 100 : 0} label="Shows" icon={Tv} color="#c4b5fd" />
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t text-[10px] opacity-50" style={{ borderColor: "var(--color-border)" }}>
        <span className="truncate">{totalPlaytime}h played</span>
        {games.length > 0 && (
          <span className="truncate">{completionRate}% done</span>
        )}
      </div>
    </div>
  );
};
