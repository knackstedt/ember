import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StreamingService } from "../../../../shared/types";
import { useSettingsStore } from "../../store/settings.store";
import { useToastStore } from "../../store/toast.store";
import { X, Download, Check, Loader } from "lucide-react";

interface Props {
  service: StreamingService;
  partition: string;
  onClose: () => void;
}

const RECOMMENDED: Array<{
  id: string;
  name: string;
  description: string;
  sourceUrl: string;
  version: string;
}> = [
  {
    id: "youtube-auto-hd",
    name: "YouTube Auto HD + FPS",
    description: "Automatically set YouTube video quality to the highest available resolution.",
    sourceUrl: "https://github.com/avi12/youtube-auto-hd/releases/download/1.17.3/youtube-auto-hd-fps-1.17.3-chrome.zip",
    version: "1.17.3",
  },
  {
    id: "sponsorblock",
    name: "SponsorBlock",
    description: "Skip sponsor segments, intros, and other non-content blocks in YouTube videos.",
    sourceUrl: "https://github.com/ajayyy/SponsorBlock/releases/download/6.1.5/ChromeExtension.zip",
    version: "6.1.5",
  },
];

export const ExtensionFirstRunPrompt: React.FC<Props> = ({ service, partition, onClose }) => {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const toast = useToastStore((s) => s.show);

  const serviceRecommended = RECOMMENDED.filter(
    (r) => !r.serviceIds || r.serviceIds.includes(service.id),
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(serviceRecommended.map((r) => r.id)),
  );

  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);

  // Auto-dismiss if there are no recommendations for this service
  useEffect(() => {
    if (serviceRecommended.length === 0) {
      dismiss();
    }
  }, []);

  if (serviceRecommended.length === 0) {
    return null;
  }

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  async function installSelected() {
    setInstalling(true);
    const all = settings?.streamingExtensions ?? [];
    const next = [...all];

    for (const rec of serviceRecommended) {
      if (!selectedIds.has(rec.id)) continue;

      try {
        const result = await window.htpc.streaming.extensions.download(
          rec.id,
          rec.sourceUrl,
          rec.version,
        );
        if (result.success && result.extension) {
          const idx = next.findIndex((e) => e.id === rec.id);
          if (idx >= 0) next[idx] = result.extension;
          else next.push(result.extension);

          await window.htpc.streaming.extensions.load(rec.id, partition);
        }
      } catch (err: any) {
        toast(`Failed to install ${rec.name}: ${err.message}`, "error");
      }
    }

    await updateSettings({ streamingExtensions: next });
    setInstalling(false);
    setDone(true);

    // Auto-dismiss after a moment
    setTimeout(() => {
      dismiss();
    }, 1500);
  }

  function dismiss() {
    const dismissed = new Set(settings?.streamingExtensionPromptDismissed ?? []);
    dismissed.add(service.id);
    updateSettings({
      streamingExtensionPromptDismissed: Array.from(dismissed),
    });
    onClose();
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
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
        onClick={dismiss}
      />
      <motion.div
        className="relative flex flex-col w-[min(480px,90vw)] max-h-[80vh] rounded-[var(--radius-card)] overflow-hidden"
        style={{
          background: "var(--color-surface-overlay)",
          border: "1px solid var(--color-border)",
        }}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Enhance {service.name}
          </h2>
          <button
            className="p-1 rounded hover:bg-white/10 transition-colors"
            onClick={dismiss}
            aria-label="Close"
          >
            <X size={18} style={{ color: "var(--color-text)" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Add these community extensions to improve your {service.name} experience. They run
            locally and can be toggled on or off at any time.
          </p>

          {done ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "var(--color-accent)" }}
              >
                <Check size={20} color="#fff" />
              </div>
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                All set!
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {serviceRecommended.map((rec) => {
                const selected = selectedIds.has(rec.id);
                return (
                  <button
                    key={rec.id}
                    className="flex items-start gap-3 px-3 py-3 rounded-[var(--radius-card)] text-left transition-colors"
                    style={{
                      background: selected
                        ? "var(--color-surface-raised)"
                        : "transparent",
                      border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border)"}`,
                    }}
                    onClick={() => toggle(rec.id)}
                  >
                    <div
                      className="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                        background: selected ? "var(--color-accent)" : "transparent",
                      }}
                    >
                      {selected && <Check size={14} color="#fff" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {rec.name}
                      </span>
                      <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                        {rec.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!done && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-4 border-t"
            style={{ borderColor: "var(--color-border)" }}
          >
            <button
              className="px-4 py-2 rounded text-sm font-medium transition-colors"
              style={{ color: "var(--color-text-dim)" }}
              onClick={dismiss}
            >
              Skip
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium transition-colors"
              style={{ background: "var(--color-accent)", color: "#fff" }}
              onClick={installSelected}
              disabled={installing || selectedIds.size === 0}
            >
              {installing ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              Install {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
