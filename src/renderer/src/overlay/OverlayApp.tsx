import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Gamepad2,
  Trophy,
  X,
  Power,
  Pause,
  Play,
  Clock,
  Star,
  Award,
  Disc,
  Cpu,
  HardDrive,
  Info,
  Settings,
  Wifi,
  Activity,
  Zap,
  MemoryStick,
} from "lucide-react";
import { useInputNav } from "../hooks/useInputNav";
import { useControllerWorker } from "../hooks/useControllerWorker";
import { Game, AppSettings, OverlayStyle } from "../../../shared/types";

/* ─── Sidebar items ─────────────────────────────────────────── */

type SidebarId =
  | "resume"
  | "pause"
  | "achievements"
  | "gameinfo"
  | "controllers"
  | "settings"
  | "exit";

interface SidebarItem {
  id: SidebarId;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "resume", label: "Back to Game", Icon: Play },
  { id: "pause", label: "Pause / Unpause", Icon: Pause },
  { id: "achievements", label: "Achievements", Icon: Trophy },
  { id: "gameinfo", label: "Game Info", Icon: Info },
  { id: "controllers", label: "Controllers", Icon: Gamepad2 },
  { id: "settings", label: "Quick Settings", Icon: Settings },
  { id: "exit", label: "Exit to Ember", Icon: Power },
];

/* ─── Helpers ───────────────────────────────────────────────── */

function formatPlayTime(seconds?: number): string {
  if (!seconds) return "0h 0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDate(ts?: number): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleDateString();
}

/* ─── Hooks ─────────────────────────────────────────────────── */

function useOverlayGame() {
  const [game, setGame] = useState<Game | null>(null);
  useEffect(() => {
    void window.htpc.overlay.getGame().then(setGame);
    return window.htpc.overlay.onState((state) => {
      setGame(state.game);
    });
  }, []);
  return game;
}

function useOverlaySettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    void window.htpc.settings.get().then(setSettings);
  }, []);
  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
    void window.htpc.settings.set(partial);
  }, []);
  return { settings, update };
}

function useOverlayPaused() {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    void window.htpc.overlay.isPaused().then(setPaused);
    const interval = setInterval(() => {
      void window.htpc.overlay.isPaused().then(setPaused);
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  return { paused, toggle: () => void window.htpc.overlay.pause() };
}

interface ProcessStats {
  cpuPercent: number;
  memMB: number;
  diskReadKBps: number;
  diskWriteKBps: number;
  netRxKBps: number;
  netTxKBps: number;
  processCount: number;
  gpuPercent: number;
  gpuMemUsedMB: number;
  gpuMemTotalMB: number;
}

function useProcessStats(enabled: boolean) {
  const [stats, setStats] = useState<ProcessStats>({
    cpuPercent: 0,
    memMB: 0,
    diskReadKBps: 0,
    diskWriteKBps: 0,
    netRxKBps: 0,
    netTxKBps: 0,
    processCount: 0,
    gpuPercent: 0,
    gpuMemUsedMB: 0,
    gpuMemTotalMB: 0,
  });
  const [history, setHistory] = useState<{
    cpu: number[];
    mem: number[];
    diskR: number[];
    diskW: number[];
    netRx: number[];
    netTx: number[];
    gpu: number[];
    gpuMem: number[];
  }>({ cpu: [], mem: [], diskR: [], diskW: [], netRx: [], netTx: [], gpu: [], gpuMem: [] });

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      void window.htpc.overlay.processStats().then((s) => {
        setStats(s);
        setHistory((prev) => ({
          cpu: [...prev.cpu.slice(-59), s.cpuPercent],
          mem: [...prev.mem.slice(-59), s.memMB],
          diskR: [...prev.diskR.slice(-59), s.diskReadKBps],
          diskW: [...prev.diskW.slice(-59), s.diskWriteKBps],
          netRx: [...prev.netRx.slice(-59), s.netRxKBps],
          netTx: [...prev.netTx.slice(-59), s.netTxKBps],
          gpu: [...prev.gpu.slice(-59), s.gpuPercent],
          gpuMem: [...prev.gpuMem.slice(-59), s.gpuMemUsedMB],
        }));
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [enabled]);

  return { stats, history };
}

/* ─── Mini chart component ──────────────────────────────────── */

function MiniChart({
  data,
  color,
  max,
  label,
  value,
  unit,
  Icon,
}: {
  data: number[];
  color: string;
  max: number;
  label: string;
  value: string;
  unit: string;
  Icon: React.ComponentType<{ size?: number }>;
}) {
  const width = 120;
  const height = 32;
  const points = data.length > 1
    ? data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - Math.min(1, v / max) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ")
    : "";
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: width + 28 }}>
      <div className="flex items-center gap-1.5">
        <Icon size={12} />
        <span className="text-[12px] font-medium opacity-80">{label}</span>
        <span className="ml-auto text-[12px] font-semibold tabular-nums" style={{ color }}>
          {value}<span className="opacity-50 text-[12px] ml-0.5">{unit}</span>
        </span>
      </div>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.length > 0 && (
          <circle
            cx={width}
            cy={height - Math.min(1, data[data.length - 1] / max) * height}
            r={2}
            fill={color}
          />
        )}
      </svg>
    </div>
  );
}

/* ─── Content panels ────────────────────────────────────────── */

function AchievementsPanel({ game }: { game: Game }) {
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    setError(null);
    void window.htpc.games
      .fetchAchievements({ gameId: game.id, steamAppId: game.steamAppId })
      .then((result) => {
        const list = result?.achievements ?? [];
        setAchievements(Array.isArray(list) ? list : []);
      })
      .catch((err) => setError(err?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [game]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 opacity-60">
        <div className="w-8 h-8 border-2 border-[var(--border-default)] border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-70">
        <Trophy size={40} />
        <div className="text-sm">Failed to load achievements.</div>
        <div className="text-xs opacity-60 max-w-md text-center">{error}</div>
      </div>
    );
  }
  if (achievements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-70">
        <Trophy size={40} />
        <div className="text-sm">No achievements available for this game.</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto p-1">
      {achievements.map((ach, idx) => (
        <div
          key={ach.id ?? idx}
          className="p-3 rounded-xl bg-[var(--surface-0)] border border-[var(--border-default)] flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] flex items-center justify-center shrink-0">
            <Trophy size={18} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold">{ach.title ?? ach.name ?? "Achievement"}</div>
            {ach.description && <div className="text-xs opacity-70">{ach.description}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function GameInfoPanel({ game }: { game: Game }) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-1 max-w-2xl">
      <div className="flex flex-wrap gap-2">
        <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] text-sm">{game.platform}</span>
        {game.releaseYear && <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] text-sm">{game.releaseYear}</span>}
        {game.rating && (
          <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] text-sm flex items-center gap-1">
            <Star size={14} /> {game.rating}%
          </span>
        )}
        {game.developer && (
          <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] text-sm flex items-center gap-1">
            <Info size={14} /> {game.developer}
          </span>
        )}
      </div>
      <div className="flex gap-6 py-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs opacity-50 uppercase tracking-wide">Playtime</span>
          <span className="text-sm font-medium flex items-center gap-1.5"><Clock size={14} /> {formatPlayTime(game.playTime)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs opacity-50 uppercase tracking-wide">Last Played</span>
          <span className="text-sm font-medium flex items-center gap-1.5"><Activity size={14} /> {formatDate(game.lastPlayed)}</span>
        </div>
        {game.achievementCount !== undefined && game.achievementCount > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs opacity-50 uppercase tracking-wide">Achievements</span>
            <span className="text-sm font-medium flex items-center gap-1.5"><Award size={14} /> {game.achievementCount}</span>
          </div>
        )}
      </div>
      {game.description && (
        <div className="text-sm leading-relaxed opacity-80">{game.description}</div>
      )}
    </div>
  );
}

function ControllersPanel() {
  const [devices, setDevices] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, any[]>>({});
  useEffect(() => {
    void window.htpc.input.devices().then((devs) => {
      setDevices(devs);
      devs.forEach((d) => {
        void window.htpc.input.getMappings(d.id).then((m) => {
          setMappings((prev) => ({ ...prev, [d.id]: m }));
        });
      });
    });
  }, []);

  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-70">
        <Gamepad2 size={40} />
        <div className="text-sm">No controllers detected.</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-1">
      {devices.map((dev) => (
        <div key={dev.id} className="p-4 rounded-xl bg-[var(--surface-0)] border border-[var(--border-default)] flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <Gamepad2 size={18} />
            {dev.name}
            <span className="text-xs font-normal opacity-60 px-2 py-0.5 rounded bg-[var(--surface-2)]">
              {dev.type}
            </span>
          </div>
          <div className="text-xs opacity-70">
            {dev.axisCount} axes · {dev.buttonCount} buttons · {dev.connectionType}
            {dev.batteryPercent !== undefined && ` · ${dev.batteryPercent}% battery`}
          </div>
          {mappings[dev.id]?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {mappings[dev.id].map((m) => (
                <span key={m.inputCode} className="text-xs px-2 py-1 rounded bg-[var(--surface-2)]">
                  {m.inputCode} → {m.action}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function QuickSettingsPanel({
  style,
  onAdjustOpacity,
}: {
  style: OverlayStyle;
  onAdjustOpacity: (delta: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Overlay Opacity</div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onAdjustOpacity(-0.05)}
            className="w-9 h-9 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors flex items-center justify-center font-bold"
          >
            −
          </button>
          <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((style.opacity ?? 0.65) * 100)}%`,
                background: "var(--accent)",
              }}
            />
          </div>
          <button
            onClick={() => onAdjustOpacity(0.05)}
            className="w-9 h-9 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors flex items-center justify-center font-bold"
          >
            +
          </button>
          <span className="text-sm tabular-nums w-12 text-right">
            {Math.round((style.opacity ?? 0.65) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Controller hints ──────────────────────────────────────── */

function ControllerHints() {
  const hints = [
    { keys: "↑ / ↓", action: "Navigate" },
    { keys: "A", action: "Select" },
    { keys: "B", action: "Close" },
    { keys: "F1 / Esc", action: "Close" },
  ];
  return (
    <div className="flex items-center gap-4 text-xs opacity-50">
      {hints.map((h) => (
        <div key={h.keys} className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] font-medium text-[12px]">
            {h.keys}
          </span>
          <span>{h.action}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Main overlay component ────────────────────────────────── */

export function OverlayApp(): React.ReactElement {
  useControllerWorker();
  const game = useOverlayGame();
  const { paused, toggle: togglePaused } = useOverlayPaused();
  const { settings, update } = useOverlaySettings();
  const [selectedItem, setSelectedItem] = useState(0);
  const selectedItemRef = useRef(0);

  const style = settings?.overlayStyle ?? { mode: "glass", color: "#000000", opacity: 0.7 };

  const backgroundStyle = useMemo(() => {
    const baseColor = style.color || "#000000";
    const opacity = style.opacity ?? 0.7;
    if (style.mode === "glass") {
      return {
        backgroundColor: `${baseColor}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`,
        backdropFilter: "blur(16px) saturate(120%)",
        WebkitBackdropFilter: "blur(16px) saturate(120%)",
      } as React.CSSProperties;
    }
    return {
      backgroundColor: `${baseColor}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`,
    } as React.CSSProperties;
  }, [style]);

  const adjustOpacity = useCallback(
    (delta: number) => {
      const next: OverlayStyle = {
        ...style,
        opacity: Math.max(0.1, Math.min(1, (style.opacity ?? 0.7) + delta)),
      };
      update({ overlayStyle: next });
    },
    [style, update]
  );

  /* Controller navigation: up/down to navigate sidebar, A to select, B to close */
  const handleSelect = useCallback(
    (id: SidebarId) => {
      switch (id) {
        case "resume":
          window.htpc.overlay.close();
          break;
        case "pause":
          togglePaused();
          break;
        case "exit":
          window.htpc.overlay.stopGame();
          window.htpc.overlay.close();
          break;
        default:
          break;
      }
    },
    [togglePaused]
  );

  useInputNav(
    useCallback((action) => {
      if (action === "up") {
        selectedItemRef.current = Math.max(0, selectedItemRef.current - 1);
        setSelectedItem(selectedItemRef.current);
      } else if (action === "down") {
        selectedItemRef.current = Math.min(SIDEBAR_ITEMS.length - 1, selectedItemRef.current + 1);
        setSelectedItem(selectedItemRef.current);
      } else if (action === "confirm") {
        handleSelect(SIDEBAR_ITEMS[selectedItemRef.current].id);
      } else if (action === "cancel") {
        window.htpc.overlay.close();
      }
    }, [handleSelect])
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "F1") {
        e.preventDefault();
        window.htpc.overlay.close();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedItemRef.current = Math.max(0, selectedItemRef.current - 1);
        setSelectedItem(selectedItemRef.current);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedItemRef.current = Math.min(SIDEBAR_ITEMS.length - 1, selectedItemRef.current + 1);
        setSelectedItem(selectedItemRef.current);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(SIDEBAR_ITEMS[selectedItemRef.current].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSelect]);

  /* Process stats */
  const { stats, history } = useProcessStats(true);

  /* Game cover */
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    if (!game) return;
    if (game.coverUrl) {
      setCover(game.coverUrl);
      return;
    }
    void window.htpc.games.loadThumbnail(game).then((url) => {
      if (url) setCover(url);
    });
  }, [game]);

  /* Determine which content panel to show */
  const activeId = SIDEBAR_ITEMS[selectedItem].id;
  const contentPanel = useMemo(() => {
    if (!game) return null;
    switch (activeId) {
      case "achievements":
        return <AchievementsPanel game={game} />;
      case "gameinfo":
        return <GameInfoPanel game={game} />;
      case "controllers":
        return <ControllersPanel />;
      case "settings":
        return <QuickSettingsPanel style={style} onAdjustOpacity={adjustOpacity} />;
      default:
        return null;
    }
  }, [activeId, game, style, adjustOpacity]);

  const showContent = activeId === "achievements" || activeId === "gameinfo" || activeId === "controllers" || activeId === "settings";

  return (
    <div
      className="fixed inset-0 flex text-[var(--text-primary)] overflow-hidden select-none"
      style={backgroundStyle}
    >
      {/* ─── Sidebar (left) ─────────────────────────────────── */}
      <aside
        className="flex flex-col flex-shrink-0 w-72 border-r overflow-y-auto"
        style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
      >
        {/* Game thumbnail + title + playtime (horizontal) */}
        <div className="flex items-center gap-3 p-4">
          {cover ? (
            <img
              src={cover}
              alt={game?.title ?? ""}
              className="w-16 h-16 object-cover rounded-lg border flex-shrink-0"
              style={{ borderColor: "var(--border-default)" }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-lg flex items-center justify-center border flex-shrink-0"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
            >
              <Disc size={24} className="opacity-40" />
            </div>
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-sm font-bold leading-tight line-clamp-2">{game?.title ?? "Loading..."}</h2>
            <div className="flex items-center gap-1.5 text-xs opacity-60">
              <Clock size={12} />
              {formatPlayTime(game?.playTime)}
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="h-px mx-4" style={{ background: "var(--border-default)" }} />

        {/* Sidebar items */}
        <nav className="flex flex-col gap-1 p-2">
          {SIDEBAR_ITEMS.map((item, idx) => {
            const isActive = idx === selectedItem;
            const Icon = item.Icon;
            const isExit = item.id === "exit";
            const isPause = item.id === "pause";
            return (
              <button
                key={item.id}
                onClick={() => {
                  selectedItemRef.current = idx;
                  setSelectedItem(idx);
                  handleSelect(item.id);
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left"
                style={{
                  background: isActive ? "var(--surface-2)" : "transparent",
                  color: isExit
                    ? "#ff6b6b"
                    : isPause && paused
                      ? "var(--accent)"
                      : isActive
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-1)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <Icon size={18} />
                <span>{isPause ? (paused ? "Resume Game" : "Pause Game") : item.label}</span>
                {isActive && (
                  <div
                    className="ml-auto w-1 h-5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ─── Main area (right) ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top-right: process stats */}
        <div
          className="flex items-start justify-end gap-4 px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: "var(--border-default)" }}
        >
          <MiniChart
            data={history.cpu}
            color="var(--accent)"
            max={100 * (stats.processCount || 1)}
            label="CPU"
            value={stats.cpuPercent.toFixed(1)}
            unit="%"
            Icon={Cpu}
          />
          <MiniChart
            data={history.mem}
            color="#4ade80"
            max={Math.max(1024, ...history.mem, stats.memMB)}
            label="Mem"
            value={stats.memMB.toFixed(0)}
            unit="MB"
            Icon={HardDrive}
          />
          <MiniChart
            data={history.gpu}
            color="#a78bfa"
            max={100}
            label="GPU"
            value={stats.gpuPercent.toFixed(0)}
            unit="%"
            Icon={Zap}
          />
          <MiniChart
            data={history.gpuMem}
            color="#fb923c"
            max={Math.max(256, ...history.gpuMem, stats.gpuMemTotalMB)}
            label="VRAM"
            value={stats.gpuMemUsedMB.toFixed(0)}
            unit={`/${stats.gpuMemTotalMB || "?"}MB`}
            Icon={MemoryStick}
          />
          <MiniChart
            data={history.diskR.map((v, i) => v + (history.diskW[i] ?? 0))}
            color="#60a5fa"
            max={Math.max(1024, ...history.diskR, ...history.diskW)}
            label="Disk"
            value={(stats.diskReadKBps + stats.diskWriteKBps).toFixed(0)}
            unit="KB/s"
            Icon={Activity}
          />
          <MiniChart
            data={history.netRx.map((v, i) => v + (history.netTx[i] ?? 0))}
            color="#f472b6"
            max={Math.max(1024, ...history.netRx, ...history.netTx)}
            label="Net"
            value={(stats.netRxKBps + stats.netTxKBps).toFixed(0)}
            unit="KB/s"
            Icon={Wifi}
          />
          {/* Close button */}
          <button
            onClick={() => window.htpc.overlay.close()}
            title="Close overlay"
            className="px-3 py-1.5 rounded transition-colors flex items-center"
            style={{ color: "var(--text-secondary)", background: "transparent" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-0)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 p-6 overflow-hidden min-h-0">
          {game ? (
            showContent ? (
              <div className="h-full overflow-y-auto">{contentPanel}</div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
                <Disc size={64} className="opacity-30" />
                <div className="text-sm">Select an item from the sidebar</div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 opacity-70">
              <div className="w-12 h-12 border-2 border-[var(--border-default)] border-t-[var(--accent)] rounded-full animate-spin" />
              <div className="text-sm">Waiting for game info...</div>
            </div>
          )}
        </div>

        {/* Bottom-right: controller hints */}
        <div
          className="flex items-center justify-end px-6 py-2 border-t flex-shrink-0"
          style={{ borderColor: "var(--border-default)" }}
        >
          <ControllerHints />
        </div>
      </div>
    </div>
  );
}
