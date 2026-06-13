import { useState, useEffect, useRef, useCallback } from "react";

export type NavAction = "up" | "down" | "left" | "right" | "confirm" | "cancel";

export interface StreamingNavItem {
  serviceId: string;
  itemId?: string;
  url: string;
  title: string;
}

export interface UseStreamingNavOptions {
  rows: { serviceId: string; itemCount: number }[];
  enabled: boolean;
  onConfirm: (item: StreamingNavItem) => void;
}

export function useStreamingNav({ rows, enabled, onConfirm }: UseStreamingNavOptions): {
  focusedRow: number;
  focusedCol: number;
  setFocusedRow: (r: number) => void;
  setFocusedCol: (c: number) => void;
} {
  const [focusedRow, setFocusedRow] = useState(0);
  const [focusedCol, setFocusedCol] = useState(0);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (enabled && rows.length > 0) {
      setFocusedRow((prev) => (prev >= rows.length ? 0 : prev));
      setFocusedCol((prev) => {
        const cols = rows[focusedRow]?.itemCount ?? 0;
        return prev > cols ? cols : prev;
      });
    }
  }, [rows.length, enabled]);

  const handleNav = useCallback(
    (action: NavAction) => {
      if (!enabledRef.current || rowsRef.current.length === 0) return;

      if (action === "confirm") {
        const row = rowsRef.current[focusedRow];
        if (!row) return;
        const isService = focusedCol === 0;
        onConfirmRef.current({
          serviceId: row.serviceId,
          itemId: isService ? undefined : `${row.serviceId}-${focusedCol - 1}`,
          url: "", // resolved by caller
          title: isService ? row.serviceId : "",
        });
        return;
      }

      if (action === "up") {
        setFocusedRow((prev) => {
          const next = Math.max(0, prev - 1);
          if (next !== prev) {
            setFocusedCol((col) => {
              const targetCols = rowsRef.current[next]?.itemCount ?? 0;
              return Math.min(col, targetCols);
            });
          }
          return next;
        });
        return;
      }

      if (action === "down") {
        setFocusedRow((prev) => {
          const next = Math.min(rowsRef.current.length - 1, prev + 1);
          if (next !== prev) {
            setFocusedCol((col) => {
              const targetCols = rowsRef.current[next]?.itemCount ?? 0;
              return Math.min(col, targetCols);
            });
          }
          return next;
        });
        return;
      }

      if (action === "left") {
        setFocusedCol((prev) => Math.max(0, prev - 1));
        return;
      }

      if (action === "right") {
        setFocusedCol((prev) => {
          const cols = rowsRef.current[focusedRow]?.itemCount ?? 0;
          return Math.min(cols, prev + 1);
        });
        return;
      }
    },
    [focusedRow],
  );

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: NavAction };
      if (detail?.action) handleNav(detail.action);
    };
    window.addEventListener("htpc:nav", listener);
    return () => window.removeEventListener("htpc:nav", listener);
  }, [handleNav]);

  return { focusedRow, focusedCol, setFocusedRow, setFocusedCol };
}
