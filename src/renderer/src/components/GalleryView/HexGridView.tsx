import React, { useRef, useCallback, useLayoutEffect, useEffect, CSSProperties, RefObject } from "react";
import { Virtualizer, VirtualizerHandle } from "virtua";
import { NavAction } from "../../hooks/useGridFocus";
import { PLATFORM_ICONS } from "../GameCard/icons";

export interface HexCellData {
  coverUrl?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  isFavorite?: boolean;
  isLoading?: boolean;
  missing?: boolean;
  progress?: number;
  platform?: string;
  onClick?: () => void;
  onFavorite?: () => void;
  onVisible?: () => void;
  skeleton?: boolean;
}

export interface HexGridViewProps<T> {
  items: T[];
  renderHex: (item: T, index: number) => HexCellData;
  minItemWidth?: number;
  onColumnCountChange?: (count: number) => void;
  focusedIndex?: number;
  className?: string;
  style?: CSSProperties;
  scrollRef?: RefObject<HTMLElement>;
  overscan?: number;
  bindItem?: (item: T, index: number) => Record<string, unknown>;
}

const SQRT3 = Math.sqrt(3);
const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

const PLACEHOLDER_COLORS = ["#1a1a2e", "#16213e", "#0f3460", "#1b1b2f", "#2d132c", "#1c1c1c"];

function placeholderColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

function initials(title: string): string {
  return title.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function platformIconUrl(platform: string): string {
  const svg = PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.unknown;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface HexCellProps {
  hex: HexCellData;
  isFocused: boolean;
  cellWidth: number;
  hexHeight: number;
  itemProps?: Record<string, unknown>;
}

function hexDataEqual(a: HexCellData, b: HexCellData): boolean {
  return (
    a.coverUrl === b.coverUrl &&
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.badge === b.badge &&
    a.badgeColor === b.badgeColor &&
    a.isFavorite === b.isFavorite &&
    a.isLoading === b.isLoading &&
    a.missing === b.missing &&
    a.progress === b.progress &&
    a.platform === b.platform &&
    a.skeleton === b.skeleton
  );
}

const HexCell = React.memo(function HexCellInner({ hex, isFocused, cellWidth, hexHeight, itemProps }: HexCellProps) {
  const [imgError, setImgError] = React.useState(false);
  const hasCover = hex.coverUrl && !imgError;

  useEffect(() => {
    hex.onVisible?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setImgError(false);
  }, [hex.coverUrl]);

  if (hex.skeleton) {
    return (
      <div
        style={{
          width: cellWidth,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Outer hex — mirrors real cell structure */}
        <div
          style={{
            width: cellWidth,
            height: hexHeight,
            position: "relative",
            clipPath: HEX_CLIP,
            background: "transparent",
          }}
        >
          <div
            className="skeleton-shimmer"
            style={{
              position: "absolute",
              inset: 2,
              clipPath: HEX_CLIP,
              backgroundColor: "var(--color-surface-raised)",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: cellWidth,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        zIndex: isFocused ? 10 : 1,
        transform: isFocused ? "scale(1.04)" : "scale(1)",
        transition: "transform 0.2s ease",
        filter: isFocused
          ? "drop-shadow(0 0 10px var(--color-accent)) drop-shadow(0 0 4px var(--color-accent))"
          : undefined,
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
      {...itemProps}
      onClick={() => hex.onClick?.()}
    >
      {/* Outer hex: focus glow ring */}
      <div
        style={{
          width: cellWidth,
          height: hexHeight,
          position: "relative",
          clipPath: HEX_CLIP,
          background: "transparent",
          transition: "filter 0.2s",
          cursor: "pointer",
        }}
      >
        {/* Inner hex: thumbnail / placeholder + title */}
        <div
          style={{
            position: "absolute",
            inset: 2,
            clipPath: HEX_CLIP,
            backgroundColor: !hasCover ? placeholderColor(hex.title) : undefined,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            filter: isFocused ? "brightness(1.15)" : "brightness(1)",
            transition: "filter 0.2s",
          }}
        >
          {hasCover && (
            <img
              src={hex.coverUrl}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              onError={() => setImgError(true)}
            />
          )}

          {!hasCover && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                textAlign: "center",
                padding: "8px 12px",
                wordBreak: "break-word",
                lineHeight: 1.2,
                maxWidth: "80%",
                zIndex: 2,
              }}
            >
              {hex.title}
            </span>
          )}

          {hex.missing && (
            <span
              style={{
                position: "absolute",
                top: "28%",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                backgroundColor: "#ff4444",
                color: "#fff",
                letterSpacing: "0.05em",
                zIndex: 3,
              }}
            >
              Missing
            </span>
          )}
          {!hex.missing && hex.badge && (
            <span
              style={{
                position: "absolute",
                top: "28%",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                backgroundColor: hex.badgeColor ?? "var(--color-accent)",
                color: "var(--color-bg)",
                letterSpacing: "0.05em",
                zIndex: 3,
              }}
            >
              {hex.badge}
            </span>
          )}

          {hex.isLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.5)",
                zIndex: 4,
              }}
            >
              <div className="w-7 h-7 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
            </div>
          )}


          {hex.progress !== undefined && hex.progress > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: "22%",
                left: "8%",
                right: "8%",
                height: 3,
                borderRadius: 2,
                background: "rgba(0,0,0,0.5)",
                overflow: "hidden",
                zIndex: 3,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${hex.progress * 100}%`,
                  background: "var(--color-accent)",
                  borderRadius: 2,
                }}
              />
            </div>
          )}

          {hex.platform && (
            <div
              style={{
                position: "absolute",
                bottom: "6%",
                left: "50%",
                transform: "translateX(-50%)",
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 3,
              }}
            >
              <img
                src={platformIconUrl(hex.platform)}
                alt=""
                style={{ width: 20, height: 20, objectFit: "contain" }}
              />
            </div>
          )}
        </div>

        {hex.isFavorite && !hex.onFavorite && (
          <svg
            viewBox="0 0 24 24"
            fill="var(--color-accent)"
            style={{
              position: "absolute",
              top: "28%",
              right: "8%",
              width: 16,
              height: 16,
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
              zIndex: 3,
            }}
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        )}

        {hex.onFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              hex.onFavorite?.();
            }}
            style={{
              position: "absolute",
              top: "28%",
              right: "6%",
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
              zIndex: 5,
            }}
            aria-label={hex.isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <svg
              viewBox="0 0 24 24"
              fill={hex.isFavorite ? "var(--color-accent)" : "none"}
              stroke={hex.isFavorite ? "var(--color-accent)" : "white"}
              strokeWidth={2}
              style={{ width: 14, height: 14 }}
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.isFocused === next.isFocused &&
    prev.cellWidth === next.cellWidth &&
    prev.hexHeight === next.hexHeight &&
    hexDataEqual(prev.hex, next.hex)
  );
});

const HexGridItem = React.forwardRef<
  HTMLDivElement,
  { style: CSSProperties; index: number; children: React.ReactNode }
>(function HexGridItemInner({ style, children }, ref) {
  return (
    <div ref={ref} style={{ ...style, overflow: "visible" }}>
      {children}
    </div>
  );
});

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = React.useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w > 0) setWidth(w);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let rafId: number | null = null;
    const ro = new ResizeObserver((entries) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        for (const entry of entries) {
          const w = entry.contentRect.width;
          if (w > 0) setWidth(w);
        }
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
  return width;
}

export const HexGridView = React.forwardRef(function HexGridViewInner<T>(
  {
    items,
    renderHex,
    minItemWidth = 200,
    onColumnCountChange,
    focusedIndex = -1,
    className,
    style,
    scrollRef,
    overscan = 4,
    bindItem,
  }: HexGridViewProps<T>,
  forwardedRef: React.Ref<{ scrollToItem(index: number): void; getNextIndex(currentIndex: number, action: NavAction): number | null }>,
): React.ReactElement {
  const virtualizerRef = useRef<VirtualizerHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderHexRef = useRef(renderHex);
  renderHexRef.current = renderHex;
  const bindItemRef = useRef(bindItem);
  bindItemRef.current = bindItem;
  const onColumnCountChangeRef = useRef(onColumnCountChange);
  onColumnCountChangeRef.current = onColumnCountChange;

  const containerWidth = useContainerWidth(containerRef);
  const cols = Math.max(2, Math.floor(containerWidth / minItemWidth));

  const cellWidth = containerWidth > 0 ? containerWidth / cols : minItemWidth;
  const hexHeight = (cellWidth * 2) / SQRT3;
  const rowHeight = hexHeight * 0.75;
  const overlap = (hexHeight - rowHeight) / 2;

  useEffect(() => {
    onColumnCountChangeRef.current?.(cols);
  }, [cols]);

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToItem(index: number) {
        const pairSize = 2 * cols - 1;
        const pairIndex = Math.floor(index / pairSize);
        const offsetInPair = index % pairSize;
        const row = offsetInPair < cols ? pairIndex * 2 : pairIndex * 2 + 1;
        virtualizerRef.current?.scrollToIndex(row, { align: "nearest" });
      },
      getNextIndex(currentIndex: number, action: NavAction) {
        const pairSize = 2 * cols - 1;
        const pairIndex = Math.floor(currentIndex / pairSize);
        const offsetInPair = currentIndex % pairSize;
        const isEvenRow = offsetInPair < cols;
        const row = isEvenRow ? pairIndex * 2 : pairIndex * 2 + 1;
        const col = isEvenRow ? offsetInPair : offsetInPair - cols;
        const itemCount = items.length;

        let nextRow = row;
        let nextCol = col;

        switch (action) {
          case "left":
            if (col === 0) return null;
            nextCol = col - 1;
            break;
          case "right": {
            const maxCol = isEvenRow ? cols - 1 : cols - 2;
            if (col >= maxCol) return null;
            nextCol = col + 1;
            break;
          }
          case "up": {
            if (row === 0) return null;
            nextRow = row - 1;
            if (isEvenRow) {
              // even -> odd above: clamp to odd row bounds
              nextCol = Math.min(col, cols - 2);
            } else {
              // odd -> even above: same column
              nextCol = col;
            }
            break;
          }
          case "down": {
            const maxRow = rowCount - 1;
            if (row >= maxRow) return null;
            nextRow = row + 1;
            if (isEvenRow) {
              // even -> odd below: clamp to odd row bounds
              nextCol = Math.min(col, cols - 2);
            } else {
              // odd -> even below: same column
              nextCol = col;
            }
            break;
          }
          default:
            return null;
        }

        // Convert (nextRow, nextCol) back to flat index
        const nextPairIndex = Math.floor(nextRow / 2);
        const nextIsEven = nextRow % 2 === 0;
        const nextIndex = nextIsEven
          ? nextPairIndex * pairSize + nextCol
          : nextPairIndex * pairSize + cols + nextCol;
        if (nextIndex >= itemCount) return null;
        return nextIndex;
      },
    }),
    [cols, items.length],
  );

  const pairSize = 2 * cols - 1;
  const fullPairs = Math.floor(items.length / pairSize);
  const remainder = items.length % pairSize;
  let rowCount = fullPairs * 2;
  if (remainder > 0) rowCount += 1;
  if (remainder > cols) rowCount += 1;

  const getRowItems = useCallback(
    (rowIndex: number) => {
      const pairIndex = Math.floor(rowIndex / 2);
      const isEvenRow = rowIndex % 2 === 0;
      const startIndex = isEvenRow ? pairIndex * pairSize : pairIndex * pairSize + cols;
      const count = isEvenRow ? cols : cols - 1;
      const rowItems: { item: T; index: number }[] = [];
      for (let i = 0; i < count; i++) {
        const idx = startIndex + i;
        if (idx < items.length) rowItems.push({ item: items[idx], index: idx });
      }
      return { rowItems, isEvenRow };
    },
    [items, cols, pairSize],
  );

  const renderRow = useCallback(
    (rowIndex: number) => {
      const { rowItems, isEvenRow } = getRowItems(rowIndex);
      const paddingLeft = isEvenRow ? 0 : cellWidth / 2;
      const paddingRight = isEvenRow ? 0 : cellWidth / 2;

      return (
        <div
          key={rowIndex}
          style={{
            display: "flex",
            height: rowHeight,
            paddingLeft,
            paddingRight,
            overflow: "visible",
          }}
        >
          {rowItems.map(({ item, index }) => {
            const hex = renderHexRef.current(item, index);
            const isFocused = index === focusedIndex;
            const itemProps = bindItemRef.current ? bindItemRef.current(item, index) : {};
            return (
              <HexCell
                key={index}
                hex={hex}
                isFocused={isFocused}
                cellWidth={cellWidth}
                hexHeight={hexHeight}
                itemProps={itemProps}
              />
            );
          })}
        </div>
      );
    },
    [cellWidth, hexHeight, rowHeight, focusedIndex, getRowItems, cols],
  );

  const wrapperStyle: CSSProperties = {
    paddingTop: overlap + 8,
    paddingBottom: overlap + 8,
    paddingLeft: 12,
    paddingRight: 12,
  };

  if (scrollRef) {
    return (
      <div ref={containerRef} className={`w-full ${className ?? ""}`} style={{ ...style, ...wrapperStyle }}>
        <Virtualizer
          ref={virtualizerRef}
          scrollRef={scrollRef}
          count={rowCount}
          itemSize={rowHeight}
          overscan={overscan}
          item={HexGridItem}
        >
          {(rowIndex) => renderRow(rowIndex)}
        </Virtualizer>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-y-auto gpu-scroll ${className ?? ""}`}
      style={{ ...style, ...wrapperStyle }}
    >
      <Virtualizer
        ref={virtualizerRef}
        count={rowCount}
        itemSize={rowHeight}
        overscan={overscan}
        item={HexGridItem}
      >
        {(rowIndex) => renderRow(rowIndex)}
      </Virtualizer>
    </div>
  );
}) as <T>(
  props: HexGridViewProps<T> & { ref?: React.Ref<{ scrollToItem(index: number): void }> },
) => React.ReactElement;
