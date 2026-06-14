import { useState, useEffect, useRef, useCallback } from "react";
import { VirtualGridHandle } from "../components/VirtualGrid/VirtualGrid";

export type NavAction = "up" | "down" | "left" | "right" | "confirm" | "cancel";

export interface UseGridFocusOptions<T> {
  items: T[];
  columnCount: number;
  gridRef: React.RefObject<VirtualGridHandle | null>;
  onConfirm: (item: T, index: number) => void;
  enabled: boolean;
  onEdge?: (direction: "up" | "down" | "left" | "right") => void;
  getNextIndex?: (currentIndex: number, action: NavAction, columnCount: number, itemCount: number) => number | null;
}

export function useGridFocus<T>({
  items,
  columnCount,
  gridRef,
  onConfirm,
  enabled,
  onEdge,
  getNextIndex,
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

  const onEdgeRef = useRef(onEdge);
  onEdgeRef.current = onEdge;

  const getNextIndexRef = useRef(getNextIndex);
  getNextIndexRef.current = getNextIndex;

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

        if (getNextIndexRef.current) {
          const next = getNextIndexRef.current(prev, action, columnCount, itemCount);
          if (next !== null) {
            if (action === "up" || action === "down") {
              gridRef.current?.scrollToItem(next);
            }
            return next;
          }
          if (onEdgeRef.current) {
            onEdgeRef.current(action as "up" | "down" | "left" | "right");
          }
          return prev;
        }

        const row = Math.floor(prev / columnCount);
        const col = prev % columnCount;
        const maxRow = Math.ceil(itemCount / columnCount) - 1;
        let nextRow = row;
        let nextCol = col;
        let hitEdge = false;

        switch (action) {
          case "up":
            if (row === 0) hitEdge = true;
            nextRow = Math.max(0, row - 1);
            break;
          case "down":
            if (row === maxRow) hitEdge = true;
            nextRow = Math.min(maxRow, row + 1);
            break;
          case "left":
            if (col === 0) hitEdge = true;
            nextCol = Math.max(0, col - 1);
            break;
          case "right":
            if (col === columnCount - 1) hitEdge = true;
            nextCol = Math.min(columnCount - 1, col + 1);
            break;
        }

        let nextIndex = nextRow * columnCount + nextCol;
        if (nextIndex >= itemCount) nextIndex = itemCount - 1;
        if (nextIndex === prev) {
          if (hitEdge && onEdgeRef.current && (action === "up" || action === "down" || action === "left" || action === "right")) {
            onEdgeRef.current(action);
          }
          return prev;
        }

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
