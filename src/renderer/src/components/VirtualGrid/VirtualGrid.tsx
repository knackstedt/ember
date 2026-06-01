import React, { useRef, useState, useEffect, CSSProperties } from "react";
import { experimental_VGrid as VGrid, VGridHandle } from "virtua";

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

export const VirtualGrid = React.forwardRef(function VirtualGridInner<T>(
  {
    items,
    columnCount: columnCountProp = 4,
    minItemWidth,
    rowHeight,
    renderItem,
    className,
    style,
    overscan = 4,
    onColumnCountChange,
  }: VirtualGridProps<T>,
  forwardedRef: React.Ref<VirtualGridHandle>,
): React.ReactElement {
  const ref = useRef<VGridHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [effectiveColCount, setEffectiveColCount] = useState(columnCountProp);

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

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToItem(index: number) {
        const row = Math.floor(index / effectiveColCount);
        const col = index % effectiveColCount;
        ref.current?.scrollToIndex(col, row);
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

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <VGrid
        key={`${effectiveColCount}-${items.length}`}
        ref={ref}
        className={`gpu-scroll ${className ?? ""}`}
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
        row={Math.ceil(items.length / effectiveColCount)}
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
              {renderItem(items[index], index)}
            </div>
          );
        }}
      </VGrid>
    </div>
  );
}) as <T>(
  props: VirtualGridProps<T> & { ref?: React.Ref<VirtualGridHandle> },
) => React.ReactElement;
