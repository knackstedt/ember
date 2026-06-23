import React from "react";
import { useMusicPlayerStore } from "../../../store/musicPlayer.store";
import { Music, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { getTrackDisplayName } from "../../../music/lib/track-title";

export const NowPlayingWidget: React.FC<{ title?: string }> = ({ title }) => {
  const queue = useMusicPlayerStore((s) => s.queue);
  const currentIndex = useMusicPlayerStore((s) => s.currentIndex);
  const playing = useMusicPlayerStore((s) => s.playing);
  const position = useMusicPlayerStore((s) => s.position);
  const duration = useMusicPlayerStore((s) => s.duration);
  const pause = useMusicPlayerStore((s) => s.pause);
  const resume = useMusicPlayerStore((s) => s.resume);
  const prev = useMusicPlayerStore((s) => s.prev);
  const next = useMusicPlayerStore((s) => s.next);

  const current = queue[currentIndex];

  const formatTime = (ms: number) => {
    if (!ms || ms <= 0) return "0:00";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-sm opacity-40">
        <Music size={24} />
        <span>Nothing playing</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1 text-[12px] font-medium opacity-50 uppercase tracking-wider">
          <Volume2 size={10} />
          {title}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center gap-1.5 min-h-0">
        <div className="relative flex-shrink-0">
          {current.albumArtUrl ? (
            <>
              <img src={current.albumArtUrl} alt="" className="w-14 h-14 object-cover rounded-xl" />
              <div className="absolute inset-0 rounded-xl opacity-20 blur-md -z-10" style={{ backgroundImage: `url(${current.albumArtUrl})`, backgroundSize: "cover", transform: "scale(1.2)" }} />
            </>
          ) : (
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: "var(--surface-1)" }}>
              <Music size={20} className="opacity-40" />
            </div>
          )}
        </div>

        <div className="text-center min-w-0 px-1">
          <div className="font-medium text-xs truncate">{getTrackDisplayName(current)}</div>
          <div className="text-[12px] opacity-50 truncate">{current.artist ?? "Unknown artist"}</div>
          {current.album && <div className="text-[12px] opacity-30 truncate">{current.album}</div>}
        </div>

        <div className="w-full flex flex-col gap-0.5 px-1">
          <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: "var(--surface-1)" }}>
            <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: "var(--accent)", transition: "width 0.3s linear" }} />
          </div>
          <div className="flex justify-between text-[12px] opacity-30 tabular-nums">
            <span>{formatTime(position)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 flex-shrink-0">
        <button onClick={prev} className="p-1 rounded-lg transition-colors hover:opacity-80" style={{ background: "var(--surface-1)" }}>
          <SkipBack size={10} />
        </button>
        <button onClick={playing ? pause : resume} className="p-1.5 rounded-xl transition-all hover:scale-105" style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={next} className="p-1 rounded-lg transition-colors hover:opacity-80" style={{ background: "var(--surface-1)" }}>
          <SkipForward size={10} />
        </button>
      </div>
    </div>
  );
};
