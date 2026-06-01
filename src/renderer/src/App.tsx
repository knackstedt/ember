import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "./store/settings.store";
import { useInputStore } from "./store/input.store";
import { ThemeBackground } from "./components/ThemeBackground/ThemeBackground";
import { GamingTab } from "./tabs/Gaming";
import { MoviesTab } from "./tabs/Movies";
import { MusicTab } from "./tabs/Music";
import { TVShowsTab } from "./tabs/TVShows";
import { SettingsTab } from "./tabs/Settings";
import { ControllersTab } from "./tabs/Controllers";
import { TabId, ScanProgress, AppSettings } from "../../shared/types";
import { useGamesStore } from "./store/games.store";
import { useMoviesStore, useMusicStore, useTvStore } from "./store/media.store";
import { ToastContainer } from "./components/Toast/Toast";
import { useToastStore } from "./store/toast.store";
import { MusicPlayer } from "./components/MusicPlayer/MusicPlayer";
import { useMusicPlayerStore } from "./store/musicPlayer.store";
import { VideoPlayer } from "./components/VideoPlayer/VideoPlayer";
import { useVideoPlayerStore } from "./store/videoPlayer.store";
import { FlashPlayer } from "./components/FlashPlayer/FlashPlayer";
import { useFlashPlayerStore } from "./store/flashPlayer.store";
import { useContextMenuStore } from "./store/contextMenu.store";
import { QueueBlade } from "./components/QueueBlade/QueueBlade";

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
  component: React.ComponentType;
}

const TABS: TabDef[] = [
  { id: "gaming", label: "Gaming", icon: "🎮", component: GamingTab },
  { id: "movies", label: "Movies", icon: "🎬", component: MoviesTab },
  { id: "music", label: "Music", icon: "🎵", component: MusicTab },
  { id: "tv-shows", label: "TV Shows", icon: "📺", component: TVShowsTab },
  {
    id: "controllers",
    label: "Controllers",
    icon: "🕹",
    component: ControllersTab,
  },
  { id: "settings", label: "Settings", icon: "⚙", component: SettingsTab },
];

function useVisibleTabs(settings: AppSettings | null) {
  const disabled = new Set(settings?.disabledTabs ?? []);
  return TABS.filter((t) => !disabled.has(t.id));
}

export default function App(): React.ReactElement {
  const { settings, loading, load } = useSettingsStore();
  const visibleTabs = useVisibleTabs(settings);
  const visibleTabIds = visibleTabs.map((t) => t.id);
  const { addDevice, removeDevice } = useInputStore();
  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);
  const setBladeCollapsed = useMusicPlayerStore((s) => s.setBladeCollapsed);
  const videoOpen = useVideoPlayerStore((s) => !!s.src);
  const flashOpen = useFlashPlayerStore((s) => s.open);
  const [activeTab, setActiveTab] = useState<TabId>("gaming");
  const activeTabRef = useRef<TabId>(activeTab);
  activeTabRef.current = activeTab;
  const isFullscreenRef = useRef(false);

  useEffect(() => {
    load();

    useGamesStore.getState().load();
    useMoviesStore.getState().load();
    useMusicStore.getState().load();
    useTvStore.getState().load();

    useGamesStore.getState().scan();
    useMoviesStore.getState().scan();
    useMusicStore.getState().scan();
    useTvStore.getState().scan();

    const scanToastIds = new Map<string, string>();
    const unsubScan = window.htpc.onScanProgress((p: ScanProgress) => {
      const { push, update, dismiss } = useToastStore.getState();
      const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
      const label = p.message ?? `${p.current} / ${p.total}`;
      if (!scanToastIds.has(p.scanner)) {
        const id = push({
          type: "progress",
          message: `${p.scanner}: ${label}`,
          progress: pct,
        });
        scanToastIds.set(p.scanner, id);
      } else {
        const id = scanToastIds.get(p.scanner)!;
        if (p.status === "done") {
          update(id, {
            type: "success",
            message: `${p.scanner}: Done`,
            progress: 100,
          });
          setTimeout(() => dismiss(id), 1000);
          scanToastIds.delete(p.scanner);
        } else if (p.status === "error") {
          update(id, {
            type: "error",
            message: `${p.scanner}: ${p.message ?? "Error"}`,
          });
          setTimeout(() => dismiss(id), 8000);
          scanToastIds.delete(p.scanner);
        } else {
          update(id, { message: `${p.scanner}: ${label}`, progress: pct });
        }
      }
    });

    return () => { unsubScan(); };
  }, []);

  useEffect(() => {
    if (settings?.defaultTab && visibleTabIds.includes(settings.defaultTab)) {
      setActiveTab(settings.defaultTab);
    }
  }, [settings?.defaultTab]);

  useEffect(() => {
    setBladeCollapsed(flashOpen);
  }, [flashOpen]);

  useEffect(() => {
    if (videoOpen) {
      useMusicPlayerStore.getState().pause();
    }
  }, [videoOpen]);

  useEffect(() => {
    if (!visibleTabIds.includes(activeTab)) {
      setActiveTab(visibleTabIds[0] ?? "gaming");
    }
  }, [visibleTabIds.join(","), activeTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: TabId };
      if (detail?.tab && visibleTabIds.includes(detail.tab)) {
        setActiveTab(detail.tab);
      }
    };
    window.addEventListener("htpc:switch-tab", handler);
    return () => window.removeEventListener("htpc:switch-tab", handler);
  }, []);

  useEffect(() => {
    const unsubConnect = window.htpc.input.onDeviceConnected(addDevice);
    const unsubDisconnect =
      window.htpc.input.onDeviceDisconnected(removeDevice);
    const unsubEvent = window.htpc.input.onEvent((ev) => {
      useInputStore.getState().setLastEvent(ev);
      if (ev.type !== "button_press") return;

      if (ev.action === "start") {
        const idx = visibleTabIds.indexOf(activeTabRef.current);
        setActiveTab(visibleTabIds[(idx + 1) % visibleTabIds.length]);
      } else if (ev.action === "west") {
        window.dispatchEvent(
          new CustomEvent("htpc:contextmenu", { detail: { source: "gamepad" } }),
        );
      } else {
        const actionMap: Record<string, string> = {
          dpad_up: "up",
          dpad_down: "down",
          dpad_left: "left",
          dpad_right: "right",
          south: "confirm",
          east: "cancel",
        };
        const action = actionMap[ev.action ?? ""];
        if (action) {
          if (useContextMenuStore.getState().isOpen) {
            window.dispatchEvent(
              new CustomEvent("htpc:menu-nav", { detail: { action } }),
            );
          } else {
            window.dispatchEvent(
              new CustomEvent("htpc:nav", { detail: { action } }),
            );
          }
        }
      }
    });
    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubEvent();
    };
  }, []);

  useEffect(() => {
    const longPressTimers = new Map<string, number>();

    const handler = (e: KeyboardEvent): void => {
      // Let Flash Player receive raw keyboard events; only allow Escape/F11
      if (useFlashPlayerStore.getState().open && !(e.key === "Escape" || e.key === "F11")) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTyping =
        target != null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "F11") {
        e.preventDefault();
        isFullscreenRef.current = !isFullscreenRef.current;
        window.htpc.app.setFullscreen(isFullscreenRef.current);
      } else if (e.key === "Escape") {
        useVideoPlayerStore.getState().close();
        window.dispatchEvent(new CustomEvent("htpc:escape"));
      } else if (!isTyping && (e.key === "Enter" || e.key === " ")) {
        if (e.type === "keydown") {
          const timer = window.setTimeout(() => {
            longPressTimers.delete(e.key);
            window.dispatchEvent(
              new CustomEvent("htpc:contextmenu", {
                detail: { source: "keyboard" },
              }),
            );
          }, 800);
          longPressTimers.set(e.key, timer);
        } else if (e.type === "keyup") {
          const timer = longPressTimers.get(e.key);
          if (timer) {
            clearTimeout(timer);
            longPressTimers.delete(e.key);
          }
        }
      } else if (!isTyping && e.type === "keydown" && e.key === "q") {
        e.preventDefault();
        const idx = visibleTabIds.indexOf(activeTabRef.current);
        setActiveTab(visibleTabIds[(idx - 1 + visibleTabIds.length) % visibleTabIds.length]);
      } else if (!isTyping && e.type === "keydown" && e.key === "e") {
        e.preventDefault();
        const idx = visibleTabIds.indexOf(activeTabRef.current);
        setActiveTab(visibleTabIds[(idx + 1) % visibleTabIds.length]);
      } else if (
        !isTyping &&
        e.type === "keydown" &&
        [
          "w",
          "a",
          "s",
          "d",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Enter",
        ].includes(e.key)
      ) {
        e.preventDefault();
        const actionMap: Record<string, string> = {
          w: "up",
          ArrowUp: "up",
          s: "down",
          ArrowDown: "down",
          a: "left",
          ArrowLeft: "left",
          d: "right",
          ArrowRight: "right",
          Enter: "confirm",
        };
        const action = actionMap[e.key];
        if (action) {
          if (useContextMenuStore.getState().isOpen) {
            window.dispatchEvent(
              new CustomEvent("htpc:menu-nav", { detail: { action } }),
            );
          } else {
            window.dispatchEvent(
              new CustomEvent("htpc:nav", { detail: { action } }),
            );
          }
        }
      } else if (e.type === "keydown" && e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const idx = visibleTabIds.indexOf(activeTabRef.current);
        setActiveTab(visibleTabIds[(idx + 1) % visibleTabIds.length]);
      } else if (e.type === "keydown" && e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const idx = visibleTabIds.indexOf(activeTabRef.current);
        setActiveTab(visibleTabIds[(idx - 1 + visibleTabIds.length) % visibleTabIds.length]);
      } else if (e.type === "keydown" && e.key === "F5") {
        e.preventDefault();
        const scanMap: Partial<Record<TabId, () => void>> = {
          gaming: () => useGamesStore.getState().scan(),
          movies: () => useMoviesStore.getState().scan(),
          music: () => useMusicStore.getState().scan(),
          "tv-shows": () => useTvStore.getState().scan(),
        };
        scanMap[activeTabRef.current]?.();
      } else if (e.key === "f" && e.ctrlKey) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('input[placeholder^="Search"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", handler);
      longPressTimers.forEach((t) => clearTimeout(t));
      longPressTimers.clear();
    };
  }, []);

  if (loading) {
    return (
      <div
        className="h-screen w-screen flex items-center justify-center"
        style={{ background: "#000", color: "#fff" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{
              borderColor: "var(--color-accent)",
              borderTopColor: "transparent",
            }}
          />
          <span className="text-sm opacity-50">Loading HTPC…</span>
        </div>
      </div>
    );
  }

  const ActiveComponent =
    TABS.find((t) => t.id === activeTab)?.component ?? GamingTab;

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden relative"
      style={
        {
          background: "var(--color-bg)",
          "--player-bar-height": hasPlayer ? "72px" : "0px",
        } as React.CSSProperties
      }
    >
      <ToastContainer />
      <ThemeBackground />

      <AnimatePresence>{videoOpen && <VideoPlayer />}</AnimatePresence>
      <FlashPlayer />

      <div className="relative z-10 flex flex-col h-full">
        {/* Tab bar */}
        <nav
          className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          {visibleTabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors focus:outline-none"
                style={{
                  color: isActive
                    ? "var(--color-text)"
                    : "var(--color-text-dim)",
                  background: isActive
                    ? "var(--color-surface-raised)"
                    : "transparent",
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{
                      background: "var(--color-accent)",
                      boxShadow: "var(--shadow-glow)",
                    }}
                    transition={{ type: "spring", damping: 30, stiffness: 400 }}
                  />
                )}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2 pb-1">
            <button
              className="px-3 py-1.5 rounded text-xs"
              style={{
                color: "var(--color-text-dim)",
                background: "transparent",
              }}
              onClick={() => window.htpc.app.setFullscreen(true)}
              title="Fullscreen"
            >
              ⛶
            </button>
          </div>
        </nav>

        {/* Main area: tab content + queue blade */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          {/* Tab content */}
          <div className="flex-1 min-h-0 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                className="absolute inset-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <ActiveComponent />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Queue blade */}
          <AnimatePresence>
            {hasPlayer && <QueueBlade key="queue-blade" />}
          </AnimatePresence>
        </div>

        {/* Music mini-player */}
        <AnimatePresence>{hasPlayer && <MusicPlayer />}</AnimatePresence>
      </div>
    </div>
  );
}
