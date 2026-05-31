import React, { useRef } from "react";
import { motion } from "framer-motion";

export interface ChipFilter<T extends string = string> {
  id: T;
  label: string;
  count?: number;
  color?: string;
}

interface ChipFiltersProps<T extends string> {
  filters: ChipFilter<T>[];
  active: T;
  onSelect: (id: T) => void;
  className?: string;
}

export function ChipFilters<T extends string>({
  filters,
  active,
  onSelect,
  className,
}: ChipFiltersProps<T>): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className={`flex gap-2 overflow-x-auto pb-1 ${className ?? ""}`}
      style={{ scrollbarWidth: "none" }}
    >
      {filters.map((f) => {
        const isActive = f.id === active;
        return (
          <motion.button
            key={f.id}
            onClick={() => onSelect(f.id)}
            className="relative flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none"
            style={{
              backgroundColor: isActive
                ? "var(--color-accent)"
                : "var(--color-surface-raised)",
              color: isActive ? "var(--color-bg)" : "var(--color-text-dim)",
              border: `1px solid ${isActive ? "var(--color-accent)" : "var(--color-border)"}`,
              boxShadow: isActive ? "var(--shadow-glow)" : "none",
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {f.label}
            {f.count !== undefined && (
              <span
                className="ml-1.5 text-xs opacity-70"
                style={{
                  color: isActive ? "var(--color-bg)" : "var(--color-text-dim)",
                }}
              >
                {f.count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
