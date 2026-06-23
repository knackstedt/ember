import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronUp,
  VolumeX,
  Volume1,
  Volume2,
} from "lucide-react";
import { useMusicPlayerStore } from "../../store/musicPlayer.store";
import { useFocusZoneStore } from "../../store/focusZone.store";
import { getTrackDisplayName } from "../lib/track-title";

const MINI_HEIGHT = 56;

function fmt(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

type MiniButton = "prev" | "play" | "next" | "volDown" | "volUp" | "expand";

interface MusicPlayerBarProps {
  onExpand: () => void;
}

export const MusicPlayerBar: React.FC<MusicPlayerBarProps> = React.memo(({ onExpand }) => {
  const {
    queue,
    currentIndex,
    playing,
    position,
    duration,
    volume,
    pause,
    resume,
    next,
    prev,
    seek,
    setVolume,
  } = useMusicPlayerStore();

  const activeZone = useFocusZoneStore((s) => s.activeZone);
  const setZone = useFocusZoneStore((s) => s.setZone);

  const [focusedButton, setFocusedButton] = useState<MiniButton>("play");
  const focusedButtonRef = useRef(focusedButton);
  focusedButtonRef.current = focusedButton;

  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const volumeWrapRef = useRef<HTMLDivElement>(null);

  const track = queue[currentIndex];
  if (!track) return null;

  const buttons: MiniButton[] = ["prev", "play", "next", "volDown", "volUp", "expand"];

  useEffect(() => {
    if (activeZone === "player") {
      setFocusedButton("play");
    }
  }, [activeZone]);

  useEffect(() => {
    const el = volumeWrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const step = Math.sign(e.deltaY) * -0.05;
      setVolume(Math.max(0, Math.min(1, volumeRef.current + step)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [setVolume]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (activeZone !== "player") return;
      const detail = (e as CustomEvent).detail as { action: string };
      const action = detail?.action;
      if (!action) return;

      const idx = buttons.indexOf(focusedButtonRef.current);

      switch (action) {
        case "left": {
          if (idx > 0) setFocusedButton(buttons[idx - 1]);
          break;
        }
        case "right": {
          if (idx < buttons.length - 1) setFocusedButton(buttons[idx + 1]);
          break;
        }
        case "up": {
          setZone("tab");
          break;
        }
        case "down": {
          onExpand();
          break;
        }
        case "confirm": {
          const btn = focusedButtonRef.current;
          switch (btn) {
            case "prev": prev(); break;
            case "play": playing ? pause() : resume(); break;
            case "next": next(); break;
            case "volDown": setVolume(Math.max(0, volume - 0.05)); break;
            case "volUp": setVolume(Math.min(1, volume + 0.05)); break;
            case "expand": onExpand(); break;
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
  }, [activeZone, playing, volume, setZone, prev, pause, resume, next, setVolume, onExpand]);

  const isFocused = (btn: MiniButton) => activeZone === "player" && focusedButton === btn;
  const focusStyle = (btn: MiniButton): React.CSSProperties =>
    isFocused(btn)
      ? { outline: "2px solid var(--accent)", outlineOffset: "2px", borderRadius: "var(--radius-card)" }
      : {};

  return (
    <motion.div
      className="flex-shrink-0 flex items-center gap-3 px-4"
      style={{
        height: MINI_HEIGHT,
        background: "var(--surface-1)",
        borderTop: "1px solid var(--border-default)",
        zIndex: 50,
      }}
      initial={{ y: MINI_HEIGHT, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: MINI_HEIGHT, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Album art */}
      <div
        className="w-9 h-9 rounded overflow-hidden flex-shrink-0"
        style={{ background: "var(--surface-0)" }}
      >
        {track.albumArtUrl ? (
          <img src={track.albumArtUrl} alt={getTrackDisplayName(track)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm select-none" style={{ color: "var(--text-secondary)" }}>
            ♪
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="flex flex-col min-w-0 w-32 flex-shrink-0">
        <span className="text-sm font-medium truncate leading-tight" style={{ color: "var(--text-primary)" }} title={getTrackDisplayName(track)}>
          {getTrackDisplayName(track)}
        </span>
        <span className="text-xs truncate leading-tight" style={{ color: "var(--text-secondary)" }} title={track.artist ?? track.album}>
          {track.artist ?? track.album ?? ""}
        </span>
      </div>

      {/* Mini progress */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
          {fmt(position)}
        </span>
        <div
          className="flex-1 h-3 flex items-center rounded-full overflow-hidden cursor-pointer"
          style={{ background: "var(--surface-0)" }}
          onClick={(e) => {
            if (!duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seek(pct * duration);
          }}
        >
          <motion.div
            className="h-1 rounded-full"
            style={{ background: "var(--accent)", width: `${duration ? (position / duration) * 100 : 0}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
          {fmt(duration)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={prev}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--text-primary)", ...focusStyle("prev") }}
          aria-label="Previous"
        >
          <SkipBack size={14} />
        </button>
        <button
          onClick={playing ? pause : resume}
          className="w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold"
          style={{
            background: "var(--accent)",
            color: "var(--surface-base)",
            ...focusStyle("play"),
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={next}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--text-primary)", ...focusStyle("next") }}
          aria-label="Next"
        >
          <SkipForward size={14} />
        </button>
        <div
          ref={volumeWrapRef}
          className="flex items-center gap-1"
        >
          <button
            onClick={() => setVolume(Math.max(0, volume - 0.05))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
            style={{ color: "var(--text-secondary)", ...focusStyle("volDown") }}
            aria-label="Volume down"
          >
            <VolumeX size={14} />
          </button>
          <div className="w-16 h-4 flex items-center relative">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full cursor-pointer"
              style={{
                WebkitAppearance: "none",
                appearance: "none",
                background: `linear-gradient(to right, var(--accent) ${volume * 100}%, var(--surface-0) ${volume * 100}%)`,
              }}
            />
            <style>{`
              input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: var(--accent);
                cursor: pointer;
              }
              input[type="range"]::-moz-range-thumb {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: var(--accent);
                cursor: pointer;
              }
            `}</style>
          </div>
          <button
            onClick={() => setVolume(Math.min(1, volume + 0.05))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
            style={{ color: "var(--text-secondary)", ...focusStyle("volUp") }}
            aria-label="Volume up"
          >
            {volume === 0 ? <VolumeX size={14} /> : volume < 0.5 ? <Volume1 size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
        <button
          onClick={onExpand}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--text-secondary)", ...focusStyle("expand") }}
          aria-label="Expand player"
        >
          <ChevronUp size={16} />
        </button>
      </div>
    </motion.div>
  );
});
