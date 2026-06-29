import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Volume2, RefreshCw } from "lucide-react";
import { useSplitscreenStore } from "../../store/splitscreen.store";
import { AudioSink } from "../../../../shared/splitscreen-types";

export const AudioTab: React.FC = () => {
  const { audioSinks, loadAudioSinks, setSinkLabel } = useSplitscreenStore();
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAudioSinks();
  }, [loadAudioSinks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAudioSinks();
    setRefreshing(false);
  };

  const handleLabelChange = (sinkId: string, label: string) => {
    setEditingLabels((prev) => ({ ...prev, [sinkId]: label }));
  };

  const handleLabelSave = async (sinkId: string) => {
    const label = editingLabels[sinkId];
    if (label !== undefined) {
      await setSinkLabel(sinkId, label);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Volume2 size={20} style={{ color: "var(--accent)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Audio Sinks
            </h2>
          </div>
          <motion.button
            className="px-3 py-1.5 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
            onClick={handleRefresh}
            whileTap={{ scale: 0.96 }}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </motion.button>
        </div>

        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Detected audio output devices. Assign custom labels to easily identify them when configuring splitscreen audio routing.
        </p>

        {audioSinks.length === 0 ? (
          <div
            className="p-4 rounded-[var(--radius-card)] text-sm"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
          >
            No audio sinks detected. Make sure PulseAudio or PipeWire is running.
          </div>
        ) : (
          <div className="flex flex-col gap-2 pl-1">
            {audioSinks.map((sink: AudioSink) => (
              <div
                key={sink.id}
                className="flex items-center gap-3 p-3 rounded-[var(--radius-card)]"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono truncate" style={{ color: "var(--text-primary)" }}>
                      {sink.name}
                    </span>
                    {sink.isDefault && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: "var(--accent)",
                          color: "var(--surface-base)",
                        }}
                      >
                        Default
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {sink.server}
                  </span>
                </div>
                <input
                  type="text"
                  className="px-3 py-1.5 rounded-[var(--radius-card)] text-sm flex-shrink-0"
                  style={{
                    background: "var(--surface-0)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    width: "200px",
                  }}
                  placeholder="Custom label..."
                  value={editingLabels[sink.id] ?? sink.label ?? ""}
                  onChange={(e) => handleLabelChange(sink.id, e.target.value)}
                  onBlur={() => handleLabelSave(sink.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
