import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const [activeIndex, setActiveIndex] = useState(1); // 0 = confirm, 1 = cancel
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (isOpen) setActiveIndex(1);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCancelRef.current();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setActiveIndex((i) => (i === 0 ? 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (activeIndexRef.current === 0) onConfirmRef.current();
        else onCancelRef.current();
      }
    };

    const handleNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string } | undefined;
      if (!detail?.action) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (detail.action === "left" || detail.action === "right" || detail.action === "up" || detail.action === "down") {
        setActiveIndex((i) => (i === 0 ? 1 : 0));
      } else if (detail.action === "confirm") {
        if (activeIndexRef.current === 0) onConfirmRef.current();
        else onCancelRef.current();
      } else if (detail.action === "cancel") {
        onCancelRef.current();
      }
    };

    const handleEscape = (e: Event) => {
      e.stopImmediatePropagation();
      onCancelRef.current();
    };

    window.addEventListener("keydown", handleKey, true);
    window.addEventListener("htpc:nav", handleNav, true);
    window.addEventListener("htpc:escape", handleEscape, true);
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("htpc:nav", handleNav, true);
      window.removeEventListener("htpc:escape", handleEscape, true);
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.6)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <motion.div
            className="max-w-md w-full rounded-[var(--radius-card)] p-6 flex flex-col gap-4"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <div className="flex items-start gap-3">
              <span style={{ color: destructive ? "#ff6b6b" : "var(--color-accent)" }}>
                <AlertTriangle size={22} />
              </span>
              <div className="flex-1">
                <h3
                  className="text-base font-semibold"
                  style={{ color: "var(--color-text)" }}
                >
                  {title}
                </h3>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-dim)" }}>
                  {message}
                </p>
              </div>
            </div>

            <div className="flex flex-row gap-3 justify-end">
              <button
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm transition-colors"
                style={{
                  background:
                    activeIndex === 0
                      ? destructive
                        ? "#ff4444"
                        : "var(--color-accent)"
                      : "transparent",
                  color: activeIndex === 0 ? "#fff" : "var(--color-text)",
                  border: `1px solid ${
                    activeIndex === 0
                      ? destructive
                        ? "#ff4444"
                        : "var(--color-accent)"
                      : "var(--color-border)"
                  }`,
                  opacity: loading ? 0.6 : 1,
                }}
                onClick={onConfirm}
                disabled={loading}
              >
                {loading && <Loader size={14} className="animate-spin inline mr-1.5" />}
                {confirmLabel}
              </button>
              <button
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm transition-colors"
                style={{
                  background:
                    activeIndex === 1
                      ? "var(--color-surface)"
                      : "transparent",
                  color: "var(--color-text)",
                  border: `1px solid ${
                    activeIndex === 1 ? "var(--color-accent)" : "var(--color-border)"
                  }`,
                }}
                onClick={onCancel}
                disabled={loading}
              >
                {cancelLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
