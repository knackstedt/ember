import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gamepad2,
  Film,
  Music,
  Tv,
  Store,
  Settings,
  Maximize,
  Power,
  Loader,
  LayoutDashboard,
  LogOut,
  RotateCw,
  Moon,
  Snowflake,
  Monitor,
} from "lucide-react";
import { useSettingsStore } from "./store/settings.store";
import { useInputStore } from "./store/input.store";
import { ThemeBackground } from "./components/ThemeBackground/ThemeBackground";
import { GamingTab } from "./tabs/Gaming";
import { MoviesTab } from "./tabs/Movies";
import { MusicTab } from "./music/MusicTab";
import { StreamingTab } from "./tabs/Streaming";
import { StoreTab } from "./tabs/Store";
import { SettingsTab } from "./tabs/Settings";
import { ControllersTab } from "./tabs/Controllers";
import { DashboardTab } from "./tabs/Dashboard";
import { TabId, ScanProgress, AppSettings, NormalizedInputEvent } from "../../shared/types";
import { useGamesStore } from "./store/games.store";
import { useMoviesStore, useMusicStore, useTvStore } from "./store/media.store";
import { ToastContainer } from "./components/Toast/Toast";
import { useToastStore } from "./store/toast.store";
import { useMusicPlayerStore } from "./store/musicPlayer.store";
import { MusicPlayerShell } from "./music/components/MusicPlayerShell";
import { VideoPlayer } from "./components/VideoPlayer/VideoPlayer";
import { useVideoPlayerStore } from "./store/videoPlayer.store";
import { FlashPlayer } from "./components/FlashPlayer/FlashPlayer";
import { useFlashPlayerStore } from "./store/flashPlayer.store";
import { JsnesPlayer } from "./components/JsnesPlayer/JsnesPlayer";
import { useJsnesPlayerStore } from "./store/jsnesPlayer.store";
import { PluginPlayer } from "./components/PluginPlayer/PluginPlayer";
import { usePluginPlayerStore } from "./store/pluginPlayer.store";
import { LibretroPlayer } from "./components/LibretroPlayer/LibretroPlayer";
import { useLibretroPlayerStore } from "./store/libretroPlayer.store";
import { useGameLaunchStore } from "./store/gameLaunch.store";
import { GameLaunchOverlay } from "./components/GameLaunchOverlay/GameLaunchOverlay";
import { useSplitscreenStore } from "./store/splitscreen.store";
import { SplitscreenLaunchSpinner } from "./components/Splitscreen/SplitscreenLaunchSpinner";
import { useContextMenuStore } from "./store/contextMenu.store";

import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { CredentialPrompt } from "./components/CredentialPrompt/CredentialPrompt";
import { useCommands } from "./hooks/useCommands";
import { useCommandsStore } from "./store/commands.store";
import { useGamepadApi } from "./hooks/useGamepadApi";
import {
  useControllerWorker,
  subscribeControllerEvents,
} from "./hooks/useControllerWorker";
import { useBrowserControllerNav } from "./hooks/useBrowserControllerNav";
import { CursorOverlay } from "./components/CursorOverlay/CursorOverlay";
import { useFocusZoneStore } from "./store/focusZone.store";
import { CommandDefinition, COMMAND_DEFINITIONS } from "../../shared/commands";
import { ControllerOSKOverlay } from "./components/ControllerOSKOverlay/ControllerOSKOverlay";
import { useControllerOskStore } from "./store/controllerOsk.store";

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
  Icon: React.ComponentType<any>;
  component: React.ComponentType;
}

const TABS: TabDef[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard, component: DashboardTab },
  { id: "gaming", label: "Gaming", Icon: Gamepad2, component: GamingTab },
  { id: "movies", label: "Movies", Icon: Film, component: MoviesTab },
  { id: "music", label: "Music", Icon: Music, component: MusicTab },
  { id: "streaming", label: "Streaming", Icon: Tv, component: StreamingTab },
  { id: "store", label: "Store", Icon: Store, component: StoreTab },
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

const LAST_TAB_KEY = "ember:last-tab";
const LAST_TAB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function restoreLastTab(): TabId | null {
  try {
    const raw = localStorage.getItem(LAST_TAB_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { tab: TabId; ts: number };
      if (Date.now() - data.ts < LAST_TAB_TIMEOUT_MS) {
        return data.tab;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export default function App(): React.ReactElement {
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);
  const load = useSettingsStore((s) => s.load);
  const visibleTabs = useVisibleTabs(settings);
  const visibleTabIds = visibleTabs.map((t) => t.id);
  const visibleTabIdsRef = useRef(visibleTabIds);
  visibleTabIdsRef.current = visibleTabIds;

  const inputDevices = useInputStore((s) => s.devices);

  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);
  const videoOpen = useVideoPlayerStore((s) => !!s.src);
  const flashOpen = useFlashPlayerStore((s) => s.open);
  const jsnesOpen = useJsnesPlayerStore((s) => s.open);
  const pluginOpen = usePluginPlayerStore((s) => s.open);
  const libretroOpen = useLibretroPlayerStore((s) => s.open);
  const anyEmulatorOpen = flashOpen || jsnesOpen || pluginOpen || libretroOpen;
  const [gameRunning, setGameRunning] = useState(false);
  const gameRunningRef = useRef(false);

  /* Controller cursors — always call hook, control via `enabled` */
  const restoredTabRef = useRef<TabId | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const restored = restoreLastTab();
    if (restored) restoredTabRef.current = restored;
    return restored ?? "gaming";
  });
  const hasEvdevDevices = inputDevices.some((d) => !d.id.startsWith("gamepad-"));
  useBrowserControllerNav({ enabled: !loading && !anyEmulatorOpen && !gameRunning, evdevActive: hasEvdevDevices });
  const activeTabRef = useRef<TabId>(activeTab);
  activeTabRef.current = activeTab;
  const [evdevGamepadActive, setEvdevGamepadActive] = useState(false);
  const evdevGamepadActiveRef = useRef(false);

  /* Tab bar keyboard/controller focus state (-1 = unfocused) */
  const [tabBarFocusIndex, setTabBarFocusIndex] = useState(-1);
  const tabBarFocusIndexRef = useRef(tabBarFocusIndex);
  tabBarFocusIndexRef.current = tabBarFocusIndex;

  /* Power dialog state */
  const [powerDialogOpen, setPowerDialogOpen] = useState(false);
  const [powerActionLoading, setPowerActionLoading] = useState(false);
  const [canHibernate, setCanHibernate] = useState(false);

  const POWER_GRID_COLS = 3;
  const powerActions = [
    { id: "exit", label: "Exit Ember", icon: LogOut, action: () => window.htpc.app.quit() },
    { id: "restart", label: "Restart Ember", icon: RotateCw, action: () => window.htpc.app.restart() },
    { id: "shutdown", label: "Shut Down", icon: Power, action: () => window.htpc.app.shutdown(), danger: true },
    { id: "reboot", label: "Reboot", icon: Monitor, action: () => window.htpc.app.reboot(), danger: true },
    { id: "suspend", label: "Sleep", icon: Moon, action: () => window.htpc.app.suspend() },
    ...(canHibernate
      ? [{ id: "hibernate", label: "Hibernate", icon: Snowflake, action: () => window.htpc.app.hibernate() }]
      : []),
    { id: "cancel", label: "Cancel", icon: Loader, action: () => Promise.resolve() },
  ] as const;
  const powerActionsRef = useRef(powerActions);
  powerActionsRef.current = powerActions;

  /* Command palette context refs */
  const selectedGameRef = useRef<string | null>(null);
  const selectedMovieRef = useRef<string | null>(null);
  const selectedMusicRef = useRef<string | null>(null);
  const selectedMusicArtistRef = useRef<string | null>(null);
  const selectedMusicAlbumRef = useRef<string | null>(null);
  const selectedTvRef = useRef<string | null>(null);

  /* Re-assignable keybind refs (keyboard handler captures at mount) */
  const customKeybindsRef = useRef<Record<string, string>>({});
  const customControllerMapRef = useRef<Record<string, string>>({});
  customKeybindsRef.current = settings?.commandKeybinds ?? {};
  customControllerMapRef.current = settings?.commandControllerMap ?? {};
  const executeCommandRef = useRef<(cmd: CommandDefinition) => void>(() => {});

  /* Axis navigation state for analog sticks / D-pad axes */
  const axisValuesRef = useRef<Record<string, number>>({});
  const axisTimersRef = useRef<Record<string, number>>({});
  const axisCooldownRef = useRef<Record<string, number>>({});
  const AXIS_COOLDOWN_MS = 120;

  /* Button long-press timers for evdev controller input */
  const buttonTimersRef = useRef<Record<string, number>>({});

  /* Navigation button repeat timers (dpad directions held) */
  const navButtonTimersRef = useRef<Record<string, number>>({});

  /* Controllers tab lock state */
  const controllersTabLockedRef = useRef(false);
  const unlockTimerRef = useRef<number | null>(null);
  const unlockIntervalRef = useRef<number | null>(null);

  const AXIS_THRESHOLD = 0.5;

  function getAxisNavAction(axis: string, value: number): string | null {
    if (axis === "dpad_x") {
      if (value < 0) return "left";
      if (value > 0) return "right";
    } else if (axis === "dpad_y") {
      if (value < 0) return "up";
      if (value > 0) return "down";
    } else if (axis === "left_x") {
      if (value < -AXIS_THRESHOLD) return "left";
      if (value > AXIS_THRESHOLD) return "right";
    } else if (axis === "left_y") {
      if (value < -AXIS_THRESHOLD) return "up";
      if (value > AXIS_THRESHOLD) return "down";
    }
    return null;
  }

  function canDispatchAxisNav(axis: string): boolean {
    const now = Date.now();
    const last = axisCooldownRef.current[axis] ?? 0;
    if (now - last < AXIS_COOLDOWN_MS) return false;
    axisCooldownRef.current[axis] = now;
    return true;
  }

  function dispatchNavAction(action: string) {
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

  const { executeCommand } = useCommands(
    {
      activeTab: activeTabRef.current,
      visibleTabs: visibleTabIds,
      selectedGameId: selectedGameRef.current,
      selectedMovieId: selectedMovieRef.current,
      selectedMusicId: selectedMusicRef.current,
      selectedMusicArtist: selectedMusicArtistRef.current,
      selectedMusicAlbum: selectedMusicAlbumRef.current,
      selectedTvId: selectedTvRef.current,
      gameRunning,
    },
    setActiveTab,
  );
  executeCommandRef.current = executeCommand;

  // Global command dispatch: any component can request command execution via event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      const cmd = COMMAND_DEFINITIONS.find((c) => c.id === detail.id);
      if (cmd) executeCommand(cmd);
    };
    window.addEventListener("htpc:execute-command", handler);
    return () => window.removeEventListener("htpc:execute-command", handler);
  }, [executeCommand]);

  // Fallback gamepad input via browser Gamepad API (works without evdev permissions)
  useGamepadApi(!anyEmulatorOpen && !gameRunning && !hasEvdevDevices && !evdevGamepadActive, activeTab);

  useEffect(() => {
    load().then(() => {
      useMusicPlayerStore.getState().loadPersisted();
    });

    // Scan operations are now fire-and-forget; each tab loads its own data on demand
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
        // Skip no-op start events and finished events that never had progress.
        // This prevents sticky 0/0 toasts when the initial scanning event is
        // lost before the listener is registered.
        if (
          (p.status === "scanning" && p.current === 0 && p.total === 0) ||
          p.status === "done"
        ) {
          return;
        }
        const id = push({
          type: p.status === "error" ? "error" : "progress",
          message: `${p.scanner}: ${label}`,
          progress: pct,
        });
        scanToastIds.set(p.scanner, id);
        if (p.status === "error") {
          setTimeout(() => dismiss(id), 8000);
          scanToastIds.delete(p.scanner);
        }
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

      // Track remote scanning state in stores
      if (p.scanner === "remote-movie") {
        useMoviesStore.setState({ remoteScanning: p.status === "scanning" });
        if (p.status === "done") {
          useMoviesStore.getState().load();
        }
      } else if (p.scanner === "remote-music") {
        useMusicStore.setState({ remoteScanning: p.status === "scanning" });
        if (p.status === "done") {
          useMusicStore.getState().load();
        }
      } else if (p.scanner === "remote-rom") {
        useGamesStore.setState({ remoteScanning: p.status === "scanning" });
        if (p.status === "done") {
          useGamesStore.getState().load();
        }
      }
    });

    const unsubCores = window.htpc.libretro.onCoreListChanged(() => {
      useGamesStore.getState().load();
      useGamesStore.getState().refreshCores();
    });

    const unsubHook = window.htpc.onSessionHookError((detail) => {
      useToastStore.getState().push({
        type: "error",
        message: `Session hook "${detail.timing}" failed for ${detail.gameTitle}: ${detail.reason}`,
      });
    });

    const unsubMusicMoved = window.htpc.onMusicFilesMoved(({ moves }) => {
      for (const move of moves) {
        useMusicPlayerStore.getState().updateTrackFilePath(move.id, move.newPath);
      }
      useMusicStore.getState().load();
    });

    const unsubToast = window.htpc.onToastPush((toast) => {
      useToastStore.getState().push(toast);
    });

    const unsubLibretro = window.htpc.libretro.onOpen((opts) => {
      useLibretroPlayerStore.getState().launch(opts);
    });

    const unsubGameLaunching = window.htpc.onGameLaunching((detail) => {
      useGameLaunchStore.getState().setLaunching(detail.gameId, detail.title);
      console.log(`[renderer] External game launching: ${detail.gameId}`);
    });

    const unsubGameLaunchProgress = window.htpc.onGameLaunchProgress((detail) => {
      useGameLaunchStore.getState().setProgress(detail.gameId, detail.step, detail.detail);
    });

    const unsubGameLaunchFailed = window.htpc.onGameLaunchFailed((detail) => {
      gameRunningRef.current = false;
      setGameRunning(false);
      useGameLaunchStore.getState().setFailed(detail.gameId, detail.reason);
      console.log(`[renderer] External game launch failed: ${detail.gameId}`);
    });

    const unsubGameStarted = window.htpc.onGameStarted((gameId) => {
      gameRunningRef.current = true;
      setGameRunning(true);
      useGameLaunchStore.getState().setStarted(gameId);
      console.log(`[renderer] External game started: ${gameId}`);
    });

    const unsubGameStopped = window.htpc.onGameStopped((gameId) => {
      gameRunningRef.current = false;
      setGameRunning(false);
      useGameLaunchStore.getState().setStopped(gameId);
      console.log(`[renderer] External game stopped: ${gameId}`);
    });

    const unsubSplitscreenState = window.htpc.splitscreen.onState((session) => {
      useSplitscreenStore.getState().setSession(session);
    });

    const unsubSplitscreenProgress = window.htpc.splitscreen.onInstanceProgress((detail) => {
      useSplitscreenStore.getState().setInstanceProgress(detail);
    });

    // Check for a pending desktop-entry launch on startup
    void (async () => {
      try {
        const game = await window.htpc.games.getPendingLaunch();
        if (game) {
          console.log("[renderer] Pending launch detected, switching to gaming:", game.title);
          setActiveTab("gaming");
        }
      } catch (err) {
        console.error("[renderer] Failed to check pending launch:", err);
      }
    })();

    return () => { unsubScan(); unsubCores(); unsubHook(); unsubMusicMoved(); unsubToast(); unsubLibretro(); unsubGameLaunching(); unsubGameLaunchProgress(); unsubGameLaunchFailed(); unsubGameStarted(); unsubGameStopped(); unsubSplitscreenState(); unsubSplitscreenProgress(); };
  }, []);

  useEffect(() => {
    if (restoredTabRef.current) {
      restoredTabRef.current = null; // consume — only skip once
      return;
    }
    if (settings?.defaultTab && visibleTabIds.includes(settings.defaultTab)) {
      setActiveTab(settings.defaultTab);
    }
  }, [settings?.defaultTab]);

  // Listen for fallback gamepad API tab-switch events
  useEffect(() => {
    const onNext = () => {
      const tabs = visibleTabIdsRef.current;
      const idx = tabs.indexOf(activeTabRef.current);
      setActiveTab(tabs[(idx + 1) % tabs.length]);
    };
    const onPrev = () => {
      const tabs = visibleTabIdsRef.current;
      const idx = tabs.indexOf(activeTabRef.current);
      setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
    };
    window.addEventListener("htpc:tab-next", onNext);
    window.addEventListener("htpc:tab-prev", onPrev);
    return () => {
      window.removeEventListener("htpc:tab-next", onNext);
      window.removeEventListener("htpc:tab-prev", onPrev);
    };
  }, []);

  useEffect(() => {
    if (anyEmulatorOpen) {
      useFocusZoneStore.getState().clearZone();
    }
  }, [anyEmulatorOpen]);

  useEffect(() => {
    if (videoOpen) {
      useMusicPlayerStore.getState().pause();
      useFocusZoneStore.getState().clearZone();
    }
  }, [videoOpen]);

  useEffect(() => {
    if (!visibleTabIds.includes(activeTab)) {
      setActiveTab(visibleTabIds[0] ?? "gaming");
    }
  }, [visibleTabIds.join(","), activeTab]);

  useEffect(() => {
    useFocusZoneStore.getState().clearZone();
  }, [activeTab]);

  /* Reset controller lock timers when leaving the Controllers tab */
  useEffect(() => {
    if (activeTab !== "controllers") {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      if (unlockIntervalRef.current) {
        clearInterval(unlockIntervalRef.current);
        unlockIntervalRef.current = null;
      }
      controllersTabLockedRef.current = false;
      useInputStore.getState().setControllersTabLocked(false);
      useInputStore.getState().setControllersTabUnlockProgress(0);
    }
    return () => {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      if (unlockIntervalRef.current) {
        clearInterval(unlockIntervalRef.current);
        unlockIntervalRef.current = null;
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: TabId };
      if (detail?.tab && visibleTabIdsRef.current.includes(detail.tab)) {
        setActiveTab(detail.tab);
      }
    };
    window.addEventListener("htpc:switch-tab", handler);
    return () => window.removeEventListener("htpc:switch-tab", handler);
  }, []);

  /* Save current tab on app shutdown so it can be restored within 5 minutes */
  useEffect(() => {
    const removeSaveStateListener = window.htpc.onSaveState?.(() => {
      try {
        localStorage.setItem(
          LAST_TAB_KEY,
          JSON.stringify({ tab: activeTabRef.current, ts: Date.now() }),
        );
      } catch {
        // ignore
      }
    });
    return () => { removeSaveStateListener?.(); };
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
      const detail = (e as CustomEvent).detail;
      selectedMusicRef.current = detail?.id ?? null;
      selectedMusicArtistRef.current = detail?.artist ?? null;
      selectedMusicAlbumRef.current = detail?.album ?? null;
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

  // Initialize the controller worker + SAB pipeline
  useControllerWorker();

  useEffect(() => {
    const handleInputEvent = (ev: NormalizedInputEvent) => {
      useInputStore.getState().setLastEvent(ev);
      if (activeTabRef.current === "controllers") {
        useInputStore.getState().recordRawInput(ev.deviceId, ev);
      }
      if (ev.source === "gamepad" && !ev.deviceId.startsWith("gamepad-") && !evdevGamepadActiveRef.current) {
        evdevGamepadActiveRef.current = true;
        setEvdevGamepadActive(true);
      }

      // When an external game is running, only allow mapped controller keybinds
      // (e.g. focus-ember, kill game, toggle overlay, pause). All navigation
      // and unmapped inputs are suppressed so the game gets clean controller input.
      if (gameRunningRef.current) {
        if (ev.type === "axis") return;
        if (ev.type === "button_press") {
          const ctrlMap = customControllerMapRef.current;
          const mappedCmdId = Object.entries(ctrlMap).find(([, btn]) => btn === ev.action)?.[0];
          if (mappedCmdId) {
            const cmd = COMMAND_DEFINITIONS.find((c) => c.id === mappedCmdId);
            if (cmd) executeCommandRef.current(cmd);
          }
        }
        return;
      }

      // When an emulator has focus, only allow mapped controller keybinds
      const emuOpen =
        useFlashPlayerStore.getState().open ||
        useJsnesPlayerStore.getState().open ||
        usePluginPlayerStore.getState().open ||
        useLibretroPlayerStore.getState().open;
      if (emuOpen) {
        if (ev.type === "axis") return;
        if (ev.type === "button_press") {
          const ctrlMap = customControllerMapRef.current;
          const mappedCmdId = Object.entries(ctrlMap).find(([, btn]) => btn === ev.action)?.[0];
          if (mappedCmdId) {
            const cmd = COMMAND_DEFINITIONS.find((c) => c.id === mappedCmdId);
            if (cmd) executeCommandRef.current(cmd);
          }
          return;
        }
        return;
      }

      // Controllers tab lock / unlock logic
      if (
        activeTabRef.current === "controllers" &&
        ev.source === "gamepad" &&
        useInputStore.getState().controllersTabLocked
      ) {
        if (ev.type === "button_press" && ev.action === "west") {
          if (!unlockTimerRef.current) {
            const startTime = Date.now();
            unlockIntervalRef.current = window.setInterval(() => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / 5000, 1);
              useInputStore.getState().setControllersTabUnlockProgress(progress);
              if (progress >= 1) {
                controllersTabLockedRef.current = false;
                useInputStore.getState().setControllersTabLocked(false);
                if (unlockTimerRef.current) {
                  clearTimeout(unlockTimerRef.current);
                  unlockTimerRef.current = null;
                }
                if (unlockIntervalRef.current) {
                  clearInterval(unlockIntervalRef.current);
                  unlockIntervalRef.current = null;
                }
              }
            }, 50);
            unlockTimerRef.current = window.setTimeout(() => {
              // Unlock is handled by the interval above for smooth progress
            }, 5000);
          }
        } else if (ev.type === "button_release" && ev.action === "west") {
          if (unlockTimerRef.current) {
            clearTimeout(unlockTimerRef.current);
            unlockTimerRef.current = null;
          }
          if (unlockIntervalRef.current) {
            clearInterval(unlockIntervalRef.current);
            unlockIntervalRef.current = null;
          }
          useInputStore.getState().setControllersTabUnlockProgress(0);
        }
        // Suppress all controller navigation while locked
        return;
      }

      // Suppress background navigation while a modal dialog is open, but still
      // forward directional/confirm/cancel actions to the dialog's capture listener.
      if (useInputStore.getState().navSuspended) {
        if (ev.type === "axis" && ev.axis) {
          const axis = ev.axis ?? "";
          const prev = axisValuesRef.current[axis] ?? 0;
          axisValuesRef.current[axis] = ev.value ?? 0;
          const action = getAxisNavAction(axis, ev.value ?? 0);
          const prevAction = getAxisNavAction(axis, prev);
          if (action && action !== prevAction && canDispatchAxisNav(axis)) {
            dispatchNavAction(action);
          }
          return;
        }
        if (ev.type === "button_press") {
          const dialogActionMap: Record<string, string> = {
            dpad_up: "up",
            dpad_down: "down",
            dpad_left: "left",
            dpad_right: "right",
            south: "confirm",
            east: "cancel",
          };
          const action = dialogActionMap[ev.action ?? ""];
          if (action) dispatchNavAction(action);
          return;
        }
        return;
      }

      // Suppress axis navigation when this device has an OSK open
      if (ev.type === "axis" && useControllerOskStore.getState().isOpen(ev.deviceId)) {
        return;
      }

      if (ev.type === "axis" && ev.axis) {
        const axis = ev.axis ?? "";
        const prev = axisValuesRef.current[axis] ?? 0;
        axisValuesRef.current[axis] = ev.value ?? 0;

        const action = getAxisNavAction(axis, ev.value ?? 0);
        const prevAction = getAxisNavAction(axis, prev);

        // Only clear the repeat timer when the direction actually changes.
        // Analog stick jitter generates constant axis events; if we blindly
        // clear the timer the repeat never fires while the stick is held.
        if (action !== prevAction) {
          const existingTimer = axisTimersRef.current[axis];
          if (existingTimer) {
            clearTimeout(existingTimer);
            delete axisTimersRef.current[axis];
          }
        }

        if (action && action !== prevAction && canDispatchAxisNav(axis)) {
          dispatchNavAction(action);
          const repeat = () => {
            if (canDispatchAxisNav(axis)) {
              dispatchNavAction(action);
            }
            axisTimersRef.current[axis] = window.setTimeout(repeat, 180);
          };
          axisTimersRef.current[axis] = window.setTimeout(repeat, 400);
        }
        return;
      }

      if (ev.type === "button_release") {
        if (ev.action) {
          const timer = buttonTimersRef.current[ev.action];
          if (timer) {
            clearTimeout(timer);
            delete buttonTimersRef.current[ev.action];
          }
          const navTimer = navButtonTimersRef.current[ev.action];
          if (navTimer) {
            clearTimeout(navTimer);
            delete navButtonTimersRef.current[ev.action];
          }
        }
        return;
      }

      if (ev.type !== "button_press") return;

      // Suppress controller navigation when this device has an OSK open
      if (useControllerOskStore.getState().isOpen(ev.deviceId)) {
        return;
      }

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
        const tabs = visibleTabIdsRef.current;
        const idx = tabs.indexOf(activeTabRef.current);
        setActiveTab(tabs[(idx + 1) % tabs.length]);
      } else if (ev.action === "left_bumper") {
        if (useFocusZoneStore.getState().activeZone === "player") {
          dispatchNavAction("prevTab");
        } else {
          const tabs = visibleTabIdsRef.current;
          const idx = tabs.indexOf(activeTabRef.current);
          setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
        }
      } else if (ev.action === "right_bumper") {
        if (useFocusZoneStore.getState().activeZone === "player") {
          dispatchNavAction("nextTab");
        } else {
          const tabs = visibleTabIdsRef.current;
          const idx = tabs.indexOf(activeTabRef.current);
          setActiveTab(tabs[(idx + 1) % tabs.length]);
        }
      } else if (ev.action === "west") {
        window.dispatchEvent(
          new CustomEvent("htpc:contextmenu", { detail: { source: "gamepad" } }),
        );
      } else if (ev.action === "select") {
        useCommandsStore.getState().toggle();
      } else if (ev.action === "south") {
        dispatchNavAction("confirm");
        const timer = window.setTimeout(() => {
          delete buttonTimersRef.current["south"];
          window.dispatchEvent(
            new CustomEvent("htpc:contextmenu", { detail: { source: "gamepad" } }),
          );
        }, 800);
        buttonTimersRef.current["south"] = timer;
      } else {
        const actionMap: Record<string, string> = {
          dpad_up: "up",
          dpad_down: "down",
          dpad_left: "left",
          dpad_right: "right",
          east: "cancel",
          north: "menu",
        };
        const action = actionMap[ev.action ?? ""];
        if (action) {
          dispatchNavAction(action);

          // Start a repeat timer for directional buttons so holding
          // the d-pad or mapped stick buttons scrolls like keyboard hold.
          if (ev.action?.startsWith("dpad_")) {
            const repeat = () => {
              dispatchNavAction(action);
              navButtonTimersRef.current[ev.action!] = window.setTimeout(repeat, 180);
            };
            navButtonTimersRef.current[ev.action] = window.setTimeout(repeat, 400);
          }
        }
      }
    };

    const unsubEvent = subscribeControllerEvents(handleInputEvent);
    const unsubKeyboard = window.htpc.input.onEventKeyboard(handleInputEvent);
    return () => {
      unsubEvent();
      unsubKeyboard();
      Object.values(axisTimersRef.current).forEach(clearTimeout);
      Object.values(buttonTimersRef.current).forEach(clearTimeout);
      Object.values(navButtonTimersRef.current).forEach(clearTimeout);
      axisTimersRef.current = {};
      axisCooldownRef.current = {};
      buttonTimersRef.current = {};
      navButtonTimersRef.current = {};
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      if (unlockIntervalRef.current) {
        clearInterval(unlockIntervalRef.current);
        unlockIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const longPressTimers = new Map<string, number>();

    const handler = (e: KeyboardEvent): void => {
      // Let emulator players receive raw keyboard events; only allow Escape/F11
      const emuOpen =
        useFlashPlayerStore.getState().open ||
        useJsnesPlayerStore.getState().open ||
        usePluginPlayerStore.getState().open ||
        useLibretroPlayerStore.getState().open;
      if (emuOpen && !(e.key === "Escape" || e.key === "F11")) {
        return;
      }

      // Skip command execution if commands are suspended (e.g., during keybind recording)
      const commandsSuspended = useCommandsStore.getState().commandsSuspended;
      if (commandsSuspended) {
        return;
      }

      // Skip background shortcuts while a modal dialog is open. The dialog's capture
      // listener handles Escape/Enter/Arrows and stops their propagation.
      if (useInputStore.getState().navSuspended) {
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

      if (e.type === "keydown" && e.key === "Escape") {
        useVideoPlayerStore.getState().close();
        window.dispatchEvent(new CustomEvent("htpc:escape"));
      } else if (!isTyping && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        if (e.type === "keydown") {
          window.dispatchEvent(
            new CustomEvent("htpc:nav", { detail: { action: "confirm" } }),
          );
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
        if (useFocusZoneStore.getState().activeZone === "player") {
          window.dispatchEvent(new CustomEvent("htpc:nav", { detail: { action: "prevTab" } }));
        } else {
          const tabs = visibleTabIdsRef.current;
          const idx = tabs.indexOf(activeTabRef.current);
          setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
        }
      } else if (!isTyping && e.type === "keydown" && e.key === "e") {
        e.preventDefault();
        if (useFocusZoneStore.getState().activeZone === "player") {
          window.dispatchEvent(new CustomEvent("htpc:nav", { detail: { action: "nextTab" } }));
        } else {
          const tabs = visibleTabIdsRef.current;
          const idx = tabs.indexOf(activeTabRef.current);
          setActiveTab(tabs[(idx + 1) % tabs.length]);
        }
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
          " ",
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
          " ": "confirm",
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
        const totalItems = visibleTabs.length + 2; // tabs + fullscreen + power
        const next = (tabBarFocusIndexRef.current + 1) % totalItems;
        setTabBarFocusIndex(next);
      } else if (e.type === "keydown" && e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const totalItems = visibleTabs.length + 2;
        const next = (tabBarFocusIndexRef.current - 1 + totalItems) % totalItems;
        setTabBarFocusIndex(next);
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
          streaming: () => useTvStore.getState().scan(),
        };
        scanMap[activeTabRef.current]?.();
      } else if (e.type === "keydown" && e.key === "f" && e.ctrlKey) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('input[placeholder^="Search"]')
          ?.focus();
      } else if (e.type === "keydown" && e.key === "=" && e.ctrlKey) {
        e.preventDefault();
        window.htpc.app.zoomIn();
      } else if (e.type === "keydown" && e.key === "-" && e.ctrlKey) {
        e.preventDefault();
        window.htpc.app.zoomOut();
      } else if (e.type === "keydown" && e.key === "0" && e.ctrlKey) {
        e.preventDefault();
        window.htpc.app.resetZoom();
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

  /* Power dialog: suspend nav and handle Escape / controller nav */
  const [powerDialogFocusIndex, setPowerDialogFocusIndex] = useState(0);
  useEffect(() => {
    useInputStore.getState().setNavSuspended(powerDialogOpen);
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !powerActionLoading) {
        setPowerDialogOpen(false);
      }
    };
    if (powerDialogOpen) {
      window.addEventListener("keydown", handler, true);
    }
    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [powerDialogOpen, powerActionLoading]);

  useEffect(() => {
    if (powerDialogOpen) {
      setPowerDialogFocusIndex(0);
      void window.htpc.app.canHibernate().then(setCanHibernate);
    }
  }, [powerDialogOpen]);

  useEffect(() => {
    if (!powerDialogOpen) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string } | undefined;
      const action = detail?.action;
      if (!action) return;
      e.stopImmediatePropagation();
      const maxIndex = powerActionsRef.current.length - 1;
      if (action === "left") {
        setPowerDialogFocusIndex((prev) => Math.max(0, prev - 1));
      } else if (action === "right") {
        setPowerDialogFocusIndex((prev) => Math.min(maxIndex, prev + 1));
      } else if (action === "up") {
        setPowerDialogFocusIndex((prev) => Math.max(0, prev - POWER_GRID_COLS));
      } else if (action === "down") {
        setPowerDialogFocusIndex((prev) => Math.min(maxIndex, prev + POWER_GRID_COLS));
      } else if (action === "confirm") {
        const item = powerActionsRef.current[powerDialogFocusIndex];
        if (item) {
          if (item.id === "cancel") {
            setPowerDialogOpen(false);
          } else {
            setPowerActionLoading(true);
            void item.action();
          }
        }
      } else if (action === "cancel") {
        setPowerDialogOpen(false);
      }
    };
    window.addEventListener("htpc:nav", handler, true);
    return () => window.removeEventListener("htpc:nav", handler, true);
  }, [powerDialogOpen, powerDialogFocusIndex]);

  /* Capture-phase nav listener for tab bar focus */
  useEffect(() => {
    const handler = (e: Event) => {
      if (useInputStore.getState().navSuspended) return;
      const idx = tabBarFocusIndexRef.current;
      if (idx < 0) return;

      const detail = (e as CustomEvent).detail as { action?: string } | undefined;
      const action = detail?.action;
      if (!action) return;

      const totalItems = visibleTabs.length + 2;

      if (action === "left") {
        e.stopImmediatePropagation();
        setTabBarFocusIndex((prev) => (prev - 1 + totalItems) % totalItems);
      } else if (action === "right") {
        e.stopImmediatePropagation();
        setTabBarFocusIndex((prev) => (prev + 1) % totalItems);
      } else if (action === "confirm") {
        e.stopImmediatePropagation();
        const tabCount = visibleTabs.length;
        if (idx < tabCount) {
          setActiveTab(visibleTabs[idx].id);
          setTabBarFocusIndex(-1);
        } else if (idx === tabCount) {
          const current = useSettingsStore.getState().settings?.fullscreen ?? false;
          void useSettingsStore.getState().update({ fullscreen: !current });
          setTabBarFocusIndex(-1);
        } else if (idx === tabCount + 1) {
          setPowerDialogOpen(true);
          setTabBarFocusIndex(-1);
        }
      } else if (action === "cancel") {
        e.stopImmediatePropagation();
        setTabBarFocusIndex(-1);
      }
    };
    window.addEventListener("htpc:nav", handler, true);
    return () => window.removeEventListener("htpc:nav", handler, true);
  }, [visibleTabs.length]);

  if (loading) {
    return (
      <div
        className="h-screen w-screen flex items-center justify-center"
        style={{ background: "#000", color: "#fff" }}
      >
        {/* <CampfireLoader text="Loading Ember…" /> */}
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden relative"
      style={
        {
          background: "var(--surface-base)",
          "--player-bar-height": hasPlayer ? "72px" : "0px",
        } as React.CSSProperties
      }
    >
      <ToastContainer />
      <ThemeBackground />
      <CursorOverlay />
      <ControllerOSKOverlay />

      <AnimatePresence>
        {videoOpen && (
          <ErrorBoundary variant="section">
            <VideoPlayer />
          </ErrorBoundary>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {flashOpen && (
          <ErrorBoundary variant="section">
            <FlashPlayer />
          </ErrorBoundary>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {jsnesOpen && (
          <ErrorBoundary variant="section">
            <JsnesPlayer />
          </ErrorBoundary>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pluginOpen && (
          <ErrorBoundary variant="section">
            <PluginPlayer />
          </ErrorBoundary>
        )}
      </AnimatePresence>

      <div
        className="relative z-10 flex flex-col h-full"
        style={{ display: videoOpen ? "none" : "flex" }}
      >
        {/* Tab bar */}
        <nav
          className="flex items-center gap-1 px-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border-default)" }}
        >
          {visibleTabs.map((tab, idx) => {
            const isActive = tab.id === activeTab;
            const isFocused = tabBarFocusIndex === idx;
            return (
              <button
                key={tab.id}
                tabIndex={0}
                onClick={() => {
                  setActiveTab(tab.id);
                  setTabBarFocusIndex(-1);
                }}
                onFocus={() => setTabBarFocusIndex(idx)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${isFocused ? "tab-bar-focus" : ""}`}
                style={{
                  color: isActive
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  background: isActive
                    ? "var(--surface-1)"
                    : "transparent",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-0)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = isActive ? "var(--surface-1)" : "transparent";
                }}
              >
                <tab.Icon size={16} />
                <span>{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{
                      background: "var(--accent)",
                      boxShadow: "var(--shadow-glow)",
                    }}
                    transition={{ type: "spring", damping: 30, stiffness: 400 }}
                  />
                )}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            <button
              tabIndex={0}
              className={`px-3 py-1.5 rounded text-xs transition-colors ${tabBarFocusIndex === visibleTabs.length ? "tab-bar-focus" : ""}`}
              style={{
                color: "var(--text-secondary)",
                background: "transparent",
              }}
              onClick={() => {
                const current = useSettingsStore.getState().settings?.fullscreen ?? false;
                void useSettingsStore.getState().update({ fullscreen: !current });
              }}
              onFocus={() => setTabBarFocusIndex(visibleTabs.length)}
              title="Fullscreen"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-0)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <Maximize size={16} />
            </button>
            <button
              tabIndex={0}
              className={`px-3 py-1.5 rounded text-xs transition-colors ${tabBarFocusIndex === visibleTabs.length + 1 ? "tab-bar-focus" : ""}`}
              style={{
                color: "var(--text-secondary)",
                background: "transparent",
              }}
              onClick={() => setPowerDialogOpen(true)}
              onFocus={() => setTabBarFocusIndex(visibleTabs.length + 1)}
              title="Power"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-0)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <Power size={16} />
            </button>
          </div>
        </nav>

        {/* Main area: tab content */}
        {/* Render the active tab directly. Wrapping it in AnimatePresence with
            mode="wait" made the new tab start invisible and left the container
            empty during the transition, causing the recurring blank-tab bug. */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <ErrorBoundary variant="section">
            {(() => {
              const Component =
                TABS.find((t) => t.id === activeTab)?.component ?? GamingTab;
              return <Component />;
            })()}
          </ErrorBoundary>
        </div>

        {/* Music player shell (mini bar / full player) */}
        <MusicPlayerShell />
      </div>

      {/* Libretro native core player */}
      <AnimatePresence>
        {libretroOpen && (
          <ErrorBoundary variant="section">
            <LibretroPlayer />
          </ErrorBoundary>
        )}
      </AnimatePresence>

      {/* Command Palette */}
      <ErrorBoundary variant="section">
        <CommandPalette onExecute={(cmd: CommandDefinition) => executeCommand(cmd)} />
      </ErrorBoundary>

      {/* Credential Prompt for remote sources */}
      <ErrorBoundary variant="section">
        <CredentialPrompt />
      </ErrorBoundary>

      {/* Game launch overlay */}
      <GameLaunchOverlay />

      {/* Splitscreen launch spinner */}
      <SplitscreenLaunchSpinner />

      {/* Power dialog */}
      <AnimatePresence>
        {powerDialogOpen && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!powerActionLoading) setPowerDialogOpen(false);
            }}
          >
            <motion.div
              className="flex flex-col gap-4 p-6 rounded-[var(--radius-card)]"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                maxWidth: 520,
              }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-1">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Power Options
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Choose an action below.
                </p>
              </div>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${POWER_GRID_COLS}, 1fr)` }}
              >
                {powerActions.map((item, idx) => {
                  const Icon = item.icon;
                  const isFocused = powerDialogFocusIndex === idx;
                  const isCancel = item.id === "cancel";
                  const isDanger = "danger" in item && item.danger;
                  const focusBg = isDanger ? "#ff4444" : "var(--accent)";
                  const focusColor = isDanger ? "#fff" : "var(--surface-base)";
                  const focusBorder = isDanger ? "#ff4444" : "var(--accent)";
                  return (
                    <button
                      key={item.id}
                      className={`flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-[var(--radius-card)] text-sm font-medium transition-all ${isFocused ? "tab-bar-focus" : ""}`}
                      style={{
                        background: isFocused ? focusBg : "var(--surface-0)",
                        color: isFocused ? focusColor : "var(--text-primary)",
                        border: `1px solid ${isFocused ? focusBorder : "var(--border-default)"}`,
                        opacity: powerActionLoading ? 0.5 : 1,
                        cursor: powerActionLoading ? "not-allowed" : "pointer",
                      }}
                      onClick={() => {
                        if (powerActionLoading) return;
                        if (isCancel) {
                          setPowerDialogOpen(false);
                        } else {
                          setPowerActionLoading(true);
                          void item.action();
                        }
                      }}
                      disabled={powerActionLoading}
                    >
                      <Icon size={28} strokeWidth={1.5} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              {powerActionLoading && (
                <div
                  className="flex items-center justify-center gap-2 text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Loader size={14} className="animate-spin" />
                  <span>Executing…</span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
