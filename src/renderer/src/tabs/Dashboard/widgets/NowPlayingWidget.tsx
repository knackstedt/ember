import React from "react";
import { useMusicPlayerStore } from "../../../store/musicPlayer.store";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";

export const NowPlayingWidget: React.FC<{ title?: string }> = ({ title }) => {
  const current = useMusicPlayerStore((s) => s.current);
  const isPlaying = useMusicPlayerStore((s) => s.isPlaying);
  const toggle = useMusicPlayerStore((s) => s.toggle);
  const prev = useMusicPlayerStore((s) => s.prev);
  const next = useMusicPlayerStore((s) => s.next);

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-sm opacity-40">
        <Music size={24} />
        <span>Nothing playing</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2 overflow-hidden">
      {title && (
        <div className="text-xs font-medium opacity-60 uppercase tracking-wider">
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        {current.albumArtUrl ? (
          <img
            src={current.albumArtUrl}
            alt=""
            className="w-16 h-16 object-cover rounded"
          />
        ) : (
          <div
            className="w-16 h-16 rounded flex items-center justify-center"
            style={{ background: "var(--color-surface-raised)" }}
          >
            <Music size={24} className="opacity-40" />
          </div>
        )}
        <div className="text-center min-w-0 px-2">
          <div className="font-medium text-sm truncate">{current.title}</div>
          <div className="text-xs opacity-50 truncate">
            {current.artist ?? "Unknown artist"}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={prev}
          className="p-1.5 rounded transition-colors hover:opacity-80"
          style={{ background: "var(--color-surface-raised)" }}
        >
          <SkipBack size={14} />
        </button>
        <button
          onClick={toggle}
          className="p-2 rounded transition-colors hover:opacity-80"
          style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          onClick={next}
          className="p-1.5 rounded transition-colors hover:opacity-80"
          style={{ background: "var(--color-surface-raised)" }}
        >
          <SkipForward size={14} />
        </button>
      </div>
    </div>
  );
};
