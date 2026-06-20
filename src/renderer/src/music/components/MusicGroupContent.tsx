import React, { useCallback, useEffect, useRef, useMemo } from "react";
import {
  VirtualGrid,
  VirtualGridHandle,
} from "../../components/VirtualGrid/VirtualGrid";
import { ListView } from "../../components/GalleryView";
import { MediaCard } from "../../components/MediaCard/MediaCard";
import type { MusicViewMode } from "../types";

export interface MusicGroup {
  id: string;
  name: string;
  subtitle?: string;
  coverUrl?: string;
  trackCount: number;
}

interface MusicGroupContentProps {
  items: MusicGroup[];
  viewMode: MusicViewMode;
  focusedIndex: number;
  isFocused: (index: number) => boolean;
  onSelect: (group: MusicGroup, index: number) => void;
  onColumnCountChange?: (count: number) => void;
  scrollRef?: React.RefObject<HTMLElement>;
}

const LazyGroupCard: React.FC<{
  group: MusicGroup;
  index: number;
  focusedIndex: number;
  onSelect: () => void;
}> = React.memo(({ group, index, focusedIndex, onSelect }) => {
  return (
    <div className="p-1.5 w-full h-full flex flex-col min-w-0">
      <MediaCard
        id={group.id}
        title={group.name}
        subtitle={group.subtitle ?? `${group.trackCount} track${group.trackCount !== 1 ? "s" : ""}`}
        coverUrl={group.coverUrl}
        aspectRatio="1/1"
        isFocused={index === focusedIndex}
        onSelect={onSelect}
      />
    </div>
  );
});

const GroupListItem: React.FC<{
  group: MusicGroup;
  index: number;
  focusedIndex: number;
  onSelect: () => void;
}> = React.memo(({ group, index, focusedIndex, onSelect }) => {
  const isFocused = index === focusedIndex;
  return (
    <div
      className="flex items-center gap-3 w-full h-full px-3 cursor-pointer select-none"
      style={{
        background: isFocused
          ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
          : "transparent",
        outline: isFocused ? "2px solid var(--color-accent)" : "none",
        outlineOffset: -2,
        borderRadius: "var(--radius-card)",
      }}
      onClick={onSelect}
    >
      <div
        className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-cover bg-center flex items-center justify-center text-sm"
        style={{
          backgroundImage: group.coverUrl ? `url(${group.coverUrl})` : undefined,
          backgroundColor: !group.coverUrl ? "var(--color-surface-raised)" : undefined,
        }}
      >
        {!group.coverUrl && <span style={{ color: "var(--color-text-dim)" }}>♪</span>}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div
          className="font-medium truncate text-sm"
          style={{ color: isFocused ? "var(--color-accent)" : "var(--color-text)" }}
        >
          {group.name}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--color-text-dim)" }}>
          {group.trackCount} track{group.trackCount !== 1 ? "s" : ""}
          {group.subtitle ? ` · ${group.subtitle}` : ""}
        </div>
      </div>
    </div>
  );
});

export const MusicGroupContent: React.FC<MusicGroupContentProps> = React.memo(({
  items,
  viewMode,
  focusedIndex,
  isFocused,
  onSelect,
  onColumnCountChange,
  scrollRef,
}) => {
  const gridRef = useRef<VirtualGridHandle>(null);

  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < items.length) {
      gridRef.current?.scrollToItem(focusedIndex);
    }
  }, [focusedIndex, items.length]);

  const renderGridItem = useCallback(
    (group: MusicGroup, index: number) => (
      <LazyGroupCard
        group={group}
        index={index}
        focusedIndex={focusedIndex}
        onSelect={() => onSelect(group, index)}
      />
    ),
    [focusedIndex, onSelect]
  );

  const renderListItem = useCallback(
    (group: MusicGroup, index: number) => (
      <GroupListItem
        group={group}
        index={index}
        focusedIndex={focusedIndex}
        onSelect={() => onSelect(group, index)}
      />
    ),
    [focusedIndex, onSelect]
  );

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center" style={{ color: "var(--color-text-dim)" }}>
          No items found
        </div>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <VirtualGrid
        ref={gridRef}
        items={items}
        minItemWidth={180}
        onColumnCountChange={onColumnCountChange}
        rowHeight={240}
        renderItem={renderGridItem}
        scrollRef={scrollRef as React.RefObject<HTMLElement>}
      />
    );
  }

  return (
    <ListView
      ref={gridRef}
      items={items}
      renderItem={renderListItem}
      rowHeight={72}
      scrollRef={scrollRef as React.RefObject<HTMLElement>}
    />
  );
});
