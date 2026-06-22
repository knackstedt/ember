import React from "react";

const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

/* ─── Standard Grid Skeleton ─── */

interface SkeletonGridProps {
  columns: number;
  rows?: number;
  rowHeight?: number;
  cellWidth?: number;
}

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({
  columns,
  rows = 2,
  rowHeight = 260,
  cellWidth = 200,
}) => {
  const safeRows = Math.min(Math.max(rows, 1), 4);

  return (
    <div className="w-full" style={{ contain: "layout paint" }}>
      {Array.from({ length: safeRows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex w-full"
          style={{
            height: rowHeight,
            gap: 12,
            justifyContent: "center",
            marginBottom: rowIdx < safeRows - 1 ? 12 : 0,
          }}
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <div
              key={colIdx}
              className="skeleton-shimmer relative overflow-hidden flex-shrink-0 min-w-0"
              style={{
                width: cellWidth,
                height: "100%",
                borderRadius: "var(--radius-card)",
                backgroundColor: "var(--surface-1)",
                contain: "layout paint",
              }}
            >
              {/* Cover area */}
              <div className="absolute inset-0" style={{ padding: 6 }}>
                <div
                  className="w-full skeleton-shimmer"
                  style={{
                    height: "calc(100% - 36px)",
                    borderRadius: "calc(var(--radius-card) - 2px)",
                    backgroundColor: "var(--surface-0)",
                  }}
                />
              </div>
              {/* Text lines */}
              <div
                className="absolute bottom-0 left-0 right-0 flex flex-col gap-1"
                style={{ padding: "8px 8px 10px" }}
              >
                <div className="skeleton-shimmer rounded" style={{ width: "90%", height: 12, backgroundColor: "rgba(255,255,255,0.12)" }} />
                <div className="skeleton-shimmer rounded" style={{ width: "55%", height: 10, backgroundColor: "rgba(255,255,255,0.08)" }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

/* ─── List View Skeleton ─── */

export const SkeletonList: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  const safeRows = Math.min(Math.max(rows, 1), 10);
  return (
    <div className="w-full" style={{ contain: "layout paint" }}>
      {Array.from({ length: safeRows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 w-full"
          style={{ height: 80, borderBottom: "1px solid var(--border-default)", padding: "0 12px" }}
        >
          <div
            className="skeleton-shimmer flex-shrink-0 rounded overflow-hidden"
            style={{ width: 48, height: 72, backgroundColor: "var(--surface-1)" }}
          />
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="skeleton-shimmer rounded" style={{ width: "60%", height: 14, backgroundColor: "var(--surface-1)" }} />
            <div className="skeleton-shimmer rounded" style={{ width: "35%", height: 12, backgroundColor: "var(--surface-1)" }} />
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─── Hex Grid Skeleton ─── */

export const SkeletonHexGrid: React.FC<{ columns?: number; rows?: number; cellWidth?: number }> = ({
  columns = 5,
  rows = 2,
  cellWidth = 200,
}) => {
  const cols = Math.min(Math.max(columns, 2), 8);
  const safeRows = Math.min(Math.max(rows, 1), 4);

  return (
    <div className="w-full" style={{ padding: 16, contain: "layout paint" }}>
      {Array.from({ length: safeRows }).map((_, rowIdx) => {
        const isEven = rowIdx % 2 === 0;
        const hexCount = isEven ? cols : cols - 1;
        return (
          <div
            key={rowIdx}
            className="flex w-full"
            style={{
              gap: 4,
              marginBottom: rowIdx < safeRows - 1 ? -24 : 0,
              justifyContent: isEven ? "flex-start" : "center",
            }}
          >
            {Array.from({ length: hexCount }).map((_, colIdx) => (
              <div
                key={colIdx}
                className="skeleton-shimmer flex-shrink-0"
                style={{
                  width: cellWidth,
                  aspectRatio: `${Math.sqrt(3)} / 2`,
                  clipPath: HEX_CLIP,
                  backgroundColor: "var(--surface-1)",
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
};

/* ─── Bookshelf Skeleton ─── */

export const SkeletonBookshelf: React.FC<{ spinesPerShelf?: number; shelves?: number }> = ({
  spinesPerShelf = 12,
  shelves = 2,
}) => {
  const safeSpines = Math.min(Math.max(spinesPerShelf, 4), 20);
  const safeShelves = Math.min(Math.max(shelves, 1), 3);

  return (
    <div className="w-full" style={{ contain: "layout paint" }}>
      {Array.from({ length: safeShelves }).map((_, shelfIdx) => (
        <div key={shelfIdx} style={{ height: 260, padding: "0 12px", marginBottom: shelfIdx < safeShelves - 1 ? 12 : 0 }}>
          <div
            className="flex items-end gap-[3px]"
            style={{
              background: "var(--surface-1)",
              borderRadius: "10px 10px 0 0",
              minHeight: 234,
              padding: "12px 12px 0",
              overflow: "hidden",
            }}
          >
            {Array.from({ length: safeSpines }).map((_, spineIdx) => (
              <div
                key={spineIdx}
                className="skeleton-shimmer flex-shrink-0"
                style={{
                  width: 36,
                  height: 198,
                  borderRadius: "3px 3px 0 0",
                  backgroundColor: "var(--surface-0)",
                }}
              />
            ))}
          </div>
          <div
            style={{
              height: 13,
              background: "linear-gradient(180deg, #2a1e10, #19120a)",
              borderRadius: "0 0 6px 6px",
            }}
          />
        </div>
      ))}
    </div>
  );
};

/* ─── Spread Deck Skeleton ─── */

export const SkeletonSpreadDeck: React.FC<{ cardsPerDeck?: number; decks?: number }> = ({
  cardsPerDeck = 10,
  decks = 2,
}) => {
  const safeCards = Math.min(Math.max(cardsPerDeck, 4), 18);
  const safeDecks = Math.min(Math.max(decks, 1), 3);

  return (
    <div className="w-full" style={{ contain: "layout paint" }}>
      {Array.from({ length: safeDecks }).map((_, deckIdx) => (
        <div
          key={deckIdx}
          style={{
            height: 320,
            padding: "0 12px",
            marginBottom: deckIdx < safeDecks - 1 ? 12 : 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <div style={{ position: "relative", height: 256 }}>
            {Array.from({ length: safeCards }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="skeleton-shimmer"
                style={{
                  position: "absolute",
                  left: cardIdx * 28,
                  bottom: 0,
                  width: 152,
                  height: 224,
                  borderRadius: 7,
                  backgroundColor: "var(--surface-1)",
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─── Neon Grid Skeleton ─── */

export const SkeletonNeonGrid: React.FC<{ columns?: number; rows?: number; rowHeight?: number; cellWidth?: number }> = ({
  columns = 5,
  rows = 2,
  rowHeight = 260,
  cellWidth = 200,
}) => {
  const safeRows = Math.min(Math.max(rows, 1), 4);

  return (
    <div className="w-full" style={{ contain: "layout paint" }}>
      {Array.from({ length: safeRows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex w-full"
          style={{
            height: rowHeight,
            gap: 8,
            justifyContent: "center",
            marginBottom: rowIdx < safeRows - 1 ? 8 : 0,
          }}
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <div key={colIdx} className="min-w-0 flex-shrink-0" style={{ width: cellWidth, height: "100%", padding: 4 }}>
              <div
                className="skeleton-shimmer w-full h-full"
                style={{
                  borderRadius: 3,
                  backgroundColor: "#04050e",
                  border: "1px solid rgba(24, 30, 46, 0.8)",
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
