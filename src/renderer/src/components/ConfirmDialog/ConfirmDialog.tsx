import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader } from "lucide-react";
import { useInputStore } from "../../store/input.store";

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
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) setActiveIndex(1);
  }, [isOpen]);

  useEffect(() => {
    useInputStore.getState().setNavSuspended(isOpen);
    return () => {
      useInputStore.getState().setNavSuspended(false);
    };
  }, [isOpen]);

  // Keep browser focus in sync with the active button so Enter/Space click the
  // highlighted button and keyboard focus is visibly inside the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const button = activeIndex === 0 ? confirmRef.current : cancelRef.current;
    button?.focus();
  }, [isOpen, activeIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCancelRef.current();
      } else if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "a" ||
        e.key === "d" ||
        e.key === "w" ||
        e.key === "s"
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setActiveIndex((i) => (i === 0 ? 1 : 0));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (activeIndexRef.current === 0) {
          if (!loadingRef.current) onConfirmRef.current();
        } else {
          onCancelRef.current();
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setActiveIndex((i) => (i === 0 ? 1 : 0));
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
        if (activeIndexRef.current === 0) {
          if (!loadingRef.current) onConfirmRef.current();
        } else {
          onCancelRef.current();
        }
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
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <div className="flex items-start gap-3">
              <span style={{ color: destructive ? "#ff6b6b" : "var(--accent)" }}>
                <AlertTriangle size={22} />
              </span>
              <div className="flex-1">
                <h3
                  className="text-base font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {title}
                </h3>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  {message}
                </p>
              </div>
            </div>

            <div className="flex flex-row gap-3 justify-end">
              <button
                ref={confirmRef}
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm transition-colors"
                style={{
                  background:
                    activeIndex === 0
                      ? destructive
                        ? "#ff4444"
                        : "var(--accent)"
                      : "transparent",
                  color: activeIndex === 0 ? "#fff" : "var(--text-primary)",
                  border: `1px solid ${
                    activeIndex === 0
                      ? destructive
                        ? "#ff4444"
                        : "var(--accent)"
                      : "var(--border-default)"
                  }`,
                  opacity: loading ? 0.6 : 1,
                }}
                onClick={onConfirm}
                onFocus={() => setActiveIndex(0)}
                disabled={loading}
              >
                {loading && <Loader size={14} className="animate-spin inline mr-1.5" />}
                {confirmLabel}
              </button>
              <button
                ref={cancelRef}
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm transition-colors"
                style={{
                  background:
                    activeIndex === 1
                      ? "var(--surface-0)"
                      : "transparent",
                  color: "var(--text-primary)",
                  border: `1px solid ${
                    activeIndex === 1 ? "var(--accent)" : "var(--border-default)"
                  }`,
                }}
                onClick={onCancel}
                onFocus={() => setActiveIndex(1)}
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
