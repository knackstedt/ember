import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  value,
  options,
  onChange,
  placeholder = "Select...",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v);
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onChange]
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [isOpen, handleClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev + 1;
          return next >= options.length ? 0 : next;
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? options.length - 1 : next;
        });
        return;
      }
      if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        handleSelect(options[activeIndex].value);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, options, activeIndex, handleClose, handleSelect]);

  // Scroll active option into view
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        className="w-full text-sm px-2 py-1.5 rounded flex items-center justify-between gap-2 text-left transition-colors"
        style={{
          background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
          outline: "none",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          size={14}
          className="flex-shrink-0 transition-transform"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            color: "var(--color-text-dim)",
          }}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-[50] left-0 right-0 mt-1 flex flex-col rounded-[var(--radius-card)] overflow-hidden py-1"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              maxHeight: 240,
              overflowY: "auto",
            }}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            {options.map((opt, i) => (
              <button
                key={opt.value}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                className="text-sm text-left px-3 py-2 transition-colors"
                style={{
                  background:
                    i === activeIndex || opt.value === value
                      ? "color-mix(in srgb, var(--color-accent) 18%, transparent)"
                      : "transparent",
                  color:
                    i === activeIndex || opt.value === value
                      ? "var(--color-accent)"
                      : "var(--color-text)",
                  outline: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
