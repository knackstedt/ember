import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useInputStore } from "../../store/input.store";

interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
  isOpen,
  title,
  label,
  defaultValue = "",
  placeholder,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);
  const [activeIndex, setActiveIndex] = useState(1); // 0 = confirm, 1 = cancel
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setActiveIndex(1);
    }
  }, [isOpen, defaultValue]);

  useEffect(() => {
    useInputStore.getState().setNavSuspended(isOpen);
    return () => {
      useInputStore.getState().setNavSuspended(false);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  const doConfirm = () => {
    onConfirmRef.current(valueRef.current);
  };

  const doCancel = () => {
    onCancelRef.current();
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        doCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        doConfirm();
      } else if (e.key === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setActiveIndex((i) => (i === 0 ? 1 : 0));
      } else if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        const el = document.activeElement;
        if (el === inputRef.current) return;
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
        doConfirm();
      } else if (detail.action === "cancel") {
        doCancel();
      }
    };

    const handleEscape = (e: Event) => {
      e.stopImmediatePropagation();
      doCancel();
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

  useEffect(() => {
    if (!isOpen) return;
    const button = activeIndex === 0 ? confirmRef.current : cancelRef.current;
    button?.focus();
  }, [isOpen, activeIndex]);

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
            <h3
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </h3>

            {label && (
              <label
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                {label}
              </label>
            )}

            <input
              ref={inputRef}
              type="text"
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setActiveIndex(-1)}
              className="w-full px-3 py-2 rounded-[var(--radius-card)] text-sm outline-none"
              style={{
                background: "var(--surface-0)",
                border: `1px solid var(--border-default)`,
                color: "var(--text-primary)",
              }}
            />

            <div className="flex flex-row gap-3 justify-end">
              <button
                ref={confirmRef}
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm transition-colors"
                style={{
                  background:
                    activeIndex === 0 ? "var(--accent)" : "transparent",
                  color: activeIndex === 0 ? "#fff" : "var(--text-primary)",
                  border: `1px solid ${
                    activeIndex === 0 ? "var(--accent)" : "var(--border-default)"
                  }`,
                }}
                onClick={doConfirm}
                onFocus={() => setActiveIndex(0)}
              >
                {confirmLabel}
              </button>
              <button
                ref={cancelRef}
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm transition-colors"
                style={{
                  background:
                    activeIndex === 1 ? "var(--surface-0)" : "transparent",
                  color: "var(--text-primary)",
                  border: `1px solid ${
                    activeIndex === 1 ? "var(--accent)" : "var(--border-default)"
                  }`,
                }}
                onClick={doCancel}
                onFocus={() => setActiveIndex(1)}
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
