import React, { useMemo } from "react";
import { useMoviesStore } from "../../../store/media.store";
import { Movie } from "@shared/types";
import { Film, Clapperboard, Play } from "lucide-react";

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
      await window.htpc.movies.launch(m);
    } catch (err: any) {
      console.error("[dashboard] failed to play movie:", err);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1 text-[10px] font-medium opacity-50 uppercase tracking-wider">
          <Film size={10} />
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
        {recent.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm opacity-40">
            No recent movies
          </div>
        )}
        {recent.map((m) => (
          <button
            key={m.id}
            onClick={() => play(m)}
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
              {m.coverUrl ? (
                <img src={m.coverUrl} alt="" className="w-8 h-11 object-cover rounded-lg" loading="lazy" />
              ) : (
                <div className="w-8 h-11 rounded-lg flex items-center justify-center" style={{ background: "var(--surface-0)" }}>
                  <Clapperboard size={14} className="opacity-40" />
                </div>
              )}
              <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
                <Play size={12} style={{ color: "#fff" }} />
              </div>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0">
              <div className="truncate font-medium text-xs">{m.title}</div>
              <div className="flex items-center gap-1">
                {m.releaseYear && <span className="text-[9px] opacity-40">{m.releaseYear}</span>}
                <span className="text-[9px] opacity-30">{timeAgo(m.lastPlayed!)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
