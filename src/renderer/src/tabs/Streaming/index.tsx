import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StreamingService } from "../../../../shared/types";
import { StreamingWebview } from "../../components/StreamingWebview/StreamingWebview";
import { ExtensionManager } from "../../components/ExtensionManager/ExtensionManager";
import { ExtensionFirstRunPrompt } from "../../components/ExtensionFirstRunPrompt/ExtensionFirstRunPrompt";
import { useSettingsStore } from "../../store/settings.store";
import { useFocusZoneStore } from "../../store/focusZone.store";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";
import { SkeletonGrid } from "../../components/SkeletonCard/SkeletonCard";
import { ErrorDisplay } from "../../components/ErrorDisplay/ErrorDisplay";
import { Globe, ArrowLeft, X, Settings, Music, Film, EyeOff } from "lucide-react";

type ViewMode = "services" | "webview";

export const StreamingTab: React.FC = () => {
  const [services, setServices] = useState<StreamingService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<StreamingService | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("services");
  const [showExtensionManager, setShowExtensionManager] = useState(false);
  const [showFirstRunPrompt, setShowFirstRunPrompt] = useState(false);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const setGlobalZone = useFocusZoneStore((s) => s.setZone);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const musicServices = useMemo(
    () => services.filter((s) => s.category === "music" && s.enabled !== false),
    [services],
  );

  const videoServices = useMemo(
    () => services.filter((s) => s.category === "video" && s.enabled !== false),
    [services],
  );

  const hasServices = musicServices.length > 0 || videoServices.length > 0;

  useEffect(() => {
    loadServices();
    window.htpc.streaming.extensions.ensureDefaults().catch(() => {});
  }, []);

  async function loadServices() {
    try {
      setLoading(true);
      setError(null);
      const list = await window.htpc.streaming.list();
      setServices(list);
    } catch {
      setServices([]);
      setError("Failed to load streaming services.");
    } finally {
      setLoading(false);
    }
  }

  const handleLaunchService = (svc: StreamingService) => {
    setActiveService(svc);
    setViewMode("webview");
    setGlobalZone("player");

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
  };

  const handleCloseWebview = () => {
    setActiveService(null);
    setViewMode("services");
    setGlobalZone("tab");
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

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: "up" | "down" | "left" | "right" | "confirm" | "cancel" };
      if (detail?.action === "cancel" && viewMode === "webview") {
        handleCloseWebview();
      }
    };
    window.addEventListener("htpc:nav", handler);
    return () => window.removeEventListener("htpc:nav", handler);
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

  // Controller navigation across two tile sections
  const [focusedIndex, setFocusedIndex] = useState(0);
  const allTiles = useMemo(() => [...musicServices, ...videoServices], [musicServices, videoServices]);
  const navEnabled = viewMode === "services" && allTiles.length > 0;
  const columns = 6;

  useEffect(() => {
    setFocusedIndex((prev) => Math.min(prev, Math.max(0, allTiles.length - 1)));
  }, [allTiles.length]);

  const handleNav = useCallback(
    (action: "up" | "down" | "left" | "right" | "confirm" | "cancel") => {
      if (!navEnabled || allTiles.length === 0) return;

      if (action === "confirm") {
        const svc = allTiles[focusedIndex];
        if (svc) handleLaunchService(svc);
        return;
      }

      if (action === "cancel") {
        return;
      }

      const row = Math.floor(focusedIndex / columns);
      const col = focusedIndex % columns;

      if (action === "up") {
        setFocusedIndex((prev) => {
          if (row === 0) return prev;
          return Math.max(0, prev - columns);
        });
      } else if (action === "down") {
        setFocusedIndex((prev) => {
          const nextRowStart = (row + 1) * columns;
          if (nextRowStart >= allTiles.length) return prev;
          return Math.min(allTiles.length - 1, nextRowStart + col);
        });
      } else if (action === "left") {
        setFocusedIndex((prev) => Math.max(0, prev - 1));
      } else if (action === "right") {
        setFocusedIndex((prev) => Math.min(allTiles.length - 1, prev + 1));
      }
    },
    [navEnabled, allTiles, focusedIndex, columns],
  );

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: "up" | "down" | "left" | "right" | "confirm" | "cancel" };
      if (detail?.action) handleNav(detail.action);
    };
    window.addEventListener("htpc:nav", listener);
    return () => window.removeEventListener("htpc:nav", listener);
  }, [handleNav]);

  useEffect(() => {
    tileRefs.current[focusedIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [focusedIndex]);

  const { menu, bindItem } = useContextMenu({
    items: allTiles,
    focusedIndex,
    getOptions: (svc): ContextMenuOption[] => {
      const opts: ContextMenuOption[] = [
        { id: "hide", label: "Hide", icon: <EyeOff size={16} />, destructive: true },
      ];
      if (svc.isBuiltin !== true) {
        opts.push({ id: "delete", label: "Delete", destructive: true });
      }
      return opts;
    },
    onAction: async (svc, optionId) => {
      if (optionId === "hide") {
        await window.htpc.streaming.setEnabled(svc.id, false);
        await loadServices();
      } else if (optionId === "delete") {
        await window.htpc.streaming.delete(svc.id);
        await loadServices();
      }
    },
    enabled: navEnabled,
  });

  const openSettings = () => {
    window.dispatchEvent(new CustomEvent("htpc:execute-command", { detail: { id: "nav.tab.settings" } }));
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      <AnimatePresence mode="wait">
        {viewMode === "services" && (
          <motion.div
            key="services"
            className="flex flex-col h-full p-6 gap-6 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
                Streaming
              </h1>
              <motion.button
                className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                whileTap={{ scale: 0.96 }}
                onClick={openSettings}
                title="Configure streaming services in Settings"
              >
                <Settings size={14} />
                Manage Services
              </motion.button>
            </div>

            {loading ? (
              <SkeletonGrid columns={6} rows={2} rowHeight={112} cellWidth={160} />
            ) : error ? (
              <ErrorDisplay message={error} onRetry={loadServices} />
            ) : !hasServices ? (
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
                  No streaming services are enabled. Enable built-in services or add your own in{" "}
                  <button
                    className="underline hover:text-white transition-colors"
                    style={{ color: "var(--color-accent)" }}
                    onClick={openSettings}
                  >
                    Settings → Streaming Services
                  </button>
                  .
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {musicServices.length > 0 && (
                  <section
                    ref={(el) => { sectionRefs.current[0] = el; }}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <Music size={18} style={{ color: "var(--color-accent)" }} />
                      <h2
                        className="text-sm font-semibold uppercase tracking-wide"
                        style={{ color: "var(--color-text-dim)" }}
                      >
                        Music
                      </h2>
                    </div>
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
                    >
                      {musicServices.map((svc, index) => {
                        const tileIndex = index;
                        return (
                          <ServiceTile
                            key={svc.id}
                            ref={(el) => { tileRefs.current[tileIndex] = el; }}
                            service={svc}
                            focused={navEnabled && focusedIndex === tileIndex}
                            onClick={() => handleLaunchService(svc)}
                            bindHandlers={bindItem(svc, tileIndex)}
                          />
                        );
                      })}
                    </div>
                  </section>
                )}

                {videoServices.length > 0 && (
                  <section
                    ref={(el) => { sectionRefs.current[1] = el; }}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <Film size={18} style={{ color: "var(--color-accent)" }} />
                      <h2
                        className="text-sm font-semibold uppercase tracking-wide"
                        style={{ color: "var(--color-text-dim)" }}
                      >
                        Videos
                      </h2>
                    </div>
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
                    >
                      {videoServices.map((svc, index) => {
                        const tileIndex = musicServices.length + index;
                        return (
                          <ServiceTile
                            key={svc.id}
                            ref={(el) => { tileRefs.current[tileIndex] = el; }}
                            service={svc}
                            focused={navEnabled && focusedIndex === tileIndex}
                            onClick={() => handleLaunchService(svc)}
                            bindHandlers={bindItem(svc, tileIndex)}
                          />
                        );
                      })}
                    </div>
                  </section>
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
                <Settings size={16} style={{ color: "var(--color-text)" }} />
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
              key={activeService.url}
              ref={webviewRef as any}
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

      {menu}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

interface ServiceTileProps {
  service: StreamingService;
  focused: boolean;
  onClick: () => void;
  bindHandlers?: {
    onContextMenu: (e: React.MouseEvent) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
}

const ServiceTile = React.forwardRef<HTMLButtonElement, ServiceTileProps>(
  ({ service, focused, onClick, bindHandlers }, ref) => {
    return (
      <motion.button
        ref={ref}
        className="relative flex flex-col justify-between rounded-[var(--radius-card)] overflow-hidden transition-all text-left"
        style={{
          aspectRatio: "16/9",
          background: service.color || "var(--color-surface-raised)",
          boxShadow: focused ? "0 0 0 3px var(--color-accent)" : "var(--shadow-card)",
          transform: focused ? "scale(1.05)" : undefined,
        }}
        whileHover={{ scale: 1.05, y: -3 }}
        whileTap={{ scale: 0.97 }}
        title={`Open ${service.name}`}
        onClick={onClick}
        {...bindHandlers}
      >
        <span className="text-3xl px-3 pt-2.5 leading-none select-none" aria-hidden>
          {service.icon}
        </span>
        <span
          className="text-sm font-bold px-3 pb-2.5 leading-tight"
          style={{ color: service.textColor || "var(--color-text)" }}
        >
          {service.name}
        </span>
      </motion.button>
    );
  },
);

ServiceTile.displayName = "ServiceTile";
