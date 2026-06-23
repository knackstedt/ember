import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  StreamingService,
  StreamingExtension,
  ExtensionInstallResult,
} from "../../../../shared/types";
import { useSettingsStore } from "../../store/settings.store";
import { useToastStore } from "../../store/toast.store";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { X, Download, Trash2, Plus, Globe, Check, Loader } from "lucide-react";

interface Props {
  service: StreamingService;
  partition: string;
  onClose: () => void;
}

const RECOMMENDED_EXTENSIONS: Omit<StreamingExtension, "installedVersion" | "installPath">[] = [
  {
    id: "youtube-auto-hd",
    name: "YouTube Auto HD + FPS",
    sourceUrl: "https://github.com/avi12/youtube-auto-hd/releases/download/1.17.3/youtube-auto-hd-fps-1.17.3-chrome.zip",
    version: "1.17.3",
    enabled: true,
    serviceIds: ["youtube"],
  },
  {
    id: "sponsorblock",
    name: "SponsorBlock",
    sourceUrl: "https://github.com/ajayyy/SponsorBlock/releases/download/6.1.5/ChromeExtension.zip",
    version: "6.1.5",
    enabled: true,
    serviceIds: ["youtube"],
  },
];

export const ExtensionManager: React.FC<Props> = ({ service, partition, onClose }) => {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const push = useToastStore((s) => s.push);
  const toast = (message: string, type: "info" | "success" | "error") => push({ message, type });
  const [customUrl, setCustomUrl] = useState("");
  const [customName, setCustomName] = useState("");
  const [customId, setCustomId] = useState("");
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const [showCustomForm, setShowCustomForm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, true, onClose);

  const allExtensions = settings?.streamingExtensions ?? [];

  const relevantExtensions = useMemo(() => {
    return allExtensions.filter(
      (e) =>
        !e.serviceIds ||
        e.serviceIds.length === 0 ||
        e.serviceIds.includes(service.id),
    );
  }, [allExtensions, service.id]);

  const recommended = useMemo(() => {
    return RECOMMENDED_EXTENSIONS.filter(
      (r) =>
        (!r.serviceIds || r.serviceIds.includes(service.id)) &&
        !allExtensions.some((e) => e.id === r.id),
    );
  }, [allExtensions, service.id]);

  async function installExtension(
    ext: Omit<StreamingExtension, "installedVersion" | "installPath">,
  ) {
    setInstallingIds((prev) => new Set(prev).add(ext.id));
    try {
      const result: ExtensionInstallResult =
        await window.htpc.streaming.extensions.download(ext.id, ext.sourceUrl, ext.version);
      if (result.success && result.extension) {
        const next = allExtensions.filter((e) => e.id !== ext.id);
        next.push(result.extension);
        await updateSettings({ streamingExtensions: next });

        // Load into current session
        await window.htpc.streaming.extensions.load(ext.id, partition);
        toast(`Installed ${ext.name}`, "success");
      } else {
        toast(`Failed to install ${ext.name}: ${result.error ?? ""}`, "error");
      }
    } catch (err: any) {
      toast(`Failed to install ${ext.name}: ${err.message}`, "error");
    } finally {
      setInstallingIds((prev) => {
        const n = new Set(prev);
        n.delete(ext.id);
        return n;
      });
    }
  }

  async function toggleExtension(ext: StreamingExtension) {
    const next = allExtensions.map((e) =>
      e.id === ext.id ? { ...e, enabled: !e.enabled } : e,
    );
    await updateSettings({ streamingExtensions: next });

    if (!ext.enabled) {
      // Was disabled, now enabling
      if (ext.installPath) {
        await window.htpc.streaming.extensions.load(ext.id, partition);
        toast(`Enabled ${ext.name}`, "success");
      }
    } else {
      await window.htpc.streaming.extensions.unload(ext.id, partition);
      toast(`Disabled ${ext.name}`, "info");
    }
  }

  async function removeExtension(ext: StreamingExtension) {
    await window.htpc.streaming.extensions.unload(ext.id, partition);
    await window.htpc.streaming.extensions.remove(ext.id);
    const next = allExtensions.filter((e) => e.id !== ext.id);
    await updateSettings({ streamingExtensions: next });
    toast(`Removed ${ext.name}`, "info");
  }

  async function updateExtension(ext: StreamingExtension) {
    setInstallingIds((prev) => new Set(prev).add(ext.id));
    try {
      const result: ExtensionInstallResult =
        await window.htpc.streaming.extensions.download(ext.id, ext.sourceUrl, ext.version);
      if (result.success && result.extension) {
        const next = allExtensions.map((e) =>
          e.id === ext.id ? { ...result.extension!, enabled: e.enabled } : e,
        );
        await updateSettings({ streamingExtensions: next });

        if (ext.enabled) {
          await window.htpc.streaming.extensions.load(ext.id, partition);
        }
        toast(`Updated ${ext.name} to v${ext.version}`, "success");
      } else {
        toast(`Failed to update ${ext.name}: ${result.error ?? ""}`, "error");
      }
    } catch (err: any) {
      toast(`Failed to update ${ext.name}: ${err.message}`, "error");
    } finally {
      setInstallingIds((prev) => {
        const n = new Set(prev);
        n.delete(ext.id);
        return n;
      });
    }
  }

  async function addCustomExtension() {
    if (!customUrl || !customName || !customId) return;
    // Guess version from URL or default to 1.0.0
    const versionMatch = customUrl.match(/(\d+\.\d+(?:\.\d+)?)/);
    const version = versionMatch ? versionMatch[1] : "1.0.0";

    await installExtension({
      id: customId,
      name: customName,
      sourceUrl: customUrl,
      version,
      enabled: true,
      serviceIds: [service.id],
    });

    setCustomUrl("");
    setCustomName("");
    setCustomId("");
    setShowCustomForm(false);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <motion.div
        ref={containerRef}
        className="relative flex flex-col w-[min(560px,90vw)] max-h-[85vh] rounded-[var(--radius-card)] overflow-hidden"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
        }}
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div className="flex items-center gap-2">
            <Globe size={18} style={{ color: "var(--accent)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Extensions
            </h2>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              for {service.name}
            </span>
          </div>
          <button
            className="p-1 rounded hover:bg-white/10 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} style={{ color: "var(--text-primary)" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Recommended */}
          {recommended.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                Recommended
              </h3>
              <div className="flex flex-col gap-2">
                {recommended.map((ext) => (
                  <div
                    key={ext.id}
                    className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-card)]"
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {ext.name}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        v{ext.version}
                      </span>
                    </div>
                    <button
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                      style={{ background: "var(--accent)", color: "#fff" }}
                      onClick={() => installExtension(ext)}
                      disabled={installingIds.has(ext.id)}
                    >
                      {installingIds.has(ext.id) ? (
                        <Loader size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      Install
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Installed */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
              Installed
            </h3>
            {relevantExtensions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                No extensions installed yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {relevantExtensions.map((ext) => (
                  <div
                    key={ext.id}
                    className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-card)]"
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {ext.name}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        v{ext.installedVersion ?? ext.version}
                        {ext.version !== ext.installedVersion && ` (update available: v${ext.version})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {ext.version !== ext.installedVersion && (
                        <button
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
                          style={{ background: "var(--accent)", color: "#fff" }}
                          onClick={() => updateExtension(ext)}
                          disabled={installingIds.has(ext.id)}
                        >
                          {installingIds.has(ext.id) ? (
                            <Loader size={12} className="animate-spin" />
                          ) : (
                            <Download size={12} />
                          )}
                          Update
                        </button>
                      )}
                      <button
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          ext.enabled
                            ? ""
                            : "opacity-60"
                        }`}
                        style={{
                          background: ext.enabled ? "var(--accent)" : "var(--surface-0)",
                          color: ext.enabled ? "#fff" : "var(--text-secondary)",
                        }}
                        onClick={() => toggleExtension(ext)}
                      >
                        {ext.enabled ? (
                          <span className="flex items-center gap-1">
                            <Check size={12} /> On
                          </span>
                        ) : (
                          "Off"
                        )}
                      </button>
                      <button
                        className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
                        onClick={() => removeExtension(ext)}
                        title="Remove"
                      >
                        <Trash2 size={14} style={{ color: "var(--error-fg)" }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Add custom */}
          <section className="flex flex-col gap-2">
            <button
              className="flex items-center gap-2 text-sm font-medium transition-colors"
              style={{ color: "var(--accent)" }}
              onClick={() => setShowCustomForm((v) => !v)}
            >
              <Plus size={16} />
              Add custom extension
            </button>

            <AnimatePresence>
              {showCustomForm && (
                <motion.div
                  className="flex flex-col gap-2 p-3 rounded-[var(--radius-card)]"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                  }}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <input
                    className="px-3 py-2 rounded text-sm bg-transparent border outline-none focus:border-[var(--accent)]"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                    placeholder="Extension ID (e.g. my-extension)"
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value)}
                  />
                  <input
                    className="px-3 py-2 rounded text-sm bg-transparent border outline-none focus:border-[var(--accent)]"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                    placeholder="Display name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                  <input
                    className="px-3 py-2 rounded text-sm bg-transparent border outline-none focus:border-[var(--accent)]"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                    placeholder="ZIP download URL"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                  />
                  <button
                    className="px-3 py-1.5 rounded text-xs font-medium self-end"
                    style={{ background: "var(--accent)", color: "#fff" }}
                    onClick={addCustomExtension}
                    disabled={!customUrl || !customName || !customId}
                  >
                    Add Extension
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
};
