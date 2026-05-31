import { useState, useEffect, useRef, useCallback } from "react";
import { VirtualGridHandle } from "../components/VirtualGrid/VirtualGrid";

export type NavAction = "up" | "down" | "left" | "right" | "confirm" | "cancel";

export interface UseGridFocusOptions<T> {
  items: T[];
  columnCount: number;
  gridRef: React.RefObject<VirtualGridHandle | null>;
  onConfirm: (item: T, index: number) => void;
  enabled: boolean;
}

export function useGridFocus<T>({
  items,
  columnCount,
  gridRef,
  onConfirm,
  enabled,
}: UseGridFocusOptions<T>): {
  focusedIndex: number;
  setFocusedIndex: (i: number) => void;
} {
  const [focusedIndex, setFocusedIndex] = useState(0);

  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (enabled && items.length > 0) {
      setFocusedIndex((prev) => (prev >= items.length ? 0 : prev));
    }
  }, [items.length, enabled]);

  const handleNav = useCallback(
    (action: NavAction) => {
      if (!enabledRef.current || itemsRef.current.length === 0) return;

      if (action === "confirm") {
        const idx = focusedIndexRef.current;
        onConfirmRef.current(itemsRef.current[idx], idx);
        return;
      }

      setFocusedIndex((prev) => {
        const itemCount = itemsRef.current.length;
        const row = Math.floor(prev / columnCount);
        const col = prev % columnCount;
        const maxRow = Math.ceil(itemCount / columnCount) - 1;
        let nextRow = row;
        let nextCol = col;

        switch (action) {
          case "up":
            nextRow = Math.max(0, row - 1);
            break;
          case "down":
            nextRow = Math.min(maxRow, row + 1);
            break;
          case "left":
            nextCol = Math.max(0, col - 1);
            break;
          case "right":
            nextCol = Math.min(columnCount - 1, col + 1);
            break;
        }

        let nextIndex = nextRow * columnCount + nextCol;
        if (nextIndex >= itemCount) nextIndex = itemCount - 1;
        if (nextIndex === prev) return prev;

        if (action === "up" || action === "down") {
          gridRef.current?.scrollToItem(nextIndex);
        }
        return nextIndex;
      });
    },
    [columnCount, gridRef],
  );

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: NavAction };
      if (detail?.action) handleNav(detail.action);
    };
    window.addEventListener("htpc:nav", listener);
    return () => window.removeEventListener("htpc:nav", listener);
  }, [handleNav]);

  return { focusedIndex, setFocusedIndex };
}
