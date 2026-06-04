import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  SkipForward,
  SkipBack,
} from "lucide-react";
import { useMusicPlayerStore } from "../../store/musicPlayer.store";

const BLADE_WIDTH = 280;
const COLLAPSED_WIDTH = 40;

function fmt(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export const QueueBlade: React.FC = () => {
  const {
    queue,
    currentIndex,
    playing,
    bladeCollapsed,
    toggleBlade,
    next,
    prev,
    play,
    pause,
    resume,
  } = useMusicPlayerStore();

  const currentTrack = queue[currentIndex];

  return (
    <motion.div
      className="flex-shrink-0 h-full relative flex"
      style={{
        width: bladeCollapsed ? COLLAPSED_WIDTH : BLADE_WIDTH,
        background: "var(--color-surface-raised)",
        borderLeft: "1px solid var(--color-border)",
      }}
      initial={{ width: COLLAPSED_WIDTH, opacity: 0 }}
      animate={{ width: bladeCollapsed ? COLLAPSED_WIDTH : BLADE_WIDTH, opacity: 1 }}
      exit={{ width: COLLAPSED_WIDTH, opacity: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 400 }}
    >
      {/* Collapse/expand toggle strip */}
      <button
        onClick={toggleBlade}
        className="flex-shrink-0 h-full flex flex-col items-center justify-center gap-1 cursor-pointer"
        style={{ width: COLLAPSED_WIDTH, color: "var(--color-text-dim)" }}
        aria-label={bladeCollapsed ? "Expand queue" : "Collapse queue"}
        title={bladeCollapsed ? "Expand queue" : "Collapse queue"}
      >
        <span
          className="text-lg select-none"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: bladeCollapsed ? undefined : "rotate(180deg)",
          }}
        >
          {bladeCollapsed ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </span>
        {bladeCollapsed && queue.length > 0 && (
          <span
            className="text-[10px] select-none"
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
            }}
          >
            Queue ({queue.length})
          </span>
        )}
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {!bladeCollapsed && (
          <motion.div
            key="blade-content"
            className="flex-1 min-w-0 flex flex-col h-full overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-3 py-2 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <span
                className="text-sm font-semibold truncate"
                style={{ color: "var(--color-text)" }}
              >
                Queue
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--color-text-dim)" }}
              >
                {queue.length} tracks
              </span>
            </div>

            {/* Current track card */}
            {currentTrack && (
              <div
                className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-[var(--radius-card)] flex-shrink-0 overflow-hidden"
                  style={{ background: "var(--color-bg)" }}
                >
                  {currentTrack.albumArtUrl ? (
                    <img
                      src={currentTrack.albumArtUrl}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg select-none">
                      ♪
                    </div>
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className="text-xs font-medium truncate"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {playing ? "Now Playing" : "Paused"}
                  </span>
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--color-text)" }}
                    title={currentTrack.title}
                  >
                    {currentTrack.title}
                  </span>
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--color-text-dim)" }}
                    title={currentTrack.artist ?? currentTrack.album}
                  >
                    {currentTrack.artist ?? currentTrack.album ?? ""}
                  </span>
                </div>
              </div>
            )}

            {/* Mini controls */}
            {currentTrack && (
              <div className="flex items-center justify-center gap-1 px-3 py-1.5 flex-shrink-0">
                <button
                  onClick={prev}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-sm"
                  style={{ color: "var(--color-text)" }}
                  aria-label="Previous"
                  title="Previous"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  onClick={() => {
                    playing ? pause() : resume();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: "var(--color-accent)",
                    color: "var(--color-bg)",
                  }}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  onClick={next}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-sm"
                  style={{ color: "var(--color-text)" }}
                  aria-label="Next"
                  title="Next"
                >
                  <SkipForward size={16} />
                </button>
              </div>
            )}

            {/* Track list */}
            <div className="flex-1 min-h-0 overflow-y-auto gpu-scroll">
              {queue.map((track, index) => {
                const isCurrent = index === currentIndex;
                return (
                  <button
                    key={`${track.id}-${index}`}
                    onClick={() => play(queue, index)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                    style={{
                      background: isCurrent
                        ? "var(--color-accent-dim)"
                        : "transparent",
                      opacity: isCurrent ? 1 : 0.85,
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <span
                      className="text-xs tabular-nums w-5 flex-shrink-0 text-center"
                      style={{ color: "var(--color-text-dim)" }}
                    >
                      {isCurrent ? (playing ? <Play size={12} /> : <Pause size={12} />) : index + 1}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className="text-sm truncate"
                        style={{
                          color: isCurrent
                            ? "var(--color-accent)"
                            : "var(--color-text)",
                          fontWeight: isCurrent ? 600 : 400,
                        }}
                        title={track.title}
                      >
                        {track.title}
                      </span>
                      <span
                        className="text-xs truncate"
                        style={{ color: "var(--color-text-dim)" }}
                      >
                        {track.artist ?? track.album ?? ""}
                        {track.duration ? ` · ${fmt(track.duration)}` : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
