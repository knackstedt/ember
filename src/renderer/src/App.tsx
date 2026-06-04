import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gamepad2,
  Film,
  Music,
  Tv,
  Settings,
  Maximize,
} from "lucide-react";
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
import { JsnesPlayer } from "./components/JsnesPlayer/JsnesPlayer";
import { useJsnesPlayerStore } from "./store/jsnesPlayer.store";
import { EmulatorJSPlayer } from "./components/EmulatorJSPlayer/EmulatorJSPlayer";
import { useEmulatorjsPlayerStore } from "./store/emulatorjsPlayer.store";
import { V86Player } from "./components/V86Player/V86Player";
import { useV86PlayerStore } from "./store/v86Player.store";
import { LibretroPlayer } from "./components/LibretroPlayer/LibretroPlayer";
import { useLibretroPlayerStore } from "./store/libretroPlayer.store";
import { useContextMenuStore } from "./store/contextMenu.store";
import { QueueBlade } from "./components/QueueBlade/QueueBlade";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { useCommands } from "./hooks/useCommands";
import { useCommandsStore } from "./store/commands.store";
import { CommandDefinition, COMMAND_DEFINITIONS } from "../../shared/commands";

function normalizeShortcut(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  const key = e.key;
  if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") {
    return parts.join("+");
  }
  let displayKey = key;
  if (key.startsWith("F") && key.length > 1 && /^F\d+$/.test(key)) displayKey = key;
  else if (key === "Escape") displayKey = "Escape";
  else if (key === "Enter") displayKey = "Enter";
  else if (key === "Tab") displayKey = "Tab";
  else if (key === "Backspace") displayKey = "Backspace";
  else if (key === "Delete") displayKey = "Delete";
  else if (key === "ArrowUp") displayKey = "ArrowUp";
  else if (key === "ArrowDown") displayKey = "ArrowDown";
  else if (key === "ArrowLeft") displayKey = "ArrowLeft";
  else if (key === "ArrowRight") displayKey = "ArrowRight";
  else if (key === " ") displayKey = "Space";
  else if (key.length === 1) displayKey = key.toUpperCase();
  parts.push(displayKey);
  return parts.join("+");
}

function findMatchingCommand(shortcut: string, customBinds: Record<string, string>): CommandDefinition | undefined {
  // Check custom binds first
  for (const [cmdId, boundShortcut] of Object.entries(customBinds)) {
    if (boundShortcut === shortcut) {
      const cmd = COMMAND_DEFINITIONS.find((c) => c.id === cmdId);
      if (cmd) return cmd;
      // stale/invalid bind — continue checking other binds & defaults
    }
  }
  // Fall back to defaults
  return COMMAND_DEFINITIONS.find((c) => c.defaultShortcut === shortcut);
}

interface TabDef {
  id: TabId;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  component: React.ComponentType;
}

const TABS: TabDef[] = [
  { id: "gaming", label: "Gaming", Icon: Gamepad2, component: GamingTab },
  { id: "movies", label: "Movies", Icon: Film, component: MoviesTab },
  { id: "music", label: "Music", Icon: Music, component: MusicTab },
  { id: "tv-shows", label: "TV Shows", Icon: Tv, component: TVShowsTab },
  {
    id: "controllers",
    label: "Controllers",
    Icon: Gamepad2,
    component: ControllersTab,
  },
  { id: "settings", label: "Settings", Icon: Settings, component: SettingsTab },
];

function useVisibleTabs(settings: AppSettings | null) {
  const disabled = new Set(settings?.disabledTabs ?? []);
  return TABS.filter((t) => !disabled.has(t.id));
}

export default function App(): React.ReactElement {
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);
  const load = useSettingsStore((s) => s.load);
  const visibleTabs = useVisibleTabs(settings);
  const visibleTabIds = visibleTabs.map((t) => t.id);
  const addDevice = useInputStore((s) => s.addDevice);
  const removeDevice = useInputStore((s) => s.removeDevice);
  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);
  const setBladeCollapsed = useMusicPlayerStore((s) => s.setBladeCollapsed);
  const videoOpen = useVideoPlayerStore((s) => !!s.src);
  const flashOpen = useFlashPlayerStore((s) => s.open);
  const jsnesOpen = useJsnesPlayerStore((s) => s.open);
  const emulatorjsOpen = useEmulatorjsPlayerStore((s) => s.open);
  const v86Open = useV86PlayerStore((s) => s.open);
  const libretroOpen = useLibretroPlayerStore((s) => s.open);
  const anyEmulatorOpen = flashOpen || jsnesOpen || emulatorjsOpen || v86Open || libretroOpen;
  const [activeTab, setActiveTab] = useState<TabId>("gaming");
  const activeTabRef = useRef<TabId>(activeTab);
  activeTabRef.current = activeTab;
  const isFullscreenRef = useRef(false);

  /* Command palette context refs */
  const selectedGameRef = useRef<string | null>(null);
  const selectedMovieRef = useRef<string | null>(null);
  const selectedMusicRef = useRef<string | null>(null);
  const selectedTvRef = useRef<string | null>(null);

  /* Re-assignable keybind refs (keyboard handler captures at mount) */
  const customKeybindsRef = useRef<Record<string, string>>({});
  const customControllerMapRef = useRef<Record<string, string>>({});
  customKeybindsRef.current = settings?.commandKeybinds ?? {};
  customControllerMapRef.current = settings?.commandControllerMap ?? {};
  const executeCommandRef = useRef<(cmd: CommandDefinition) => void>(() => {});

  const { executeCommand } = useCommands(
    {
      activeTab: activeTabRef.current,
      visibleTabs: visibleTabIds,
      selectedGameId: selectedGameRef.current,
      selectedMovieId: selectedMovieRef.current,
      selectedMusicId: selectedMusicRef.current,
      selectedTvId: selectedTvRef.current,
    },
    setActiveTab,
  );
  executeCommandRef.current = executeCommand;

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
    setBladeCollapsed(anyEmulatorOpen);
  }, [anyEmulatorOpen]);

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

  /* Listen for selection changes from tabs for command palette context */
  useEffect(() => {
    const onSelectGame = (e: Event) => {
      selectedGameRef.current = (e as CustomEvent).detail?.id ?? null;
    };
    const onSelectMovie = (e: Event) => {
      selectedMovieRef.current = (e as CustomEvent).detail?.id ?? null;
    };
    const onSelectMusic = (e: Event) => {
      selectedMusicRef.current = (e as CustomEvent).detail?.id ?? null;
    };
    const onSelectTv = (e: Event) => {
      selectedTvRef.current = (e as CustomEvent).detail?.id ?? null;
    };
    window.addEventListener("htpc:select-game", onSelectGame);
    window.addEventListener("htpc:select-movie", onSelectMovie);
    window.addEventListener("htpc:select-music", onSelectMusic);
    window.addEventListener("htpc:select-tv", onSelectTv);
    return () => {
      window.removeEventListener("htpc:select-game", onSelectGame);
      window.removeEventListener("htpc:select-movie", onSelectMovie);
      window.removeEventListener("htpc:select-music", onSelectMusic);
      window.removeEventListener("htpc:select-tv", onSelectTv);
    };
  }, []);

  useEffect(() => {
    const unsubConnect = window.htpc.input.onDeviceConnected(addDevice);
    const unsubDisconnect =
      window.htpc.input.onDeviceDisconnected(removeDevice);
    const unsubEvent = window.htpc.input.onEvent((ev) => {
      useInputStore.getState().setLastEvent(ev);
      if (ev.type !== "button_press") return;

      // Check custom controller mappings first
      const ctrlMap = customControllerMapRef.current;
      const mappedCmdId = Object.entries(ctrlMap).find(([, btn]) => btn === ev.action)?.[0];
      if (mappedCmdId) {
        const cmd = COMMAND_DEFINITIONS.find((c) => c.id === mappedCmdId);
        if (cmd) {
          executeCommandRef.current(cmd);
          return;
        }
      }

      if (ev.action === "start") {
        const idx = visibleTabIds.indexOf(activeTabRef.current);
        setActiveTab(visibleTabIds[(idx + 1) % visibleTabIds.length]);
      } else if (ev.action === "west") {
        window.dispatchEvent(
          new CustomEvent("htpc:contextmenu", { detail: { source: "gamepad" } }),
        );
      } else if (ev.action === "north") {
        useCommandsStore.getState().open();
      } else if (ev.action === "select") {
        useCommandsStore.getState().toggle();
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
      // Let emulator players receive raw keyboard events; only allow Escape/F11
      const emuOpen =
        useFlashPlayerStore.getState().open ||
        useJsnesPlayerStore.getState().open ||
        useEmulatorjsPlayerStore.getState().open ||
        useV86PlayerStore.getState().open ||
        useLibretroPlayerStore.getState().open;
      if (emuOpen && !(e.key === "Escape" || e.key === "F11")) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTyping =
        target != null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Check custom keybinds first (before defaults)
      if (e.type === "keydown") {
        const shortcut = normalizeShortcut(e);
        const matched = findMatchingCommand(shortcut, customKeybindsRef.current);
        if (matched) {
          e.preventDefault();
          executeCommandRef.current(matched);
          return;
        }
      }

      if (e.type === "keydown" && e.key === "F11") {
        e.preventDefault();
        isFullscreenRef.current = !isFullscreenRef.current;
        window.htpc.app.setFullscreen(isFullscreenRef.current);
      } else if (e.type === "keydown" && e.key === "Escape") {
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
      } else if (e.type === "keydown" && e.key === "F1" && e.ctrlKey) {
        // Ctrl+F1 — rescan all libraries
        e.preventDefault();
        useGamesStore.getState().scan();
        useMoviesStore.getState().scan();
        useMusicStore.getState().scan();
        useTvStore.getState().scan();
      } else if (e.type === "keydown" && e.key === "F2" && e.ctrlKey) {
        // Ctrl+F2 — wipe library data then reload
        e.preventDefault();
        window.htpc.db.clear().then(() => window.htpc.app.restart());
      } else if (e.type === "keydown" && e.key === "F3" && e.ctrlKey) {
        // Ctrl+F3 — wipe thumbnail cache then reload stores
        e.preventDefault();
        window.htpc.db.wipeThumbnails().then(() => {
          useGamesStore.getState().load();
          useMoviesStore.getState().load();
          useMusicStore.getState().load();
          useTvStore.getState().load();
        });
      } else if (e.type === "keydown" && e.key === "F5" && e.ctrlKey) {
        // Ctrl+F5 — reload window
        e.preventDefault();
        window.htpc.app.restart();
      } else if (e.type === "keydown" && e.key === "p" && e.ctrlKey && !e.shiftKey) {
        // Ctrl+P — open command palette
        e.preventDefault();
        useCommandsStore.getState().toggle();
      } else if (e.type === "keydown" && e.key === "F5") {
        e.preventDefault();
        const scanMap: Partial<Record<TabId, () => void>> = {
          gaming: () => useGamesStore.getState().scan(),
          movies: () => useMoviesStore.getState().scan(),
          music: () => useMusicStore.getState().scan(),
          "tv-shows": () => useTvStore.getState().scan(),
        };
        scanMap[activeTabRef.current]?.();
      } else if (e.type === "keydown" && e.key === "f" && e.ctrlKey) {
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

      <AnimatePresence>
        {videoOpen && (
          <ErrorBoundary variant="section">
            <VideoPlayer />
          </ErrorBoundary>
        )}
      </AnimatePresence>
      <ErrorBoundary variant="section">
        <FlashPlayer />
      </ErrorBoundary>
      <ErrorBoundary variant="section">
        <JsnesPlayer />
      </ErrorBoundary>
      <ErrorBoundary variant="section">
        <EmulatorJSPlayer />
      </ErrorBoundary>
      <ErrorBoundary variant="section">
        <V86Player />
      </ErrorBoundary>

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
                <tab.Icon size={16} />
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
              onClick={() => {
                isFullscreenRef.current = !isFullscreenRef.current;
                window.htpc.app.setFullscreen(isFullscreenRef.current);
              }}
              title="Fullscreen"
            >
              <Maximize size={16} />
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
                <ErrorBoundary variant="section">
                  <ActiveComponent />
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Queue blade */}
          <AnimatePresence>
            {hasPlayer && (
              <ErrorBoundary variant="section" key="queue-blade">
                <QueueBlade />
              </ErrorBoundary>
            )}
          </AnimatePresence>
        </div>

        {/* Music mini-player */}
        <AnimatePresence>
          {hasPlayer && (
            <ErrorBoundary variant="section">
              <MusicPlayer />
            </ErrorBoundary>
          )}
        </AnimatePresence>
      </div>

      {/* Libretro native core player */}
      <ErrorBoundary variant="section">
        <LibretroPlayer />
      </ErrorBoundary>

      {/* Command Palette */}
      <ErrorBoundary variant="section">
        <CommandPalette onExecute={(cmd: CommandDefinition) => executeCommand(cmd)} />
      </ErrorBoundary>
    </div>
  );
}
