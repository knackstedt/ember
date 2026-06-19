import React, { useMemo } from "react";
import { useGamesStore } from "../../../store/games.store";
import { useMoviesStore, useMusicStore, useTvStore } from "../../../store/media.store";
import { Gamepad2, Film, Music, Tv } from "lucide-react";

export const StatsWidget: React.FC<{ title?: string }> = ({ title }) => {
  const games = useGamesStore((s) => s.games);
  const movies = useMoviesStore((s) => s.movies);
  const music = useMusicStore((s) => s.tracks);
  const tv = useTvStore((s) => s.shows);

  const totalPlaytime = useMemo(() => {
    const minutes = games.reduce((sum, g) => sum + (g.playTime ?? 0), 0);
    const hours = Math.floor(minutes / 60);
    return hours;
  }, [games]);

  const stats = [
    { label: "Games", value: games.length, icon: Gamepad2, color: "#7dd3fc" },
    { label: "Movies", value: movies.length, icon: Film, color: "#fca5a5" },
    { label: "Tracks", value: music.length, icon: Music, color: "#86efac" },
    { label: "Shows", value: tv.length, icon: Tv, color: "#c4b5fd" },
  ];

  return (
    <div className="flex flex-col h-full gap-2 overflow-hidden">
      {title && (
        <div className="text-xs font-medium opacity-60 uppercase tracking-wider">
          {title}
        </div>
      )}
      <div className="flex-1 grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center justify-center gap-1 rounded p-2"
            style={{ background: "var(--color-surface-raised)" }}
          >
            <s.icon size={18} style={{ color: s.color, opacity: 0.8 }} />
            <span className="text-xl font-bold tabular-nums">{s.value}</span>
            <span className="text-[10px] opacity-50 uppercase">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="text-center text-xs opacity-50">
        {totalPlaytime} hours played
      </div>
    </div>
  );
};
