import React, { useRef, useState, useCallback, useLayoutEffect, useEffect, CSSProperties, RefObject } from "react";
import { Virtualizer, VirtualizerHandle } from "virtua";

export interface BookshelfViewProps<T> {
  items: T[];
  renderSpine: (item: T, index: number, state: { isHovered: boolean; isFocused: boolean }) => React.ReactNode;
  shelfHeight?: number;
  /** Fixed items per shelf. If omitted, the shelf computes how many fit
   *  in the visible width when one spine is expanded. */
  itemsPerShelf?: number;
  className?: string;
  style?: CSSProperties;
  scrollRef?: RefObject<HTMLElement>;
  overscan?: number;
  /** Index of the currently focused item (controller navigation) */
  focusedIndex?: number;
  /** Called when the computed items-per-shelf changes (e.g. on resize) */
  onItemsPerRowChange?: (count: number) => void;
  /** Called when a spine is clicked by mouse or virtual cursor. */
  onItemClick?: (item: T, index: number) => void;
  /** Binds context-menu / long-press handlers to each spine. */
  bindItem?: (item: T, index: number) => Record<string, unknown>;
}

const SPINE_COLLAPSED = 36;
const SPINE_EXPANDED = 148;
const SPINE_GAP = 3;
const SHELF_PADDING = 24; // px-3 = 12px each side

function computeItemsPerShelf(width: number): number {
  const available = Math.max(0, width - SHELF_PADDING);
  // One item expanded, rest collapsed: expanded + (n-1)*(collapsed + gap)
  const n = 1 + Math.floor((available - SPINE_EXPANDED) / (SPINE_COLLAPSED + SPINE_GAP));
  return Math.max(4, n);
}

export const BookshelfView = React.forwardRef(function BookshelfViewInner<T>(
  {
    items,
    renderSpine,
    shelfHeight = 260,
    itemsPerShelf: itemsPerShelfProp,
    className,
    style,
    scrollRef,
    overscan = 2,
    focusedIndex = -1,
    onItemsPerRowChange,
    onItemClick,
    bindItem,
  }: BookshelfViewProps<T>,
  forwardedRef: React.Ref<{ scrollToItem(index: number): void }>,
): React.ReactElement {
  const virtualizerRef = useRef<VirtualizerHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredGlobalIndex, setHoveredGlobalIndex] = useState<number | null>(null);
  const renderSpineRef = useRef(renderSpine);
  renderSpineRef.current = renderSpine;
  const onItemsPerRowChangeRef = useRef(onItemsPerRowChange);
  onItemsPerRowChangeRef.current = onItemsPerRowChange;
  const onItemClickRef = useRef(onItemClick);
  onItemClickRef.current = onItemClick;
  const bindItemRef = useRef(bindItem);
  bindItemRef.current = bindItem;

  // Measure container width so we can fit as many spines as possible per shelf
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w > 0) setContainerWidth(w);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId: number | null = null;
    const ro = new ResizeObserver((entries) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        for (const entry of entries) {
          const w = entry.contentRect.width;
          if (w > 0) setContainerWidth(w);
        }
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const itemsPerShelf = itemsPerShelfProp ?? (containerWidth > 0 ? computeItemsPerShelf(containerWidth) : 12);
  const shelfCount = Math.ceil(items.length / itemsPerShelf);

  // Report items-per-row changes upward
  useEffect(() => {
    onItemsPerRowChangeRef.current?.(itemsPerShelf);
  }, [itemsPerShelf]);

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToItem(index: number) {
        const shelf = Math.floor(index / itemsPerShelf);
        virtualizerRef.current?.scrollToIndex(shelf, { align: "nearest" });
      },
    }),
    [itemsPerShelf],
  );

  const renderShelf = useCallback(
    (shelfIndex: number) => {
      const start = shelfIndex * itemsPerShelf;
      const shelfItems = items.slice(start, start + itemsPerShelf);
      return (
        <div
          key={shelfIndex}
          style={{ height: shelfHeight }}
          className="flex flex-col"
        >
          <div
            className="flex items-end gap-[3px] px-3 pt-3 overflow-x-auto"
            style={{
              background: "var(--surface-1)",
              borderRadius: "10px 10px 0 0",
              minHeight: shelfHeight - 26,
              scrollbarWidth: "none",
            }}
          >
            {shelfItems.map((item, i) => {
              const globalIndex = start + i;
              const isHovered = hoveredGlobalIndex === globalIndex;
              const isFocused = focusedIndex === globalIndex;
              const isActive = isHovered || isFocused;
              const itemProps = bindItemRef.current ? bindItemRef.current(item, globalIndex) : {};
              return (
                <div
                  key={globalIndex}
                  className="flex-shrink-0 cursor-pointer transition-all duration-200"
                  style={{
                    width: isActive ? SPINE_EXPANDED : SPINE_COLLAPSED,
                    height: isActive ? 212 : 198,
                    borderRadius: isActive ? "7px 7px 0 0" : "3px 3px 0 0",
                    overflow: "hidden",
                    position: "relative",
                    zIndex: isActive ? 5 : 1,
                  }}
                  onMouseEnter={() => setHoveredGlobalIndex(globalIndex)}
                  onMouseLeave={() => setHoveredGlobalIndex((prev) => (prev === globalIndex ? null : prev))}
                  onClick={() => onItemClickRef.current?.(item, globalIndex)}
                  {...itemProps}
                >
                  {renderSpineRef.current(item, globalIndex, { isHovered, isFocused })}
                </div>
              );
            })}
          </div>
          {/* Shelf wood base */}
          <div
            style={{
              height: 13,
              background: "linear-gradient(180deg, #2a1e10, #19120a)",
              borderRadius: "0 0 6px 6px",
              boxShadow: "0 6px 18px rgba(0,0,0,.72)",
            }}
          />
        </div>
      );
    },
    [items, itemsPerShelf, shelfHeight, hoveredGlobalIndex, focusedIndex],
  );

  const shelfData = Array.from({ length: shelfCount }, (_, i) => i);

  if (scrollRef) {
    return (
      <div ref={containerRef} className={`w-full ${className ?? ""}`} style={style}>
        <Virtualizer
          ref={virtualizerRef}
          scrollRef={scrollRef}
          data={shelfData}
          itemSize={shelfHeight}
          bufferSize={overscan * shelfHeight}
        >
          {(_, shelfIndex) => renderShelf(shelfIndex)}
        </Virtualizer>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-y-auto gpu-scroll ${className ?? ""}`}
      style={style}
    >
      <Virtualizer
        ref={virtualizerRef}
        data={shelfData}
        itemSize={shelfHeight}
        bufferSize={overscan * shelfHeight}
      >
        {(_, shelfIndex) => renderShelf(shelfIndex)}
      </Virtualizer>
    </div>
  );
}) as <T>(
  props: BookshelfViewProps<T> & { ref?: React.Ref<{ scrollToItem(index: number): void }> },
) => React.ReactElement;
