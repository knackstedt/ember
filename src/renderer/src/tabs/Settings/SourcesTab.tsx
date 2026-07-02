import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Globe,
  Play,
  Square,
  RefreshCw,
  Shield,
  KeyRound,
  Timer,
  Wifi,
  Lock,
  FolderCheck,
  AlertTriangle,
  Film,
  Music,
  Gamepad2,
  Link,
  X,
} from "lucide-react";
import { useSettingsStore } from "../../store/settings.store";
import { PathList, Toggle, Field } from "./shared";
import {
  SCAN_SOURCE_LABELS,
  ScanSourceId,
} from "../../../../shared/scan-sources";
import { RemoteSource, CredentialMode, StreamingService } from "@shared/types";

const MODE_ICONS: Record<CredentialMode, typeof Shield> = {
  "auto-key": Shield,
  "user-password": KeyRound,
  "session-only": Timer,
};

const MODE_LABELS: Record<CredentialMode, string> = {
  "auto-key": "Auto Key",
  "user-password": "Master Password",
  "session-only": "Session Only",
};

const PROTOCOL_LABELS: Record<string, string> = {
  sftp: "SFTP",
  ftp: "FTP",
  smb: "SMB/CIFS",
  webdav: "WebDAV",
  http: "HTTP",
  googledrive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
};

export const SourcesTab: React.FC = () => {
  const { settings, update } = useSettingsStore();

  /* ── Local Data state ── */
  const [xdgDefaults, setXdgDefaults] = useState<{
    videosDir: string;
    musicDir: string;
    roms: string[];
    steam: string[];
    heroic: string[];
    lutris: string[];
    desktop: string[];
    retroarch: string[];
    bottles: string[];
    itch: string[];
    kodi: string[];
    jellyfin: string[];
    plex: string[];
    mounts: string[];
  } | null>(null);
  const [sourceCounts, setSourceCounts] = useState<Record<ScanSourceId, number>>({
    steam: 0,
    heroic: 0,
    lutris: 0,
    desktop: 0,
    dolphin: 0,
    rom: 0,
    flash: 0,
    v86: 0,
    windows: 0,
    itch: 0,
  });
  const [clearing, setClearing] = useState<Record<ScanSourceId, boolean>>({
    steam: false,
    heroic: false,
    lutris: false,
    desktop: false,
    dolphin: false,
    rom: false,
    flash: false,
    v86: false,
    windows: false,
    itch: false,
  });

  /* ── Remote Sources state ── */
  const [remoteSources, setRemoteSources] = useState<RemoteSource[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [showAddRemote, setShowAddRemote] = useState(false);
  const [servingIds, setServingIds] = useState<Set<string>>(new Set());
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [deletingMissing, setDeletingMissing] = useState<Record<string, boolean>>({});
  const [rcloneAvailable, setRcloneAvailable] = useState<boolean | null>(null);

  /* ── Data Feed state ── */
  const [streamingServices, setStreamingServices] = useState<StreamingService[]>([]);
  const [showAddService, setShowAddService] = useState(false);
  const [newService, setNewService] = useState({
    name: "",
    url: "",
    category: "music" as "music" | "video",
    color: "#1DB954",
    textColor: "#ffffff",
    icon: "",
  });

  /* ── Local Data effects ── */
  useEffect(() => {
    window.htpc.app
      .getXdgDefaults()
      .then((data) => setXdgDefaults(data))
      .catch((err) => console.error("Failed to get xdgDefaults:", err));
  }, []);

  const loadSourceCounts = async () => {
    const disabled = settings?.disabledScanSources ?? [];
    const next: Record<ScanSourceId, number> = { ...sourceCounts };
    await Promise.all(
      disabled.map(async (source) => {
        try {
          next[source] = await window.htpc.games.countBySource(source);
        } catch (err) {
          console.error(`Failed to count games for ${source}:`, err);
          next[source] = 0;
        }
      })
    );
    setSourceCounts(next);
  };

  useEffect(() => {
    if (!settings) return;
    void loadSourceCounts();
  }, [settings?.disabledScanSources?.join(",")]);

  const toggleSource = (source: ScanSourceId, enabled: boolean) => {
    const current = new Set(settings?.disabledScanSources ?? []);
    if (enabled) {
      current.delete(source);
    } else {
      current.add(source);
    }
    update({ disabledScanSources: Array.from(current) as ScanSourceId[] });
  };

  const handleClearSource = async (source: ScanSourceId) => {
    setClearing((prev) => ({ ...prev, [source]: true }));
    try {
      const count = await window.htpc.games.deleteBySource(source);
      setSourceCounts((prev) => ({ ...prev, [source]: 0 }));
      alert(`Cleared ${count} games from ${SCAN_SOURCE_LABELS[source]}.`);
    } catch (err) {
      console.error(`Failed to clear games for ${source}:`, err);
      alert(`Failed to clear games from ${SCAN_SOURCE_LABELS[source]}.`);
    } finally {
      setClearing((prev) => ({ ...prev, [source]: false }));
    }
  };

  /* ── Remote Sources effects ── */
  const loadRemoteSources = async () => {
    setRemoteLoading(true);
    try {
      const list = await window.htpc.rclone.list();
      setRemoteSources(list);
      const ports = await window.htpc.rclone.getAllServePorts();
      setServingIds(new Set(Object.keys(ports)));
    } catch (err) {
      console.error("Failed to load remotes:", err);
    } finally {
      setRemoteLoading(false);
    }
  };

  useEffect(() => {
    loadRemoteSources();
    window.htpc.rclone.available()
      .then(setRcloneAvailable)
      .catch(() => setRcloneAvailable(false));
  }, []);

  const handleRemoveRemote = async (id: string) => {
    try {
      await window.htpc.rclone.remove(id);
      await loadRemoteSources();
    } catch (err) {
      console.error("Failed to remove remote:", err);
    }
  };

  const handleToggleServe = async (source: RemoteSource) => {
    try {
      if (servingIds.has(source.id)) {
        await window.htpc.rclone.stopServe(source.id);
        setServingIds((prev) => {
          const next = new Set(prev);
          next.delete(source.id);
          return next;
        });
      } else {
        await window.htpc.rclone.startServe(source);
        setServingIds((prev) => new Set(prev).add(source.id));
      }
    } catch (err) {
      console.error("Failed to toggle serve:", err);
      alert(String(err));
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const devices = await window.htpc.network.discover();
      if (devices.length === 0) {
        alert("No devices discovered on the network.");
      } else {
        setShowAddRemote(true);
      }
    } catch (err) {
      console.error("Discovery failed:", err);
      alert("Network discovery failed.");
    } finally {
      setDiscovering(false);
    }
  };

  const handleCheckAvailability = async () => {
    setCheckingMissing(true);
    try {
      await window.htpc.remote.checkAvailability();
      alert("Availability check complete. Missing items have been marked.");
    } catch (err) {
      console.error("Availability check failed:", err);
      alert("Availability check failed.");
    } finally {
      setCheckingMissing(false);
    }
  };

  const handleDeleteMissing = async (type: "movie" | "music" | "game") => {
    setDeletingMissing((prev) => ({ ...prev, [type]: true }));
    try {
      const count = await window.htpc.remote.deleteMissing(type);
      alert(`Deleted ${count} missing ${type} entries.`);
    } catch (err) {
      console.error(`Failed to delete missing ${type}:`, err);
      alert(`Failed to delete missing ${type} entries.`);
    } finally {
      setDeletingMissing((prev) => ({ ...prev, [type]: false }));
    }
  };

  /* ── Data Feed effects ── */
  useEffect(() => {
    window.htpc.streaming.list()
      .then(setStreamingServices)
      .catch(() => {});
  }, []);

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
      icon: "",
    });
    setShowAddService(false);
    refreshServices();
  };

  const handleDeleteService = async (id: string) => {
    await window.htpc.streaming.delete(id);
    refreshServices();
  };

  if (!settings) return null;

  const allSources = Object.keys(SCAN_SOURCE_LABELS) as ScanSourceId[];
  const disabledSet = new Set(settings.disabledScanSources ?? []);

  return (
    <div className="flex flex-col gap-8">
      {/* ── Media Directories ── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Media Directories
        </h2>
        <PathList
          label="Movie Paths"
          paths={settings.moviePaths ?? []}
          onChange={(p) => update({ moviePaths: p })}
          placeholder={xdgDefaults?.videosDir}
          hint={xdgDefaults?.videosDir}
        />
        <PathList
          label="Music Paths"
          paths={settings.musicPaths ?? []}
          onChange={(p) => update({ musicPaths: p })}
          placeholder={xdgDefaults?.musicDir}
          hint={xdgDefaults?.musicDir}
        />
        <PathList
          label="ROM Paths"
          paths={settings.romPaths ?? []}
          onChange={(p) => update({ romPaths: p })}
        />
        <PathList
          label="Game Paths"
          paths={settings.gamePaths ?? []}
          onChange={(p) => update({ gamePaths: p })}
        />
        {xdgDefaults && (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong className="block mb-1">Auto-discovered game sources</strong>
            <div className="flex flex-col gap-2 mt-2">
              {xdgDefaults.steam.length > 0 && (
                <div>
                  <strong className="block">Steam</strong>
                  {xdgDefaults.steam.join(", ")}
                </div>
              )}
              {xdgDefaults.heroic.length > 0 && (
                <div>
                  <strong className="block">Heroic</strong>
                  {xdgDefaults.heroic.join(", ")}
                </div>
              )}
              {xdgDefaults.lutris.length > 0 && (
                <div>
                  <strong className="block">Lutris</strong>
                  {xdgDefaults.lutris.join(", ")}
                </div>
              )}
              {xdgDefaults.desktop.length > 0 && (
                <div>
                  <strong className="block">Desktop</strong>
                  {xdgDefaults.desktop.join(", ")}
                </div>
              )}
              {xdgDefaults.bottles.length > 0 && (
                <div>
                  <strong className="block">Bottles</strong>
                  {xdgDefaults.bottles.join(", ")}
                </div>
              )}
              {xdgDefaults.itch.length > 0 && (
                <div>
                  <strong className="block">Itch.io</strong>
                  {xdgDefaults.itch.join(", ")}
                </div>
              )}
            </div>
          </div>
        )}
        {xdgDefaults && (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong className="block mb-1">Media Servers</strong>
            <div className="flex flex-col gap-2 mt-2">
              {xdgDefaults.kodi.length > 0 && (
                <div>
                  <strong className="block">Kodi</strong>
                  {xdgDefaults.kodi.join(", ")}
                </div>
              )}
              {xdgDefaults.jellyfin.length > 0 && (
                <div>
                  <strong className="block">Jellyfin</strong>
                  {xdgDefaults.jellyfin.join(", ")}
                </div>
              )}
              {xdgDefaults.plex.length > 0 && (
                <div>
                  <strong className="block">Plex</strong>
                  {xdgDefaults.plex.join(", ")}
                </div>
              )}
            </div>
          </div>
        )}
        {xdgDefaults?.mounts && xdgDefaults.mounts.length > 0 && (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong className="block mb-1">Mounts</strong>
            {xdgDefaults.mounts.join(", ")}
          </div>
        )}
      </section>

      {/* ── Scan Sources ── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Scan Sources
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Disable sources you don't want to include in game scans. Disabling a source leaves existing games in the library until you clear them.
        </p>
        <div className="pl-1">
          <Toggle
            label="Auto-create .desktop entries"
            description="Automatically create Linux desktop entries for newly discovered games"
            value={settings.autoCreateDesktopEntries ?? false}
            onChange={(v) => update({ autoCreateDesktopEntries: v })}
          />
        </div>
        <div className="flex flex-col gap-3 pl-1">
          {allSources.map((source) => {
            const enabled = !disabledSet.has(source);
            const count = sourceCounts[source];
            return (
              <div key={source} className="flex flex-col gap-1">
                <Toggle
                  label={SCAN_SOURCE_LABELS[source]}
                  value={enabled}
                  onChange={(v) => toggleSource(source, v)}
                />
                {!enabled && count > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {count} game{count === 1 ? "" : "s"} previously scanned
                    </span>
                    <motion.button
                      className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium flex items-center gap-1.5 flex-shrink-0"
                      style={{
                        background: "#ff444420",
                        color: "#ff4444",
                        border: "1px solid #ff444430",
                      }}
                      onClick={() => handleClearSource(source)}
                      whileTap={{ scale: 0.96 }}
                      disabled={clearing[source]}
                    >
                      {clearing[source] ? (
                        <span>Clearing…</span>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          Clear {count} game{count === 1 ? "" : "s"}
                        </>
                      )}
                    </motion.button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Remote Sources ── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Remote Sources
          </h2>
          <div className="flex gap-2">
            <motion.button
              className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium flex items-center gap-1.5"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={handleDiscover}
              whileTap={{ scale: 0.96 }}
              disabled={discovering}
            >
              {discovering ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />}
              {discovering ? "Discovering…" : "Discover Network"}
            </motion.button>
            <motion.button
              className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium"
              style={{
                background: "var(--accent)",
                color: "var(--surface-base)",
              }}
              onClick={() => setShowAddRemote(true)}
              whileTap={{ scale: 0.96 }}
            >
              + Add Source
            </motion.button>
          </div>
        </div>

        {rcloneAvailable === false && (
          <div
            className="flex items-center gap-2 p-3 rounded-[var(--radius-card)] text-sm"
            style={{
              background: "#3a1515",
              color: "#ff9999",
              border: "1px solid #ff444430",
            }}
          >
            <AlertTriangle size={16} />
            <span>rclone is not available. Remote sources require the rclone binary (bundled or in PATH).</span>
          </div>
        )}

        {remoteLoading ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading remote sources…
          </div>
        ) : remoteSources.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 py-8"
            style={{ color: "var(--text-secondary)" }}
          >
            <Globe size={32} />
            <p className="text-sm">No remote sources configured.</p>
            <motion.button
              className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium"
              style={{
                background: "var(--accent)",
                color: "var(--surface-base)",
              }}
              onClick={() => setShowAddRemote(true)}
              whileTap={{ scale: 0.96 }}
            >
              Add your first remote source
            </motion.button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {remoteSources.map((source) => {
              const ModeIcon = MODE_ICONS[source.credentialMode];
              const isServing = servingIds.has(source.id);
              return (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-3 rounded-[var(--radius-card)]"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {source.name}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[12px] font-medium"
                        style={{
                          background: "var(--accent)",
                          color: "var(--surface-base)",
                        }}
                      >
                        {PROTOCOL_LABELS[source.protocol] ?? source.protocol}
                      </span>
                      <span
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px]"
                        style={{ color: "var(--text-secondary)", background: "var(--surface-0)" }}
                        title={MODE_LABELS[source.credentialMode]}
                      >
                        <ModeIcon size={10} />
                        {MODE_LABELS[source.credentialMode]}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {source.host}
                      {source.port ? `:${source.port}` : ""}
                      {source.remotePath}
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      {source.mediaTypes.map((t) => (
                        <span
                          key={t}
                          className="px-1 py-0.5 rounded text-[12px]"
                          style={{
                            background: "var(--surface-0)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.button
                      className="p-1.5 rounded"
                      style={{
                        background: isServing ? "var(--accent)" : "var(--surface-0)",
                        color: isServing ? "var(--surface-base)" : "var(--text-secondary)",
                      }}
                      onClick={() => handleToggleServe(source)}
                      whileTap={{ scale: 0.9 }}
                      title={isServing ? "Stop serving" : "Start serving"}
                    >
                      {isServing ? <Square size={14} /> : <Play size={14} />}
                    </motion.button>
                    <motion.button
                      className="p-1.5 rounded"
                      style={{
                        background: "var(--surface-0)",
                        color: "var(--text-secondary)",
                      }}
                      onClick={() => handleRemoveRemote(source.id)}
                      whileTap={{ scale: 0.9 }}
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </motion.button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Remote File Availability ── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Remote File Availability
        </h2>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          An automatic worker checks every 5 minutes whether remote files still exist and marks missing ones.
        </p>
        <div className="flex flex-wrap gap-2">
          <motion.button
            className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium flex items-center gap-1.5"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
            onClick={handleCheckAvailability}
            whileTap={{ scale: 0.96 }}
            disabled={checkingMissing}
          >
            {checkingMissing ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
            {checkingMissing ? "Checking…" : "Check Now"}
          </motion.button>
        </div>
        <div className="flex flex-col gap-2 mt-2">
          <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Delete entries marked as missing:
          </p>
          <div className="flex flex-wrap gap-2">
            <DeleteMissingButton
              label="Movies"
              type="movie"
              icon={<Film size={14} />}
              deleting={deletingMissing["movie"]}
              onClick={() => handleDeleteMissing("movie")}
            />
            <DeleteMissingButton
              label="Music"
              type="music"
              icon={<Music size={14} />}
              deleting={deletingMissing["music"]}
              onClick={() => handleDeleteMissing("music")}
            />
            <DeleteMissingButton
              label="Games"
              type="game"
              icon={<Gamepad2 size={14} />}
              deleting={deletingMissing["game"]}
              onClick={() => handleDeleteMissing("game")}
            />
          </div>
        </div>
      </section>

      {/* ── API Keys ── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          API Keys
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
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

      {/* ── Streaming Services ── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Streaming Services
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Manage which streaming services appear in the Streaming tab. Services are grouped into Music and Videos sections.
        </p>

        <div className="flex flex-col gap-2">
          {streamingServices.map((svc) => (
            <div
              key={svc.id}
              className="flex items-center gap-3 px-3 py-2 rounded"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
              }}
            >
              {svc.icon ? <span className="text-lg">{svc.icon}</span> : <Link size={20} />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {svc.name}
                </div>
                <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  {svc.category} · {svc.url}
                </div>
              </div>
              <button
                onClick={() => toggleServiceEnabled(svc.id, !svc.enabled)}
                className="w-11 h-6 rounded-full transition-colors relative flex-shrink-0"
                style={{
                  background: svc.enabled
                    ? "var(--accent)"
                    : "var(--surface-0)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                  style={{
                    background: "white",
                    left: svc.enabled ? "1.25rem" : "0.125rem",
                  }}
                />
              </button>
              {svc.id.startsWith("custom_") && (
                <button
                  onClick={() => handleDeleteService(svc.id)}
                  className="px-2 py-1 text-xs rounded flex-shrink-0"
                  style={{
                    background: "#ff444420",
                    color: "#ff4444",
                    border: "1px solid #ff444430",
                  }}
                >
                  <X size={14} />
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
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
              }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Add Custom Service
              </h3>
              <Field
                label="Name"
                value={newService.name}
                onChange={(v) => setNewService((s) => ({ ...s, name: v }))}
                placeholder="My Service"
              />
              <Field
                label="URL"
                value={newService.url}
                onChange={(v) => setNewService((s) => ({ ...s, url: v }))}
                placeholder="https://..."
              />
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                  Category
                </label>
                <select
                  value={newService.category}
                  onChange={(e) =>
                    setNewService((s) => ({
                      ...s,
                      category: e.target.value as "music" | "video",
                    }))
                  }
                  className="w-full text-sm px-2 py-1.5 rounded"
                  style={{
                    background: "var(--surface-0)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                >
                  <option value="music">Music</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div className="flex gap-2">
                <motion.button
                  className="px-4 py-2 rounded text-sm"
                  style={{
                    background: "var(--accent)",
                    color: "var(--surface-base)",
                  }}
                  onClick={handleAddService}
                  whileTap={{ scale: 0.96 }}
                >
                  Add
                </motion.button>
                <motion.button
                  className="px-4 py-2 rounded text-sm"
                  style={{
                    background: "var(--surface-0)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
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
              background: "var(--surface-1)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
            onClick={() => setShowAddService(true)}
            whileTap={{ scale: 0.96 }}
          >
            + Add Custom Service
          </motion.button>
        )}
      </section>

      {showAddRemote && (
        <AddRemoteSourceModal onClose={() => setShowAddRemote(false)} onAdded={loadRemoteSources} />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Add Remote Source Modal                                            */
/* ------------------------------------------------------------------ */

interface AddRemoteSourceModalProps {
  onClose: () => void;
  onAdded: () => void;
}

const PROTOCOLS: { value: RemoteSource["protocol"]; label: string }[] = [
  { value: "sftp", label: "SFTP" },
  { value: "ftp", label: "FTP" },
  { value: "smb", label: "SMB/CIFS" },
  { value: "webdav", label: "WebDAV" },
  { value: "http", label: "HTTP" },
  { value: "googledrive", label: "Google Drive" },
  { value: "dropbox", label: "Dropbox" },
  { value: "onedrive", label: "OneDrive" },
];

const CREDENTIAL_MODES: { value: CredentialMode; label: string; description: string }[] = [
  {
    value: "auto-key",
    label: "Auto Key",
    description: "Encrypt credentials using your OS keyring. No prompts required.",
  },
  {
    value: "user-password",
    label: "Master Password",
    description: "Encrypt with a password you provide on each launch.",
  },
  {
    value: "session-only",
    label: "Session Only",
    description: "Do not persist credentials. You'll re-enter them each launch.",
  },
];

const AddRemoteSourceModal: React.FC<AddRemoteSourceModalProps> = ({ onClose, onAdded }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState<RemoteSource["protocol"]>("sftp");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [remotePath, setRemotePath] = useState("/");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [credentialMode, setCredentialMode] = useState<CredentialMode>("auto-key");
  const [mediaTypes, setMediaTypes] = useState<RemoteSource["mediaTypes"]>(["movie"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [testResults, setTestResults] = useState<{
    connection?: { success: boolean; message: string };
    credentials?: { success: boolean; message: string };
    path?: { success: boolean; message: string };
  }>({});
  const [testing, setTesting] = useState<string | null>(null);

  const isCloud = ["googledrive", "dropbox", "onedrive"].includes(protocol);

  const buildSource = (): RemoteSource => ({
    id: "preview",
    name,
    protocol,
    host: isCloud ? undefined : host,
    port: isCloud ? undefined : port ? parseInt(port, 10) : undefined,
    remotePath,
    mediaTypes,
    enabled: true,
    credentialMode,
  });

  const handleAdd = async () => {
    setLoading(true);
    setError("");
    try {
      await window.htpc.rclone.add(
        {
          name,
          protocol,
          host: isCloud ? undefined : host,
          port: isCloud ? undefined : port ? parseInt(port, 10) : undefined,
          remotePath,
          mediaTypes,
          enabled: true,
          credentialMode,
        },
        { user, password },
      );
      onAdded();
      onClose();
      for (const type of mediaTypes) {
        if (type === "movie") void window.htpc.movies.scan();
        if (type === "music") void window.htpc.music.scan();
        if (type === "rom") void window.htpc.games.scan();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const runTest = async (type: "connection" | "credentials" | "path") => {
    setTesting(type);
    try {
      const source = buildSource();
      if (type === "credentials" || type === "path") {
        await window.htpc.rclone.update(source, { user, password });
      }
      let result: { success: boolean; message: string };
      if (type === "connection") {
        result = await window.htpc.rclone.testConnection(source);
      } else if (type === "credentials") {
        result = await window.htpc.rclone.testCredentials(source);
      } else {
        result = await window.htpc.rclone.testPath(source);
      }
      setTestResults((prev) => ({ ...prev, [type]: result }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [type]: { success: false, message: String(err) } }));
    } finally {
      setTesting(null);
    }
  };

  const steps = [
    { id: 1, label: "Details" },
    { id: 2, label: "Auth" },
    { id: 3, label: "Media" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="w-full max-w-lg rounded-[var(--radius-card)] flex flex-col gap-4 p-6"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Add Remote Source
        </h3>

        <div className="flex items-center gap-2">
          {steps.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full"
              style={{
                background: step === s.id ? "var(--accent)" : "var(--surface-0)",
                color: step === s.id ? "var(--surface-base)" : "var(--text-secondary)",
              }}
            >
              {s.id}. {s.label}
            </div>
          ))}
        </div>

        {error && (
          <div className="text-sm p-2 rounded" style={{ background: "#3a1515", color: "#ff9999" }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My NAS"
                className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Protocol
              </span>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as RemoteSource["protocol"])}
                className="px-3 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  backgroundColor: "var(--surface-0)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {PROTOCOLS.map((p) => (
                  <option
                    key={p.value}
                    value={p.value}
                    style={{ backgroundColor: "var(--surface-0)", color: "var(--text-primary)" }}
                  >
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            {!isCloud && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Host
                  </span>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.5 or nas.local"
                    className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                    style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Port (optional)
                  </span>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="22"
                    className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                    style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  />
                </label>
              </>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Remote Path
              </span>
              <input
                type="text"
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                placeholder="/media/movies"
                className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            {!isCloud && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Username (optional)
                  </span>
                  <input
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                    style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Password (optional)
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                    style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  />
                </label>
              </>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Credential Storage
              </span>
              {CREDENTIAL_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className="flex items-start gap-2 p-2 rounded-[var(--radius-card)] cursor-pointer"
                  style={{ border: "1px solid var(--border-default)" }}
                >
                  <input
                    type="radio"
                    name="credentialMode"
                    value={mode.value}
                    checked={credentialMode === mode.value}
                    onChange={() => setCredentialMode(mode.value)}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {mode.label}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {mode.description}
                    </span>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Verify Setup
              </span>
              <div className="flex flex-col gap-2">
                <TestButton
                  label="Test Connection"
                  icon={<Wifi size={14} />}
                  result={testResults.connection}
                  testing={testing === "connection"}
                  onClick={() => runTest("connection")}
                  disabled={!host && !isCloud}
                />
                <TestButton
                  label="Test Credentials"
                  icon={<Lock size={14} />}
                  result={testResults.credentials}
                  testing={testing === "credentials"}
                  onClick={() => runTest("credentials")}
                  disabled={!isCloud && !user && !password}
                />
                <TestButton
                  label="Test Path"
                  icon={<FolderCheck size={14} />}
                  result={testResults.path}
                  testing={testing === "path"}
                  onClick={() => runTest("path")}
                  disabled={false}
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Media Types
            </span>
            <div className="flex gap-2">
              {(["movie", "music", "rom"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    if (mediaTypes.includes(t)) {
                      setMediaTypes((prev) => prev.filter((x) => x !== t));
                    } else {
                      setMediaTypes((prev) => [...prev, t]);
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius-card)] cursor-pointer text-xs"
                  style={{
                    background: mediaTypes.includes(t) ? "var(--accent)" : "var(--surface-0)",
                    color: mediaTypes.includes(t) ? "var(--surface-base)" : "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between mt-2">
          <motion.button
            className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium"
            style={{
              background: "var(--surface-0)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
            onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}
            whileTap={{ scale: 0.96 }}
            disabled={loading}
          >
            {step === 1 ? "Cancel" : "Back"}
          </motion.button>
          <motion.button
            className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium"
            style={{
              background: "var(--accent)",
              color: "var(--surface-base)",
            }}
            onClick={step < 3 ? () => setStep((s) => s + 1) : handleAdd}
            whileTap={{ scale: 0.96 }}
            disabled={loading || !name.trim()}
          >
            {loading ? "Saving…" : step < 3 ? "Next" : "Add Source"}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Helper Components                                                  */
/* ------------------------------------------------------------------ */

interface DeleteMissingButtonProps {
  label: string;
  type: string;
  icon: React.ReactNode;
  deleting: boolean;
  onClick: () => void;
}

const DeleteMissingButton: React.FC<DeleteMissingButtonProps> = ({ label, icon, deleting, onClick }) => {
  return (
    <motion.button
      className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-card)] text-xs font-medium"
      style={{
        background: "var(--surface-0)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-default)",
      }}
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      disabled={deleting}
    >
      {deleting ? <RefreshCw size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
      {deleting ? "Deleting…" : `Delete Missing ${label}`}
    </motion.button>
  );
};

interface TestButtonProps {
  label: string;
  icon: React.ReactNode;
  result?: { success: boolean; message: string };
  testing: boolean;
  onClick: () => void;
  disabled: boolean;
}

const TestButton: React.FC<TestButtonProps> = ({ label, icon, result, testing, onClick, disabled }) => {
  return (
    <div className="flex flex-col gap-1">
      <motion.button
        className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-card)] text-xs font-medium"
        style={{
          background: result
            ? result.success
              ? "#1a3a1a"
              : "#3a1515"
            : "var(--surface-0)",
          color: result
            ? result.success
              ? "#99ff99"
              : "#ff9999"
            : "var(--text-primary)",
          border: "1px solid var(--border-default)",
          opacity: disabled ? 0.5 : 1,
        }}
        onClick={onClick}
        whileTap={{ scale: 0.96 }}
        disabled={disabled || testing}
      >
        {testing ? <RefreshCw size={14} className="animate-spin" /> : icon}
        {testing ? "Testing…" : label}
      </motion.button>
      {result && (
        <span
          className="text-xs px-3"
          style={{ color: result.success ? "#99ff99" : "#ff9999" }}
        >
          {result.message}
        </span>
      )}
    </div>
  );
};
