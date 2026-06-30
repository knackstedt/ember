import React, { useRef, useState, useEffect, useLayoutEffect, useMemo, CSSProperties, RefObject } from "react";
import { Virtualizer, VirtualizerHandle } from "virtua";

export interface VirtualGridHandle {
  scrollToItem(index: number): void;
}

export interface VirtualGridProps<T> {
  items: T[];
  /** Fixed column count. Ignored when minItemWidth is set. */
  columnCount?: number;
  /** Minimum card width in px — column count is derived dynamically from container width. */
  minItemWidth?: number;
  rowHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  style?: CSSProperties;
  overscan?: number;
  /** Called whenever the effective column count changes (useful for syncing useGridFocus). */
  onColumnCountChange?: (count: number) => void;
  /**
   * When provided, the grid delegates scrolling to this external container
   * using virtua's Virtualizer with scrollRef (row-based virtualization).
   * This enables the grid to participate in a shared scroll context
   * (e.g. sticky filters that collapse before the grid scrolls).
   */
  scrollRef?: RefObject<HTMLElement>;
}

function useGridLayout(
  containerRef: RefObject<HTMLDivElement | null>,
  columnCountProp: number,
  minItemWidth: number | undefined,
  onColumnCountChange: ((count: number) => void) | undefined,
) {
  const [containerWidth, setContainerWidth] = useState(0);

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

  const effectiveColCount = useMemo(() => {
    if (containerWidth <= 0) return columnCountProp;
    return minItemWidth
      ? Math.max(2, Math.floor(containerWidth / minItemWidth))
      : columnCountProp;
  }, [containerWidth, minItemWidth, columnCountProp]);

  const prevColCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (effectiveColCount === prevColCountRef.current) return;
    // Skip the initial unmeasured default so the parent doesn't see a bogus column count.
    if (prevColCountRef.current === null && containerWidth <= 0) return;
    prevColCountRef.current = effectiveColCount;
    onColumnCountChange?.(effectiveColCount);
  }, [effectiveColCount, containerWidth, onColumnCountChange]);

  return { containerWidth, effectiveColCount };
}

export const VirtualGrid = React.forwardRef(function VirtualGridInner<T>(
  {
    items,
    columnCount: columnCountProp = 4,
    minItemWidth,
    rowHeight,
    renderItem,
    className,
    style,
    overscan = 2,
    onColumnCountChange,
    scrollRef,
  }: VirtualGridProps<T>,
  forwardedRef: React.Ref<VirtualGridHandle>,
): React.ReactElement {
  const virtualizerRef = useRef<VirtualizerHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderItemRef = useRef(renderItem);
  renderItemRef.current = renderItem;

  const { containerWidth, effectiveColCount } = useGridLayout(
    containerRef,
    columnCountProp,
    minItemWidth,
    onColumnCountChange,
  );

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToItem(index: number) {
        const row = Math.floor(index / effectiveColCount);
        virtualizerRef.current?.scrollToIndex(row, { align: "nearest" });
      },
    }),
    [effectiveColCount],
  );

  const cellWidth = minItemWidth
    ? minItemWidth
    : containerWidth > 0
      ? containerWidth / effectiveColCount
      : 200;
  const gridWidth =
    containerWidth > 0 ? cellWidth * effectiveColCount : containerWidth;
  const offset =
    containerWidth > 0
      ? Math.max(0, Math.floor((containerWidth - gridWidth) / 2))
      : 0;

  const rowCount = Math.max(1, Math.ceil(items.length / effectiveColCount));

  const renderRow = (rowIndex: number) => (
    <div
      key={rowIndex}
      style={{
        display: "flex",
        height: rowHeight,
        paddingLeft: offset,
        paddingRight: offset,
      }}
    >
      {Array.from({ length: effectiveColCount }, (_, colIndex) => {
        const index = rowIndex * effectiveColCount + colIndex;
        if (index >= items.length) {
          return <div key={colIndex} style={{ width: cellWidth, flexShrink: 0 }} />;
        }
        return (
          <div key={colIndex} style={{ width: cellWidth, flexShrink: 0 }} className="min-w-0">
            {renderItemRef.current(items[index], index)}
          </div>
        );
      })}
    </div>
  );

  if (scrollRef) {
    return (
      <div ref={containerRef} className={`w-full relative ${className ?? ""}`} style={style}>
        <Virtualizer
          ref={virtualizerRef}
          scrollRef={scrollRef}
          count={rowCount}
          itemSize={rowHeight}
          overscan={overscan}
        >
          {renderRow}
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
        count={rowCount}
        itemSize={rowHeight}
        overscan={overscan}
      >
        {renderRow}
      </Virtualizer>
    </div>
  );
}) as <T>(
  props: VirtualGridProps<T> & { ref?: React.Ref<VirtualGridHandle> },
) => React.ReactElement;
