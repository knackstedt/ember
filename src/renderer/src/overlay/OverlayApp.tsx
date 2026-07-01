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
  Bluetooth,
  RefreshCw,
  Link2,
  Unlink,
  Search,
  Trash2,
  Columns,
} from "lucide-react";
import { useInputNav } from "../hooks/useInputNav";
import { useControllerWorker } from "../hooks/useControllerWorker";
import { Game, AppSettings, OverlayStyle, BluetoothDevice, VulkanShaderConfig, GameInjectionConfig, ReShadeRuntimeState, ReShadeTechniqueState, ReShadeUniformState } from "../../../shared/types";
import { SplitscreenOverlay } from "../components/Splitscreen/SplitscreenOverlay";
import { useSplitscreenStore } from "../store/splitscreen.store";

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
    const unsubscribe = window.htpc.overlay.onState((state) => {
      setGame(state.game);
    });
    return () => {
      unsubscribe();
    };
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
  Icon: React.ComponentType<{ size?: number | string }>;
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

  const isEmulator = EMULATOR_PLATFORMS.has(game.platform);

  // Poll state from addon every 3 seconds
  useEffect(() => {
    if (isEmulator) { setLoading(false); return; }
    let cancelled = false;
    const poll = () => {
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
    sendControl({ effectsEnabled: enabled });
    setState((prev) => prev ? { ...prev, effectsEnabled: enabled } : prev);
  }, [sendControl]);

  const toggleTechnique = useCallback((tech: ReShadeTechniqueState, enabled: boolean) => {
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
                className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                style={{
                  background: tech.enabled ? "var(--accent)" : "var(--surface-2)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {tech.enabled && <span style={{ color: "var(--surface-base)", fontSize: "12px", fontWeight: 700 }}>\u2713</span>}
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
            const isFloat = uniform.type === 0x61 || uniform.type === 0x65;
            const isInt = uniform.type === 0x6d || uniform.type === 0x71;
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
  const [isExiting, setIsExiting] = useState(false);

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
    </div>
  );
}
