import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  ChevronDown,
  VolumeX,
  Volume1,
  Volume2,
  ListMusic,
  LayoutGrid,
  FileText,
  Activity,
  X,
} from "lucide-react";
import { useMusicPlayerStore } from "../../store/musicPlayer.store";
import { useFocusZoneStore } from "../../store/focusZone.store";
import { getTrackDisplayName } from "../lib/track-title";
import { scaledImageUrl } from "../../lib/image-url";
import { MusicVisualizer, PRESETS, DEFAULT_PRESET_NAME } from "./MusicVisualizer";

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

type FullTab = "overview" | "lyrics" | "visualizer" | "queue";

const TAB_ITEMS: { id: FullTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "lyrics", label: "Lyrics", icon: FileText },
  { id: "visualizer", label: "Visualizer", icon: Activity },
  { id: "queue", label: "Queue", icon: ListMusic },
];

type OverviewButton =
  | "prev"
  | "seekBack"
  | "play"
  | "seekFwd"
  | "next"
  | "shuffle"
  | "repeat"
  | "volDown"
  | "volUp";

const CONTROL_BUTTONS: OverviewButton[] = [
  "prev",
  "seekBack",
  "play",
  "seekFwd",
  "next",
  "shuffle",
  "repeat",
  "volDown",
  "volUp",
];

const QUEUE_ITEM_HEIGHT = 56;

interface MusicPlayerFullProps {
  audioElement: HTMLAudioElement | null;
  onClose: () => void;
}

export const MusicPlayerFull: React.FC<MusicPlayerFullProps> = React.memo(({
  audioElement,
  onClose,
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

  const [activeTab, setActiveTab] = useState<FullTab>("overview");
  const [tabBarFocused, setTabBarFocused] = useState(true);
  const [focusedControl, setFocusedControl] = useState<OverviewButton>("play");
  const [focusedQueueIndex, setFocusedQueueIndex] = useState(currentIndex);
  const [presetIndex, setPresetIndex] = useState(() => {
    const idx = PRESETS.findIndex((p) => p.name === DEFAULT_PRESET_NAME);
    return idx >= 0 ? idx : 0;
  });
  const [queueContainerHeight, setQueueContainerHeight] = useState(0);
  const [queueScrollTop, setQueueScrollTop] = useState(0);

  const activeTabRef = useRef(activeTab);
  const tabBarFocusedRef = useRef(tabBarFocused);
  const focusedControlRef = useRef(focusedControl);
  const focusedQueueIndexRef = useRef(focusedQueueIndex);
  activeTabRef.current = activeTab;
  tabBarFocusedRef.current = tabBarFocused;
  focusedControlRef.current = focusedControl;
  focusedQueueIndexRef.current = focusedQueueIndex;

  const track = queue[currentIndex];
  if (!track) return null;

  useEffect(() => {
    if (activeZone === "player") {
      setActiveTab("overview");
      setTabBarFocused(true);
      setFocusedControl("play");
      setFocusedQueueIndex(currentIndex);
    }
  }, [activeZone]);

  useEffect(() => {
    setFocusedQueueIndex(currentIndex);
  }, [currentIndex]);

  const queueListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab !== "queue") return;
    const el = queueListRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setQueueContainerHeight(entries[0]?.contentRect.height ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "queue" || tabBarFocused || queueContainerHeight === 0) return;
    const el = queueListRef.current;
    if (!el) return;
    const targetTop = focusedQueueIndex * QUEUE_ITEM_HEIGHT;
    const centered = targetTop - queueContainerHeight / 2 + QUEUE_ITEM_HEIGHT / 2;
    const maxScroll = Math.max(0, queue.length * QUEUE_ITEM_HEIGHT - queueContainerHeight);
    const target = Math.max(0, Math.min(centered, maxScroll));
    el.scrollTop = target;
    setQueueScrollTop(target);
  }, [focusedQueueIndex, activeTab, tabBarFocused, queueContainerHeight, queue.length]);

  useEffect(() => {
    if (activeTab !== "queue" || queueContainerHeight === 0) return;
    const el = queueListRef.current;
    if (!el) return;
    setFocusedQueueIndex(currentIndex);
    const targetTop = currentIndex * QUEUE_ITEM_HEIGHT;
    const centered = targetTop - queueContainerHeight / 2 + QUEUE_ITEM_HEIGHT / 2;
    const maxScroll = Math.max(0, queue.length * QUEUE_ITEM_HEIGHT - queueContainerHeight);
    const target = Math.max(0, Math.min(centered, maxScroll));
    el.scrollTop = target;
    setQueueScrollTop(target);
  }, [activeTab, currentIndex, queueContainerHeight, queue.length]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (activeZone !== "player") return;
      const detail = (e as CustomEvent).detail as { action: string };
      const action = detail?.action;
      if (!action) return;

      const tab = activeTabRef.current;

      if (tabBarFocusedRef.current) {
        const tabIdx = TAB_ITEMS.findIndex((t) => t.id === tab);
        switch (action) {
          case "left": {
            if (tabIdx > 0) setActiveTab(TAB_ITEMS[tabIdx - 1].id);
            break;
          }
          case "right": {
            if (tabIdx < TAB_ITEMS.length - 1) setActiveTab(TAB_ITEMS[tabIdx + 1].id);
            break;
          }
          case "up": {
            onClose();
            break;
          }
          case "down": {
            setTabBarFocused(false);
            if (tab === "overview") setFocusedControl("play");
            if (tab === "queue") setFocusedQueueIndex(currentIndex);
            break;
          }
          case "cancel": {
            onClose();
            break;
          }
        }
      } else if (tab === "overview") {
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
            setTabBarFocused(true);
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
            }
            break;
          }
          case "cancel": {
            onClose();
            break;
          }
        }
      } else if (tab === "queue") {
        switch (action) {
          case "up": {
            setFocusedQueueIndex((prev) => {
              if (prev === 0) {
                setTabBarFocused(true);
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
      } else {
        switch (action) {
          case "up": {
            setTabBarFocused(true);
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
  }, [activeZone, currentIndex, playing, position, duration, volume, shuffle, repeat, queue.length, prev, pause, resume, seek, next, setVolume, toggleShuffle, toggleRepeat, play, onClose]);

  const virtualQueue = useMemo(() => {
    const overscan = 3;
    const startIndex = Math.max(0, Math.floor(queueScrollTop / QUEUE_ITEM_HEIGHT) - overscan);
    const endIndex = Math.min(queue.length, Math.ceil((queueScrollTop + queueContainerHeight) / QUEUE_ITEM_HEIGHT) + overscan);
    return {
      startIndex,
      endIndex,
      visibleItems: queue.slice(startIndex, endIndex),
    };
  }, [queue, queueScrollTop, queueContainerHeight]);

  const isTabFocused = (id: FullTab) => activeZone === "player" && tabBarFocused && activeTab === id;
  const isControlFocused = (btn: OverviewButton) =>
    activeZone === "player" && !tabBarFocused && activeTab === "overview" && focusedControl === btn;
  const isQueueItemFocused = (idx: number) =>
    activeZone === "player" && !tabBarFocused && activeTab === "queue" && focusedQueueIndex === idx;

  const focusStyle = (focused: boolean): React.CSSProperties =>
    focused
      ? { outline: "2px solid var(--accent)", outlineOffset: "3px", borderRadius: "var(--radius-card)" }
      : {};

  const tabStyle = (id: FullTab): React.CSSProperties => {
    const focused = isTabFocused(id);
    const active = activeTab === id;
    return {
      color: active ? "var(--accent)" : "var(--text-secondary)",
      background: active ? "var(--accent-muted)" : "transparent",
      outline: focused ? "2px solid var(--accent)" : "none",
      outlineOffset: focused ? "2px" : "0",
      borderRadius: "var(--radius-card)",
    };
  };

  return (
    <motion.div
      className="absolute inset-0 flex flex-col"
      style={{
        background: "var(--surface-base)",
        zIndex: 100,
      }}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
    >
      {/* Tab bar */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setTabBarFocused(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors"
                style={tabStyle(tab.id)}
                aria-label={tab.label}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Close player"
        >
          <ChevronDown size={20} />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "overview" && (
          <div className="h-full flex flex-col items-center justify-center gap-4 px-6 py-4 overflow-y-auto">
            <div
              className="w-64 h-64 rounded-[var(--radius-card)] overflow-hidden shadow-2xl flex-shrink-0"
              style={{ background: "var(--surface-1)" }}
            >
              {track.albumArtUrl ? (
                <img src={scaledImageUrl(track.albumArtUrl, 256, 256)} alt={getTrackDisplayName(track)} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl select-none" style={{ color: "var(--text-secondary)" }}>
                  ♪
                </div>
              )}
            </div>
            <div className="text-center max-w-md">
              <div className="text-lg font-semibold truncate" style={{ color: "var(--text-primary)" }} title={getTrackDisplayName(track)}>
                {getTrackDisplayName(track)}
              </div>
              <div className="text-sm truncate" style={{ color: "var(--text-secondary)" }} title={track.artist ?? track.album}>
                {track.artist ?? track.album ?? ""}
              </div>
            </div>

            {/* Seek bar */}
            <div className="w-full max-w-md flex items-center gap-3">
              <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
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
                style={{ accentColor: "var(--accent)" }}
                aria-label="Seek"
              />
              <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                {fmt(duration)}
              </span>
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={prev}
                className="w-10 h-10 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                style={{ color: "var(--text-primary)", ...focusStyle(isControlFocused("prev")) }}
                aria-label="Previous"
              >
                <SkipBack size={20} />
              </button>
              <button
                onClick={() => seek(Math.max(0, position - 15))}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-xs font-bold"
                style={{ color: "var(--text-secondary)", ...focusStyle(isControlFocused("seekBack")) }}
                aria-label="Seek back 15s"
                title="-15s"
              >
                -15
              </button>
              <button
                onClick={playing ? pause : resume}
                className="w-14 h-14 flex items-center justify-center rounded-full text-lg font-bold"
                style={{
                  background: "var(--accent)",
                  color: "var(--surface-base)",
                  ...focusStyle(isControlFocused("play")),
                }}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause size={24} /> : <Play size={24} />}
              </button>
              <button
                onClick={() => seek(Math.min(duration, position + 15))}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-xs font-bold"
                style={{ color: "var(--text-secondary)", ...focusStyle(isControlFocused("seekFwd")) }}
                aria-label="Seek forward 15s"
                title="+15s"
              >
                +15
              </button>
              <button
                onClick={next}
                className="w-10 h-10 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                style={{ color: "var(--text-primary)", ...focusStyle(isControlFocused("next")) }}
                aria-label="Next"
              >
                <SkipForward size={20} />
              </button>
            </div>

            {/* Secondary controls */}
            <div className="flex items-center gap-3 w-full max-w-md">
              <button
                onClick={toggleShuffle}
                className="w-9 h-9 flex items-center justify-center rounded transition-colors"
                style={{
                  color: shuffle ? "var(--accent)" : "var(--text-secondary)",
                  background: shuffle ? "var(--accent-muted)" : "transparent",
                  ...focusStyle(isControlFocused("shuffle")),
                }}
                aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
              >
                <Shuffle size={18} />
              </button>
              <button
                onClick={toggleRepeat}
                className="w-9 h-9 flex items-center justify-center rounded transition-colors relative"
                style={{
                  color: repeat !== "none" ? "var(--accent)" : "var(--text-secondary)",
                  background: repeat !== "none" ? "var(--accent-muted)" : "transparent",
                  ...focusStyle(isControlFocused("repeat")),
                }}
                aria-label={`Repeat: ${repeat}`}
              >
                <Repeat size={18} />
                {repeat === "one" && (
                  <span className="absolute bottom-0.5 right-0.5 text-[12px] font-bold" style={{ color: "var(--accent)" }}>
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
                  style={{ color: "var(--text-secondary)", ...focusStyle(isControlFocused("volDown")) }}
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
                      background: `linear-gradient(to right, var(--accent) ${volume * 100}%, var(--surface-0) ${volume * 100}%)`,
                      outline: isControlFocused("volDown") || isControlFocused("volUp") ? "2px solid var(--accent)" : "none",
                    }}
                  />
                  <style>{`
                    input[type="range"]::-webkit-slider-thumb {
                      -webkit-appearance: none;
                      appearance: none;
                      width: 14px;
                      height: 14px;
                      border-radius: 50%;
                      background: var(--accent);
                      cursor: pointer;
                      border: 2px solid var(--surface-base);
                      box-shadow: 0 0 4px rgba(0,0,0,0.3);
                    }
                    input[type="range"]::-moz-range-thumb {
                      width: 14px;
                      height: 14px;
                      border-radius: 50%;
                      background: var(--accent);
                      cursor: pointer;
                      border: 2px solid var(--surface-base);
                      box-shadow: 0 0 4px rgba(0,0,0,0.3);
                    }
                  `}</style>
                </div>
                <button
                  onClick={() => setVolume(Math.min(1, volume + 0.05))}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                  style={{ color: "var(--text-secondary)", ...focusStyle(isControlFocused("volUp")) }}
                  aria-label="Volume up"
                >
                  {volume === 0 ? <VolumeX size={16} /> : volume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "lyrics" && (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center">
            <FileText size={48} style={{ color: "var(--text-secondary)" }} />
            <div className="mt-4 text-base font-medium" style={{ color: "var(--text-primary)" }}>
              Lyrics not available
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Connect a lyrics source to see synchronized lyrics here.
            </div>
          </div>
        )}

        {activeTab === "visualizer" && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-end px-4 py-2 flex-shrink-0 gap-2">
              <select
                value={presetIndex}
                onChange={(e) => setPresetIndex(Number(e.target.value))}
                className="min-w-0 px-2 py-1 text-xs font-medium rounded border-none outline-none cursor-pointer transition-colors"
                style={{
                  color: "var(--text-primary)",
                  background: "var(--surface-1)",
                }}
                aria-label="Visualizer preset"
              >
                {PRESETS.map((p, i) => (
                  <option key={p.name} value={i} style={{ background: "var(--surface-1)" }}>
                    {p.name}{p.description ? ` — ${p.description}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-h-0">
              <MusicVisualizer audioElement={audioElement} presetName={PRESETS[presetIndex]?.name} />
            </div>
          </div>
        )}

        {activeTab === "queue" && (
          <div
            className="h-full flex flex-col overflow-hidden"
            style={{ background: "var(--surface-1)" }}
          >
            <div
              className="flex items-center justify-between px-4 py-2 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--border-default)" }}
            >
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Queue
              </span>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {queue.length} tracks
              </span>
            </div>
            <div
              ref={queueListRef}
              className="flex-1 overflow-y-auto"
              onScroll={(e) => setQueueScrollTop(e.currentTarget.scrollTop)}
            >
              <div
                style={{
                  paddingTop: virtualQueue.startIndex * QUEUE_ITEM_HEIGHT,
                  paddingBottom: (queue.length - virtualQueue.endIndex) * QUEUE_ITEM_HEIGHT,
                }}
              >
                {virtualQueue.visibleItems.map((t, offset) => {
                  const idx = virtualQueue.startIndex + offset;
                  return (
                    <button
                      key={t.id}
                      className="w-full flex items-center gap-2 px-4 text-left transition-colors"
                      style={{
                        height: QUEUE_ITEM_HEIGHT,
                        background:
                          idx === currentIndex
                            ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                            : isQueueItemFocused(idx)
                              ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                              : "transparent",
                        outline: isQueueItemFocused(idx) ? "2px solid var(--accent)" : "none",
                        outlineOffset: -2,
                      }}
                      onClick={() => play(queue, idx)}
                    >
                      <div
                        className="w-8 h-8 rounded flex-shrink-0 overflow-hidden flex items-center justify-center text-xs"
                        style={{ background: "var(--surface-0)" }}
                      >
                        {t.albumArtUrl ? (
                          <img src={scaledImageUrl(t.albumArtUrl, 32, 32)} alt={getTrackDisplayName(t)} className="w-full h-full object-cover" />
                        ) : (
                          <span style={{ color: "var(--text-secondary)" }}>♪</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm truncate"
                          style={{
                            color: idx === currentIndex ? "var(--accent)" : "var(--text-primary)",
                            fontWeight: idx === currentIndex ? 600 : 400,
                          }}
                          title={getTrackDisplayName(t)}
                        >
                          {getTrackDisplayName(t)}
                        </div>
                        <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                          {t.artist}
                        </div>
                      </div>
                      {t.duration && (
                        <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                          {fmt(t.duration)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
});
