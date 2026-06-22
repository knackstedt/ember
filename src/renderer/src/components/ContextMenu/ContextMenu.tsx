import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ContextMenuOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  header?: boolean;
}

interface ContextMenuProps {
  isOpen: boolean;
  options: ContextMenuOption[];
  activeIndex: number;
  position: { x: number; y: number };
  onSelect: (optionId: string) => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  options,
  activeIndex,
  position,
  onSelect,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Auto-scroll active option into view
  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // Close on Escape and block htpc:escape from reaching other listeners
  useEffect(() => {
    if (!isOpen) return;
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    const customHandler = (e: Event) => {
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", keyHandler, true);
    window.addEventListener("htpc:escape", customHandler, true);
    return () => {
      window.removeEventListener("keydown", keyHandler, true);
      window.removeEventListener("htpc:escape", customHandler, true);
    };
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  // Clamp position to viewport
  const estimatedHeight = Math.min(options.length * 44 + 12, window.innerHeight - 32);
  const clampedX = Math.min(
    Math.max(position.x, 8),
    Math.max(8, window.innerWidth - 240),
  );
  const clampedY = Math.min(
    Math.max(position.y, 8),
    Math.max(8, window.innerHeight - estimatedHeight),
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          className="context-menu fixed z-[100] flex flex-col rounded-[var(--radius-card)] py-1.5"
          style={{
            left: clampedX,
            top: clampedY,
            minWidth: 200,
            maxWidth: 320,
            maxHeight: estimatedHeight,
            overflow: "hidden auto",
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          {options.map((opt, i) => {
            const isSep = opt.header || (opt.disabled && opt.id.startsWith("__sep"));
            if (isSep) {
              return (
                <div
                  key={opt.id}
                  className={`px-3 py-1.5 text-xs font-medium tracking-wide ${opt.header ? "" : "uppercase"}`}
                  style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--border-default)" }}
                >
                  {opt.label}
                </div>
              );
            }
            return (
              <button
                key={opt.id}
                ref={(el) => { itemRefs.current[i] = el; }}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors"
                style={{
                  background:
                    i === activeIndex
                      ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                      : "transparent",
                  color: opt.destructive
                    ? "#ff6b6b"
                    : i === activeIndex
                      ? "var(--accent)"
                      : "var(--text-primary)",
                  outline: "none",
                  cursor: opt.disabled ? "not-allowed" : "pointer",
                  opacity: opt.disabled ? 0.4 : 1,
                }}
                onClick={() => {
                  if (!opt.disabled) {
                    onSelect(opt.id);
                  }
                }}
                disabled={opt.disabled}
              >
                {opt.icon && (
                  <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    {opt.icon}
                  </span>
                )}
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
