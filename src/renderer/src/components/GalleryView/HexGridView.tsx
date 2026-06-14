import React, { useRef, useCallback, useLayoutEffect, useEffect, CSSProperties, RefObject } from "react";
import { Virtualizer, VirtualizerHandle } from "virtua";
import { NavAction } from "../../hooks/useGridFocus";

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
  onClick?: () => void;
  onFavorite?: () => void;
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
    overscan = 2,
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
    [cols],
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
          {isEvenRow && rowItems.length < cols
            ? Array.from({ length: cols - rowItems.length }, (_, i) => (
                <div key={`spacer-${i}`} style={{ width: cellWidth, flexShrink: 0 }} />
              ))
            : null}
          {rowItems.map(({ item, index }) => {
            const hex = renderHexRef.current(item, index);
            const isFocused = index === focusedIndex;
            const itemProps = bindItemRef.current ? bindItemRef.current(item, index) : {};
            return (
              <div
                key={index}
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
                      backgroundImage: hex.coverUrl ? `url(${hex.coverUrl})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundColor: !hex.coverUrl ? placeholderColor(hex.title) : undefined,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      filter: isFocused ? "brightness(1.15)" : "brightness(1)",
                      transition: "filter 0.2s",
                    }}
                  >
                    {!hex.coverUrl && (
                      <span style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>
                        {initials(hex.title)}
                      </span>
                    )}

                    {hex.coverUrl && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 100%)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#fff",
                            textAlign: "center",
                            padding: 10,
                            textShadow: "0 1px 4px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.9)",
                            wordBreak: "break-word",
                            lineHeight: 1.25,
                            maxWidth: "80%",
                          }}
                          title={hex.title}
                        >
                          {hex.title}
                        </span>
                      </div>
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
      >
        {(rowIndex) => renderRow(rowIndex)}
      </Virtualizer>
    </div>
  );
}) as <T>(
  props: HexGridViewProps<T> & { ref?: React.Ref<{ scrollToItem(index: number): void }> },
) => React.ReactElement;
