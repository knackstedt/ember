import React, { useMemo } from "react";
import { useMusicStore } from "../../../store/media.store";
import { useMusicPlayerStore } from "../../../store/musicPlayer.store";
import { MusicTrack } from "../../../../shared/types";
import { Disc, Music } from "lucide-react";

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
    playTrack(t);
  };

  return (
    <div className="flex flex-col h-full gap-2 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-60 uppercase tracking-wider">
          <Disc size={12} />
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {recent.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm opacity-40">
            No recent tracks
          </div>
        )}
        {recent.map((t) => (
          <button
            key={t.id}
            onClick={() => play(t)}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors hover:opacity-80"
            style={{ background: "var(--color-surface-raised)" }}
          >
            {t.albumArtUrl ? (
              <img src={t.albumArtUrl} alt="" className="w-8 h-8 object-cover rounded flex-shrink-0" loading="lazy" />
            ) : (
              <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: "var(--color-surface)" }}>
                <Music size={14} className="opacity-40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium text-sm">{t.title}</div>
              <div className="text-xs opacity-40 truncate">{t.artist ?? "Unknown artist"}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
