import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StreamingService, StreamingExtension, StreamingFrontpageItem } from "../../../../shared/types";
import { StreamingWebview } from "../../components/StreamingWebview/StreamingWebview";
import { ExtensionManager } from "../../components/ExtensionManager/ExtensionManager";
import { ExtensionFirstRunPrompt } from "../../components/ExtensionFirstRunPrompt/ExtensionFirstRunPrompt";
import { useSettingsStore } from "../../store/settings.store";
import { useToastStore } from "../../store/toast.store";
import { SkeletonGrid } from "../../components/SkeletonCard/SkeletonCard";
import { ErrorDisplay } from "../../components/ErrorDisplay/ErrorDisplay";
import { Globe, ArrowLeft, X, Play } from "lucide-react";

type ViewMode = "services" | "webview";

interface ServiceWithItems {
  service: StreamingService;
  items: StreamingFrontpageItem[];
}

export const StreamingTab: React.FC = () => {
  const [services, setServices] = useState<StreamingService[]>([]);
  const [frontpageMap, setFrontpageMap] = useState<Record<string, StreamingFrontpageItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<StreamingService | null>(null);
  const [activeItemUrl, setActiveItemUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("services");
  const [showExtensionManager, setShowExtensionManager] = useState(false);
  const [showFirstRunPrompt, setShowFirstRunPrompt] = useState(false);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const toast = useToastStore((s) => s.show);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const videoServices = useMemo(
    () => services.filter((s) => s.category === "video" && s.enabled !== false),
    [services],
  );

  const enabledVideoServices = useMemo(
    () => videoServices.filter((s) => s.enabled !== false && s.frontpageEnabled !== false),
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
      setError(null);
      const list = await window.htpc.streaming.list("video");
      setServices(list);
      // Load frontpage items for all services
      const allItems = await window.htpc.streaming.frontpage.listAll();
      const map: Record<string, StreamingFrontpageItem[]> = {};
      for (const item of allItems) {
        if (!map[item.serviceId]) map[item.serviceId] = [];
        map[item.serviceId].push(item);
      }
      // Sort each by sortIndex and cap at 7
      for (const serviceId of Object.keys(map)) {
        map[serviceId] = map[serviceId]
          .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
          .slice(0, 7);
      }
      setFrontpageMap(map);
    } catch {
      setServices([]);
      setError("Failed to load streaming services.");
    } finally {
      setLoading(false);
    }
  }

  const servicesWithItems: ServiceWithItems[] = useMemo(() => {
    return enabledVideoServices
      .map((s) => ({
        service: s,
        items: frontpageMap[s.id] ?? [],
      }))
      .sort((a, b) => {
        const ptA = a.service.playTime ?? 0;
        const ptB = b.service.playTime ?? 0;
        if (ptA !== ptB) return ptB - ptA;
        const lpA = a.service.lastPlayed ?? 0;
        const lpB = b.service.lastPlayed ?? 0;
        return lpB - lpA;
      });
  }, [enabledVideoServices, frontpageMap]);

  // Controller navigation state
  const [focusedRow, setFocusedRow] = useState(0);
  const [focusedCol, setFocusedCol] = useState(0);
  const navEnabled = viewMode === "services" && servicesWithItems.length > 0;

  useEffect(() => {
    if (navEnabled) {
      setFocusedRow((prev) => (prev >= servicesWithItems.length ? 0 : prev));
      setFocusedCol((prev) => {
        const cols = servicesWithItems[focusedRow]?.items.length ?? 0;
        return prev > cols ? cols : prev;
      });
    }
  }, [servicesWithItems.length, navEnabled]);

  const handleNav = useCallback(
    (action: "up" | "down" | "left" | "right" | "confirm" | "cancel") => {
      if (!navEnabled || servicesWithItems.length === 0) return;

      if (action === "confirm") {
        const row = servicesWithItems[focusedRow];
        if (!row) return;
        if (focusedCol === 0 || row.items.length === 0) {
          handleLaunchService(row.service);
        } else {
          const item = row.items[focusedCol - 1];
          if (item) handleLaunchItem(row.service, item);
        }
        return;
      }

      if (action === "up") {
        setFocusedRow((prev) => {
          const next = Math.max(0, prev - 1);
          if (next !== prev) {
            setFocusedCol((col) => {
              const targetCols = servicesWithItems[next]?.items.length ?? 0;
              return Math.min(col, targetCols);
            });
            rowRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          return next;
        });
        return;
      }

      if (action === "down") {
        setFocusedRow((prev) => {
          const next = Math.min(servicesWithItems.length - 1, prev + 1);
          if (next !== prev) {
            setFocusedCol((col) => {
              const targetCols = servicesWithItems[next]?.items.length ?? 0;
              return Math.min(col, targetCols);
            });
            rowRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          return next;
        });
        return;
      }

      if (action === "left") {
        setFocusedCol((prev) => Math.max(0, prev - 1));
        return;
      }

      if (action === "right") {
        setFocusedCol((prev) => {
          const cols = servicesWithItems[focusedRow]?.items.length ?? 0;
          return Math.min(cols, prev + 1);
        });
        return;
      }
    },
    [navEnabled, servicesWithItems, focusedRow, focusedCol],
  );

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: "up" | "down" | "left" | "right" | "confirm" | "cancel" };
      if (detail?.action) handleNav(detail.action);
    };
    window.addEventListener("htpc:nav", listener);
    return () => window.removeEventListener("htpc:nav", listener);
  }, [handleNav]);

  const handleLaunchService = (svc: StreamingService) => {
    if (svc.embed ?? true) {
      setActiveService(svc);
      setActiveItemUrl(null);
      setViewMode("webview");

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

  const handleLaunchItem = (svc: StreamingService, item: StreamingFrontpageItem) => {
    if (svc.embed ?? true) {
      setActiveService(svc);
      setActiveItemUrl(item.url);
      setViewMode("webview");
    } else {
      window.htpc.streaming.launch(svc);
    }
  };

  const handleCloseWebview = () => {
    setActiveService(null);
    setActiveItemUrl(null);
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

  const webviewSrc = useMemo(() => {
    if (!activeService) return "";
    if (activeItemUrl) return activeItemUrl;
    return activeService.url;
  }, [activeService, activeItemUrl]);

  return (
    <div className="flex flex-col h-full w-full relative">
      <AnimatePresence mode="wait">
        {viewMode === "services" && (
          <motion.div
            key="services"
            className="flex flex-col h-full p-6 gap-4 overflow-y-auto"
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
              <SkeletonGrid columns={8} rows={2} rowHeight={112} cellWidth={200} />
            ) : error ? (
              <ErrorDisplay message={error} onRetry={loadServices} />
            ) : servicesWithItems.length > 0 ? (
              <div className="flex flex-col gap-6">
                {servicesWithItems.map(({ service, items }, rowIndex) => {
                  const isFocusedRow = focusedRow === rowIndex && navEnabled;
                  return (
                    <div
                      key={service.id}
                      ref={(el) => { rowRefs.current[rowIndex] = el; }}
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-3 overflow-x-auto pb-1">
                        {/* Service tile */}
                        <ServiceTile
                          service={service}
                          focused={isFocusedRow && focusedCol === 0}
                          onClick={() => handleLaunchService(service)}
                        />

                        {/* Frontpage items */}
                        {items.map((item, colIndex) => (
                          <FrontpageItemTile
                            key={item.id}
                            item={item}
                            focused={isFocusedRow && focusedCol === colIndex + 1}
                            onClick={() => handleLaunchItem(service, item)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
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
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {displayServices.map((svc) => (
                      <ServiceTile
                        key={svc.id}
                        service={svc}
                        focused={false}
                        onClick={() => handleLaunchService(svc)}
                      />
                    ))}
                  </div>
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
                onClick={handleCloseWebview}
                title="Close"
              >
                <X size={16} style={{ color: "var(--color-text)" }} />
              </button>
            </div>

            <StreamingWebview
              key={webviewSrc}
              ref={webviewRef as any}
              service={{ ...activeService, url: webviewSrc }}
              partition={partition}
              extensions={relevantExtensions}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showExtensionManager && (
        <ExtensionManager onClose={() => setShowExtensionManager(false)} />
      )}

      {showFirstRunPrompt && activeService && (
        <ExtensionFirstRunPrompt
          service={activeService}
          extensions={relevantExtensions}
          onDismiss={(svcId) => {
            const dismissed = settings?.streamingExtensionPromptDismissed ?? [];
            if (!dismissed.includes(svcId)) {
              updateSettings({
                streamingExtensionPromptDismissed: [...dismissed, svcId],
              });
            }
            setShowFirstRunPrompt(false);
          }}
          onManageExtensions={() => {
            setShowFirstRunPrompt(false);
            setShowExtensionManager(true);
          }}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

const ServiceTile: React.FC<{
  service: StreamingService;
  focused: boolean;
  onClick: () => void;
}> = ({ service, focused, onClick }) => {
  return (
    <motion.button
      className="flex-shrink-0 relative flex flex-col justify-between rounded-[var(--radius-card)] overflow-hidden transition-all"
      style={{
        width: 160,
        aspectRatio: "16/9",
        background: service.color || "var(--color-surface-raised)",
        boxShadow: focused ? "0 0 0 3px var(--color-accent)" : "var(--shadow-card)",
        transform: focused ? "scale(1.05)" : undefined,
      }}
      whileHover={{ scale: 1.05, y: -3 }}
      whileTap={{ scale: 0.97 }}
      title={`Open ${service.name}`}
      onClick={onClick}
    >
      <span className="text-3xl px-3 pt-2.5 leading-none select-none" aria-hidden>
        {service.icon}
      </span>
      <span
        className="text-sm font-bold px-3 pb-2.5 text-left leading-tight"
        style={{ color: service.textColor || "var(--color-text)" }}
      >
        {service.name}
      </span>
    </motion.button>
  );
};

const PLACEHOLDER_COLORS = [
  "#1a1a2e",
  "#16213e",
  "#0f3460",
  "#1b1b2f",
  "#2d132c",
  "#1c1c1c",
  "#2a2a2a",
];

function placeholderColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

const FrontpageItemTile: React.FC<{
  item: StreamingFrontpageItem;
  focused: boolean;
  onClick: () => void;
}> = ({ item, focused, onClick }) => {
  const [imgError, setImgError] = useState(false);
  const showPlaceholder = !item.thumbnailUrl || imgError;

  return (
    <motion.button
      className="flex-shrink-0 relative flex flex-col cursor-pointer rounded-[var(--radius-card)] overflow-hidden transition-all"
      style={{
        width: 200,
        aspectRatio: "16/9",
        boxShadow: focused ? "0 0 0 3px var(--color-accent)" : "var(--shadow-card)",
        transform: focused ? "scale(1.05)" : undefined,
      }}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      title={item.title}
    >
      <div className="relative w-full h-full overflow-hidden">
        {showPlaceholder ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: placeholderColor(item.title) }}
          >
            <Play size={24} className="text-white/40" />
          </div>
        ) : (
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-1.5 left-2 right-2">
          <span className="text-xs font-semibold leading-tight text-white line-clamp-2 block">
            {item.title}
          </span>
        </div>
      </div>
    </motion.button>
  );
};
