import React, { useState, useEffect } from "react";
import { DashboardWidget, DashboardWidgetType } from "../../../shared/types";
import { X, Globe, Hash, Type } from "lucide-react";

interface WidgetConfigDialogProps {
  widget: DashboardWidget | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<DashboardWidget>) => void;
}

export const WidgetConfigDialog: React.FC<WidgetConfigDialogProps> = ({
  widget,
  open,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [maxItems, setMaxItems] = useState(5);
  const [location, setLocation] = useState("");

  useEffect(() => {
    if (widget) {
      setTitle(widget.title ?? "");
      setUrl((widget.config?.url as string) ?? "");
      setMaxItems((widget.config?.maxItems as number) ?? 5);
      setLocation((widget.config?.location as string) ?? "");
    }
  }, [widget]);

  if (!open || !widget) return null;

  const handleSave = () => {
    const updates: Partial<DashboardWidget> = { title: title || undefined };
    const config: Record<string, unknown> = { ...(widget.config ?? {}) };

    if (widget.type === "webview") {
      if (url) config.url = url;
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
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-4 w-full max-w-sm flex flex-col gap-3"
        style={{
          background: "var(--color-surface-overlay)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Widget Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--color-text-dim)" }}
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
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
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
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
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
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
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
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: "var(--color-surface-raised)", color: "var(--color-text)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
