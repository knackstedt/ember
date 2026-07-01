import React, { useRef, useState, useCallback, useLayoutEffect, useEffect, CSSProperties, RefObject } from "react";
import { Virtualizer, VirtualizerHandle } from "virtua";

export interface SpreadDeckViewProps<T> {
  items: T[];
  renderCard: (item: T, index: number, state: { isHovered: boolean; isFocused: boolean }) => React.ReactNode;
  deckHeight?: number;
  /** Fixed items per deck. If omitted, the deck computes how many fit
   *  in the visible width with one card hovered. */
  itemsPerDeck?: number;
  className?: string;
  style?: CSSProperties;
  scrollRef?: RefObject<HTMLElement>;
  overscan?: number;
  /** Index of the currently focused item (controller navigation) */
  focusedIndex?: number;
  /** Called when the computed items-per-deck changes (e.g. on resize) */
  onItemsPerRowChange?: (count: number) => void;
  /** Called when a card is clicked by mouse or virtual cursor. */
  onItemClick?: (item: T, index: number) => void;
  /** Binds context-menu / long-press handlers to each card. */
  bindItem?: (item: T, index: number) => Record<string, unknown>;
}

const CARD_WIDTH = 152;
const CARD_OVERLAP = 28;

function computeItemsPerDeck(width: number): number {
  const available = Math.max(0, width);
  // One card full width, rest overlap: 152 + (n-1)*28
  const n = 1 + Math.floor((available - CARD_WIDTH) / CARD_OVERLAP);
  return Math.max(4, n);
}

export const SpreadDeckView = React.forwardRef(function SpreadDeckViewInner<T>(
  {
    items,
    renderCard,
    deckHeight = 320,
    itemsPerDeck: itemsPerDeckProp,
    className,
    style,
    scrollRef,
    overscan = 2,
    focusedIndex = -1,
    onItemsPerRowChange,
    onItemClick,
    bindItem,
  }: SpreadDeckViewProps<T>,
  forwardedRef: React.Ref<{ scrollToItem(index: number): void }>,
): React.ReactElement {
  const virtualizerRef = useRef<VirtualizerHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredGlobalIndex, setHoveredGlobalIndex] = useState<number | null>(null);
  const renderCardRef = useRef(renderCard);
  renderCardRef.current = renderCard;
  const onItemsPerRowChangeRef = useRef(onItemsPerRowChange);
  onItemsPerRowChangeRef.current = onItemsPerRowChange;
  const onItemClickRef = useRef(onItemClick);
  onItemClickRef.current = onItemClick;
  const bindItemRef = useRef(bindItem);
  bindItemRef.current = bindItem;

  // Measure container width so we can fit as many cards as possible per deck
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

  const itemsPerDeck = itemsPerDeckProp ?? (containerWidth > 0 ? computeItemsPerDeck(containerWidth) : 16);
  const deckCount = Math.ceil(items.length / itemsPerDeck);

  // Report items-per-row changes upward
  useEffect(() => {
    onItemsPerRowChangeRef.current?.(itemsPerDeck);
  }, [itemsPerDeck]);

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToItem(index: number) {
        const deck = Math.floor(index / itemsPerDeck);
        virtualizerRef.current?.scrollToIndex(deck, { align: "nearest" });
      },
    }),
    [itemsPerDeck],
  );

  const renderDeck = useCallback(
    (deckIndex: number) => {
      const start = deckIndex * itemsPerDeck;
      const deckItems = items.slice(start, start + itemsPerDeck);
      const N = deckItems.length;
      const totalWidth = Math.max((N - 1) * CARD_OVERLAP + CARD_WIDTH, 400);

      return (
        <div
          key={deckIndex}
          style={{ height: deckHeight }}
          className="flex flex-col justify-center"
        >
          <div
            className="overflow-x-auto gpu-scroll"
            style={{ scrollbarWidth: "none" }}
          >
            <div
              className="relative"
              style={{ width: totalWidth, height: 224 + 32 }}
            >
              {deckItems.map((item, i) => {
                const globalIndex = start + i;
                const isHovered = hoveredGlobalIndex === globalIndex;
                const isFocused = focusedIndex === globalIndex;
                const isActive = isHovered || isFocused;
                const itemProps = bindItemRef.current ? bindItemRef.current(item, globalIndex) : {};
                return (
                  <div
                    key={globalIndex}
                    className="absolute bottom-0 cursor-pointer transition-all duration-200"
                    style={{
                      left: i * CARD_OVERLAP,
                      width: CARD_WIDTH,
                      height: 224,
                      borderRadius: 7,
                      overflow: "hidden",
                      zIndex: isActive ? 50 : i,
                      transform: isActive ? "translateY(-30px) scale(1.05)" : "none",
                      boxShadow: isActive
                        ? "0 24px 44px rgba(0,0,0,.85)"
                        : "0 4px 16px rgba(0,0,0,.55)",
                    }}
                    onMouseEnter={() => setHoveredGlobalIndex(globalIndex)}
                    onMouseLeave={() => setHoveredGlobalIndex((prev) => (prev === globalIndex ? null : prev))}
                    onClick={() => onItemClickRef.current?.(item, globalIndex)}
                    {...itemProps}
                  >
                    {renderCardRef.current(item, globalIndex, { isHovered, isFocused })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    },
    [items, itemsPerDeck, deckHeight, hoveredGlobalIndex, focusedIndex],
  );

  const deckData = Array.from({ length: deckCount }, (_, i) => i);

  if (scrollRef) {
    return (
      <div ref={containerRef} className={`w-full ${className ?? ""}`} style={style}>
        <Virtualizer
          ref={virtualizerRef}
          scrollRef={scrollRef}
          data={deckData}
          itemSize={deckHeight}
          bufferSize={overscan * deckHeight}
        >
          {(_, deckIndex) => renderDeck(deckIndex)}
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
        data={deckData}
        itemSize={deckHeight}
        bufferSize={overscan * deckHeight}
      >
        {(_, deckIndex) => renderDeck(deckIndex)}
      </Virtualizer>
    </div>
  );
}) as <T>(
  props: SpreadDeckViewProps<T> & { ref?: React.Ref<{ scrollToItem(index: number): void }> },
) => React.ReactElement;
