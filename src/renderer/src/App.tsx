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
} from "lucide-react";
import { useSettingsStore } from "./store/settings.store";
import { useInputStore } from "./store/input.store";
import { ThemeBackground } from "./components/ThemeBackground/ThemeBackground";
import { GamingTab } from "./tabs/Gaming";
import { MoviesTab } from "./tabs/Movies";
import { MusicTab } from "./tabs/Music";
import { StreamingTab } from "./tabs/Streaming";
import { StoreTab } from "./tabs/Store";
import { SettingsTab } from "./tabs/Settings";
import { ControllersTab } from "./tabs/Controllers";
import { TabId, ScanProgress, AppSettings, NormalizedInputEvent } from "../../shared/types";
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
import { PluginPlayer } from "./components/PluginPlayer/PluginPlayer";
import { usePluginPlayerStore } from "./store/pluginPlayer.store";
import { LibretroPlayer } from "./components/LibretroPlayer/LibretroPlayer";
import { useLibretroPlayerStore } from "./store/libretroPlayer.store";
import { useContextMenuStore } from "./store/contextMenu.store";
import { QueueBlade } from "./components/QueueBlade/QueueBlade";
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

export default function App(): React.ReactElement {
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);
  const load = useSettingsStore((s) => s.load);
  const visibleTabs = useVisibleTabs(settings);
  const visibleTabIds = visibleTabs.map((t) => t.id);
  const visibleTabIdsRef = useRef(visibleTabIds);
  visibleTabIdsRef.current = visibleTabIds;

  const inputDevices = useInputStore((s) => s.devices);

  /* Controller cursors — always call hook, control via `enabled` */
  const [activeTab, setActiveTab] = useState<TabId>("gaming");
  useBrowserControllerNav({ enabled: !loading, evdevActive: inputDevices.length > 0 });


  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);
  const setBladeCollapsed = useMusicPlayerStore((s) => s.setBladeCollapsed);
  const videoOpen = useVideoPlayerStore((s) => !!s.src);
  const flashOpen = useFlashPlayerStore((s) => s.open);
  const jsnesOpen = useJsnesPlayerStore((s) => s.open);
  const pluginOpen = usePluginPlayerStore((s) => s.open);
  const libretroOpen = useLibretroPlayerStore((s) => s.open);
  const anyEmulatorOpen = flashOpen || jsnesOpen || pluginOpen || libretroOpen;
  const activeTabRef = useRef<TabId>(activeTab);
  activeTabRef.current = activeTab;
  const [evdevGamepadActive, setEvdevGamepadActive] = useState(false);
  const evdevGamepadActiveRef = useRef(false);

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
  const AXIS_COOLDOWN_MS = 200;

  /* Button long-press timers for evdev controller input */
  const buttonTimersRef = useRef<Record<string, number>>({});

  /* Controllers tab lock state */
  const controllersTabLockedRef = useRef(true);
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
    },
    setActiveTab,
  );
  executeCommandRef.current = executeCommand;

  // Fallback gamepad input via browser Gamepad API (works without evdev permissions)
  useGamepadApi(!anyEmulatorOpen && inputDevices.length === 0 && !evdevGamepadActive, activeTab);

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

    const unsubLibretro = window.htpc.libretro.onOpen((opts) => {
      useLibretroPlayerStore.getState().launch(opts);
    });

    return () => { unsubScan(); unsubCores(); unsubHook(); unsubLibretro(); };
  }, []);

  useEffect(() => {
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
    setBladeCollapsed(anyEmulatorOpen);
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

  /* Reset controller lock when entering / leaving the Controllers tab */
  useEffect(() => {
    if (activeTab === "controllers") {
      controllersTabLockedRef.current = true;
      useInputStore.getState().setControllersTabLocked(true);
      useInputStore.getState().setControllersTabUnlockProgress(0);
    } else {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      if (unlockIntervalRef.current) {
        clearInterval(unlockIntervalRef.current);
        unlockIntervalRef.current = null;
      }
      controllersTabLockedRef.current = true;
      useInputStore.getState().setControllersTabLocked(true);
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
      if (ev.source === "gamepad" && !evdevGamepadActiveRef.current) {
        evdevGamepadActiveRef.current = true;
        setEvdevGamepadActive(true);
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
        controllersTabLockedRef.current
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

      // Suppress axis navigation when this device has an OSK open
      if (ev.type === "axis" && useControllerOskStore.getState().isOpen(ev.deviceId)) {
        return;
      }

      if (ev.type === "axis" && ev.axis) {
        const axis = ev.axis ?? "";
        const prev = axisValuesRef.current[axis] ?? 0;
        axisValuesRef.current[axis] = ev.value ?? 0;

        const existingTimer = axisTimersRef.current[axis];
        if (existingTimer) {
          clearTimeout(existingTimer);
          delete axisTimersRef.current[axis];
        }

        const action = getAxisNavAction(axis, ev.value ?? 0);
        const prevAction = getAxisNavAction(axis, prev);

        if (action && action !== prevAction && canDispatchAxisNav(axis)) {
          dispatchNavAction(action);
          const repeat = () => {
            if (canDispatchAxisNav(axis)) {
              dispatchNavAction(action);
            }
            axisTimersRef.current[axis] = window.setTimeout(repeat, 180);
          };
          axisTimersRef.current[axis] = window.setTimeout(repeat, 500);
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
        const tabs = visibleTabIdsRef.current;
        const idx = tabs.indexOf(activeTabRef.current);
        setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
      } else if (ev.action === "right_bumper") {
        const tabs = visibleTabIdsRef.current;
        const idx = tabs.indexOf(activeTabRef.current);
        setActiveTab(tabs[(idx + 1) % tabs.length]);
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
      axisTimersRef.current = {};
      axisCooldownRef.current = {};
      buttonTimersRef.current = {};
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
        const tabs = visibleTabIdsRef.current;
        const idx = tabs.indexOf(activeTabRef.current);
        setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
      } else if (!isTyping && e.type === "keydown" && e.key === "e") {
        e.preventDefault();
        const tabs = visibleTabIdsRef.current;
        const idx = tabs.indexOf(activeTabRef.current);
        setActiveTab(tabs[(idx + 1) % tabs.length]);
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
        const tabs = visibleTabIdsRef.current;
        const idx = tabs.indexOf(activeTabRef.current);
        setActiveTab(tabs[(idx + 1) % tabs.length]);
      } else if (e.type === "keydown" && e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const tabs = visibleTabIdsRef.current;
        const idx = tabs.indexOf(activeTabRef.current);
        setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
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
      <CursorOverlay />
      <ControllerOSKOverlay />

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
        <PluginPlayer />
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
                const current = useSettingsStore.getState().settings?.fullscreen ?? false;
                void useSettingsStore.getState().update({ fullscreen: !current });
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

      {/* Credential Prompt for remote sources */}
      <ErrorBoundary variant="section">
        <CredentialPrompt />
      </ErrorBoundary>
    </div>
  );
}
