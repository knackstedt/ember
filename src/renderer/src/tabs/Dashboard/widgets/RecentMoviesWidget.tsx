import React, { useMemo } from "react";
import { useMoviesStore } from "../../../store/media.store";
import { Movie } from "../../../../shared/types";
import { Film, Clapperboard } from "lucide-react";

export const RecentMoviesWidget: React.FC<{ title?: string; maxItems?: number }> = ({
  title,
  maxItems = 5,
}) => {
  const movies = useMoviesStore((s) => s.movies);

  const recent = useMemo(() => {
    return [...movies]
      .filter((m) => m.lastPlayed && m.lastPlayed > 0)
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
      .slice(0, maxItems);
  }, [movies, maxItems]);

  const play = async (m: Movie) => {
    try {
      await window.htpc.movies.play(m);
    } catch (err: any) {
      console.error("[dashboard] failed to play movie:", err);
    }
  };

  return (
    <div className="flex flex-col h-full gap-2 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-60 uppercase tracking-wider">
          <Film size={12} />
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {recent.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm opacity-40">
            No recent movies
          </div>
        )}
        {recent.map((m) => (
          <button
            key={m.id}
            onClick={() => play(m)}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors hover:opacity-80"
            style={{ background: "var(--color-surface-raised)" }}
          >
            {m.coverUrl ? (
              <img src={m.coverUrl} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0" loading="lazy" />
            ) : (
              <div className="w-8 h-12 rounded flex items-center justify-center flex-shrink-0" style={{ background: "var(--color-surface)" }}>
                <Clapperboard size={14} className="opacity-40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium text-sm">{m.title}</div>
              <div className="text-xs opacity-40">{m.releaseYear ?? "Unknown year"}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
