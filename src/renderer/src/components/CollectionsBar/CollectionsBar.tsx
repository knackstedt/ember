import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCollectionsStore } from "../../store/collections.store";
import {
  Collection,
  CollectionItemType,
  SmartFilterGroup,
} from "../../../../shared/types";
import { ChipFilters, ChipFilter } from "../ChipFilters/ChipFilters";

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
  const loading = useCollectionsStore((s) => s.loading);

  const relevant = useMemo(() => {
    return collections.filter(
      (c) => c.itemType === itemType || c.itemType === "mixed",
    );
  }, [collections, itemType]);

  const filters: ChipFilter<string>[] = useMemo(() => {
    const base: ChipFilter<string>[] = [
      { id: "__none__", label: "All" },
      ...relevant.map((c) => ({
        id: c.id,
        label: c.icon ? `${c.icon} ${c.name}` : c.name,
        color: c.color,
      })),
    ];
    if (onManage) {
      base.push({ id: "__manage__", label: "+ Collections" });
    }
    return base;
  }, [relevant, onManage]);

  const active = activeCollectionId ?? "__none__";

  const handleSelect = (id: string) => {
    if (id === "__manage__") {
      onManage?.();
      return;
    }
    onSelect(id === "__none__" ? null : id);
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <ChipFilters
        filters={filters}
        active={active}
        onSelect={handleSelect}
        className="flex-1"
      />
    </div>
  );
}
