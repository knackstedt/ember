import React, { useRef, useState, useEffect, useLayoutEffect, CSSProperties, RefObject } from "react";
import { experimental_VGrid as VGrid, VGridHandle, Virtualizer, VirtualizerHandle } from "virtua";

export interface VirtualGridHandle {
  scrollToItem(index: number): void;
}

interface VirtualGridProps<T> {
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

const GridCell = React.forwardRef<
  HTMLDivElement,
  { style: CSSProperties; children: React.ReactNode }
>(function GridCellInner({ style, children }, ref) {
  return (
    <div
      ref={ref}
      style={{
        ...style,
        width: style.minWidth,
        height: style.minHeight,
        display: "flex",
      }}
    >
      {children}
    </div>
  );
});

function useGridLayout(
  containerRef: RefObject<HTMLDivElement | null>,
  columnCountProp: number,
  minItemWidth: number | undefined,
  onColumnCountChange: ((count: number) => void) | undefined,
) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [effectiveColCount, setEffectiveColCount] = useState(columnCountProp);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w > 0) {
      setContainerWidth(w);
      const cols = minItemWidth
        ? Math.max(2, Math.floor(w / minItemWidth))
        : columnCountProp;
      setEffectiveColCount((prev) => (prev !== cols ? cols : prev));
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) {
          setContainerWidth(w);
          const cols = minItemWidth
            ? Math.max(2, Math.floor(w / minItemWidth))
            : columnCountProp;
          setEffectiveColCount((prev) => (prev !== cols ? cols : prev));
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [columnCountProp, minItemWidth]);

  useEffect(() => {
    onColumnCountChange?.(effectiveColCount);
  }, [effectiveColCount]);

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
  const vgridRef = useRef<VGridHandle>(null);
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
        if (scrollRef) {
          virtualizerRef.current?.scrollToIndex(row, { align: "nearest" });
        } else {
          const vgrid = vgridRef.current;
          if (!vgrid) return;
          const rowOffset = row * rowHeight;
          const scrollTop = vgrid.scrollTop;
          const viewportHeight = vgrid.viewportHeight;
          if (rowOffset < scrollTop) {
            vgrid.scrollTo(0, rowOffset);
          } else if (rowOffset + rowHeight > scrollTop + viewportHeight) {
            vgrid.scrollTo(0, rowOffset + rowHeight - viewportHeight);
          }
        }
      },
    }),
    [effectiveColCount, rowHeight, scrollRef],
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

  const rowCount = Math.ceil(items.length / effectiveColCount);

  if (scrollRef) {
    return (
      <div ref={containerRef} className="w-full relative">
        <Virtualizer
          key={`${effectiveColCount}-${items.length}`}
          ref={virtualizerRef}
          scrollRef={scrollRef}
          count={rowCount}
          itemSize={rowHeight}
          overscan={overscan}
        >
          {(rowIndex) => (
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
          )}
        </Virtualizer>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <VGrid
        key={`${effectiveColCount}-${items.length}`}
        ref={vgridRef}
        className={`gpu-scroll vgrid-center ${className ?? ""}`}
        style={{
          height: "100%",
          width: "100%",
          overflowX: "hidden",
          paddingTop: 8,
          paddingBottom: 8,
          // @ts-expect-error - CSS variable
          "--scroll-x": `${offset}px`,
          ...style,
        }}
        item={GridCell}
        row={rowCount}
        col={effectiveColCount}
        cellHeight={rowHeight}
        cellWidth={cellWidth}
        overscan={overscan}
      >
        {({ rowIndex, colIndex }) => {
          const index = rowIndex * effectiveColCount + colIndex;
          if (index >= items.length) {
            return <div className="w-full h-full" />;
          }
          return (
            <div className="w-full h-full min-w-0">
              {renderItemRef.current(items[index], index)}
            </div>
          );
        }}
      </VGrid>
    </div>
  );
}) as <T>(
  props: VirtualGridProps<T> & { ref?: React.Ref<VirtualGridHandle> },
) => React.ReactElement;
