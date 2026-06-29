import React from "react";
import { motion } from "framer-motion";
import { Monitor } from "lucide-react";
import {
  SplitscreenLayoutType,
  LAYOUT_DEFINITIONS,
  DisplayInfo,
} from "../../../../shared/splitscreen-types";

interface LayoutPickerProps {
  selected: SplitscreenLayoutType | null;
  onSelect: (type: SplitscreenLayoutType) => void;
  displays: DisplayInfo[];
  slotDisplayMapping?: Record<number, string>;
  onSlotDisplayMap?: (slotIndex: number, displayId: string) => void;
}

function LayoutPreview({ type, size = 80 }: { type: SplitscreenLayoutType; size?: number }) {
  const padding = 2;
  const inner = size - padding * 2;
  const slotStyle: React.CSSProperties = {
    stroke: "currentColor",
    strokeWidth: 1,
    fill: "currentColor",
    fillOpacity: 0.15,
  };

  function SlotRect({ index, x, y, w, h }: { index: number; x: number; y: number; w: number; h: number }) {
    return (
      <g key={index}>
        <rect x={x} y={y} width={w} height={h} {...slotStyle} rx={2} />
        <text
          x={x + w / 2}
          y={y + h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.min(w, h) * 0.4}
          fill="currentColor"
          opacity={0.6}
        >
          {index + 1}
        </text>
      </g>
    );
  }

  const h = inner / 2;
  const w = inner / 2;

  switch (type) {
    case "2p-horizontal":
      return (
        <svg width={size} height={size}>
          <SlotRect index={0} x={padding} y={padding} w={w} h={inner} />
          <SlotRect index={1} x={padding + w} y={padding} w={w} h={inner} />
        </svg>
      );
    case "2p-vertical":
      return (
        <svg width={size} height={size}>
          <SlotRect index={0} x={padding} y={padding} w={inner} h={h} />
          <SlotRect index={1} x={padding} y={padding + h} w={inner} h={h} />
        </svg>
      );
    case "3p-top-wide":
      return (
        <svg width={size} height={size}>
          <SlotRect index={0} x={padding} y={padding} w={inner} h={h} />
          <SlotRect index={1} x={padding} y={padding + h} w={w} h={h} />
          <SlotRect index={2} x={padding + w} y={padding + h} w={w} h={h} />
        </svg>
      );
    case "3p-bottom-wide":
      return (
        <svg width={size} height={size}>
          <SlotRect index={0} x={padding} y={padding} w={w} h={h} />
          <SlotRect index={1} x={padding + w} y={padding} w={w} h={h} />
          <SlotRect index={2} x={padding} y={padding + h} w={inner} h={h} />
        </svg>
      );
    case "3p-left-wide":
      return (
        <svg width={size} height={size}>
          <SlotRect index={0} x={padding} y={padding} w={w} h={inner} />
          <SlotRect index={1} x={padding + w} y={padding} w={w} h={h} />
          <SlotRect index={2} x={padding + w} y={padding + h} w={w} h={h} />
        </svg>
      );
    case "3p-right-wide":
      return (
        <svg width={size} height={size}>
          <SlotRect index={0} x={padding} y={padding} w={w} h={h} />
          <SlotRect index={1} x={padding} y={padding + h} w={w} h={h} />
          <SlotRect index={2} x={padding + w} y={padding} w={w} h={inner} />
        </svg>
      );
    case "4p-corners":
      return (
        <svg width={size} height={size}>
          <SlotRect index={0} x={padding} y={padding} w={w} h={h} />
          <SlotRect index={1} x={padding + w} y={padding} w={w} h={h} />
          <SlotRect index={2} x={padding} y={padding + h} w={w} h={h} />
          <SlotRect index={3} x={padding + w} y={padding + h} w={w} h={h} />
        </svg>
      );
    default:
      return null;
  }
}

export const LayoutPicker: React.FC<LayoutPickerProps> = ({
  selected,
  onSelect,
  displays,
  slotDisplayMapping,
  onSlotDisplayMap,
}) => {
  const selectedLayout = LAYOUT_DEFINITIONS.find((l) => l.type === selected);
  const multiMonitor = displays.length > 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Display info */}
      {multiMonitor && (
        <div
          className="flex items-center gap-2 p-3 rounded-[var(--radius-card)] text-xs"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          <Monitor size={14} style={{ color: "var(--accent)" }} />
          <span>
            {displays.length} displays detected: {displays.map((d) => `${d.name} (${d.width}x${d.height})${d.isPrimary ? " ★" : ""}`).join(", ")}
          </span>
        </div>
      )}

      {/* Layout grid */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {LAYOUT_DEFINITIONS.map((layout) => (
          <motion.button
            key={layout.type}
            className="flex flex-col items-center gap-2 p-3 rounded-[var(--radius-card)] transition-colors"
            style={{
              background: selected === layout.type ? "var(--accent)" : "var(--surface-1)",
              color: selected === layout.type ? "var(--surface-base)" : "var(--text-primary)",
              border: `1px solid ${selected === layout.type ? "var(--accent)" : "var(--border-default)"}`,
            }}
            onClick={() => onSelect(layout.type)}
            whileTap={{ scale: 0.96 }}
          >
            <div style={{ color: selected === layout.type ? "var(--surface-base)" : "var(--text-secondary)" }}>
              <LayoutPreview type={layout.type} />
            </div>
            <span className="text-xs text-center">{layout.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Per-slot monitor mapping */}
      {multiMonitor && selected && selectedLayout && onSlotDisplayMap && (
        <div
          className="flex flex-col gap-3 p-4 rounded-[var(--radius-card)]"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div className="flex items-center gap-2">
            <Monitor size={14} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Monitor Assignment
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Assign each player slot to a specific monitor, or leave as "Auto" to span across all displays.
          </p>
          <div className="flex flex-col gap-2">
            {Array.from({ length: selectedLayout.playerCount }, (_, i) => i).map((slotIdx) => (
              <div key={slotIdx} className="flex items-center gap-3">
                <span
                  className="text-sm font-semibold w-20"
                  style={{ color: "var(--accent)" }}
                >
                  Player {slotIdx + 1}
                </span>
                <select
                  className="text-xs px-3 py-1.5 rounded flex-1"
                  style={{
                    background: "var(--surface-0)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                  }}
                  value={slotDisplayMapping?.[slotIdx] ?? ""}
                  onChange={(e) => onSlotDisplayMap(slotIdx, e.target.value)}
                >
                  <option value="">Auto (span all displays)</option>
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.width}x{d.height}){d.isPrimary ? " ★" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
