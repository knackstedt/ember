import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Gamepad2,
  Monitor,
  Trophy,
  Globe,
  FileText,
  Settings,
  X,
  Power,
  Search,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Clock,
  Calendar,
  Star,
  Award,
  Disc,
  Cpu,
  HardDrive,
  Layers,
  Info,
} from "lucide-react";
import { useInputNav } from "../hooks/useInputNav";
import { useControllerWorker } from "../hooks/useControllerWorker";
import { Game, AppSettings, OverlayStyle } from "../../../shared/types";

const TABS = [
  { id: "game", label: "Game", Icon: Disc },
  { id: "system", label: "System", Icon: Monitor },
  { id: "achievements", label: "Achievements", Icon: Trophy },
  { id: "web", label: "Web", Icon: Globe },
  { id: "notes", label: "Notes", Icon: FileText },
  { id: "controllers", label: "Controllers", Icon: Gamepad2 },
] as const;

type TabId = typeof TABS[number]["id"];

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

function GameInfoPanel({ game }: { game: Game }) {
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    if (game.coverUrl) {
      setCover(game.coverUrl);
      return;
    }
    void window.htpc.games.loadThumbnail(game).then((url) => {
      if (url) setCover(url);
    });
  }, [game]);

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-1">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {cover ? (
          <img
            src={cover}
            alt={game.title}
            className="w-48 h-64 object-cover rounded-xl shadow-lg border border-white/10"
          />
        ) : (
          <div className="w-48 h-64 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
            <Disc size={48} className="opacity-40" />
          </div>
        )}
        <div className="flex-1 flex flex-col gap-3">
          <h2 className="text-2xl font-bold">{game.title}</h2>
          <div className="flex flex-wrap gap-2 text-sm opacity-80">
            <span className="px-2 py-1 rounded bg-white/10">{game.platform}</span>
            {game.releaseYear && (
              <span className="px-2 py-1 rounded bg-white/10">{game.releaseYear}</span>
            )}
            {game.rating && (
              <span className="px-2 py-1 rounded bg-white/10 flex items-center gap-1">
                <Star size={14} /> {game.rating}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="flex items-center gap-2 text-sm opacity-90">
              <Clock size={16} /> Playtime: {formatPlayTime(game.playTime)}
            </div>
            <div className="flex items-center gap-2 text-sm opacity-90">
              <Calendar size={16} /> Last played: {formatDate(game.lastPlayed)}
            </div>
            {game.achievementCount !== undefined && game.achievementCount > 0 && (
              <div className="flex items-center gap-2 text-sm opacity-90">
                <Award size={16} /> Achievements: {game.achievementCount}
              </div>
            )}
            {game.developer && (
              <div className="flex items-center gap-2 text-sm opacity-90">
                <Info size={16} /> {game.developer}
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => window.htpc.overlay.stopGame()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/80 hover:bg-red-600/80 text-white font-medium transition-colors"
            >
              <Power size={18} /> Stop Game
            </button>
            <button
              onClick={() => window.htpc.overlay.close()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-medium transition-colors"
            >
              <X size={18} /> Close
            </button>
          </div>
        </div>
      </div>
      {game.description && (
        <div className="text-sm leading-relaxed opacity-80 max-w-3xl">{game.description}</div>
      )}
    </div>
  );
}

function SystemPanel() {
  const [diag, setDiag] = useState<any>(null);
  useEffect(() => {
    void window.htpc.system.getDiagnostics().then(setDiag);
  }, []);

  if (!diag) {
    return (
      <div className="flex items-center justify-center h-40 opacity-60">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  const totalGB = diag.memory?.total ? Math.round(diag.memory.total / 1024 / 1024 / 1024) : 0;
  const freeGB = diag.memory?.free ? Math.round(diag.memory.free / 1024 / 1024 / 1024) : 0;
  const gpu = diag.gpu?.gpuDevice?.[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto p-1">
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
        <div className="flex items-center gap-2 font-semibold"><Cpu size={18} /> CPU</div>
        <div className="text-sm opacity-90">{diag.cpu?.model ?? "Unknown"}</div>
        <div className="text-sm opacity-70">{diag.cpu?.cores} cores @ {diag.cpu?.speed} MHz</div>
      </div>
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
        <div className="flex items-center gap-2 font-semibold"><Layers size={18} /> GPU</div>
        <div className="text-sm opacity-90">{gpu?.deviceString || gpu?.deviceDesc || "Unknown"}</div>
        <div className="text-sm opacity-70">{gpu?.vendorString || gpu?.vendorId}</div>
      </div>
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
        <div className="flex items-center gap-2 font-semibold"><HardDrive size={18} /> Memory</div>
        <div className="text-sm opacity-90">{totalGB} GB total</div>
        <div className="text-sm opacity-70">{freeGB} GB free</div>
      </div>
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
        <div className="flex items-center gap-2 font-semibold"><Monitor size={18} /> OS</div>
        <div className="text-sm opacity-90">{diag.os?.type} {diag.os?.release}</div>
        <div className="text-sm opacity-70">{diag.os?.arch}</div>
      </div>
      {diag.displays?.length > 0 && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 md:col-span-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold"><Monitor size={18} /> Displays</div>
          <div className="flex flex-wrap gap-2">
            {diag.displays.map((d: any) => (
              <span key={d.id} className="text-sm px-2 py-1 rounded bg-white/10">
                {d.resolution} {d.primary ? "(primary)" : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AchievementsPanel({ game }: { game: Game }) {
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    void window.htpc.games
      .getMetadataLazy({
        gameId: game.id,
        title: game.title,
        platform: game.platform,
        steamAppId: game.steamAppId,
      })
      .then((metadata) => {
        const list = (metadata as any)?.achievements ?? [];
        setAchievements(Array.isArray(list) ? list : []);
      })
      .finally(() => setLoading(false));
  }, [game]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 opacity-60">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
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
          className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <Trophy size={18} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold">{ach.title ?? ach.name ?? "Achievement"}</div>
            {ach.description && (
              <div className="text-xs opacity-70">{ach.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function WebPanel() {
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("https://duckduckgo.com/html/?q=game+guide");
  const webviewRef = useRef<Electron.WebviewTag | null>(null);

  const doSearch = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    setUrl(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
  }, [query]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="Search the web..."
          className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-sm outline-none focus:border-white/30"
        />
        <button
          onClick={doSearch}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
        >
          <Search size={18} />
        </button>
        <button
          onClick={() => webviewRef.current?.goBack()}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          onClick={() => webviewRef.current?.goForward()}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
        >
          <ArrowRight size={18} />
        </button>
        <button
          onClick={() => webviewRef.current?.reload()}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <div className="flex-1 rounded-xl overflow-hidden border border-white/10 bg-white/5 min-h-[300px]">
        <webview
          ref={(el) => { webviewRef.current = el as any; }}
          src={url}
          partition="overlay"
          className="w-full h-full"
          style={{ border: "none" }}
        />
      </div>
    </div>
  );
}

function NotesPanel({ game, notes, onChange }: { game: Game; notes?: string; onChange: (v: string) => void }) {
  const [value, setValue] = useState(notes ?? "");
  useEffect(() => {
    setValue(notes ?? "");
  }, [notes]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        placeholder="Type notes for this game..."
        className="flex-1 min-h-[200px] p-3 rounded-xl bg-white/10 border border-white/10 text-sm outline-none focus:border-white/30 resize-none"
      />
      <div className="text-xs opacity-60">Notes are saved automatically.</div>
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
        <div key={dev.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <Gamepad2 size={18} />
            {dev.name}
            <span className="text-xs font-normal opacity-60 px-2 py-0.5 rounded bg-white/10">
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
                <span key={m.inputCode} className="text-xs px-2 py-1 rounded bg-white/10">
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

export function OverlayApp(): React.ReactElement {
  useControllerWorker();
  const game = useOverlayGame();
  const { settings, update } = useOverlaySettings();
  const [activeTab, setActiveTab] = useState<TabId>("game");
  const tabIndexRef = useRef(0);

  const style = settings?.overlayStyle ?? { mode: "glass", color: "#000000", opacity: 0.65 };

  const backgroundStyle = useMemo(() => {
    const baseColor = style.color || "#000000";
    const opacity = style.opacity ?? 0.65;
    if (style.mode === "glass") {
      return {
        backgroundColor: `${baseColor}${Math.round(opacity * 255)
          .toString(16)
          .padStart(2, "0")}`,
        backdropFilter: "blur(16px) saturate(120%)",
        WebkitBackdropFilter: "blur(16px) saturate(120%)",
      } as React.CSSProperties;
    }
    return {
      backgroundColor: `${baseColor}${Math.round(opacity * 255)
        .toString(16)
        .padStart(2, "0")}`,
    } as React.CSSProperties;
  }, [style]);

  const updateNotes = useCallback(
    (text: string) => {
      if (!game || !settings) return;
      const next = { ...(settings.gameNotes ?? {}), [game.id]: text };
      update({ gameNotes: next });
    },
    [game, settings, update]
  );

  const toggleStyleMode = useCallback(() => {
    const next: OverlayStyle = {
      ...style,
      mode: style.mode === "glass" ? "tint" : "glass",
    };
    update({ overlayStyle: next });
  }, [style, update]);

  const adjustOpacity = useCallback(
    (delta: number) => {
      const next: OverlayStyle = {
        ...style,
        opacity: Math.max(0.1, Math.min(1, (style.opacity ?? 0.65) + delta)),
      };
      update({ overlayStyle: next });
    },
    [style, update]
  );

  useInputNav(
    useCallback((action) => {
      if (action === "left" || action === "right") {
        const dir = action === "left" ? -1 : 1;
        tabIndexRef.current = Math.max(0, Math.min(TABS.length - 1, tabIndexRef.current + dir));
        const next = TABS[tabIndexRef.current].id;
        setActiveTab(next);
      } else if (action === "cancel") {
        window.htpc.overlay.close();
      }
    }, [])
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "F1") {
        e.preventDefault();
        window.htpc.overlay.close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const panel = useMemo(() => {
    if (!game) return null;
    switch (activeTab) {
      case "game":
        return <GameInfoPanel game={game} />;
      case "system":
        return <SystemPanel />;
      case "achievements":
        return <AchievementsPanel game={game} />;
      case "web":
        return <WebPanel />;
      case "notes":
        return (
          <NotesPanel
            game={game}
            notes={settings?.gameNotes?.[game.id]}
            onChange={updateNotes}
          />
        );
      case "controllers":
        return <ControllersPanel />;
      default:
        return null;
    }
  }, [activeTab, game, settings?.gameNotes, updateNotes]);

  return (
    <div
      className="fixed inset-0 flex flex-col text-white overflow-hidden select-none"
      style={backgroundStyle}
    >
      {/* Top border accent */}
      <div className="h-1 w-full bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-sm">
            EMBER
          </div>
          <div className="text-sm font-medium opacity-80">In-Game Overlay</div>
          {game && (
            <div className="hidden sm:block text-xs opacity-50">· {game.title}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleStyleMode}
            title="Toggle glass/tint"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={() => adjustOpacity(-0.05)}
            title="Decrease opacity"
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs transition-colors"
          >
            -
          </button>
          <button
            onClick={() => adjustOpacity(0.05)}
            title="Increase opacity"
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs transition-colors"
          >
            +
          </button>
          <button
            onClick={() => window.htpc.overlay.close()}
            className="p-2 rounded-lg bg-white/10 hover:bg-red-500/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-white/10 bg-black/10">
        {TABS.map((tab, idx) => {
          const active = tab.id === activeTab;
          const Icon = tab.Icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                tabIndexRef.current = idx;
              }}
              className={[
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active ? "bg-white/20 text-white" : "bg-transparent hover:bg-white/10 opacity-70",
              ].join(" ")}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-hidden">
        {game ? (
          <div className="h-full max-w-6xl mx-auto">{panel}</div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-70">
            <div className="w-12 h-12 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            <div className="text-sm">Waiting for game info...</div>
          </div>
        )}
      </div>

      {/* Bottom hint bar */}
      <div className="px-6 py-2 border-t border-white/10 bg-black/20 text-xs opacity-60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>F1 / Esc to close</span>
          <span>D-pad or stick left/right to switch tabs</span>
          <span>B / East to close</span>
        </div>
        <div>{style.mode === "glass" ? "Glass mode" : "Tint mode"} · opacity {Math.round((style.opacity ?? 0.65) * 100)}%</div>
      </div>
    </div>
  );
}
