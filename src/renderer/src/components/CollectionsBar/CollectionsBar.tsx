import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useCollectionsStore } from "../../store/collections.store";
import {
  Collection,
  CollectionItemType,
} from "../../../../shared/types";

interface CollectionsBarProps {
  itemType: CollectionItemType;
  activeCollectionId: string | null;
  onSelect: (id: string | null) => void;
  onManage?: () => void;
  className?: string;
}

export function CollectionsBar({
  itemType,
  activeCollectionId,
  onSelect,
  onManage,
  className,
}: CollectionsBarProps): React.ReactElement {
  const collections = useCollectionsStore((s) => s.collections);

  const relevant = useMemo(() => {
    return collections.filter(
      (c) => c.itemType === itemType || c.itemType === "mixed",
    );
  }, [collections, itemType]);

  const active = activeCollectionId ?? "__none__";

  const handleSelect = (id: string) => {
    if (id === "__manage__") {
      onManage?.();
      return;
    }
    onSelect(id === "__none__" ? null : id);
  };

  return (
    <div className={`flex items-center gap-2 overflow-x-auto pb-1 ${className ?? ""}`} style={{ scrollbarWidth: "none" }}>
      <motion.button
        key="__none__"
        onClick={() => handleSelect("__none__")}
        className="relative flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none"
        style={{
          backgroundColor: active === "__none__"
            ? "var(--color-accent)"
            : "var(--color-surface-raised)",
          color: active === "__none__" ? "var(--color-bg)" : "var(--color-text-dim)",
          border: `1px solid ${active === "__none__" ? "var(--color-accent)" : "var(--color-border)"}`,
          boxShadow: active === "__none__" ? "var(--shadow-glow)" : "none",
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        All
      </motion.button>
      {relevant.map((c) => {
        const isSmart = c.type === "smart";
        const isActive = c.id === active;
        return (
          <motion.button
            key={c.id}
            onClick={() => handleSelect(c.id)}
            className="relative flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none"
            style={{
              backgroundColor: isActive
                ? isSmart ? "var(--color-accent)" : "var(--color-accent)"
                : "var(--color-surface-raised)",
              color: isActive ? "var(--color-bg)" : "var(--color-text-dim)",
              border: isActive
                ? `1px solid ${isSmart ? "var(--color-accent)" : "var(--color-accent)"}`
                : isSmart
                  ? "1px dashed var(--color-accent)"
                  : "1px solid var(--color-border)",
              boxShadow: isActive && isSmart
                ? "0 0 8px rgba(100, 200, 255, 0.4), var(--shadow-glow)"
                : isActive ? "var(--shadow-glow)" : "none",
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={isSmart ? "Smart collection (auto-updating)" : undefined}
          >
            {isSmart ? "✨ " : ""}{c.icon ? `${c.icon} ` : ""}{c.name}
          </motion.button>
        );
      })}
      {onManage && (
        <motion.button
          key="__manage__"
          onClick={() => handleSelect("__manage__")}
          className="relative flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none"
          style={{
            backgroundColor: "var(--color-surface-raised)",
            color: "var(--color-text-dim)",
            border: "1px solid var(--color-border)",
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          + Collections
        </motion.button>
      )}
    </div>
  );
}
