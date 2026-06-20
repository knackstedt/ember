import React, { useMemo } from "react";
import { useMusicStore } from "../../../store/media.store";
import { useMusicPlayerStore } from "../../../store/musicPlayer.store";
import { MusicTrack } from "../../../../shared/types";
import { Disc, Music, Play } from "lucide-react";

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

export const RecentMusicWidget: React.FC<{ title?: string; maxItems?: number }> = ({
  title,
  maxItems = 5,
}) => {
  const tracks = useMusicStore((s) => s.tracks);
  const playTrack = useMusicPlayerStore((s) => s.play);

  const recent = useMemo(() => {
    return [...tracks]
      .filter((t) => t.lastPlayed && t.lastPlayed > 0)
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
      .slice(0, maxItems);
  }, [tracks, maxItems]);

  const play = (t: MusicTrack) => {
    playTrack([t], 0);
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1 text-[10px] font-medium opacity-50 uppercase tracking-wider">
          <Disc size={10} />
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "thin" }}>
        {recent.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm opacity-40">
            No recent tracks
          </div>
        )}
        {recent.map((t) => (
          <button
            key={t.id}
            onClick={() => play(t)}
            className="group flex items-center gap-2 px-1.5 py-1 rounded-xl text-left text-sm transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.boxShadow = "var(--shadow-card)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div className="relative flex-shrink-0">
              {t.albumArtUrl ? (
                <img src={t.albumArtUrl} alt="" className="w-8 h-8 object-cover rounded-lg" loading="lazy" />
              ) : (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
                  <Music size={12} className="opacity-40" />
                </div>
              )}
              <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
                <Play size={10} style={{ color: "#fff" }} />
              </div>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0">
              <div className="truncate font-medium text-xs">{t.title}</div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] opacity-40 truncate">{t.artist ?? "Unknown"}</span>
                <span className="text-[9px] opacity-30">{timeAgo(t.lastPlayed!)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
