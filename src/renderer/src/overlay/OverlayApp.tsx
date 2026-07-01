import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Responsive, Layout, useContainerWidth, noCompactor } from "react-grid-layout";
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
  Bluetooth,
  RefreshCw,
  Link2,
  Unlink,
  Search,
  Trash2,
  Columns,
  LayoutDashboard,
  Pin,
  PinOff,
  AlertTriangle,
  Palette,
} from "lucide-react";
import { useInputNav } from "../hooks/useInputNav";
import { useControllerWorker } from "../hooks/useControllerWorker";
import { Game, AppSettings, OverlayStyle, BluetoothDevice, VulkanShaderConfig, GameInjectionConfig, ReShadeRuntimeState, ReShadeTechniqueState, ReShadeUniformState, OverlayChartConfig, OverlayChartId, OverlayChartsConfig, DashboardGridItem } from "../../../shared/types";
import { SplitscreenOverlay } from "../components/Splitscreen/SplitscreenOverlay";
import { useSplitscreenStore } from "../store/splitscreen.store";
import "react-grid-layout/css/styles.css";

/* ─── Chart config defaults ─────────────────────────────────── */

const CHART_ICONS: Record<OverlayChartId, React.ComponentType<{ size?: number | string; className?: string }>> = {
  cpu: Cpu,
  mem: HardDrive,
  gpu: Zap,
  vram: MemoryStick,
  disk: Activity,
  net: Wifi,
};

const DEFAULT_CHART_CONFIGS: OverlayChartConfig[] = [
  { id: "cpu", label: "CPU", color: "var(--accent)", pinnedBg: "rgba(0,0,0,0.75)", pinnedBorder: "var(--accent)", pinned: false, warnThreshold: 0, killThreshold: 0, enabled: true },
  { id: "mem", label: "Mem", color: "#4ade80", pinnedBg: "rgba(0,0,0,0.75)", pinnedBorder: "#4ade80", pinned: false, warnThreshold: 0, killThreshold: 0, enabled: true },
  { id: "gpu", label: "GPU", color: "#a78bfa", pinnedBg: "rgba(0,0,0,0.75)", pinnedBorder: "#a78bfa", pinned: false, warnThreshold: 0, killThreshold: 0, enabled: true },
  { id: "vram", label: "VRAM", color: "#fb923c", pinnedBg: "rgba(0,0,0,0.75)", pinnedBorder: "#fb923c", pinned: false, warnThreshold: 0, killThreshold: 0, enabled: true },
  { id: "disk", label: "Disk", color: "#60a5fa", pinnedBg: "rgba(0,0,0,0.75)", pinnedBorder: "#60a5fa", pinned: false, warnThreshold: 0, killThreshold: 0, enabled: true },
  { id: "net", label: "Net", color: "#f472b6", pinnedBg: "rgba(0,0,0,0.75)", pinnedBorder: "#f472b6", pinned: false, warnThreshold: 0, killThreshold: 0, enabled: true },
];

const DEFAULT_CHART_GRID: DashboardGridItem[] = [
  { i: "cpu", x: 32, y: 0, w: 8, h: 8, minW: 4, minH: 4 },
  { i: "mem", x: 40, y: 0, w: 8, h: 8, minW: 4, minH: 4 },
  { i: "gpu", x: 32, y: 8, w: 8, h: 8, minW: 4, minH: 4 },
  { i: "vram", x: 40, y: 8, w: 8, h: 8, minW: 4, minH: 4 },
  { i: "disk", x: 32, y: 16, w: 8, h: 8, minW: 4, minH: 4 },
  { i: "net", x: 40, y: 16, w: 8, h: 8, minW: 4, minH: 4 },
];

function getDefaultOverlayChartsConfig(): OverlayChartsConfig {
  return { charts: DEFAULT_CHART_CONFIGS.map((c) => ({ ...c })), grid: DEFAULT_CHART_GRID.map((g) => ({ ...g })) };
}

function getChartCurrentValue(id: OverlayChartId, stats: ProcessStats): number {
  switch (id) {
    case "cpu": return stats.cpuPercent;
    case "mem": return stats.memMB;
    case "gpu": return stats.gpuPercent;
    case "vram": return stats.gpuMemUsedMB;
    case "disk": return stats.diskReadKBps + stats.diskWriteKBps;
    case "net": return stats.netRxKBps + stats.netTxKBps;
  }
}

function getChartData(id: OverlayChartId, stats: ProcessStats, history: ProcessHistory): { data: number[]; value: string; max: number; unit: string } {
  switch (id) {
    case "cpu":
      return { data: history.cpu, value: stats.cpuPercent.toFixed(1), max: 100 * (stats.processCount || 1), unit: "%" };
    case "mem":
      return { data: history.mem, value: stats.memMB.toFixed(0), max: Math.max(1024, ...history.mem, stats.memMB), unit: "MB" };
    case "gpu":
      return { data: history.gpu, value: stats.gpuPercent.toFixed(0), max: 100, unit: "%" };
    case "vram":
      return { data: history.gpuMem, value: stats.gpuMemUsedMB.toFixed(0), max: Math.max(256, ...history.gpuMem, stats.gpuMemTotalMB), unit: `/${stats.gpuMemTotalMB || "?"}MB` };
    case "disk":
      return { data: history.diskR.map((v, i) => v + (history.diskW[i] ?? 0)), value: (stats.diskReadKBps + stats.diskWriteKBps).toFixed(0), max: Math.max(1024, ...history.diskR, ...history.diskW), unit: "KB/s" };
    case "net":
      return { data: history.netRx.map((v, i) => v + (history.netTx[i] ?? 0)), value: (stats.netRxKBps + stats.netTxKBps).toFixed(0), max: Math.max(1024, ...history.netRx, ...history.netTx), unit: "KB/s" };
  }
}

function logKillThreshold(cfg: OverlayChartConfig, value: number): void {
  console.warn(`[Overlay] Kill threshold exceeded for ${cfg.label}: ${value} > ${cfg.killThreshold}. Stopping game.`);
}

/* ─── Sidebar items ─────────────────────────────────────────── */

type SidebarId =
  | "resume"
  | "pause"
  | "achievements"
  | "gameinfo"
  | "controllers"
  | "shaders"
  | "reshade"
  | "settings"
  | "splitscreen"
  | "exit";

interface SidebarItem {
  id: SidebarId;
  label: string;
  Icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "resume", label: "Back to Game", Icon: Play },
  { id: "pause", label: "Pause / Unpause", Icon: Pause },
  { id: "achievements", label: "Achievements", Icon: Trophy },
  { id: "gameinfo", label: "Game Info", Icon: Info },
  { id: "controllers", label: "Controllers", Icon: Gamepad2 },
  { id: "shaders", label: "Shaders", Icon: Zap },
  { id: "reshade", label: "ReShade", Icon: Activity },
  { id: "settings", label: "Quick Settings", Icon: Settings },
  { id: "splitscreen", label: "Splitscreen", Icon: Columns },
  { id: "exit", label: "Exit to Ember", Icon: Power },
];

const CONTENT_IDS = new Set<SidebarId>([
  "achievements", "gameinfo", "controllers", "shaders", "reshade", "settings", "splitscreen",
]);

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
  const [visible, setVisible] = useState(false);
  const [pinnedVisible, setPinnedVisible] = useState(false);
  useEffect(() => {
    // Fetch initial state in case we missed a sendState before subscribing
    void window.htpc.overlay.getState().then((state) => {
      setGame(state.game);
      setVisible(state.visible);
      setPinnedVisible(state.pinnedVisible);
    });
    const unsubscribe = window.htpc.overlay.onState((state) => {
      setGame(state.game);
      setVisible(state.visible);
      setPinnedVisible(state.pinnedVisible ?? false);
    });
    return () => {
      unsubscribe();
    };
  }, []);
  return { game, visible, pinnedVisible };
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

interface ProcessHistory {
  cpu: number[];
  mem: number[];
  diskR: number[];
  diskW: number[];
  netRx: number[];
  netTx: number[];
  gpu: number[];
  gpuMem: number[];
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
  const [history, setHistory] = useState<ProcessHistory>({ cpu: [], mem: [], diskR: [], diskW: [], netRx: [], netTx: [], gpu: [], gpuMem: [] });

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

interface MiniChartProps {
  data: number[];
  color: string;
  max: number;
  label: string;
  value: string;
  unit: string;
  Icon: React.ComponentType<{ size?: number | string }>;
  pinned?: boolean;
  pinnedBg?: string;
  pinnedBorder?: string;
  warnThreshold?: number;
  killThreshold?: number;
  currentValue?: number;
  onTogglePin?: () => void;
  onConfigure?: () => void;
}

function MiniChart({
  data,
  color,
  max,
  label,
  value,
  unit,
  Icon,
  pinned = false,
  pinnedBg = "rgba(0,0,0,0.75)",
  pinnedBorder = "var(--accent)",
  warnThreshold = 0,
  killThreshold = 0,
  currentValue = 0,
  onTogglePin,
  onConfigure,
}: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 120, h: 32 });
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setDims({ w: Math.max(40, el.clientWidth), h: Math.max(20, el.clientHeight) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const strokeW = 1.5;
  const margin = Math.ceil(strokeW / 2) + 1; // 2px inset so stroke isn't clipped
  const pad = pinned ? 6 : 0; // matches containerStyle padding
  const gap = 4; // gap-1 (0.25rem) between header and SVG
  const headerH = 20; // fixed header height
  const svgW = Math.max(4, dims.w - pad * 2);
  const svgH = Math.max(8, dims.h - headerH - gap - pad * 2);
  const drawW = Math.max(4, svgW - margin * 2);
  const drawH = Math.max(4, svgH - margin * 2);
  const points = data.length > 1
    ? data.map((v, i) => {
        const x = margin + (i / (data.length - 1)) * drawW;
        const y = margin + drawH - Math.min(1, v / max) * drawH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ")
    : "";

  const isWarning = warnThreshold > 0 && currentValue > warnThreshold && !(killThreshold > 0 && currentValue > killThreshold);
  const isKill = killThreshold > 0 && currentValue > killThreshold;
  const strokeColor = isKill ? "#ef4444" : isWarning ? "#fbbf24" : color;

  const containerStyle: React.CSSProperties = pinned
    ? {
        background: pinnedBg,
        border: `1px solid ${isKill ? "#ef4444" : isWarning ? "#fbbf24" : pinnedBorder}`,
        borderRadius: 8,
        padding: 6,
      }
    : {};

  return (
    <div ref={containerRef} className="flex flex-col gap-1 relative w-full h-full" style={containerStyle}>
      <div className="flex items-center gap-1.5" style={{ minHeight: headerH }}>
        <Icon size={12} />
        <span className="text-[12px] font-medium opacity-80">{label}</span>
        {(isWarning || isKill) && (
          <AlertTriangle size={12} style={{ color: isKill ? "#ef4444" : "#fbbf24" }} />
        )}
        <span className="ml-auto text-[12px] font-semibold tabular-nums" style={{ color: strokeColor }}>
          {value}<span className="opacity-50 text-[12px] ml-0.5">{unit}</span>
        </span>
        {onTogglePin && (
          <button
            onClick={onTogglePin}
            className="ml-1 p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity"
            title={pinned ? "Unpin" : "Pin"}
          >
            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
        )}
        {onConfigure && (
          <button
            onClick={onConfigure}
            className="p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity"
            title="Configure"
          >
            <Palette size={12} />
          </button>
        )}
      </div>
      <svg width={svgW} height={svgH} className="overflow-hidden flex-1">
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.length > 0 && (
          <circle
            cx={Math.min(margin + drawW, svgW - margin)}
            cy={margin + drawH - Math.min(1, data[data.length - 1] / max) * drawH}
            r={2}
            fill={strokeColor}
          />
        )}
      </svg>
    </div>
  );
}

/* ─── Chart config dialog ───────────────────────────────────── */

function ChartConfigDialog({
  chart,
  open,
  onClose,
  onSave,
}: {
  chart: OverlayChartConfig | null;
  open: boolean;
  onClose: () => void;
  onSave: (cfg: OverlayChartConfig) => void;
}) {
  const [local, setLocal] = useState<OverlayChartConfig | null>(chart);
  useEffect(() => { setLocal(chart); }, [chart]);
  if (!open || !local) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-5 flex flex-col gap-3 max-w-sm w-full"
        style={{ background: "var(--surface-base)", border: "1px solid var(--border-default)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Palette size={16} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold">Configure {local.label}</span>
          <button onClick={onClose} className="ml-auto p-1 rounded opacity-60 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Label</label>
          <input
            type="text"
            value={local.label}
            onChange={(e) => setLocal({ ...local, label: e.target.value })}
            className="text-sm px-2 py-1.5 rounded"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Sparkline Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={local.color.startsWith("var(") ? "#6366f1" : local.color}
              onChange={(e) => setLocal({ ...local, color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer"
              style={{ border: "1px solid var(--border-default)" }}
            />
            <input
              type="text"
              value={local.color}
              onChange={(e) => setLocal({ ...local, color: e.target.value })}
              className="flex-1 text-sm px-2 py-1.5 rounded"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Pinned Background</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={local.pinnedBg}
              onChange={(e) => setLocal({ ...local, pinnedBg: e.target.value })}
              className="flex-1 text-sm px-2 py-1.5 rounded font-mono"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Pinned Border Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={local.pinnedBorder.startsWith("var(") ? "#6366f1" : local.pinnedBorder}
              onChange={(e) => setLocal({ ...local, pinnedBorder: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer"
              style={{ border: "1px solid var(--border-default)" }}
            />
            <input
              type="text"
              value={local.pinnedBorder}
              onChange={(e) => setLocal({ ...local, pinnedBorder: e.target.value })}
              className="flex-1 text-sm px-2 py-1.5 rounded"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Warn Threshold (0 = disabled)
          </label>
          <input
            type="number"
            min={0}
            value={local.warnThreshold}
            onChange={(e) => setLocal({ ...local, warnThreshold: parseFloat(e.target.value) || 0 })}
            className="text-sm px-2 py-1.5 rounded"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Kill Threshold (0 = disabled)
          </label>
          <input
            type="number"
            min={0}
            value={local.killThreshold}
            onChange={(e) => setLocal({ ...local, killThreshold: parseFloat(e.target.value) || 0 })}
            className="text-sm px-2 py-1.5 rounded"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
          />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => setLocal({ ...local, enabled: !local.enabled })}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{
              background: local.enabled ? "var(--surface-2)" : "var(--accent)",
              color: local.enabled ? "var(--text-secondary)" : "var(--surface-base)",
            }}
          >
            {local.enabled ? "Disable Chart" : "Enable Chart"}
          </button>
          <button
            onClick={() => { if (local) onSave(local); onClose(); }}
            className="ml-auto px-4 py-1.5 rounded text-xs font-medium"
            style={{ background: "var(--accent)", color: "var(--surface-base)" }}
          >
            Save
          </button>
        </div>
      </div>
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
  const [btAvailable, setBtAvailable] = useState(false);
  const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
  const [btScanning, setBtScanning] = useState(false);
  const [btBusy, setBtBusy] = useState<string | null>(null);

  useEffect(() => {
    void window.htpc.input.devices().then((devs) => {
      setDevices(devs);
      devs.forEach((d) => {
        void window.htpc.input.getMappings(d.id).then((m) => {
          setMappings((prev) => ({ ...prev, [d.id]: m }));
        });
      });
    });
    void window.htpc.bluetooth.available().then((avail) => {
      setBtAvailable(avail);
      if (avail) {
        void window.htpc.bluetooth.devices().then(setBtDevices);
      }
    });
  }, []);

  const btRefresh = useCallback(async () => {
    if (btAvailable) {
      const devs = await window.htpc.bluetooth.devices();
      setBtDevices(devs);
    }
  }, [btAvailable]);

  const btScan = useCallback(async () => {
    setBtScanning(true);
    try {
      const found = await window.htpc.bluetooth.scan(8);
      setBtDevices(found);
    } catch { /* ignore */ }
    setBtScanning(false);
  }, []);

  const btAction = useCallback(async (
    action: string,
    mac: string,
    fn: (mac: string) => Promise<boolean>,
  ) => {
    setBtBusy(`${action}:${mac}`);
    const ok = await fn(mac);
    if (ok) await btRefresh();
    setBtBusy(null);
  }, [btRefresh]);

  if (devices.length === 0 && (!btAvailable || btDevices.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-70">
        <Gamepad2 size={40} />
        <div className="text-sm">No controllers detected.</div>
        {btAvailable && (
          <button
            onClick={btScan}
            disabled={btScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: btScanning ? "var(--surface-2)" : "var(--accent)",
              color: btScanning ? "var(--text-secondary)" : "var(--surface-base)",
            }}
          >
            {btScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search size={16} />
                Scan for Bluetooth Controllers
              </>
            )}
          </button>
        )}
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
            {dev.connectionType === "bluetooth" && (
              <span className="flex items-center gap-1 text-xs font-normal" style={{ color: "var(--accent)" }}>
                <Bluetooth size={12} />
                Bluetooth
              </span>
            )}
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

      {/* Bluetooth section */}
      {btAvailable && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Bluetooth size={16} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold">Bluetooth Devices</span>
            <button
              onClick={btScan}
              disabled={btScanning}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
              style={{
                background: btScanning ? "var(--surface-2)" : "var(--accent)",
                color: btScanning ? "var(--text-secondary)" : "var(--surface-base)",
              }}
            >
              {btScanning ? (
                <>
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search size={14} />
                  Scan
                </>
              )}
            </button>
            <button
              onClick={btRefresh}
              className="flex items-center gap-1 px-2 py-1.5 rounded text-xs"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-secondary)",
              }}
            >
              <RefreshCw size={12} />
            </button>
          </div>
          {btDevices.map((dev) => (
            <div
              key={dev.mac}
              className="p-3 rounded-xl flex items-center gap-3"
              style={{
                background: "var(--surface-0)",
                border: dev.connected
                  ? "1px solid #4ade8040"
                  : "1px solid var(--border-default)",
              }}
            >
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{dev.name}</span>
                  {dev.connected && (
                    <span className="text-[12px] px-1.5 py-0.5 rounded" style={{ background: "#4ade8020", color: "#4ade80" }}>
                      Connected
                    </span>
                  )}
                  {dev.paired && !dev.connected && (
                    <span className="text-[12px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                      Paired
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono opacity-50">{dev.mac}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!dev.paired && (
                  <button
                    onClick={() => btAction("pair", dev.mac, window.htpc.bluetooth.pair)}
                    disabled={btBusy === `pair:${dev.mac}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                    style={{ background: "var(--accent)", color: "var(--surface-base)" }}
                  >
                    <Link2 size={14} /> Pair
                  </button>
                )}
                {dev.paired && !dev.connected && (
                  <button
                    onClick={() => btAction("connect", dev.mac, window.htpc.bluetooth.connect)}
                    disabled={btBusy === `connect:${dev.mac}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                    style={{ background: "#4ade80", color: "#000" }}
                  >
                    <Link2 size={14} /> Connect
                  </button>
                )}
                {dev.connected && (
                  <>
                    <button
                      onClick={() => btAction("reconnect", dev.mac, window.htpc.bluetooth.reconnect)}
                      disabled={btBusy === `reconnect:${dev.mac}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                      style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
                    >
                      <RefreshCw size={14} /> Reconnect
                    </button>
                    <button
                      onClick={() => btAction("disconnect", dev.mac, window.htpc.bluetooth.disconnect)}
                      disabled={btBusy === `disconnect:${dev.mac}`}
                      className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium"
                      style={{ background: "#ff444420", color: "#ff6666" }}
                    >
                      <Unlink size={14} />
                    </button>
                  </>
                )}
                {dev.paired && (
                  <button
                    onClick={() => btAction("remove", dev.mac, window.htpc.bluetooth.remove)}
                    disabled={btBusy === `remove:${dev.mac}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                    style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
                    title="Forget device"
                  >
                    <Trash2 size={14} /> Forget
                  </button>
                )}
              </div>
            </div>
          ))}
          {btDevices.length === 0 && (
            <div className="text-sm opacity-60 text-center py-4">
              No Bluetooth devices found. Click Scan to search.
            </div>
          )}
        </div>
      )}
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

/* ─── Shader panel ─────────────────────────────────────────── */

const EMULATOR_PLATFORMS = new Set([
  "dolphin-gc", "dolphin-wii", "nes", "snes", "gb", "gba", "n64",
  "genesis", "sms", "gamegear", "pce", "psx", "ps2", "ps3", "psp",
  "xbox360", "nds", "dreamcast", "flash", "dos",
]);

function ShaderPanel({ game }: { game: Game }) {
  const [injectionConfig, setInjectionConfig] = useState<GameInjectionConfig | null>(null);
  const [presets, setPresets] = useState<{ id: string; name: string }[]>([]);
  const [paramDefs, setParamDefs] = useState<Record<string, { label: string; min: number; max: number; step: number; default: number }[]>>({});
  const [loading, setLoading] = useState(true);

  const isEmulator = EMULATOR_PLATFORMS.has(game.platform);
  const shaderConfig = injectionConfig?.vulkanShader;
  const shaderActive = shaderConfig?.enabled === true;

  useEffect(() => {
    void Promise.all([
      window.htpc.games.injectionConfig.get(game.id),
      window.htpc.games.injectionConfig.vulkanPresets(),
      window.htpc.games.injectionConfig.shaderParamDefs(),
    ]).then(([cfg, p, defs]) => {
      setInjectionConfig(cfg);
      setPresets(p ?? []);
      setParamDefs(defs ?? {});
      setLoading(false);
    });
  }, [game.id]);

  const updateShader = useCallback((next: VulkanShaderConfig) => {
    const newCfg: GameInjectionConfig = {
      ...injectionConfig,
      vulkanShader: next,
    };
    setInjectionConfig(newCfg);
    void window.htpc.games.injectionConfig.set(game.id, newCfg);
    void window.htpc.games.injectionConfig.updateRuntimeShader(game.id, next);
  }, [injectionConfig, game.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 opacity-60">
        <div className="w-8 h-8 border-2 border-[var(--border-default)] border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  if (isEmulator) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-70">
        <Zap size={40} />
        <div className="text-sm">Shader injection is not available for emulator games.</div>
        <div className="text-xs opacity-60 max-w-md text-center">
          The Vulkan layer only works with native and Proton/Wine games that use Vulkan or OpenGL.
        </div>
      </div>
    );
  }

  if (!shaderActive) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-70">
        <Zap size={40} />
        <div className="text-sm">Shader injection is not enabled for this game.</div>
        <div className="text-xs opacity-60 max-w-md text-center">
          Enable Vulkan Layer Shader in the game's settings before launching to use runtime shader controls.
        </div>
        <button
          onClick={() => updateShader({ enabled: true, preset: "crt", intensity: 1.0 })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium mt-2"
          style={{ background: "var(--accent)", color: "var(--surface-base)" }}
        >
          <Zap size={16} /> Enable Shaders
        </button>
      </div>
    );
  }

  const currentPreset = shaderConfig!.preset;
  const currentIntensity = shaderConfig!.intensity ?? 1.0;
  const currentParams = shaderConfig!.params ?? [];
  const defs = paramDefs[currentPreset] ?? [];

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-1 max-w-md">
      <div className="flex items-center gap-2">
        <Zap size={18} style={{ color: "var(--accent)" }} />
        <span className="text-sm font-semibold">Runtime Shader Controls</span>
        <span className="text-[12px] px-2 py-0.5 rounded ml-auto" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
          Active
        </span>
      </div>

      <div>
        <label className="text-[12px] block mb-1" style={{ color: "var(--text-secondary)" }}>
          Preset
        </label>
        <select
          value={currentPreset}
          onChange={(e) => {
            const newPreset = e.target.value;
            const newDefs = paramDefs[newPreset] ?? [];
            const defaultParams = newDefs.map((d) => d.default);
            updateShader({
              enabled: true,
              preset: newPreset,
              intensity: currentIntensity,
              params: defaultParams.length > 0 ? defaultParams : undefined,
            });
          }}
          className="w-full text-sm px-2 py-1.5 rounded"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[12px] block mb-1" style={{ color: "var(--text-secondary)" }}>
          Intensity: {currentIntensity.toFixed(2)}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={currentIntensity}
          onChange={(e) => {
            updateShader({
              enabled: true,
              preset: currentPreset,
              intensity: parseFloat(e.target.value),
              params: currentParams.length > 0 ? currentParams : undefined,
            });
          }}
          className="w-full"
        />
      </div>

      {defs.map((def, idx) => (
        <div key={idx}>
          <label className="text-[12px] block mb-1" style={{ color: "var(--text-secondary)" }}>
            {def.label}: {(currentParams[idx] ?? def.default).toFixed(def.step < 0.01 ? 4 : def.step < 1 ? 3 : 0)}
          </label>
          <input
            type="range"
            min={def.min}
            max={def.max}
            step={def.step}
            value={currentParams[idx] ?? def.default}
            onChange={(e) => {
              const newParams = [...currentParams];
              while (newParams.length <= idx) newParams.push(def.default);
              newParams[idx] = parseFloat(e.target.value);
              updateShader({
                enabled: true,
                preset: currentPreset,
                intensity: currentIntensity,
                params: newParams,
              });
            }}
            className="w-full"
          />
        </div>
      ))}

      <button
        onClick={() => updateShader({ enabled: false, preset: currentPreset, intensity: currentIntensity })}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium mt-2"
        style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
      >
        <Zap size={16} /> Disable Shaders
      </button>
    </div>
  );
}

/* ─── ReShade panel ────────────────────────────────────────── */

function ReShadePanel({ game }: { game: Game }) {
  const [state, setState] = useState<ReShadeRuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customSection, setCustomSection] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [overrides, setOverrides] = useState<{ section: string; key: string; value: string }[]>([]);
  const lastLocalChangeRef = useRef(0);

  const isEmulator = EMULATOR_PLATFORMS.has(game.platform);

  // Poll state from addon every 3 seconds, but skip for 5s after a local change
  useEffect(() => {
    if (isEmulator) { setLoading(false); return; }
    let cancelled = false;
    const poll = () => {
      if (Date.now() - lastLocalChangeRef.current < 5000) return;
      void window.htpc.games.reshade.getRuntimeState(game).then((s) => {
        if (cancelled) return;
        setState(s);
        setError(null);
        setLoading(false);
      }).catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [game, isEmulator]);

  const sendControl = useCallback((control: Record<string, unknown>) => {
    void window.htpc.games.reshade.writeRuntimeControl(game, control);
  }, [game]);

  const toggleEffects = useCallback((enabled: boolean) => {
    lastLocalChangeRef.current = Date.now();
    sendControl({ effectsEnabled: enabled });
    setState((prev) => prev ? { ...prev, effectsEnabled: enabled } : prev);
  }, [sendControl]);

  const toggleTechnique = useCallback((tech: ReShadeTechniqueState, enabled: boolean) => {
    lastLocalChangeRef.current = Date.now();
    const techniques: Record<string, boolean> = {};
    if (state) {
      for (const t of state.techniques) {
        techniques[t.name] = t.name === tech.name ? enabled : t.enabled;
      }
    } else {
      techniques[tech.name] = enabled;
    }
    sendControl({ techniques });
    setState((prev) => prev ? {
      ...prev,
      techniques: prev.techniques.map((t) => t.name === tech.name ? { ...t, enabled } : t),
    } : prev);
  }, [sendControl, state]);

  const setUniformValue = useCallback((uniform: ReShadeUniformState, value: number) => {
    lastLocalChangeRef.current = Date.now();
    const uniforms: Record<string, number> = {};
    uniforms[uniform.name] = value;
    sendControl({ uniforms });
  }, [sendControl]);

  const addOverride = useCallback(() => {
    if (!customSection.trim() || !customKey.trim()) return;
    const newOverride = { section: customSection.trim(), key: customKey.trim(), value: customValue.trim() };
    setOverrides((prev) => [...prev, newOverride]);
    sendControl({
      configOverrides: [...overrides, newOverride],
    });
    setCustomSection("");
    setCustomKey("");
    setCustomValue("");
  }, [customSection, customKey, customValue, overrides, sendControl]);

  const removeOverride = useCallback((idx: number) => {
    const next = overrides.filter((_, i) => i !== idx);
    setOverrides(next);
    sendControl({ configOverrides: next });
  }, [overrides, sendControl]);

  const savePreset = useCallback(() => {
    void window.htpc.games.reshade.savePreset(game);
  }, [game]);

  if (isEmulator) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-70">
        <Activity size={40} />
        <div className="text-sm">ReShade is not available for emulator games.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 opacity-60">
        <div className="w-8 h-8 border-2 border-[var(--border-default)] border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-70">
        <Activity size={40} />
        <div className="text-sm">ReShade addon not detected.</div>
        {error && (
          <div className="text-xs opacity-60 max-w-md text-center">{error}</div>
        )}
        <div className="text-xs opacity-60 max-w-md text-center">
          Make sure ReShade is installed and the game is running. The addon DLL writes state to ember-reshade-state.json next to the game exe.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-1 max-w-md">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity size={18} style={{ color: "var(--accent)" }} />
        <span className="text-sm font-semibold">ReShade Controls</span>
        <button
          onClick={() => toggleEffects(!state.effectsEnabled)}
          className="ml-auto px-3 py-1 rounded text-xs font-medium"
          style={{
            background: state.effectsEnabled ? "var(--surface-2)" : "var(--accent)",
            color: state.effectsEnabled ? "var(--text-secondary)" : "var(--surface-base)",
          }}
        >
          {state.effectsEnabled ? "Effects On" : "Effects Off"}
        </button>
      </div>

      {/* Techniques */}
      {state.techniques.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60">Effects</div>
          {state.techniques.map((tech) => (
            <div
              key={tech.name}
              className="flex items-center gap-2 p-2 rounded-lg"
              style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)" }}
            >
              <button
                onClick={() => toggleTechnique(tech, !tech.enabled)}
                className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors"
                style={{
                  background: tech.enabled ? "var(--accent)" : "var(--surface-2)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {tech.enabled && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="var(--surface-base)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">{tech.name}</span>
                <span className="text-[12px] opacity-50 truncate">{tech.effect}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uniforms (sliders) */}
      {state.uniforms.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60">Parameters</div>
          {state.uniforms.map((uniform) => {
            // ReShade format enum values: r32_float=41, r32g32_float=16, r32g32b32_float=6, r32g32b32a32_float=2
            const FLOAT_TYPES = new Set([41, 16, 6, 2]);
            // r32_sint=43, r32g32_sint=18, r32g32b32_sint=8, r32g32b32a32_sint=4
            const INT_TYPES = new Set([43, 18, 8, 4]);
            const isFloat = FLOAT_TYPES.has(uniform.type);
            const isInt = INT_TYPES.has(uniform.type);
            if (!isFloat && !isInt) return null;
            const val = uniform.values[0] ?? 0;
            const min = isFloat ? 0 : -100;
            const max = isFloat ? 1 : 100;
            const step = isFloat ? 0.01 : 1;
            return (
              <div key={uniform.name} className="flex flex-col gap-1">
                <label className="text-[12px] flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
                  <span className="truncate">{uniform.name}</span>
                  <span className="tabular-nums ml-2 shrink-0">{isFloat ? val.toFixed(3) : val}</span>
                </label>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={val}
                  onChange={(e) => {
                    const newVal = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
                    setUniformValue(uniform, newVal);
                  }}
                  className="w-full"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Custom ini overrides */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-60">Custom INI Overrides</div>
        {overrides.map((ov, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 p-2 rounded-lg text-xs"
            style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)" }}
          >
            <span className="font-mono opacity-80">[{ov.section}] {ov.key}={ov.value}</span>
            <button
              onClick={() => removeOverride(idx)}
              className="ml-auto px-1.5 py-0.5 rounded opacity-60 hover:opacity-100"
              style={{ background: "var(--surface-2)" }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Section"
              value={customSection}
              onChange={(e) => setCustomSection(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 rounded"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
            />
            <input
              type="text"
              placeholder="Key"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 rounded"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Value"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 rounded"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
            />
            <button
              onClick={addOverride}
              disabled={!customSection.trim() || !customKey.trim()}
              className="px-3 py-1.5 rounded text-xs font-medium"
              style={{
                background: customSection.trim() && customKey.trim() ? "var(--accent)" : "var(--surface-2)",
                color: customSection.trim() && customKey.trim() ? "var(--surface-base)" : "var(--text-secondary)",
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Save preset button */}
      <button
        onClick={savePreset}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium mt-2"
        style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
      >
        <Settings size={16} /> Save Current Preset
      </button>
    </div>
  );
}

/* ─── Controller hints ──────────────────────────────────────── */

function ControllerHints() {
  const hints = [
    { keys: "↑ / ↓", action: "Navigate" },
    { keys: "A", action: "Select" },
    { keys: "B / Esc", action: "Back" },
    { keys: "F1", action: "Close" },
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

export function OverlayApp(): React.ReactElement | null {
  useControllerWorker();
  const { game, visible, pinnedVisible } = useOverlayGame();
  const { paused, toggle: togglePaused } = useOverlayPaused();
  const { settings, update } = useOverlaySettings();
  const [selectedItem, setSelectedItem] = useState(0);
  const selectedItemRef = useRef(0);
  const [isExiting, setIsExiting] = useState(false);
  const [configChartId, setConfigChartId] = useState<OverlayChartId | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);

  /* Chart config from settings */
  const chartsConfig = settings?.overlayChartsConfig ?? getDefaultOverlayChartsConfig();
  const chartConfigs = chartsConfig.charts;
  const chartGrid = chartsConfig.grid as Layout;

  const persistChartsConfig = useCallback((nextCharts: OverlayChartConfig[], nextGrid: Layout) => {
    const cfg: OverlayChartsConfig = {
      charts: nextCharts,
      grid: nextGrid.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h, minW: l.minW, minH: l.minH })),
    };
    update({ overlayChartsConfig: cfg });
  }, [update]);

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
          setIsExiting(true);
          void window.htpc.overlay.stopGame().then(() => {
            window.htpc.overlay.close();
          });
          break;
        default:
          break;
      }
    },
    [togglePaused]
  );

  const backOrClose = useCallback(() => {
    const currentId = SIDEBAR_ITEMS[selectedItemRef.current].id;
    if (CONTENT_IDS.has(currentId)) {
      selectedItemRef.current = 0;
      setSelectedItem(0);
    } else {
      window.htpc.overlay.close();
    }
  }, []);

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
        backOrClose();
      }
    }, [handleSelect, backOrClose])
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        window.htpc.overlay.close();
      } else if (e.key === "Escape") {
        e.preventDefault();
        backOrClose();
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
  }, [handleSelect, backOrClose]);

  /* Process stats — always running so pinned charts work even when overlay is hidden */
  const { stats, history } = useProcessStats(true);

  /* Kill threshold monitoring */
  useEffect(() => {
    for (const cfg of chartConfigs) {
      if (!cfg.enabled || cfg.killThreshold <= 0) continue;
      const val = getChartCurrentValue(cfg.id, stats);
      if (val > cfg.killThreshold) {
        logKillThreshold(cfg, val);
        void window.htpc.overlay.stopGame();
        return;
      }
    }
  }, [stats, chartConfigs]);

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

  /* Chart config helpers */
  const togglePin = useCallback((id: OverlayChartId) => {
    const nextCharts = chartConfigs.map((c) =>
      c.id === id ? { ...c, pinned: !c.pinned } : c
    );
    persistChartsConfig(nextCharts, chartGrid);
  }, [chartConfigs, chartGrid, persistChartsConfig]);

  const saveChartConfig = useCallback((cfg: OverlayChartConfig) => {
    const nextCharts = chartConfigs.map((c) => (c.id === cfg.id ? cfg : c));
    persistChartsConfig(nextCharts, chartGrid);
  }, [chartConfigs, chartGrid, persistChartsConfig]);

  const handleChartLayoutChange = useCallback((newLayout: Layout) => {
    persistChartsConfig(chartConfigs, newLayout);
  }, [chartConfigs, persistChartsConfig]);

  /* Container width for react-grid-layout (full overlay) */
  const { width: gridWidth, containerRef: gridContainerRef } = useContainerWidth({ measureBeforeMount: false });

  /* Container width for pinned-only mode */
  const { width: pinnedGridWidth, containerRef: pinnedGridContainerRef } = useContainerWidth({ measureBeforeMount: false });

  /* Enabled chart configs and their grid items */
  const enabledCharts = useMemo(() => {
    const enabledIds = new Set(chartConfigs.filter((c) => c.enabled).map((c) => c.id));
    return {
      charts: chartConfigs.filter((c) => c.enabled),
      grid: chartGrid.filter((g) => enabledIds.has(g.i as OverlayChartId)),
    };
  }, [chartConfigs, chartGrid]);

  /* Pinned chart configs and their grid items */
  const pinnedCharts = useMemo(() => {
    const pinnedIds = new Set(chartConfigs.filter((c) => c.enabled && c.pinned).map((c) => c.id));
    return {
      charts: chartConfigs.filter((c) => c.enabled && c.pinned),
      grid: chartGrid.filter((g) => pinnedIds.has(g.i as OverlayChartId)),
    };
  }, [chartConfigs, chartGrid]);

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
      case "shaders":
        return <ShaderPanel game={game} />;
      case "reshade":
        return <ReShadePanel game={game} />;
      case "settings":
        return <QuickSettingsPanel style={style} onAdjustOpacity={adjustOpacity} />;
      case "splitscreen":
        return <SplitscreenOverlay />;
      default:
        return null;
    }
  }, [activeId, game, style, adjustOpacity]);

  const showContent = activeId === "achievements" || activeId === "gameinfo" || activeId === "controllers" || activeId === "shaders" || activeId === "reshade" || activeId === "settings" || activeId === "splitscreen";

  /* Render a single chart inside a grid item */
  const renderChart = useCallback((cfg: OverlayChartConfig, isPinned: boolean) => {
    const Icon = CHART_ICONS[cfg.id] ?? Activity;
    const { data, value, max, unit } = getChartData(cfg.id, stats, history);
    const currentValue = getChartCurrentValue(cfg.id, stats);
    return (
      <MiniChart
        data={data}
        color={cfg.color}
        max={max}
        label={cfg.label}
        value={value}
        unit={unit}
        Icon={Icon}
        pinned={isPinned}
        pinnedBg={cfg.pinnedBg}
        pinnedBorder={cfg.pinnedBorder}
        warnThreshold={cfg.warnThreshold}
        killThreshold={cfg.killThreshold}
        currentValue={currentValue}
        onTogglePin={visible ? () => togglePin(cfg.id) : undefined}
        onConfigure={visible ? () => setConfigChartId(cfg.id) : undefined}
      />
    );
  }, [stats, history, visible, togglePin]);

  /* Pinned-only overlay: just the pinned charts, floating, click-through */
  if (!visible && pinnedVisible && pinnedCharts.charts.length > 0) {
    return (
      <>
        <div
          ref={pinnedGridContainerRef as React.LegacyRef<HTMLDivElement>}
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: 9999 }}
        >
          <Responsive
            className="layout"
            width={pinnedGridWidth || (typeof window !== "undefined" ? window.innerWidth : 1920)}
            layouts={{ lg: pinnedCharts.grid.map((l) => ({ ...l, static: true })) }}
            breakpoints={{ lg: 0 }}
            cols={{ lg: 48 }}
            rowHeight={10}
            margin={[4, 4]}
            containerPadding={[0, 0]}
            compactor={noCompactor}
            dragConfig={{ enabled: false }}
            resizeConfig={{ enabled: false }}
          >
            {pinnedCharts.charts.map((cfg) => (
              <div key={cfg.id} className="overflow-visible h-full">
                {renderChart(cfg, true)}
              </div>
            ))}
          </Responsive>
        </div>
        <ChartConfigDialog
          chart={chartConfigs.find((c) => c.id === configChartId) ?? null}
          open={!!configChartId}
          onClose={() => setConfigChartId(null)}
          onSave={saveChartConfig}
        />
      </>
    );
  }

  /* Full overlay hidden and no pinned charts */
  if (!visible) return null;

  return (
    <div
      ref={gridContainerRef as React.LegacyRef<HTMLDivElement>}
      className="fixed inset-0 flex text-[var(--text-primary)] overflow-hidden select-none"
      style={backgroundStyle}
    >
      {/* ─── Grid layer (fills entire overlay) ─────────────── */}
      <div className="absolute inset-0">
        <Responsive
          className="layout"
          width={gridWidth || (typeof window !== "undefined" ? window.innerWidth : 1920)}
          layouts={{ lg: enabledCharts.grid.map((l) => ({ ...l, static: false })) }}
          breakpoints={{ lg: 0 }}
          cols={{ lg: 48 }}
          rowHeight={10}
          margin={[4, 4]}
          containerPadding={[0, 0]}
          compactor={noCompactor}
          dragConfig={{ enabled: true }}
          resizeConfig={{ enabled: true, handles: ["s", "w", "e", "n", "sw", "nw", "se", "ne"] }}
          onLayoutChange={handleChartLayoutChange}
        >
          {enabledCharts.charts.map((cfg) => (
            <div key={cfg.id} className="overflow-visible h-full">
              {renderChart(cfg, cfg.pinned)}
            </div>
          ))}
        </Responsive>
      </div>

      {/* ─── Edit charts toggle (floats right of sidebar) ─── */}
      <button
        onClick={() => setSidebarHidden((v) => !v)}
        className="fixed top-2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-[12px] font-medium"
        style={{
          left: sidebarHidden ? 8 : 296,
          background: sidebarHidden ? "var(--surface-2)" : "var(--surface-1)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-default)",
        }}
        title={sidebarHidden ? "Show sidebar" : "Edit charts"}
      >
        <LayoutDashboard size={14} />
        <span>Edit Charts</span>
      </button>

      {/* ─── Sidebar + content (hidden when sidebarHidden) ── */}
      {!sidebarHidden && (
        <>
          {/* ─── Sidebar (left) ─────────────────────────────────── */}
          <aside
            className="flex flex-col flex-shrink-0 w-72 border-r overflow-y-auto relative z-20"
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
          <div className="flex-1 flex flex-col min-w-0 relative z-20">
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
        </>
      )}

      {/* Exit progress overlay */}
      {isExiting && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center gap-4 z-50"
          style={{ background: "rgba(0,0,0,0.85)" }}
        >
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <div className="text-sm text-white/80">Stopping game…</div>
        </div>
      )}

      {/* Chart config dialog */}
      <ChartConfigDialog
        chart={chartConfigs.find((c) => c.id === configChartId) ?? null}
        open={!!configChartId}
        onClose={() => setConfigChartId(null)}
        onSave={saveChartConfig}
      />
    </div>
  );
}
