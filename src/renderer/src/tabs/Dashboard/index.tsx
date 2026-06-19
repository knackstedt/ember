import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Responsive, Layout, useContainerWidth } from "react-grid-layout";
import { useSettingsStore } from "../../store/settings.store";
import {
  Plus,
  Trash2,
  Move,
  Check,
  X,
  GripVertical,
  Settings,
  Gamepad2,
} from "lucide-react";
import { useInputStore } from "../../store/input.store";
import { DashboardWidget, DashboardWidgetType, DashboardLayout } from "../../../shared/types";
import { WidgetRenderer } from "./DashboardWidget";
import { AddWidgetDialog } from "./AddWidgetDialog";
import { WidgetConfigDialog } from "./WidgetConfigDialog";
import "react-grid-layout/css/styles.css";

function generateId(): string {
  return `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getDefaultLayout(): DashboardLayout {
  return {
    widgets: [
      { id: "widget-recent-games", type: "recent-games", title: "Recently Played" },
      { id: "widget-favorites", type: "favorite-games", title: "Favorites" },
      { id: "widget-clock", type: "clock", title: "Clock" },
      { id: "widget-system", type: "system-info", title: "System" },
    ],
    grid: [
      { i: "widget-recent-games", x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
      { i: "widget-favorites", x: 6, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
      { i: "widget-clock", x: 0, y: 4, w: 3, h: 2, minW: 2, minH: 2 },
      { i: "widget-system", x: 3, y: 4, w: 3, h: 3, minW: 2, minH: 3 },
    ],
  };
}

const DEFAULT_WIDGET_SIZES: Record<DashboardWidgetType, { w: number; h: number; minW: number; minH: number }> = {
  "recent-games": { w: 4, h: 4, minW: 3, minH: 3 },
  "favorite-games": { w: 4, h: 4, minW: 3, minH: 3 },
  "system-info": { w: 3, h: 3, minW: 2, minH: 3 },
  clock: { w: 3, h: 2, minW: 2, minH: 2 },
  weather: { w: 3, h: 3, minW: 2, minH: 3 },
  news: { w: 4, h: 4, minW: 3, minH: 3 },
  achievements: { w: 4, h: 4, minW: 3, minH: 3 },
  "recent-movies": { w: 4, h: 4, minW: 3, minH: 3 },
  "recent-music": { w: 4, h: 4, minW: 3, minH: 3 },
  "now-playing": { w: 3, h: 3, minW: 2, minH: 3 },
  "quick-launch": { w: 4, h: 3, minW: 3, minH: 2 },
  webview: { w: 5, h: 5, minW: 3, minH: 3 },
  stats: { w: 3, h: 3, minW: 2, minH: 3 },
};

export function DashboardTab(): React.ReactElement {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);

  const savedLayout = settings?.dashboardLayout ?? getDefaultLayout();

  const [widgets, setWidgets] = useState<DashboardWidget[]>(savedLayout.widgets);
  const [gridLayout, setGridLayout] = useState<Layout[]>(savedLayout.grid);
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);

  const layoutRef = useRef<HTMLDivElement>(null);
  const editModeRef = useRef(editMode);
  const selectedIdRef = useRef(selectedId);
  const widgetsRef = useRef(widgets);
  const gridLayoutRef = useRef(gridLayout);

  editModeRef.current = editMode;
  selectedIdRef.current = selectedId;
  widgetsRef.current = widgets;
  gridLayoutRef.current = gridLayout;

  // Container width measurement for react-grid-layout
  const { width, containerRef } = useContainerWidth({ measureBeforeMount: false });

  // Controller long-press west (X) → toggle edit mode
  const lastEvent = useInputStore((s) => s.lastEvent);
  const westTimerRef = useRef<number | null>(null);
  const [westProgress, setWestProgress] = useState(0);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.action !== "west") return;

    if (lastEvent.type === "button_press") {
      setWestProgress(0);
      const start = Date.now();
      const tick = window.setInterval(() => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / 2000, 1);
        setWestProgress(progress);
        if (progress >= 1) {
          window.clearInterval(tick);
          setEditMode((v) => !v);
          setWestProgress(0);
        }
      }, 50);
      westTimerRef.current = tick;
    } else if (lastEvent.type === "button_release") {
      if (westTimerRef.current !== null) {
        window.clearInterval(westTimerRef.current);
        westTimerRef.current = null;
      }
      setWestProgress(0);
    }
  }, [lastEvent]);

  useEffect(() => {
    return () => {
      if (westTimerRef.current !== null) {
        window.clearInterval(westTimerRef.current);
      }
    };
  }, []);

  // Persist layout changes
  const persist = useCallback(
    (nextWidgets: DashboardWidget[], nextGrid: Layout[]) => {
      const nextLayout: DashboardLayout = {
        widgets: nextWidgets,
        grid: nextGrid.map((l) => ({
          i: l.i,
          x: l.x,
          y: l.y,
          w: l.w,
          h: l.h,
          minW: l.minW,
          minH: l.minH,
        })),
      };
      void updateSettings({ dashboardLayout: nextLayout });
    },
    [updateSettings],
  );

  // Initialize selection if empty
  useEffect(() => {
    if (!selectedId && widgets.length > 0) {
      setSelectedId(widgets[0].id);
    }
  }, [widgets, selectedId]);

  // Keyboard / gamepad navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editModeRef.current) {
        e.preventDefault();
        setEditMode(false);
        return;
      }
    };

    const handleNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string };
      if (!detail?.action) return;

      if (editModeRef.current) {
        if (detail.action === "cancel") {
          setEditMode(false);
          return;
        }
        if (["up", "down", "left", "right"].includes(detail.action)) {
          moveWidget(
            detail.action === "up"
              ? "ArrowUp"
              : detail.action === "down"
              ? "ArrowDown"
              : detail.action === "left"
              ? "ArrowLeft"
              : "ArrowRight",
          );
        }
        return;
      }

      if (detail.action === "cancel") {
        // In view mode, cancel does nothing on dashboard (global tab switch still works via bumpers)
        return;
      }

      if (["up", "down", "left", "right"].includes(detail.action)) {
        navigateSelection(
          detail.action === "up"
            ? "ArrowUp"
            : detail.action === "down"
            ? "ArrowDown"
            : detail.action === "left"
            ? "ArrowLeft"
            : "ArrowRight",
        );
      }
    };

    window.addEventListener("keydown", handleKey);
    window.addEventListener("htpc:nav", handleNav);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("htpc:nav", handleNav);
    };
  }, []);

  function getGridItem(id: string): Layout | undefined {
    return gridLayoutRef.current.find((l) => l.i === id);
  }

  function navigateSelection(key: string) {
    const current = selectedIdRef.current;
    const items = gridLayoutRef.current;
    if (!current || items.length === 0) {
      if (items.length > 0) setSelectedId(items[0].i);
      return;
    }

    const cur = items.find((i) => i.i === current);
    if (!cur) {
      setSelectedId(items[0].i);
      return;
    }

    const dir =
      key === "ArrowUp"
        ? { x: 0, y: -1 }
        : key === "ArrowDown"
        ? { x: 0, y: 1 }
        : key === "ArrowLeft"
        ? { x: -1, y: 0 }
        : { x: 1, y: 0 };

    // Find nearest widget in direction
    let best: Layout | null = null;
    let bestDist = Infinity;

    for (const item of items) {
      if (item.i === current) continue;
      const dx = item.x - cur.x;
      const dy = item.y - cur.y;

      if (dir.x !== 0 && dx * dir.x > 0) {
        const dist = Math.abs(dx) + Math.abs(dy) * 0.5;
        if (dist < bestDist) {
          bestDist = dist;
          best = item;
        }
      } else if (dir.y !== 0 && dy * dir.y > 0) {
        const dist = Math.abs(dy) + Math.abs(dx) * 0.5;
        if (dist < bestDist) {
          bestDist = dist;
          best = item;
        }
      }
    }

    if (best) {
      setSelectedId(best.i);
      // Scroll into view
      const el = layoutRef.current?.querySelector(`[data-grid-id="${best.i}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }

  function moveWidget(key: string) {
    const current = selectedIdRef.current;
    if (!current) return;

    const dx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    const dy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;

    setGridLayout((prev) => {
      const next = prev.map((l) => {
        if (l.i !== current) return l;
        return { ...l, x: Math.max(0, l.x + dx), y: Math.max(0, l.y + dy) };
      });
      gridLayoutRef.current = next;
      persist(widgetsRef.current, next);
      return next;
    });
  }

  function addWidget(type: DashboardWidgetType) {
    const id = generateId();
    const sizes = DEFAULT_WIDGET_SIZES[type] ?? { w: 3, h: 2, minW: 2, minH: 2 };

    // Find first free spot (simple greedy)
    let x = 0;
    let y = 0;
    const occupied = new Set<string>();
    for (const l of gridLayoutRef.current) {
      for (let cx = l.x; cx < l.x + l.w; cx++) {
        for (let cy = l.y; cy < l.y + l.h; cy++) {
          occupied.add(`${cx},${cy}`);
        }
      }
    }

    outer: for (let tryY = 0; tryY < 20; tryY++) {
      for (let tryX = 0; tryX < 12 - sizes.w + 1; tryX++) {
        let free = true;
        for (let cx = tryX; cx < tryX + sizes.w; cx++) {
          for (let cy = tryY; cy < tryY + sizes.h; cy++) {
            if (occupied.has(`${cx},${cy}`)) {
              free = false;
              break;
            }
          }
          if (!free) break;
        }
        if (free) {
          x = tryX;
          y = tryY;
          break outer;
        }
      }
    }

    const newWidget: DashboardWidget = { id, type, title: defaultTitle(type) };
    const newLayout: Layout = {
      i: id,
      x,
      y,
      w: sizes.w,
      h: sizes.h,
      minW: sizes.minW,
      minH: sizes.minH,
    };

    const nextWidgets = [...widgetsRef.current, newWidget];
    const nextGrid = [...gridLayoutRef.current, newLayout];
    setWidgets(nextWidgets);
    setGridLayout(nextGrid);
    setSelectedId(id);
    widgetsRef.current = nextWidgets;
    gridLayoutRef.current = nextGrid;
    persist(nextWidgets, nextGrid);
  }

  function removeWidget(id: string) {
    const nextWidgets = widgetsRef.current.filter((w) => w.id !== id);
    const nextGrid = gridLayoutRef.current.filter((l) => l.i !== id);
    setWidgets(nextWidgets);
    setGridLayout(nextGrid);
    if (selectedIdRef.current === id) {
      setSelectedId(nextWidgets[0]?.id ?? null);
    }
    widgetsRef.current = nextWidgets;
    gridLayoutRef.current = nextGrid;
    persist(nextWidgets, nextGrid);
  }

  function updateWidgetConfig(id: string, updates: Partial<DashboardWidget>) {
    const nextWidgets = widgetsRef.current.map((w) =>
      w.id === id ? { ...w, ...updates } : w,
    );
    setWidgets(nextWidgets);
    widgetsRef.current = nextWidgets;
    persist(nextWidgets, gridLayoutRef.current);
  }

  function handleLayoutChange(newLayout: Layout[]) {
    setGridLayout(newLayout);
    gridLayoutRef.current = newLayout;
    persist(widgetsRef.current, newLayout);
  }

  const activeWidgets = useMemo(() => {
    const ids = new Set(gridLayout.map((l) => l.i));
    return widgets.filter((w) => ids.has(w.id));
  }, [widgets, gridLayout]);

  return (
    <div className="flex flex-col h-full overflow-hidden" ref={layoutRef}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-end gap-2 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        {editMode && selectedId && (
          <button
            onClick={() => removeWidget(selectedId)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
            style={{
              background: "rgba(239,68,68,0.15)",
              color: "#ef4444",
            }}
          >
            <Trash2 size={12} />
            Remove
          </button>
        )}
        <button
          onClick={() => setAddDialogOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
          style={{ background: "var(--color-surface-raised)" }}
        >
          <Plus size={12} />
          Add Widget
        </button>
      </div>

      {/* Grid */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto p-4 relative">
        <Responsive
          className={`layout ${editMode ? "dashboard-edit" : ""}`}
          width={width}
          layouts={{ lg: gridLayout.map((l) => ({ ...l, static: !editMode })) }}
          breakpoints={{ lg: 0 }}
          cols={{ lg: 12 }}
          rowHeight={60}
          dragConfig={{ enabled: editMode, handle: ".drag-handle" }}
          resizeConfig={{
            enabled: editMode,
            handles: editMode ? ["s", "w", "e", "n", "sw", "nw", "se", "ne"] : [],
          }}
          onLayoutChange={handleLayoutChange}
          onDragStart={(_l, _o, n) => setDraggingId(n.i)}
          onDragStop={() => setDraggingId(null)}
          margin={[12, 12]}
          containerPadding={[0, 0]}
        >
          {activeWidgets.map((widget) => {
            const isSelected = selectedId === widget.id;
            const isDragging = draggingId === widget.id;
            const gridItem = getGridItem(widget.id);

            return (
              <div
                key={widget.id}
                data-grid-id={widget.id}
                className={`relative rounded-xl overflow-hidden transition-all duration-150 ${
                  isDragging ? "opacity-90" : ""
                }`}
                style={{
                  background: "var(--color-surface)",
                  boxShadow: isSelected
                    ? `0 0 0 2px ${editMode ? "var(--color-accent-dim)" : "var(--color-accent)"}, var(--shadow-card)`
                    : "var(--shadow-card)",
                  border: "1px solid var(--color-border)",
                } as React.CSSProperties}
                onClick={() => {
                  if (!editMode) setSelectedId(widget.id);
                }}
                onFocus={() => {
                  if (!editMode) setSelectedId(widget.id);
                }}
              >
                {/* Drag handle (only visible in edit mode) */}
                {editMode && (
                  <div
                    className="drag-handle absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-2 py-1 cursor-move"
                    style={{
                      background: "var(--color-surface-raised)",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <GripVertical size={12} className="opacity-50" />
                      <span className="text-[10px] font-medium opacity-70 truncate">
                        {widget.title ?? widget.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfigWidgetId(widget.id);
                        }}
                        className="p-0.5 rounded hover:opacity-70"
                        style={{ color: "var(--color-accent-dim)" }}
                        title="Widget settings"
                      >
                        <Settings size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeWidget(widget.id);
                        }}
                        className="p-0.5 rounded hover:opacity-70"
                        style={{ color: "#ef4444" }}
                        title="Remove widget"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Widget content */}
                <div className={`h-full relative ${editMode ? "pt-7" : ""} ${widget.type === "webview" ? "" : "p-3"}`}>
                  <WidgetRenderer widget={widget} />
                </div>
              </div>
            );
          })}
        </Responsive>

        {/* Floating Edit button + controller hint */}
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1 z-20">
          {!editMode && (
            <span
              className="text-[10px] opacity-40 flex items-center gap-1 px-2 py-0.5 rounded"
              style={{ background: "var(--color-surface-overlay)" }}
            >
              <Gamepad2 size={10} />
              Hold X 2s to edit
            </span>
          )}
          {westProgress > 0 && !editMode && (
            <div
              className="w-full h-0.5 rounded-full mb-1"
              style={{
                background: "var(--color-accent)",
                width: `${westProgress * 100}%`,
                transition: "width 50ms linear",
              }}
            />
          )}
          <button
            onClick={() => setEditMode((v) => !v)}
            className="flex items-center justify-center w-10 h-10 rounded-full transition-colors"
            style={{
              background: editMode ? "var(--color-accent)" : "var(--color-surface-raised)",
              color: editMode ? "var(--color-bg)" : "var(--color-text)",
              boxShadow: "var(--shadow-card)",
              border: "1px solid var(--color-border)",
            }}
            title={editMode ? "Done" : "Edit Layout"}
          >
            {editMode ? <Check size={18} /> : <Move size={18} />}
          </button>
        </div>
      </div>

      {/* Add Widget Dialog */}
      <AddWidgetDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSelect={addWidget}
      />

      {/* Widget Config Dialog */}
      <WidgetConfigDialog
        widget={widgets.find((w) => w.id === configWidgetId) ?? null}
        open={!!configWidgetId}
        onClose={() => setConfigWidgetId(null)}
        onSave={updateWidgetConfig}
      />
    </div>
  );
}

function defaultTitle(type: DashboardWidgetType): string {
  const titles: Record<DashboardWidgetType, string> = {
    "recent-games": "Recently Played",
    "favorite-games": "Favorites",
    "system-info": "System",
    clock: "Clock",
    weather: "Weather",
    news: "News",
    achievements: "Achievements",
    "recent-movies": "Recent Movies",
    "recent-music": "Recent Music",
    "now-playing": "Now Playing",
    "quick-launch": "Quick Launch",
    webview: "Web",
    stats: "Stats",
  };
  return titles[type] ?? type;
}
