import React, { useState, useEffect, useCallback, useRef } from "react";
import { DashboardWidget } from "../../../shared/types";
import { normalizeWebUrl } from "../../../../shared/path-utils";
import { X, Globe, Hash, Type } from "lucide-react";

interface WidgetConfigDialogProps {
  widget: DashboardWidget | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<DashboardWidget>) => void;
}

interface WidgetConfigDialogContentProps {
  widget: DashboardWidget;
  onClose: () => void;
  onSave: (id: string, updates: Partial<DashboardWidget>) => void;
}

const WidgetConfigDialogContent: React.FC<WidgetConfigDialogContentProps> = ({
  widget,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [maxItems, setMaxItems] = useState(5);
  const [location, setLocation] = useState("");

  useEffect(() => {
    setTitle(widget.title ?? "");
    setUrl((widget.config?.url as string) ?? "");
    setMaxItems((widget.config?.maxItems as number) ?? 5);
    setLocation((widget.config?.location as string) ?? "");
  }, [widget]);

  const handleSave = useCallback(() => {
    const updates: Partial<DashboardWidget> = { title: title || undefined };
    const config: Record<string, unknown> = { ...(widget.config ?? {}) };

    if (widget.type === "webview") {
      const normalizedUrl = normalizeWebUrl(url.trim());
      if (normalizedUrl) config.url = normalizedUrl;
      else delete config.url;
    }

    if (["recent-games", "favorite-games", "recent-movies", "recent-music", "quick-launch"].includes(widget.type)) {
      config.maxItems = Math.max(1, Math.min(20, maxItems));
    }

    if (widget.type === "weather") {
      if (location) config.location = location;
      else delete config.location;
    }

    if (Object.keys(config).length > 0) {
      updates.config = config;
    } else {
      updates.config = undefined;
    }

    onSave(widget.id, updates);
    onClose();
  }, [widget, title, url, maxItems, location, onSave, onClose]);

  // Submit on Enter / controller A (confirm) and cancel on Escape / controller B
  const handleSaveRef = useRef(handleSave);
  const onCloseRef = useRef(onClose);
  handleSaveRef.current = handleSave;
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleSaveRef.current();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    const handleNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string };
      if (detail?.action === "confirm") {
        e.stopImmediatePropagation();
        handleSaveRef.current();
      } else if (detail?.action === "cancel") {
        e.stopImmediatePropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    window.addEventListener("htpc:nav", handleNav, true);
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("htpc:nav", handleNav, true);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-4 w-full max-w-sm flex flex-col gap-3"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Widget Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium opacity-60 flex items-center gap-1">
            <Type size={10} /> Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={widget.type}
            className="px-2 py-1.5 rounded text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {/* Webview URL */}
        {widget.type === "webview" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium opacity-60 flex items-center gap-1">
              <Globe size={10} /> URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="px-2 py-1.5 rounded text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        )}

        {/* Max items */}
        {["recent-games", "favorite-games", "recent-movies", "recent-music", "quick-launch"].includes(widget.type) && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium opacity-60 flex items-center gap-1">
              <Hash size={10} /> Max Items
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxItems}
              onChange={(e) => setMaxItems(parseInt(e.target.value, 10) || 1)}
              className="px-2 py-1.5 rounded text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        )}

        {/* Weather location */}
        {widget.type === "weather" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium opacity-60 flex items-center gap-1">
              <Globe size={10} /> Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="New York"
              className="px-2 py-1.5 rounded text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: "var(--surface-1)", color: "var(--text-primary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: "var(--accent)", color: "var(--surface-base)" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export const WidgetConfigDialog: React.FC<WidgetConfigDialogProps> = ({
  widget,
  open,
  onClose,
  onSave,
}) => {
  if (!open || !widget) return null;
  return <WidgetConfigDialogContent widget={widget} onClose={onClose} onSave={onSave} />;
};
