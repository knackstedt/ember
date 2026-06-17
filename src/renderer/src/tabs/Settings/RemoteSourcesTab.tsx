import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Globe, Trash2, Play, Square, RefreshCw, Shield, KeyRound, Timer, Wifi, Lock, FolderCheck, AlertTriangle, Film, Music, Gamepad2 } from "lucide-react";
import { RemoteSource, CredentialMode } from "../../../shared/types";

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

export const RemoteSourcesTab: React.FC = () => {
  const [sources, setSources] = useState<RemoteSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [servingIds, setServingIds] = useState<Set<string>>(new Set());
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [deletingMissing, setDeletingMissing] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const list = await window.htpc.rclone.list();
      setSources(list);
      // Refresh serve status
      const ports = await window.htpc.rclone.getAllServePorts();
      setServingIds(new Set(Object.keys(ports)));
    } catch (err) {
      console.error("Failed to load remotes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRemove = async (id: string) => {
    try {
      await window.htpc.rclone.remove(id);
      await load();
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
      console.log("Discovered devices:", devices);
      if (devices.length === 0) {
        alert("No devices discovered on the network.");
      } else {
        setShowAddModal(true);
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

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Remote Sources
          </h2>
          <div className="flex gap-2">
            <motion.button
              className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium flex items-center gap-1.5"
              style={{
                background: "var(--color-surface-raised)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
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
                background: "var(--color-accent)",
                color: "var(--color-bg)",
              }}
              onClick={() => setShowAddModal(true)}
              whileTap={{ scale: 0.96 }}
            >
              + Add Source
            </motion.button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Loading remote sources…
          </div>
        ) : sources.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 py-8"
            style={{ color: "var(--color-text-dim)" }}
          >
            <Globe size={32} />
            <p className="text-sm">No remote sources configured.</p>
            <motion.button
              className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
              }}
              onClick={() => setShowAddModal(true)}
              whileTap={{ scale: 0.96 }}
            >
              Add your first remote source
            </motion.button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sources.map((source) => {
              const ModeIcon = MODE_ICONS[source.credentialMode];
              const isServing = servingIds.has(source.id);
              return (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-3 rounded-[var(--radius-card)]"
                  style={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {source.name}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          background: "var(--color-accent)",
                          color: "var(--color-bg)",
                        }}
                      >
                        {PROTOCOL_LABELS[source.protocol] ?? source.protocol}
                      </span>
                      <span
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                        style={{ color: "var(--color-text-dim)", background: "var(--color-surface)" }}
                        title={MODE_LABELS[source.credentialMode]}
                      >
                        <ModeIcon size={10} />
                        {MODE_LABELS[source.credentialMode]}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                      {source.host}
                      {source.port ? `:${source.port}` : ""}
                      {source.remotePath}
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      {source.mediaTypes.map((t) => (
                        <span
                          key={t}
                          className="px-1 py-0.5 rounded text-[10px]"
                          style={{
                            background: "var(--color-surface)",
                            color: "var(--color-text-dim)",
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
                        background: isServing ? "var(--color-accent)" : "var(--color-surface)",
                        color: isServing ? "var(--color-bg)" : "var(--color-text-dim)",
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
                        background: "var(--color-surface)",
                        color: "var(--color-text-dim)",
                      }}
                      onClick={() => handleRemove(source.id)}
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

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Remote File Availability
        </h2>
        <p className="text-xs" style={{ color: "var(--color-text-dim)" }}>
          An automatic worker checks every 5 minutes whether remote files still exist and marks missing ones.
        </p>
        <div className="flex flex-wrap gap-2">
          <motion.button
            className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium flex items-center gap-1.5"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
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
          <p className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
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

      {showAddModal && (
        <AddRemoteSourceModal onClose={() => setShowAddModal(false)} onAdded={load} />
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
      // Trigger background scans for the source's media types
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
      // For credential tests, pass credentials explicitly
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
          background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border)",
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <h3 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Add Remote Source
        </h3>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {steps.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full"
              style={{
                background: step === s.id ? "var(--color-accent)" : "var(--color-surface)",
                color: step === s.id ? "var(--color-bg)" : "var(--color-text-dim)",
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
              <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                Name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My NAS"
                className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                Protocol
              </span>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as RemoteSource["protocol"])}
                className="px-3 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {PROTOCOLS.map((p) => (
                  <option
                    key={p.value}
                    value={p.value}
                    style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text)" }}
                  >
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            {!isCloud && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                    Host
                  </span>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.5 or nas.local"
                    className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                    Port (optional)
                  </span>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="22"
                    className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  />
                </label>
              </>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                Remote Path
              </span>
              <input
                type="text"
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                placeholder="/media/movies"
                className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            {!isCloud && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                    Username (optional)
                  </span>
                  <input
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                    Password (optional)
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  />
                </label>
              </>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                Credential Storage
              </span>
              {CREDENTIAL_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className="flex items-start gap-2 p-2 rounded-[var(--radius-card)] cursor-pointer"
                  style={{ border: "1px solid var(--color-border)" }}
                >
                  <input
                    type="radio"
                    name="credentialMode"
                    value={mode.value}
                    checked={credentialMode === mode.value}
                    onChange={() => setCredentialMode(mode.value)}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                      {mode.label}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                      {mode.description}
                    </span>
                  </div>
                </label>
              ))}
            </div>

            {/* Test buttons */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
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
            <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
              Media Types
            </span>
            <div className="flex gap-2">
              {(["movie", "music", "rom"] as const).map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius-card)] cursor-pointer text-xs"
                  style={{
                    background: mediaTypes.includes(t) ? "var(--color-accent)" : "var(--color-surface)",
                    color: mediaTypes.includes(t) ? "var(--color-bg)" : "var(--color-text)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={mediaTypes.includes(t)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setMediaTypes((prev) => [...prev, t]);
                      } else {
                        setMediaTypes((prev) => prev.filter((x) => x !== t));
                      }
                    }}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between mt-2">
          <motion.button
            className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium"
            style={{
              background: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
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
              background: "var(--color-accent)",
              color: "var(--color-bg)",
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
/*  Delete Missing Button Component                                     */
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
        background: "var(--color-surface)",
        color: "var(--color-text)",
        border: "1px solid var(--color-border)",
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

/* ------------------------------------------------------------------ */
/*  Test Button Component                                               */
/* ------------------------------------------------------------------ */

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
            : "var(--color-surface)",
          color: result
            ? result.success
              ? "#99ff99"
              : "#ff9999"
            : "var(--color-text)",
          border: "1px solid var(--color-border)",
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
