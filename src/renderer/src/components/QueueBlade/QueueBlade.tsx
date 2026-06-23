import React, { useEffect, useRef, useState } from "react";
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
import { useFocusZoneStore } from "../../store/focusZone.store";

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

  const activeZone = useFocusZoneStore((s) => s.activeZone);
  const setZone = useFocusZoneStore((s) => s.setZone);

  const [focusedIndex, setFocusedIndex] = useState(0);
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;

  const trackListRef = useRef<HTMLDivElement>(null);

  const currentTrack = queue[currentIndex];

  // Auto-expand when entering focus and reset focus to current track
  useEffect(() => {
    if (activeZone === "queue") {
      if (bladeCollapsed) {
        toggleBlade();
      }
      setFocusedIndex(currentIndex);
    }
  }, [activeZone]);

  // Scroll focused item into view
  useEffect(() => {
    if (activeZone !== "queue") return;
    const container = trackListRef.current;
    if (!container) return;
    const buttons = container.querySelectorAll<HTMLElement>("button");
    const el = buttons[focusedIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusedIndex, activeZone]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (activeZone !== "queue") return;
      const detail = (e as CustomEvent).detail as { action: string };
      const action = detail?.action;
      if (!action) return;

      switch (action) {
        case "up": {
          setFocusedIndex((prev) => Math.max(0, prev - 1));
          break;
        }
        case "down": {
          setFocusedIndex((prev) => Math.min(queue.length - 1, prev + 1));
          break;
        }
        case "left": {
          setZone("tab");
          break;
        }
        case "confirm": {
          const idx = focusedIndexRef.current;
          if (idx >= 0 && idx < queue.length) {
            play(queue, idx);
          }
          break;
        }
        case "cancel": {
          setZone("tab");
          break;
        }
      }
    };

    window.addEventListener("htpc:nav", handler);
    return () => window.removeEventListener("htpc:nav", handler);
  }, [activeZone, queue.length, play, setZone]);

  return (
    <motion.div
      className="flex-shrink-0 h-full relative flex"
      style={{
        width: bladeCollapsed ? COLLAPSED_WIDTH : BLADE_WIDTH,
        background: "var(--surface-1)",
        borderLeft: "1px solid var(--border-default)",
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
        style={{ width: COLLAPSED_WIDTH, color: "var(--text-secondary)" }}
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
            className="text-[12px] select-none"
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
              style={{ borderBottom: "1px solid var(--border-default)" }}
            >
              <span
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text-primary)" }}
              >
                Queue
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {queue.length} tracks
              </span>
            </div>

            {/* Current track card */}
            {currentTrack && (
              <div
                className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                style={{
                  borderBottom: "1px solid var(--border-default)",
                  background: "var(--surface-0)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-[var(--radius-card)] flex-shrink-0 overflow-hidden"
                  style={{ background: "var(--surface-base)" }}
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
                    style={{ color: "var(--accent)" }}
                  >
                    {playing ? "Now Playing" : "Paused"}
                  </span>
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                    title={currentTrack.title}
                  >
                    {currentTrack.title}
                  </span>
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--text-secondary)" }}
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
                  style={{ color: "var(--text-primary)" }}
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
                    background: "var(--accent)",
                    color: "var(--surface-base)",
                  }}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  onClick={next}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-sm"
                  style={{ color: "var(--text-primary)" }}
                  aria-label="Next"
                  title="Next"
                >
                  <SkipForward size={16} />
                </button>
              </div>
            )}

            {/* Track list */}
            <div ref={trackListRef} className="flex-1 min-h-0 overflow-y-auto gpu-scroll">
              {queue.map((track, index) => {
                const isCurrent = index === currentIndex;
                const isFocused = activeZone === "queue" && index === focusedIndex;
                return (
                  <button
                    key={`${track.id}-${index}`}
                    onClick={() => play(queue, index)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                    style={{
                      background: isFocused
                        ? "color-mix(in srgb, var(--accent) 20%, transparent)"
                        : isCurrent
                          ? "var(--accent-muted)"
                          : "transparent",
                      opacity: isCurrent ? 1 : 0.85,
                      borderBottom: "1px solid var(--border-default)",
                      outline: isFocused ? "2px solid var(--accent)" : "none",
                      outlineOffset: isFocused ? "-2px" : undefined,
                    }}
                  >
                    <span
                      className="text-xs tabular-nums w-5 flex-shrink-0 text-center"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {isCurrent ? (playing ? <Play size={12} /> : <Pause size={12} />) : index + 1}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className="text-sm truncate"
                        style={{
                          color: isCurrent
                            ? "var(--accent)"
                            : "var(--text-primary)",
                          fontWeight: isCurrent ? 600 : 400,
                        }}
                        title={track.title}
                      >
                        {track.title}
                      </span>
                      <span
                        className="text-xs truncate"
                        style={{ color: "var(--text-secondary)" }}
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
