import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../store/settings.store";
import {
  ThemeName,
  FlashAspectRatio,
  FlashCanvasSize,
  FlashUpscaleStyle,
  FlashSettings,
  TabId,
  DailyBackgroundSource,
  GamePlatform,
  StreamingService,
  ManagedPackage,
  PackageOperationProgress,
} from "../../../../shared/types";
import { KeybindEditor } from "../../components/KeybindEditor/KeybindEditor";

const DEFAULT_FLASH_SETTINGS: FlashSettings = {
  aspectRatio: "free",
  canvasSize: "window",
  customWidth: 800,
  customHeight: 600,
  upscaleStyle: "none",
  controllerMap: {
    south: "Space",
    east: "Escape",
    north: "KeyE",
    west: "KeyQ",
    left_bumper: "ShiftLeft",
    right_bumper: "ShiftRight",
    select: "Tab",
    start: "Enter",
    dpad_up: "ArrowUp",
    dpad_down: "ArrowDown",
    dpad_left: "ArrowLeft",
    dpad_right: "ArrowRight",
  },
  stickToMouse: true,
  stickSensitivity: 1.0,
  aiUpscaling: false,
  filter: "none",
  filterIntensity: 1.0,
  pixelateSize: 4,
  ditherLevels: 4,
};

function getFlashSettings(settings?: Partial<FlashSettings>): FlashSettings {
  return { ...DEFAULT_FLASH_SETTINGS, ...settings };
}

const THEMES: { id: ThemeName; label: string; preview: string }[] = [
  { id: "dark-oled", label: "Dark OLED", preview: "#000" },
  {
    id: "glassmorphism",
    label: "Glassmorphism",
    preview: "linear-gradient(135deg,#0d1117,#1e3a5f)",
  },
  {
    id: "neon-cyberpunk",
    label: "Neon Cyberpunk",
    preview: "linear-gradient(135deg,#07070f,#ff2d78)",
  },
  {
    id: "terminal-tui",
    label: "Terminal TUI",
    preview: "linear-gradient(135deg,#0c0c0c,#004400)",
  },
  { id: "custom", label: "Custom", preview: "var(--color-surface-raised)" },
];

function PathList({
  label,
  paths,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  paths: string[];
  onChange: (p: string[]) => void;
  placeholder?: string;
  hint?: string;
}): React.ReactElement {
  const [newPath, setNewPath] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-sm font-medium"
        style={{ color: "var(--color-text)" }}
      >
        {label}
      </label>
      {hint && (
        <p
          className="text-xs"
          style={{
            color: "var(--color-text-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          ↪ auto-scans: {hint}
        </p>
      )}
      {paths.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span
            className="flex-1 text-sm px-3 py-1.5 rounded"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {p}
          </span>
          <button
            onClick={() => onChange(paths.filter((_, j) => j !== i))}
            className="px-2 py-1 text-xs rounded"
            style={{
              background: "#ff444420",
              color: "#ff4444",
              border: "1px solid #ff444430",
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder={placeholder ?? "/path/to/folder"}
          className="flex-1 text-sm px-3 py-1.5 rounded"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            fontFamily: "var(--font-mono)",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newPath.trim()) {
              onChange([...paths, newPath.trim()]);
              setNewPath("");
            }
          }}
        />
        <motion.button
          className="px-3 py-1.5 rounded text-sm"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg)",
          }}
          onClick={() => {
            if (newPath.trim()) {
              onChange([...paths, newPath.trim()]);
              setNewPath("");
            }
          }}
          whileTap={{ scale: 0.96 }}
        >
          Add
        </motion.button>
        <motion.button
          className="px-3 py-1.5 rounded text-sm"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={async () => {
            const dir = await window.htpc.openDirectory();
            if (dir) onChange([...paths, dir]);
          }}
          whileTap={{ scale: 0.96 }}
        >
          Browse…
        </motion.button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-sm font-medium"
        style={{ color: "var(--color-text)" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 rounded text-sm"
        style={{
          background: "var(--color-surface-raised)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
          outline: "none",
        }}
      />
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm" style={{ color: "var(--color-text)" }}>
        {label}
      </span>
      <button
        onClick={() => onChange(!value)}
        className="w-11 h-6 rounded-full transition-colors relative"
        style={{
          background: value
            ? "var(--color-accent)"
            : "var(--color-surface-raised)",
          border: "1px solid var(--color-border)",
        }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
          style={{
            background: "white",
            left: value ? "1.25rem" : "0.125rem",
            transform: "translateX(0)",
          }}
        />
      </button>
    </div>
  );
}

const TOC_ITEMS = [
  { id: "appearance", label: "Appearance" },
  { id: "tabs", label: "Tabs" },
  { id: "daily-background", label: "Daily Background" },
  { id: "media-directories", label: "Media Directories" },
  { id: "api-keys", label: "API Keys" },
  { id: "general", label: "General" },
  { id: "flash-player", label: "Flash Player" },
  { id: "emulators", label: "Emulators" },
  { id: "streaming-services", label: "Streaming Services" },
  { id: "danger-zone", label: "Danger Zone" },
  { id: "plugins", label: "Plugins" },
  { id: "dependencies-cores", label: "Dependencies & Cores" },
];

function SettingsTOC(): React.ReactElement {
  const [activeId, setActiveId] = useState<string>(TOC_ITEMS[0].id);

  useEffect(() => {
    const container = document.querySelector(".gpu-scroll") as HTMLElement | null;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      {
        root: container,
        rootMargin: "-10% 0px -70% 0px",
        threshold: 0,
      }
    );

    for (const item of TOC_ITEMS) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    const container = document.querySelector(".gpu-scroll") as HTMLElement | null;
    if (!el || !container) return;

    const target = el.offsetTop - 24;
    const start = container.scrollTop;
    const delta = target - start;
    const duration = 180;
    const startTime = performance.now();

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      container.scrollTop = start + delta * easeOutCubic(progress);
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  return (
    <nav className="flex flex-col gap-1">
      <span
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-text-dim)" }}
      >
        Settings
      </span>
      {TOC_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => handleClick(item.id)}
          className="text-left text-sm px-2 py-1 rounded transition-colors"
          style={{
            color:
              activeId === item.id
                ? "var(--color-accent)"
                : "var(--color-text-dim)",
            background:
              activeId === item.id
                ? "var(--color-surface-raised)"
                : "transparent",
            fontWeight: activeId === item.id ? 600 : 400,
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export const SettingsTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [clearConfirm, setClearConfirm] = useState(false);
  const [xdgDefaults, setXdgDefaults] = useState<{
    videosDir: string;
    musicDir: string;
  } | null>(null);
  const [streamingServices, setStreamingServices] = useState<StreamingService[]>([]);
  const [showAddService, setShowAddService] = useState(false);
  const [newService, setNewService] = useState({
    name: "",
    url: "",
    category: "music" as "music" | "video",
    color: "#1DB954",
    textColor: "#ffffff",
    icon: "🔗",
  });

  // Package management state
  const [packages, setPackages] = useState<ManagedPackage[]>([]);
  const [packageSearch, setPackageSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "core" | "emulator" | "dependency" | "media-codec" | "other">("all");
  const [showAptPassword, setShowAptPassword] = useState(false);
  const [aptPassword, setAptPasswordInput] = useState("");
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  const [operationProgress, setOperationProgress] = useState<Map<string, PackageOperationProgress>>(new Map());

  /* Lock body scroll when password modal is open */
  useEffect(() => {
    if (showAptPassword) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = original; };
    }
  }, [showAptPassword]);

  useEffect(() => {
    window.htpc.app
      .getXdgDefaults()
      .then(setXdgDefaults)
      .catch(() => {});
  }, []);

  useEffect(() => {
    window.htpc.streaming.list()
      .then(setStreamingServices)
      .catch(() => {});
  }, []);

  // Load packages on mount
  useEffect(() => {
    loadPackages();
  }, []);

  // Subscribe to package operation progress
  useEffect(() => {
    const unsubscribe = window.htpc.packages.onProgress((progress) => {
      setOperationProgress((prev) => {
        const next = new Map(prev);
        next.set(progress.packageId, progress);
        return next;
      });
      // Auto-refresh package list when an operation completes successfully
      if (progress.status === "success" || progress.status === "error") {
        setTimeout(() => loadPackages(), 500);
      }
    });
    return () => { unsubscribe(); };
  }, []);

  const loadPackages = async () => {
    try {
      const pkgs = await window.htpc.packages.list();
      setPackages(pkgs);
    } catch (err) {
      console.error("Failed to load packages:", err);
    }
  };

  const refreshServices = () => {
    window.htpc.streaming.list()
      .then(setStreamingServices)
      .catch(() => {});
  };

  const toggleServiceEnabled = async (id: string, enabled: boolean) => {
    await window.htpc.streaming.setEnabled(id, enabled);
    refreshServices();
  };

  const handleAddService = async () => {
    if (!newService.name.trim() || !newService.url.trim()) return;
    await window.htpc.streaming.add({
      id: `custom_${Date.now()}`,
      name: newService.name.trim(),
      category: newService.category,
      url: newService.url.trim(),
      color: newService.color,
      textColor: newService.textColor,
      icon: newService.icon,
      enabled: true,
    });
    setNewService({
      name: "",
      url: "",
      category: "music",
      color: "#1DB954",
      textColor: "#ffffff",
      icon: "🔗",
    });
    setShowAddService(false);
    refreshServices();
  };

  const handleDeleteService = async (id: string) => {
    await window.htpc.streaming.delete(id);
    refreshServices();
  };

  // Package management functions
  const handleInstallPackage = async (pkg: ManagedPackage) => {
    if (pkg.manager === "apt" && !pkg.isInstalled) {
      setPendingPackageId(pkg.id);
      setShowAptPassword(true);
      setAptPasswordInput("");
    } else {
      await performInstall(pkg.id);
    }
  };

  const performInstall = async (packageId: string) => {
    try {
      await window.htpc.packages.install(packageId);
      await loadPackages();
    } catch (err) {
      console.error("Failed to install package:", err);
    }
  };

  const handleAptPasswordSubmit = async () => {
    if (aptPassword.trim()) {
      await window.htpc.packages.setAptPassword(aptPassword);
      setShowAptPassword(false);
      setAptPasswordInput("");
      // Actually trigger the install now that password is set
      if (pendingPackageId) {
        const id = pendingPackageId;
        setPendingPackageId(null);
        await performInstall(id);
      }
    }
  };

  const handleUninstallPackage = async (packageId: string) => {
    try {
      await window.htpc.packages.uninstall(packageId);
      await loadPackages();
    } catch (err) {
      console.error("Failed to uninstall package:", err);
    }
  };

  const handleTogglePin = async (pkg: ManagedPackage) => {
    // Update local state for now (persisting would require backend support)
    setPackages((prev) =>
      prev.map((p) =>
        p.id === pkg.id ? { ...p, isPinned: !p.isPinned } : p
      )
    );
  };

  const handleToggleAutoUpdate = async (pkg: ManagedPackage) => {
    // Update local state for now (persisting would require backend support)
    setPackages((prev) =>
      prev.map((p) =>
        p.id === pkg.id ? { ...p, autoUpdate: !p.autoUpdate } : p
      )
    );
  };

  const filteredPackages = packages.filter((pkg) => {
    const matchesCategory =
      selectedCategory === "all" || pkg.category === selectedCategory;
    const matchesSearch =
      pkg.name.toLowerCase().includes(packageSearch.toLowerCase()) ||
      pkg.displayName.toLowerCase().includes(packageSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (!settings) return null;

  return (
    <div className="h-full overflow-y-auto gpu-scroll">
      <div className="max-w-5xl mx-auto p-6 flex gap-8">
        <div className="flex-1 min-w-0 max-w-2xl flex flex-col gap-8">
        <section id="appearance" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Appearance
          </h2>
          <div>
            <label
              className="text-sm font-medium mb-3 block"
              style={{ color: "var(--color-text)" }}
            >
              Theme
            </label>
            <div className="grid grid-cols-5 gap-3">
              {THEMES.map((t) => (
                <motion.button
                  key={t.id}
                  className="flex flex-col items-center gap-2 p-2 rounded-[var(--radius-card)]"
                  style={{
                    border: `2px solid ${settings.theme === t.id ? "var(--color-accent)" : "var(--color-border)"}`,
                    background: "var(--color-surface-raised)",
                    boxShadow:
                      settings.theme === t.id ? "var(--shadow-glow)" : "none",
                  }}
                  onClick={() => update({ theme: t.id })}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div
                    className="w-full h-12 rounded"
                    style={{ background: t.preview }}
                  />
                  <span
                    className="text-xs text-center"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    {t.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
          <Toggle
            label="Start Fullscreen"
            value={settings.fullscreen}
            onChange={(v) => update({ fullscreen: v })}
          />
        </section>

        <section id="tabs" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Tabs
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Choose which tabs are visible in the navigation bar.
          </p>
          {(
            [
              ["gaming", "Gaming", "🎮"],
              ["movies", "Movies", "🎬"],
              ["music", "Music", "🎵"],
              ["tv-shows", "TV Shows", "📺"],
              ["controllers", "Controllers", "🕹"],
            ] as [TabId, string, string][]
          ).map(([id, label, icon]) => {
            const disabled = settings.disabledTabs.includes(id);
            return (
              <div key={id} className="flex items-center justify-between py-1">
                <span className="text-sm" style={{ color: "var(--color-text)" }}>
                  {icon} {label}
                </span>
                <button
                  onClick={() =>
                    update({
                      disabledTabs: disabled
                        ? settings.disabledTabs.filter((t) => t !== id)
                        : [...settings.disabledTabs, id],
                    })
                  }
                  className="w-11 h-6 rounded-full transition-colors relative"
                  style={{
                    background: !disabled
                      ? "var(--color-accent)"
                      : "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                    style={{
                      background: "white",
                      left: !disabled ? "1.25rem" : "0.125rem",
                    }}
                  />
                </button>
              </div>
            );
          })}
        </section>

        <section id="daily-background" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Daily Background
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Fetches a new wallpaper image every day and layers it behind the
            theme canvas.
          </p>
          <Toggle
            label="Enable Daily Background"
            value={settings.dailyBackground.enabled}
            onChange={(v) =>
              update({
                dailyBackground: {
                  ...settings.dailyBackground,
                  enabled: v,
                },
              })
            }
          />
          {settings.dailyBackground.enabled && (
            <div className="flex flex-col gap-3">
              <div>
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  Source
                </label>
                <select
                  value={settings.dailyBackground.source}
                  onChange={(e) =>
                    update({
                      dailyBackground: {
                        ...settings.dailyBackground,
                        source: e.target.value as DailyBackgroundSource,
                      },
                    })
                  }
                  className="w-full text-sm px-2 py-1.5 rounded"
                  style={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                >
                  <option value="bing">Bing Wallpaper of the Day</option>
                  <option value="unsplash">Unsplash Random</option>
                  <option value="picsum">Picsum Random</option>
                  <option value="custom">Custom URL</option>
                </select>
              </div>
              {settings.dailyBackground.source === "custom" && (
                <Field
                  label="Custom Image URL"
                  value={settings.dailyBackground.customUrl ?? ""}
                  onChange={(v) =>
                    update({
                      dailyBackground: {
                        ...settings.dailyBackground,
                        customUrl: v,
                      },
                    })
                  }
                  placeholder="https://example.com/wallpaper.jpg"
                />
              )}
            </div>
          )}
        </section>

        <section id="media-directories" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Media Directories
          </h2>
          <PathList
            label="Movie Paths"
            paths={settings.moviePaths}
            onChange={(p) => update({ moviePaths: p })}
            placeholder={xdgDefaults?.videosDir}
            hint={xdgDefaults?.videosDir}
          />
          <PathList
            label="Music Paths"
            paths={settings.musicPaths}
            onChange={(p) => update({ musicPaths: p })}
            placeholder={xdgDefaults?.musicDir}
            hint={xdgDefaults?.musicDir}
          />
          <PathList
            label="ROM Paths"
            paths={settings.romPaths}
            onChange={(p) => update({ romPaths: p })}
          />
          <PathList
            label="Game Paths"
            paths={settings.gamePaths}
            onChange={(p) => update({ gamePaths: p })}
          />
        </section>

        <section id="api-keys" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            API Keys
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Optional. Improves metadata quality and rate limits.
          </p>
          <Field
            label="TMDB API Key"
            value={settings.tmdbApiKey ?? ""}
            onChange={(v) => update({ tmdbApiKey: v })}
            placeholder="eyJ…"
            type="password"
          />
          <Field
            label="RAWG API Key"
            value={settings.rawgApiKey ?? ""}
            onChange={(v) => update({ rawgApiKey: v })}
            placeholder="Optional"
            type="password"
          />
          <Field
            label="AcoustID API Key"
            value={settings.acoustidApiKey ?? ""}
            onChange={(v) => update({ acoustidApiKey: v })}
            placeholder="Optional"
            type="password"
          />
          <Field
            label="TheAudioDB API Key"
            value={settings.theaudiodbApiKey ?? ""}
            onChange={(v) => update({ theaudiodbApiKey: v })}
            placeholder="Optional (uses free tier by default)"
            type="password"
          />
        </section>

        <section id="general" className="flex flex-col gap-2">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            General
          </h2>
          <Toggle
            label="Start on Boot"
            value={settings.startOnBoot}
            onChange={(v) => update({ startOnBoot: v })}
          />
          <Toggle
            label="Hardware Acceleration"
            value={settings.hardwareAcceleration}
            onChange={(v) => update({ hardwareAcceleration: v })}
          />
        </section>

        <section id="keybinds" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Keybinds & Controller
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Click a shortcut to record a new keyboard combination. Click the controller button to assign a gamepad button.
          </p>
          <KeybindEditor
            keybinds={settings.commandKeybinds ?? {}}
            controllerMap={settings.commandControllerMap ?? {}}
            onChangeKeybind={(cmdId, shortcut) => {
              const next = { ...(settings.commandKeybinds ?? {}) };
              if (shortcut) next[cmdId] = shortcut;
              else delete next[cmdId];
              update({ commandKeybinds: next });
            }}
            onChangeController={(cmdId, button) => {
              const next = { ...(settings.commandControllerMap ?? {}) };
              if (button) next[cmdId] = button;
              else delete next[cmdId];
              update({ commandControllerMap: next });
            }}
            onResetAll={() => {
              update({ commandKeybinds: {}, commandControllerMap: {} });
            }}
          />
        </section>

        <section id="flash-player" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Flash Player
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Default Aspect Ratio
              </label>
              <select
                value={settings.flashSettings?.aspectRatio ?? "free"}
                onChange={(e) =>
                  update({
                    flashSettings: {
                      ...getFlashSettings(settings.flashSettings),
                      aspectRatio: e.target.value as FlashAspectRatio,
                    },
                  })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
              >
                <option value="free">Free (fill window)</option>
                <option value="4:3">4:3</option>
                <option value="16:9">16:9</option>
                <option value="16:10">16:10</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Default Canvas Size
              </label>
              <select
                value={settings.flashSettings?.canvasSize ?? "window"}
                onChange={(e) =>
                  update({
                    flashSettings: {
                      ...getFlashSettings(settings.flashSettings),
                      canvasSize: e.target.value as FlashCanvasSize,
                    },
                  })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
              >
                <option value="window">Fit Window</option>
                <option value="550x400">550x400 (Common Flash)</option>
                <option value="640x480">640x480 (VGA)</option>
                <option value="800x600">800x600 (SVGA)</option>
                <option value="1024x768">1024x768 (XGA)</option>
                <option value="custom">Custom…</option>
              </select>
              {(settings.flashSettings?.canvasSize ?? "window") === "custom" && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={3840}
                    value={settings.flashSettings?.customWidth ?? 800}
                    onChange={(e) =>
                      update({
                        flashSettings: {
                          ...getFlashSettings(settings.flashSettings),
                          customWidth: parseInt(e.target.value) || 1,
                        },
                      })
                    }
                    placeholder="Width"
                    className="flex-1 text-sm px-2 py-1.5 rounded"
                    style={{
                      background: "var(--color-surface-raised)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text)",
                      outline: "none",
                    }}
                  />
                  <input
                    type="number"
                    min={1}
                    max={2160}
                    value={settings.flashSettings?.customHeight ?? 600}
                    onChange={(e) =>
                      update({
                        flashSettings: {
                          ...getFlashSettings(settings.flashSettings),
                          customHeight: parseInt(e.target.value) || 1,
                        },
                      })
                    }
                    placeholder="Height"
                    className="flex-1 text-sm px-2 py-1.5 rounded"
                    style={{
                      background: "var(--color-surface-raised)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text)",
                      outline: "none",
                    }}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Default Upscaling Style
              </label>
              <select
                value={settings.flashSettings?.upscaleStyle ?? "none"}
                onChange={(e) =>
                  update({
                    flashSettings: {
                      ...getFlashSettings(settings.flashSettings),
                      upscaleStyle: e.target.value as FlashUpscaleStyle,
                    },
                  })
                }
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
              >
                <option value="none">None (Smooth)</option>
                <option value="gaussian">Gaussian (Soft blur)</option>
                <option value="pixelate">Pixelate (Crisp pixels)</option>
              </select>
            </div>
            <Toggle
              label="Stick to Mouse"
              value={settings.flashSettings?.stickToMouse ?? true}
              onChange={(v) =>
                update({
                  flashSettings: {
                    ...getFlashSettings(settings.flashSettings),
                    stickToMouse: v,
                  },
                })
              }
            />
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                AI Upscaling (Experimental)
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  background: "#ffaa0020",
                  color: "#ffaa00",
                  border: "1px solid #ffaa0030",
                }}
              >
                Coming Soon
              </span>
            </div>
          </div>
        </section>

        <section id="emulators" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Emulators
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                Default Shader (Global)
              </label>
              <select
                value={settings.defaultEmulatorShader ?? ""}
                onChange={(e) => update({ defaultEmulatorShader: e.target.value })}
                className="w-full text-sm px-2 py-1.5 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
              >
                <option value="">None</option>
                <option value="2xSal.glsl">2xSal</option>
                <option value="4xBR.glsl">4xBR</option>
                <option value="6xBRZ.glsl">6xBRZ</option>
                <option value="crt-easymode.glsl">CRT Easymode</option>
                <option value="crt-geom.glsl">CRT Geom</option>
                <option value="dot.glsl">Dot</option>
                <option value="lcd.glsl">LCD</option>
                <option value="ntsc.glsl">NTSC</option>
                <option value="sharp-bilinear.glsl">Sharp Bilinear</option>
                <option value="supereagle.glsl">Super Eagle</option>
                <option value="xbrz.glsl">xBRZ</option>
              </select>
            </div>
            {(
              [
                ["nes", "NES"],
                ["snes", "SNES"],
                ["gb", "Game Boy"],
                ["gba", "GBA"],
              ] as [GamePlatform, string][]
            ).map(([platform, label]) => (
              <div key={platform}>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
                  {label} Default Shader
                </label>
                <select
                  value={settings.emulatorShaders?.[platform] ?? ""}
                  onChange={(e) => {
                    const next = { ...settings.emulatorShaders, [platform]: e.target.value || undefined };
                    update({ emulatorShaders: next });
                  }}
                  className="w-full text-sm px-2 py-1.5 rounded"
                  style={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                >
                  <option value="">Inherit (use global default)</option>
                  <option value="2xSal.glsl">2xSal</option>
                  <option value="4xBR.glsl">4xBR</option>
                  <option value="6xBRZ.glsl">6xBRZ</option>
                  <option value="crt-easymode.glsl">CRT Easymode</option>
                  <option value="crt-geom.glsl">CRT Geom</option>
                  <option value="dot.glsl">Dot</option>
                  <option value="lcd.glsl">LCD</option>
                  <option value="ntsc.glsl">NTSC</option>
                  <option value="sharp-bilinear.glsl">Sharp Bilinear</option>
                  <option value="supereagle.glsl">Super Eagle</option>
                  <option value="xbrz.glsl">xBRZ</option>
                </select>
              </div>
            ))}
          </div>
        </section>

        <section id="streaming-services" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Streaming Services
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Manage which streaming services appear in the Music and Movies tabs.
          </p>

          <div className="flex flex-col gap-2">
            {streamingServices.map((svc) => (
              <div
                key={svc.id}
                className="flex items-center gap-3 px-3 py-2 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <span className="text-lg" aria-hidden>{svc.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{svc.name}</div>
                  <div className="text-xs truncate" style={{ color: "var(--color-text-dim)" }}>
                    {svc.category === "music" ? "Music" : "Video"} · {svc.isBuiltin ? "Built-in" : "Custom"}
                  </div>
                </div>
                <button
                  onClick={() => toggleServiceEnabled(svc.id, !svc.enabled)}
                  className="w-11 h-6 rounded-full transition-colors relative flex-shrink-0"
                  style={{
                    background: svc.enabled
                      ? "var(--color-accent)"
                      : "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                    style={{
                      background: "white",
                      left: svc.enabled ? "1.25rem" : "0.125rem",
                    }}
                  />
                </button>
                {!svc.isBuiltin && (
                  <button
                    onClick={() => handleDeleteService(svc.id)}
                    className="px-2 py-1 text-xs rounded"
                    style={{
                      background: "#ff444420",
                      color: "#ff4444",
                      border: "1px solid #ff444430",
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <AnimatePresence>
            {showAddService && (
              <motion.div
                className="flex flex-col gap-3 p-4 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                }}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Field
                  label="Name"
                  value={newService.name}
                  onChange={(v) => setNewService((s) => ({ ...s, name: v }))}
                  placeholder="e.g. My Service"
                />
                <Field
                  label="URL"
                  value={newService.url}
                  onChange={(v) => setNewService((s) => ({ ...s, url: v }))}
                  placeholder="https://example.com"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewService((s) => ({ ...s, category: "music" }))}
                    className="flex-1 px-3 py-2 rounded text-sm"
                    style={{
                      background: newService.category === "music" ? "var(--color-accent)" : "var(--color-surface)",
                      color: newService.category === "music" ? "var(--color-bg)" : "var(--color-text)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    Music
                  </button>
                  <button
                    onClick={() => setNewService((s) => ({ ...s, category: "video" }))}
                    className="flex-1 px-3 py-2 rounded text-sm"
                    style={{
                      background: newService.category === "video" ? "var(--color-accent)" : "var(--color-surface)",
                      color: newService.category === "video" ? "var(--color-bg)" : "var(--color-text)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    Video
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-sm" style={{ color: "var(--color-text)" }}>Color</label>
                    <input
                      type="color"
                      value={newService.color}
                      onChange={(e) => setNewService((s) => ({ ...s, color: e.target.value }))}
                      className="w-full h-8 rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-sm" style={{ color: "var(--color-text)" }}>Text Color</label>
                    <input
                      type="color"
                      value={newService.textColor}
                      onChange={(e) => setNewService((s) => ({ ...s, textColor: e.target.value }))}
                      className="w-full h-8 rounded cursor-pointer"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <motion.button
                    className="flex-1 px-4 py-2 rounded text-sm"
                    style={{
                      background: "var(--color-accent)",
                      color: "var(--color-bg)",
                    }}
                    onClick={handleAddService}
                    whileTap={{ scale: 0.96 }}
                  >
                    Add Service
                  </motion.button>
                  <motion.button
                    className="px-4 py-2 rounded text-sm"
                    style={{
                      background: "var(--color-surface-raised)",
                      color: "var(--color-text)",
                      border: "1px solid var(--color-border)",
                    }}
                    onClick={() => setShowAddService(false)}
                    whileTap={{ scale: 0.96 }}
                  >
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!showAddService && (
            <motion.button
              className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm"
              style={{
                background: "var(--color-surface-raised)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              onClick={() => setShowAddService(true)}
              whileTap={{ scale: 0.96 }}
            >
              + Add Custom Service
            </motion.button>
          )}
        </section>

        <section id="danger-zone" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Danger Zone
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Removes all scanned games, movies, music, and TV shows from the
            database. Your settings and file paths will be preserved.
          </p>
          <AnimatePresence mode="wait">
            {clearConfirm ? (
              <motion.div
                key="confirm"
                className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
              >
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  Permanently delete all scanned data?
                </span>
                <div className="flex gap-2">
                  <motion.button
                    className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "#e05252",
                      color: "#fff",
                    }}
                    onClick={async () => {
                      await window.htpc.db.clear();
                      await window.htpc.app.restart();
                    }}
                    whileTap={{ scale: 0.96 }}
                  >
                    Confirm
                  </motion.button>
                  <motion.button
                    className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "var(--color-surface-raised)",
                      color: "var(--color-text)",
                      border: "1px solid var(--color-border)",
                    }}
                    onClick={() => setClearConfirm(false)}
                    whileTap={{ scale: 0.96 }}
                  >
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="clear"
                className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  background: "#ff444420",
                  color: "#ff4444",
                  border: "1px solid #ff444430",
                }}
                onClick={() => setClearConfirm(true)}
                whileTap={{ scale: 0.96 }}
              >
                Clear All Data
              </motion.button>
            )}
          </AnimatePresence>
        </section>

        <section id="plugins" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Plugins
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Drop TypeScript files or folders into{" "}
            <code
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                background: "var(--color-surface-raised)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ~/.config/htpc/plugins/
            </code>
          </p>
          <motion.button
            className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-1.5"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
            onClick={() => window.htpc.plugins.reload()}
            whileTap={{ scale: 0.96 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
            </svg>
            Reload Plugins
          </motion.button>
        </section>

        <section id="dependencies-cores" className="flex flex-col gap-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Dependencies & Cores
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Install, uninstall, and manage Libretro cores, emulators, and system dependencies.
          </p>
          
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search packages..."
                value={packageSearch}
                onChange={(e) => setPackageSearch(e.target.value)}
                className="flex-1 px-3 py-2 rounded text-sm"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  outline: "none",
                }}
              />
            </div>

            <div className="flex gap-1 flex-wrap">
              {[
                { id: "all", label: "All" },
                { id: "core", label: "Libretro Cores" },
                { id: "emulator", label: "Emulators" },
                { id: "dependency", label: "Dependencies" },
                { id: "media-codec", label: "Media Codecs" },
                { id: "other", label: "Other" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCategory(tab.id as any)}
                  className="px-3 py-1.5 rounded text-sm transition-colors"
                  style={{
                    background:
                      selectedCategory === tab.id
                        ? "var(--color-accent)"
                        : "var(--color-surface-raised)",
                    color:
                      selectedCategory === tab.id
                        ? "var(--color-bg)"
                        : "var(--color-text)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <motion.button
                className="px-3 py-2 rounded text-sm flex items-center gap-1.5"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onClick={loadPackages}
                whileTap={{ scale: 0.96 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                </svg>
                Refresh
              </motion.button>
            </div>

            <div
              className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto rounded p-2"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              {filteredPackages.length === 0 ? (
                <p
                  className="text-sm text-center py-4"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  No packages found matching your search.
                </p>
              ) : (
                filteredPackages.map((pkg) => {
                  const progress = operationProgress.get(pkg.id);
                  const isOp = progress?.status === "running" || progress?.status === "pending";
                  return (
                    <div
                      key={pkg.id}
                      className="flex flex-col gap-2 p-3 rounded"
                      style={{
                        background: "var(--color-surface-raised)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-sm font-medium"
                              style={{ color: "var(--color-text)" }}
                            >
                              {pkg.displayName}
                            </span>
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: pkg.isInstalled
                                  ? "#4caf5020"
                                  : "var(--color-surface)",
                                color: pkg.isInstalled
                                  ? "#4caf50"
                                  : "var(--color-text-dim)",
                                border: pkg.isInstalled
                                  ? "1px solid #4caf5040"
                                  : "1px solid var(--color-border)",
                              }}
                            >
                              {pkg.manager.toUpperCase()}
                            </span>
                            {pkg.category !== "dependency" && pkg.platforms && pkg.platforms.length > 0 && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{
                                  background: "var(--color-surface)",
                                  color: "var(--color-text-dim)",
                                  border: "1px solid var(--color-border)",
                                }}
                              >
                                {pkg.platforms.join(", ")}
                              </span>
                            )}
                          </div>
                          <p
                            className="text-xs mt-1"
                            style={{ color: "var(--color-text-dim)" }}
                          >
                            {pkg.description || pkg.name}
                          </p>
                          {pkg.installedVersion && (
                            <p
                              className="text-xs mt-0.5"
                              style={{ color: "var(--color-text-dim)" }}
                            >
                              Installed: {pkg.installedVersion}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="p-1.5 rounded"
                            style={{
                              background: pkg.isPinned
                                ? "var(--color-accent)20"
                                : "var(--color-surface)",
                              color: pkg.isPinned
                                ? "var(--color-accent)"
                                : "var(--color-text-dim)",
                              border: "1px solid var(--color-border)",
                            }}
                            onClick={() => handleTogglePin(pkg)}
                            title={pkg.isPinned ? "Unpin" : "Pin"}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="17" x2="12" y2="22" />
                              <path d="M5 17h14v-5a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v5z" />
                              <path d="M12 9V2l-2 2" />
                            </svg>
                          </button>
                          <button
                            className="p-1.5 rounded"
                            style={{
                              background: pkg.autoUpdate
                                ? "var(--color-accent)20"
                                : "var(--color-surface)",
                              color: pkg.autoUpdate
                                ? "var(--color-accent)"
                                : "var(--color-text-dim)",
                              border: "1px solid var(--color-border)",
                            }}
                            onClick={() => handleToggleAutoUpdate(pkg)}
                            title={pkg.autoUpdate ? "Disable auto-update" : "Enable auto-update"}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                            </svg>
                          </button>
                          {pkg.isInstalled ? (
                            <motion.button
                              className="px-3 py-1.5 rounded text-xs font-medium"
                              style={{
                                background: "#ff444415",
                                color: "#ff4444",
                                border: "1px solid #ff444430",
                                opacity: isOp ? 0.5 : 1,
                                cursor: isOp ? "not-allowed" : "pointer",
                              }}
                              onClick={() => !isOp && handleUninstallPackage(pkg.id)}
                              whileTap={{ scale: isOp ? 1 : 0.96 }}
                            >
                              {isOp ? "Removing..." : "Uninstall"}
                            </motion.button>
                          ) : (
                            <motion.button
                              className="px-3 py-1.5 rounded text-xs font-medium"
                              style={{
                                background: "var(--color-accent)15",
                                color: "var(--color-accent)",
                                border: "1px solid var(--color-accent)40",
                                opacity: isOp ? 0.5 : 1,
                                cursor: isOp ? "not-allowed" : "pointer",
                              }}
                              onClick={() => !isOp && handleInstallPackage(pkg)}
                              whileTap={{ scale: isOp ? 1 : 0.96 }}
                            >
                              {isOp ? "Installing..." : "Install"}
                            </motion.button>
                          )}
                        </div>
                      </div>
                      {progress && progress.status !== "success" && (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span
                              className="text-xs"
                              style={{ color: "var(--color-text-dim)" }}
                            >
                              {progress.message}
                            </span>
                            {progress.percent !== undefined && (
                              <span
                                className="text-xs"
                                style={{ color: "var(--color-text-dim)" }}
                              >
                                {progress.percent}%
                              </span>
                            )}
                          </div>
                          {progress.percent !== undefined && (
                            <div
                              className="h-1 rounded"
                              style={{
                                background: "var(--color-surface)",
                                border: "1px solid var(--color-border)",
                              }}
                            >
                              <div
                                className="h-full rounded transition-all"
                                style={{
                                  width: `${progress.percent}%`,
                                  background:
                                    progress.status === "error"
                                      ? "#ff4444"
                                      : "var(--color-accent)",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
      <aside className="hidden lg:block w-48 flex-shrink-0">
        <div className="sticky top-6">
          <SettingsTOC />
        </div>
      </aside>
    </div>

    {/* APT Password Modal */}
      <AnimatePresence>
        {showAptPassword && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{
              background: "rgba(0, 0, 0, 0.7)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAptPassword(false)}
          >
            <motion.div
              className="p-6 rounded-lg max-w-md w-full"
              style={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
              }}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                className="text-lg font-semibold mb-4"
                style={{ color: "var(--color-text)" }}
              >
                APT Password Required
              </h3>
              <p
                className="text-sm mb-4"
                style={{ color: "var(--color-text-dim)" }}
              >
                Installing system packages requires sudo privileges. Enter your password to continue.
              </p>
              <input
                type="password"
                value={aptPassword}
                onChange={(e) => setAptPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAptPasswordSubmit();
                }}
                placeholder="Enter password..."
                className="w-full px-3 py-2 rounded text-sm mb-4"
                style={{
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  outline: "none",
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <motion.button
                  className="px-4 py-2 rounded text-sm"
                  style={{
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                  }}
                  onClick={() => setShowAptPassword(false)}
                  whileTap={{ scale: 0.96 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  className="px-4 py-2 rounded text-sm"
                  style={{
                    background: "var(--color-accent)",
                    color: "var(--color-bg)",
                  }}
                  onClick={handleAptPasswordSubmit}
                  whileTap={{ scale: 0.96 }}
                >
                  Continue
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
