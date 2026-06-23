import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Trash2, RefreshCw, Power, Globe, Package, CheckCircle, AlertCircle } from "lucide-react";
import { DiscoveredPlugin } from "../../../shared/types";
import { FlameLoader } from "../../components/FlameLoader";

export const PluginsTab: React.FC = () => {
  const [installed, setInstalled] = useState<DiscoveredPlugin[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredPlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadInstalled = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.htpc.plugins.managedList();
      setInstalled(list as DiscoveredPlugin[]);
    } catch (err) {
      setError(`Failed to list plugins: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const discover = useCallback(async () => {
    setDiscovering(true);
    setError(null);
    try {
      const list = await window.htpc.plugins.discoverAll();
      setDiscovered(list as DiscoveredPlugin[]);
    } catch (err) {
      setError(`Failed to discover plugins: ${err}`);
    } finally {
      setDiscovering(false);
    }
  }, []);

  useEffect(() => {
    loadInstalled();
    discover();
  }, [loadInstalled, discover]);

  const handleInstall = async (plugin: DiscoveredPlugin) => {
    setActionId(plugin.id);
    setError(null);
    try {
      await window.htpc.plugins.install(plugin);
      await loadInstalled();
      // Refresh discovered to update installed status
      setDiscovered((prev) =>
        prev.map((p) =>
          p.id === plugin.id ? { ...p, installed: true, installedVersion: plugin.version } : p,
        ),
      );
    } catch (err) {
      setError(`Install failed: ${err}`);
    } finally {
      setActionId(null);
    }
  };

  const handleUninstall = async (id: string) => {
    setActionId(id);
    setError(null);
    try {
      await window.htpc.plugins.uninstall(id);
      await loadInstalled();
      setDiscovered((prev) =>
        prev.map((p) => (p.id === id ? { ...p, installed: false, installedVersion: undefined } : p)),
      );
    } catch (err) {
      setError(`Uninstall failed: ${err}`);
    } finally {
      setActionId(null);
    }
  };

  const handleUpdate = async (plugin: DiscoveredPlugin) => {
    setActionId(plugin.id);
    setError(null);
    try {
      await window.htpc.plugins.update(plugin);
      await loadInstalled();
    } catch (err) {
      setError(`Update failed: ${err}`);
    } finally {
      setActionId(null);
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await window.htpc.plugins.setEnabled(id, enabled);
      await loadInstalled();
    } catch (err) {
      setError(`Toggle failed: ${err}`);
    }
  };

  const isUpdateAvailable = (plugin: DiscoveredPlugin) => {
    if (!plugin.installed || !plugin.installedVersion) return false;
    return plugin.version !== plugin.installedVersion;
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Plugins
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Install plugins to add emulator support and other features.
        </p>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded text-sm" style={{ background: "rgba(255,0,0,0.1)", color: "#ff6666" }}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <motion.button
            className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-1.5"
            style={{ background: "var(--surface-1)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
            onClick={() => window.htpc.plugins.reload()}
            whileTap={{ scale: 0.96 }}
          >
            <RefreshCw size={14} />
            Reload Plugins
          </motion.button>
          <motion.button
            className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-1.5"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={discover}
            whileTap={{ scale: 0.96 }}
          >
            <Globe size={14} />
            {discovering ? "Discovering..." : "Discover Plugins"}
          </motion.button>
        </div>
      </section>

      <AnimatePresence mode="wait">
        {(loading || discovering) && installed.length === 0 && discovered.length === 0 ? (
          <motion.div
            key="loader"
            className="flex items-center justify-center py-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <FlameLoader width={120} height={200} />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            className="flex flex-col gap-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {/* Installed plugins */}
            {installed.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                  Installed
                </h3>
                <div className="flex flex-col gap-2">
                  {installed.map((plugin) => (
                    <PluginCard
                      key={plugin.id}
                      plugin={plugin}
                      isUpdateAvailable={isUpdateAvailable(
                        discovered.find((d) => d.id === plugin.id) ?? plugin,
                      )}
                      actionId={actionId}
                      onInstall={() =>
                        handleUpdate(discovered.find((d) => d.id === plugin.id) ?? plugin)
                      }
                      onUninstall={() => handleUninstall(plugin.id)}
                      onToggleEnabled={(enabled) => handleToggleEnabled(plugin.id, enabled)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Discovered plugins */}
            <AnimatePresence>
              {discovered.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-col gap-3"
                >
                  <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                    Available
                  </h3>
                  <div className="flex flex-col gap-2">
                    {discovered
                      .filter((d) => !d.installed)
                      .map((plugin) => (
                        <PluginCard
                          key={plugin.id}
                          plugin={plugin}
                          actionId={actionId}
                          onInstall={() => handleInstall(plugin)}
                          onUninstall={() => handleUninstall(plugin.id)}
                          onToggleEnabled={(enabled) => handleToggleEnabled(plugin.id, enabled)}
                        />
                      ))}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PluginCard: React.FC<{
  plugin: DiscoveredPlugin;
  isUpdateAvailable?: boolean;
  actionId: string | null;
  onInstall: () => void;
  onUninstall: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}> = ({ plugin, isUpdateAvailable, actionId, onInstall, onUninstall, onToggleEnabled }) => {
  const busy = actionId === plugin.id;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-card)]"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {plugin.displayName || plugin.name}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--surface-0)", color: "var(--text-secondary)" }}>
            v{plugin.version}
          </span>
          {plugin.installed && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "#4ade80" }}>
              <CheckCircle size={12} />
              Installed
            </span>
          )}
        </div>
        {plugin.description && (
          <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {plugin.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {plugin.installed && (
          <>
            <button
              onClick={() => onToggleEnabled(!plugin.enabled)}
              className="p-1.5 rounded transition-colors"
              style={{
                color: plugin.enabled ? "#4ade80" : "var(--text-secondary)",
                background: "transparent",
              }}
              title={plugin.enabled ? "Enabled" : "Disabled"}
            >
              <Power size={14} />
            </button>
            {isUpdateAvailable && (
              <button
                onClick={onInstall}
                disabled={busy}
                className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}
              >
                <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
                Update
              </button>
            )}
            <button
              onClick={onUninstall}
              disabled={busy}
              className="p-1.5 rounded transition-colors"
              style={{ color: "#ff6666", background: "transparent", opacity: busy ? 0.6 : 1 }}
              title="Uninstall"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
        {!plugin.installed && (
          <button
            onClick={onInstall}
            disabled={busy}
            className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
            style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}
          >
            <Download size={12} />
            {busy ? "Installing..." : "Install"}
          </button>
        )}
      </div>
    </div>
  );
};
