import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  VolumeX,
  Volume1,
  Volume2,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
} from "lucide-react";
import { useMusicPlayerStore } from "../../store/musicPlayer.store";

const PLAYER_HEIGHT = 72;

function fmt(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const REPEAT_NEXT: Record<"none" | "all" | "one", "all" | "one" | "none"> = {
  none: "all",
  all: "one",
  one: "none",
};

export const MusicPlayer: React.FC = () => {
  const {
    queue,
    currentIndex,
    playing,
    position,
    duration,
    volume,
    shuffle,
    repeat,
    pause,
    resume,
    seek,
    next,
    prev,
    setVolume,
    toggleShuffle,
    toggleRepeat,
  } = useMusicPlayerStore();

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const check = (): void => setCollapsed(window.innerHeight < 480);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const track = queue[currentIndex];
  if (!track) return null;

  const albumArt = track.albumArtUrl ? (
    <img
      src={track.albumArtUrl}
      alt={track.title}
      className="w-full h-full object-cover"
    />
  ) : (
    <div
      className="w-full h-full flex items-center justify-center text-lg select-none"
      style={{ color: "var(--color-text-dim)" }}
    >
      ♪
    </div>
  );

  if (collapsed) {
    return (
      <motion.div
        key="player-collapsed"
        className="flex-shrink-0 flex items-center justify-center gap-2 px-3"
        style={{
          height: 40,
          background: "var(--color-surface-raised)",
          borderTop: "1px solid var(--color-border)",
          zIndex: 50,
        }}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="w-6 h-6 rounded overflow-hidden flex-shrink-0"
          style={{ background: "var(--color-surface)" }}
        >
          {albumArt}
        </div>
        <button
          onClick={playing ? pause : resume}
          className="w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg)",
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={() => setCollapsed(false)}
          className="w-6 h-6 flex items-center justify-center rounded text-xs"
          style={{ color: "var(--color-text-dim)" }}
          aria-label="Expand player"
          title="Expand"
        >
          <ChevronUp size={14} />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="player-full"
      className="flex-shrink-0 flex items-center gap-3 px-4"
      style={{
        height: PLAYER_HEIGHT,
        background: "var(--color-surface-raised)",
        borderTop: "1px solid var(--color-border)",
        zIndex: 50,
      }}
      initial={{ y: PLAYER_HEIGHT, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: PLAYER_HEIGHT, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Album art */}
      <div
        className="w-10 h-10 rounded-[var(--radius-card)] flex-shrink-0 overflow-hidden"
        style={{ background: "var(--color-surface)" }}
      >
        {albumArt}
      </div>

      {/* Track info */}
      <div className="flex flex-col min-w-0 w-40 flex-shrink-0">
        <span
          className="text-sm font-medium truncate leading-tight"
          style={{ color: "var(--color-text)" }}
          title={track.title}
        >
          {track.title}
        </span>
        <span
          className="text-xs truncate leading-tight"
          style={{ color: "var(--color-text-dim)" }}
          title={track.artist ?? track.album}
        >
          {track.artist ?? track.album ?? ""}
        </span>
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={prev}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--color-text)", fontSize: 18 }}
          aria-label="Previous"
          title="Previous"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={playing ? pause : resume}
          className="w-9 h-9 flex items-center justify-center rounded-full text-sm font-bold mx-0.5"
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
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--color-text)", fontSize: 18 }}
          aria-label="Next"
          title="Next"
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* Seek bar */}
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <span
          className="text-xs tabular-nums flex-shrink-0"
          style={{ color: "var(--color-text-dim)" }}
        >
          {fmt(position)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.5}
          value={position}
          onChange={(e) => seek(parseFloat(e.target.value))}
          className="flex-1 h-1 cursor-pointer"
          style={{ accentColor: "var(--color-accent)" }}
          aria-label="Seek"
        />
        <span
          className="text-xs tabular-nums flex-shrink-0"
          style={{ color: "var(--color-text-dim)" }}
        >
          {fmt(duration)}
        </span>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span
          className="text-sm select-none"
          style={{ color: "var(--color-text-dim)" }}
        >
          {volume === 0 ? <VolumeX size={14} /> : volume < 0.5 ? <Volume1 size={14} /> : <Volume2 size={14} />}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-20 h-1 cursor-pointer"
          style={{ accentColor: "var(--color-accent)" }}
          aria-label="Volume"
        />
      </div>

      {/* Shuffle */}
      <button
        onClick={toggleShuffle}
        className="w-8 h-8 flex items-center justify-center rounded text-base transition-colors"
        style={{
          color: shuffle ? "var(--color-accent)" : "var(--color-text-dim)",
          background: shuffle ? "var(--color-accent-dim)" : "transparent",
          opacity: shuffle ? 1 : 0.6,
        }}
        aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
        title={shuffle ? "Shuffle on" : "Shuffle off"}
      >
        <Shuffle size={16} />
      </button>

      {/* Repeat */}
      <button
        onClick={toggleRepeat}
        className="w-8 h-8 flex items-center justify-center rounded text-base transition-colors relative"
        style={{
          color:
            repeat !== "none" ? "var(--color-accent)" : "var(--color-text-dim)",
          background:
            repeat !== "none" ? "var(--color-accent-dim)" : "transparent",
          opacity: repeat !== "none" ? 1 : 0.6,
        }}
        aria-label={`Repeat: ${repeat} → ${REPEAT_NEXT[repeat]}`}
        title={`Repeat: ${repeat}`}
      >
        <Repeat size={16} />
        {repeat === "one" && (
          <span
            className="absolute bottom-0.5 right-0.5 text-[9px] font-bold leading-none"
            style={{ color: "var(--color-accent)" }}
          >
            1
          </span>
        )}
      </button>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(true)}
        className="w-7 h-7 flex items-center justify-center rounded text-sm ml-1 hover:bg-white/10 transition-colors"
        style={{ color: "var(--color-text-dim)" }}
        aria-label="Collapse player"
        title="Collapse"
      >
        <ChevronDown size={14} />
      </button>
    </motion.div>
  );
};
