import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, X } from "lucide-react";
import { useSettingsStore } from "../../store/settings.store";
import { StreamingService } from "../../../../shared/types";
import { Field } from "./shared";

export const DataFeedTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
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

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
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

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
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
              {svc.icon ? <span className="text-lg">{svc.icon}</span> : <Link size={20} />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                  {svc.name}
                </div>
                <div className="text-xs truncate" style={{ color: "var(--color-text-dim)" }}>
                  {svc.category} · {svc.url}
                </div>
              </div>
              <button
                onClick={() => toggleServiceEnabled(svc.id, !svc.enabled)}
                className="w-11 h-6 rounded-full transition-colors relative flex-shrink-0"
                style={{
                  background: svc.enabled
                    ? "var(--color-accent)"
                    : "var(--color-surface)",
                  border: "1px solid var(--color-border)",
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
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
              }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
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
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-text-dim)" }}>
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
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
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
                    background: "var(--color-accent)",
                    color: "var(--color-bg)",
                  }}
                  onClick={handleAddService}
                  whileTap={{ scale: 0.96 }}
                >
                  Add
                </motion.button>
                <motion.button
                  className="px-4 py-2 rounded text-sm"
                  style={{
                    background: "var(--color-surface)",
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
    </div>
  );
};
