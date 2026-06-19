import React from "react";
import { DashboardWidgetType } from "../../../shared/types";
import {
  Clock,
  Cpu,
  Gamepad2,
  Star,
  BarChart3,
  Music,
  Globe,
  Cloud,
  Trophy,
  Film,
  Disc,
  Rocket,
  Newspaper,
  X,
} from "lucide-react";

interface AddWidgetDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: DashboardWidgetType) => void;
}

const WIDGET_TYPES: { type: DashboardWidgetType; label: string; icon: React.ComponentType<any> }[] = [
  { type: "recent-games", label: "Recently Played", icon: Gamepad2 },
  { type: "favorite-games", label: "Favorites", icon: Star },
  { type: "clock", label: "Clock", icon: Clock },
  { type: "system-info", label: "System Info", icon: Cpu },
  { type: "stats", label: "Library Stats", icon: BarChart3 },
  { type: "now-playing", label: "Now Playing", icon: Music },
  { type: "weather", label: "Weather", icon: Cloud },
  { type: "webview", label: "Web View", icon: Globe },
  { type: "achievements", label: "Achievements", icon: Trophy },
  { type: "recent-movies", label: "Recent Movies", icon: Film },
  { type: "recent-music", label: "Recent Music", icon: Disc },
  { type: "quick-launch", label: "Quick Launch", icon: Rocket },
  { type: "news", label: "News", icon: Newspaper },
];

export const AddWidgetDialog: React.FC<AddWidgetDialogProps> = ({
  open,
  onClose,
  onSelect,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-4 w-full max-w-lg max-h-[80vh] flex flex-col"
        style={{
          background: "var(--color-surface-overlay)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Add Widget</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--color-text-dim)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {WIDGET_TYPES.map((w) => (
            <button
              key={w.type}
              onClick={() => {
                onSelect(w.type);
                onClose();
              }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg text-sm transition-colors hover:opacity-80"
              style={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
              }}
            >
              <w.icon size={20} style={{ color: "var(--color-accent)" }} />
              <span className="text-xs text-center">{w.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
