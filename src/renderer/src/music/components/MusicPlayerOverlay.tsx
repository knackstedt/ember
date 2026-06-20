import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  ChevronDown,
  Maximize2,
  VolumeX,
  Volume1,
  Volume2,
  ListMusic,
  X,
} from "lucide-react";
import { useMusicPlayerStore } from "../../store/musicPlayer.store";
import { useFocusZoneStore } from "../../store/focusZone.store";

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

type OverlaySection = "controls" | "queue";

type ControlButton =
  | "prev"
  | "seekBack"
  | "play"
  | "seekFwd"
  | "next"
  | "shuffle"
  | "repeat"
  | "volDown"
  | "volUp"
  | "fullscreen"
  | "close";

const CONTROL_BUTTONS: ControlButton[] = [
  "close",
  "prev",
  "seekBack",
  "play",
  "seekFwd",
  "next",
  "shuffle",
  "repeat",
  "volDown",
  "volUp",
  "fullscreen",
];

interface MusicPlayerOverlayProps {
  onClose: () => void;
  onFullscreen: () => void;
}

export const MusicPlayerOverlay: React.FC<MusicPlayerOverlayProps> = React.memo(({
  onClose,
  onFullscreen,
}) => {
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
    play,
  } = useMusicPlayerStore();

  const activeZone = useFocusZoneStore((s) => s.activeZone);
  const setZone = useFocusZoneStore((s) => s.setZone);

  const [section, setSection] = useState<OverlaySection>("controls");
  const [focusedControl, setFocusedControl] = useState<ControlButton>("play");
  const [focusedQueueIndex, setFocusedQueueIndex] = useState(currentIndex);

  const sectionRef = useRef(section);
  const focusedControlRef = useRef(focusedControl);
  const focusedQueueIndexRef = useRef(focusedQueueIndex);
  sectionRef.current = section;
  focusedControlRef.current = focusedControl;
  focusedQueueIndexRef.current = focusedQueueIndex;

  const track = queue[currentIndex];
  if (!track) return null;

  // Reset to current track when opening overlay
  useEffect(() => {
    if (activeZone === "player") {
      setSection("controls");
      setFocusedControl("play");
      setFocusedQueueIndex(currentIndex);
    }
  }, [activeZone, currentIndex]);

  // Scroll queue item into view
  const queueListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (section !== "queue") return;
    const el = queueListRef.current;
    if (!el) return;
    const buttons = el.querySelectorAll<HTMLElement>("[data-queue-item]");
    const target = buttons[focusedQueueIndex];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusedQueueIndex, section]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (activeZone !== "player") return;
      const detail = (e as CustomEvent).detail as { action: string };
      const action = detail?.action;
      if (!action) return;

      const sec = sectionRef.current;

      if (sec === "controls") {
        const idx = CONTROL_BUTTONS.indexOf(focusedControlRef.current);

        switch (action) {
          case "left": {
            if (idx > 0) setFocusedControl(CONTROL_BUTTONS[idx - 1]);
            break;
          }
          case "right": {
            if (idx < CONTROL_BUTTONS.length - 1) setFocusedControl(CONTROL_BUTTONS[idx + 1]);
            break;
          }
          case "up": {
            onClose();
            break;
          }
          case "down": {
            if (queue.length > 0) {
              setSection("queue");
              setFocusedQueueIndex(currentIndex);
            }
            break;
          }
          case "confirm": {
            const btn = focusedControlRef.current;
            switch (btn) {
              case "prev": prev(); break;
              case "seekBack": seek(Math.max(0, position - 15)); break;
              case "play": playing ? pause() : resume(); break;
              case "seekFwd": seek(Math.min(duration, position + 15)); break;
              case "next": next(); break;
              case "shuffle": toggleShuffle(); break;
              case "repeat": toggleRepeat(); break;
              case "volDown": setVolume(Math.max(0, volume - 0.05)); break;
              case "volUp": setVolume(Math.min(1, volume + 0.05)); break;
              case "fullscreen": onFullscreen(); break;
              case "close": onClose(); break;
            }
            break;
          }
          case "cancel": {
            onClose();
            break;
          }
        }
      } else if (sec === "queue") {
        switch (action) {
          case "up": {
            setFocusedQueueIndex((prev) => {
              if (prev === 0) {
                setSection("controls");
                return prev;
              }
              return Math.max(0, prev - 1);
            });
            break;
          }
          case "down": {
            setFocusedQueueIndex((prev) => Math.min(queue.length - 1, prev + 1));
            break;
          }
          case "left": {
            onClose();
            break;
          }
          case "confirm": {
            const idx = focusedQueueIndexRef.current;
            if (idx >= 0 && idx < queue.length) {
              play(queue, idx);
            }
            break;
          }
          case "cancel": {
            onClose();
            break;
          }
        }
      }
    };

    window.addEventListener("htpc:nav", handler);
    return () => window.removeEventListener("htpc:nav", handler);
  }, [activeZone, queue.length, currentIndex, playing, position, duration, volume, shuffle, repeat, setZone, prev, pause, resume, seek, next, setVolume, toggleShuffle, toggleRepeat, play, onClose, onFullscreen]);

  const isControlFocused = (btn: ControlButton) =>
    activeZone === "player" && section === "controls" && focusedControl === btn;

  const focusStyle = (btn: ControlButton): React.CSSProperties =>
    isControlFocused(btn)
      ? { outline: "2px solid var(--color-accent)", outlineOffset: "3px", borderRadius: "var(--radius-card)" }
      : {};

  const isQueueItemFocused = (idx: number) =>
    activeZone === "player" && section === "queue" && focusedQueueIndex === idx;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col"
      style={{
        background: "var(--color-bg)",
        zIndex: 100,
      }}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
    >
      {/* Top bar: close + fullscreen */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-2" style={{ color: "var(--color-text-dim)" }}>
          <ListMusic size={16} />
          <span className="text-xs">{queue.length} tracks</span>
        </div>
        <button
          onClick={onFullscreen}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--color-text-dim)", ...focusStyle("fullscreen") }}
          aria-label="Full screen"
        >
          <Maximize2 size={18} />
        </button>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--color-text-dim)", ...focusStyle("close") }}
          aria-label="Close player"
        >
          <ChevronDown size={20} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: Big album art + info */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 min-w-0">
          <div
            className="w-64 h-64 rounded-[var(--radius-card)] overflow-hidden shadow-2xl flex-shrink-0"
            style={{ background: "var(--color-surface-raised)" }}
          >
            {track.albumArtUrl ? (
              <img src={track.albumArtUrl} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl select-none" style={{ color: "var(--color-text-dim)" }}>
                ♪
              </div>
            )}
          </div>
          <div className="text-center max-w-md">
            <div className="text-lg font-semibold truncate" style={{ color: "var(--color-text)" }} title={track.title}>
              {track.title}
            </div>
            <div className="text-sm truncate" style={{ color: "var(--color-text-dim)" }} title={track.artist ?? track.album}>
              {track.artist ?? track.album ?? ""}
            </div>
          </div>

          {/* Seek bar */}
          <div className="w-full max-w-md flex items-center gap-3">
            <span className="text-xs tabular-nums" style={{ color: "var(--color-text-dim)" }}>
              {fmt(position)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={position}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="flex-1 h-1.5 cursor-pointer"
              style={{ accentColor: "var(--color-accent)" }}
              aria-label="Seek"
            />
            <span className="text-xs tabular-nums" style={{ color: "var(--color-text-dim)" }}>
              {fmt(duration)}
            </span>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={prev}
              className="w-10 h-10 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
              style={{ color: "var(--color-text)", ...focusStyle("prev") }}
              aria-label="Previous"
            >
              <SkipBack size={20} />
            </button>
            <button
              onClick={() => seek(Math.max(0, position - 15))}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-xs font-bold"
              style={{ color: "var(--color-text-dim)", ...focusStyle("seekBack") }}
              aria-label="Seek back 15s"
              title="-15s"
            >
              -15
            </button>
            <button
              onClick={playing ? pause : resume}
              className="w-14 h-14 flex items-center justify-center rounded-full text-lg font-bold"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
                ...focusStyle("play"),
              }}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button
              onClick={() => seek(Math.min(duration, position + 15))}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-xs font-bold"
              style={{ color: "var(--color-text-dim)", ...focusStyle("seekFwd") }}
              aria-label="Seek forward 15s"
              title="+15s"
            >
              +15
            </button>
            <button
              onClick={next}
              className="w-10 h-10 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
              style={{ color: "var(--color-text)", ...focusStyle("next") }}
              aria-label="Next"
            >
              <SkipForward size={20} />
            </button>
          </div>

          {/* Secondary controls */}
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={toggleShuffle}
              className="w-9 h-9 flex items-center justify-center rounded transition-colors"
              style={{
                color: shuffle ? "var(--color-accent)" : "var(--color-text-dim)",
                background: shuffle ? "var(--color-accent-dim)" : "transparent",
                ...focusStyle("shuffle"),
              }}
              aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
            >
              <Shuffle size={18} />
            </button>
            <button
              onClick={toggleRepeat}
              className="w-9 h-9 flex items-center justify-center rounded transition-colors relative"
              style={{
                color: repeat !== "none" ? "var(--color-accent)" : "var(--color-text-dim)",
                background: repeat !== "none" ? "var(--color-accent-dim)" : "transparent",
                ...focusStyle("repeat"),
              }}
              aria-label={`Repeat: ${repeat}`}
            >
              <Repeat size={18} />
              {repeat === "one" && (
                <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold" style={{ color: "var(--color-accent)" }}>
                  1
                </span>
              )}
            </button>
            <div className="flex-1" />
            <div
              className="flex items-center gap-1.5"
              onWheel={(e) => {
                e.preventDefault();
                const step = Math.sign(e.deltaY) * -0.05;
                setVolume(Math.max(0, Math.min(1, volume + step)));
              }}
            >
              <button
                onClick={() => setVolume(Math.max(0, volume - 0.05))}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                style={{ color: "var(--color-text-dim)", ...focusStyle("volDown") }}
                aria-label="Volume down"
              >
                <VolumeX size={16} />
              </button>
              <div className="w-24 h-5 flex items-center relative">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  onWheel={(e) => {
                    e.preventDefault();
                    const step = Math.sign(e.deltaY) * -0.05;
                    setVolume(Math.max(0, Math.min(1, volume + step)));
                  }}
                  className="w-full h-3 rounded-full cursor-pointer"
                  style={{
                    WebkitAppearance: "none",
                    appearance: "none",
                    background: `linear-gradient(to right, var(--color-accent) ${volume * 100}%, var(--color-surface) ${volume * 100}%)`,
                    outline: isControlFocused("volDown") || isControlFocused("volUp") ? "2px solid var(--color-accent)" : "none",
                  }}
                />
                <style>{`
                  input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: var(--color-accent);
                    cursor: pointer;
                    border: 2px solid var(--color-bg);
                    box-shadow: 0 0 4px rgba(0,0,0,0.3);
                  }
                  input[type="range"]::-moz-range-thumb {
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: var(--color-accent);
                    cursor: pointer;
                    border: 2px solid var(--color-bg);
                    box-shadow: 0 0 4px rgba(0,0,0,0.3);
                  }
                `}</style>
              </div>
              <button
                onClick={() => setVolume(Math.min(1, volume + 0.05))}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                style={{ color: "var(--color-text-dim)", ...focusStyle("volUp") }}
                aria-label="Volume up"
              >
                {volume === 0 ? <VolumeX size={16} /> : volume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Queue */}
        <div
          ref={queueListRef}
          className="w-80 flex-shrink-0 flex flex-col overflow-hidden"
          style={{
            background: "var(--color-surface-raised)",
            borderLeft: "1px solid var(--color-border)",
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Queue
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
              {queue.length} tracks
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {queue.map((t, idx) => (
              <button
                key={t.id}
                data-queue-item
                className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                style={{
                  background:
                    idx === currentIndex
                      ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                      : isQueueItemFocused(idx)
                        ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                        : "transparent",
                  outline: isQueueItemFocused(idx) ? "2px solid var(--color-accent)" : "none",
                  outlineOffset: -2,
                }}
                onClick={() => play(queue, idx)}
              >
                <div
                  className="w-8 h-8 rounded flex-shrink-0 overflow-hidden flex items-center justify-center text-xs"
                  style={{ background: "var(--color-surface)" }}
                >
                  {t.albumArtUrl ? (
                    <img src={t.albumArtUrl} alt={t.title} className="w-full h-full object-cover" />
                  ) : (
                    <span style={{ color: "var(--color-text-dim)" }}>♪</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm truncate"
                    style={{
                      color: idx === currentIndex ? "var(--color-accent)" : "var(--color-text)",
                      fontWeight: idx === currentIndex ? 600 : 400,
                    }}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                  <div className="text-xs truncate" style={{ color: "var(--color-text-dim)" }}>
                    {t.artist}
                  </div>
                </div>
                {t.duration && (
                  <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--color-text-dim)" }}>
                    {fmt(t.duration)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
});
