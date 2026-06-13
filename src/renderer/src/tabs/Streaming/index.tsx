import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StreamingService, StreamingExtension } from "../../../../shared/types";
import { StreamingTile } from "../../components/StreamingTile/StreamingTile";
import { StreamingWebview } from "../../components/StreamingWebview/StreamingWebview";
import { ExtensionManager } from "../../components/ExtensionManager/ExtensionManager";
import { ExtensionFirstRunPrompt } from "../../components/ExtensionFirstRunPrompt/ExtensionFirstRunPrompt";
import { useSettingsStore } from "../../store/settings.store";
import { useToastStore } from "../../store/toast.store";
import { Globe, ArrowLeft, X } from "lucide-react";

type ViewMode = "services" | "webview";

export const StreamingTab: React.FC = () => {
  const [services, setServices] = useState<StreamingService[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeService, setActiveService] = useState<StreamingService | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("services");
  const [showExtensionManager, setShowExtensionManager] = useState(false);
  const [showFirstRunPrompt, setShowFirstRunPrompt] = useState(false);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const toast = useToastStore((s) => s.show);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);

  const videoServices = useMemo(
    () => services.filter((s) => s.category === "video" && s.enabled !== false),
    [services],
  );

  const enabledVideoServices = useMemo(
    () => videoServices.filter((s) => s.enabled !== false),
    [videoServices],
  );

  const youtubeService = useMemo(
    () => services.find((s) => s.id === "youtube"),
    [services],
  );

  useEffect(() => {
    loadServices();
    window.htpc.streaming.extensions.ensureDefaults().catch(() => {});
  }, []);

  async function loadServices() {
    try {
      setLoading(true);
      const list = await window.htpc.streaming.list("video");
      setServices(list);
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }

  const handleLaunch = (svc: StreamingService) => {
    if (svc.embed ?? true) {
      setActiveService(svc);
      setViewMode("webview");

      // Check first-run prompt
      const dismissed = settings?.streamingExtensionPromptDismissed ?? [];
      const extensions = settings?.streamingExtensions ?? [];
      const hasRelevant = extensions.some(
        (e) =>
          e.enabled &&
          (!e.serviceIds || e.serviceIds.length === 0 || e.serviceIds.includes(svc.id)),
      );
      if (!dismissed.includes(svc.id) && !hasRelevant) {
        setShowFirstRunPrompt(true);
      }
    } else {
      window.htpc.streaming.launch(svc);
    }
  };

  const handleCloseWebview = () => {
    setActiveService(null);
    setViewMode("services");
  };

  useEffect(() => {
    const handler = () => {
      if (viewMode === "webview") {
        handleCloseWebview();
      }
    };
    window.addEventListener("htpc:escape", handler);
    return () => window.removeEventListener("htpc:escape", handler);
  }, [viewMode]);

  const partition = activeService ? `persist:streaming-${activeService.id}` : "";

  const relevantExtensions = useMemo(() => {
    const all = settings?.streamingExtensions ?? [];
    if (!activeService) return all;
    return all.filter(
      (e) =>
        !e.serviceIds ||
        e.serviceIds.length === 0 ||
        e.serviceIds.includes(activeService.id),
    );
  }, [settings?.streamingExtensions, activeService]);

  const defaultServices: StreamingService[] = useMemo(() => {
    if (youtubeService) {
      return [youtubeService];
    }
    return [
      {
        id: "youtube",
        name: "YouTube",
        url: "https://youtube.com",
        category: "video",
        color: "#FF0000",
        textColor: "#ffffff",
        icon: "▶",
        enabled: true,
        isBuiltin: true,
        sortOrder: 0,
        embed: true,
      },
    ];
  }, [youtubeService]);

  const displayServices = enabledVideoServices.length > 0 ? enabledVideoServices : defaultServices;

  return (
    <div className="flex flex-col h-full w-full relative">
      <AnimatePresence mode="wait">
        {viewMode === "services" && (
          <motion.div
            key="services"
            className="flex flex-col h-full p-6 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
                Streaming
              </h1>
              {enabledVideoServices.length === 0 && (
                <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                  No services configured. Showing YouTube by default.
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div
                  className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
                  style={{
                    borderTopColor: "var(--color-accent)",
                    borderRightColor: "var(--color-accent)",
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <section>
                  <h2
                    className="text-sm font-semibold mb-3 uppercase tracking-wide"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    Video Services
                  </h2>
                  <StreamingTile services={displayServices} onLaunch={handleLaunch} />
                </section>

                {enabledVideoServices.length === 0 && (
                  <div
                    className="flex flex-col gap-3 p-4 rounded-[var(--radius-card)]"
                    style={{
                      background: "var(--color-surface-raised)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Globe size={18} style={{ color: "var(--color-accent)" }} />
                      <span className="font-medium" style={{ color: "var(--color-text)" }}>
                        Getting Started
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
                      YouTube is available by default for free content. You can add more streaming
                      services in Settings → Streaming Services, or browse the web directly by
                      selecting YouTube above.
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {viewMode === "webview" && activeService && (
          <motion.div
            key="webview"
            className="flex flex-col h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Toolbar */}
            <div
              className="flex items-center gap-2 px-3 py-2 border-b"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-surface-raised)",
              }}
            >
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={handleCloseWebview}
                title="Back to services"
              >
                <ArrowLeft size={16} style={{ color: "var(--color-text)" }} />
              </button>
              <div className="flex-1 text-sm font-medium truncate px-2" style={{ color: "var(--color-text)" }}>
                {activeService.name}
              </div>
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={() => setShowExtensionManager(true)}
                title="Manage extensions"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "var(--color-text)" }}
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M12 4v16" />
                  <path d="M4 12h16" />
                </svg>
              </button>
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={handleCloseWebview}
                title="Close"
              >
                <X size={16} style={{ color: "var(--color-text)" }} />
              </button>
            </div>

            <StreamingWebview
              ref={webviewRef}
              service={activeService}
              partition={partition}
              extensions={relevantExtensions}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showExtensionManager && activeService && (
        <ExtensionManager
          service={activeService}
          partition={partition}
          onClose={() => setShowExtensionManager(false)}
        />
      )}

      {showFirstRunPrompt && activeService && (
        <ExtensionFirstRunPrompt
          service={activeService}
          partition={partition}
          onClose={() => setShowFirstRunPrompt(false)}
        />
      )}
    </div>
  );
};
