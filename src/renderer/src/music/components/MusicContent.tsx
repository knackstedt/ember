import React, { useCallback, useRef, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  VirtualGrid,
  VirtualGridHandle,
} from "../../components/VirtualGrid/VirtualGrid";
import { ListView } from "../../components/GalleryView";
import { MediaCard } from "../../components/MediaCard/MediaCard";
import type { MusicTrack } from "../../../../shared/types";
import type { MusicViewMode, MusicNavItem } from "../types";
import { useCoverCacheStore } from "../../store/coverCache.store";
import { useMusicStore } from "../../store/media.store";
import { getSourceBadge } from "../../lib/source-badge";

interface MusicContentProps {
  items: MusicTrack[];
  viewMode: MusicViewMode;
  focusedIndex: number;
  isFocused: (index: number) => boolean;
  onSelect: (track: MusicTrack, index: number) => void;
  onFavorite: (track: MusicTrack) => void;
  activeNav: MusicNavItem;
  onColumnCountChange?: (count: number) => void;
  scrollRef?: React.RefObject<HTMLElement>;
}

const LazyMusicCard: React.FC<{
  track: MusicTrack;
  index: number;
  focusedIndex: number;
  onSelect: () => void;
  onFavorite: () => void;
}> = React.memo(({ track, index, focusedIndex, onSelect, onFavorite }) => {
  const loadThumbnail = useMusicStore((s) => s.loadThumbnail);
  const cachedUrl = useCoverCacheStore((s) => s.urls[track.id]);
  const coverUrl = track.albumArtUrl ?? cachedUrl;
  const source = getSourceBadge(track.sourceLocation);

  React.useEffect(() => {
    if (!coverUrl) {
      loadThumbnail(track.id);
    }
  }, [track.id, coverUrl, loadThumbnail]);

  return (
    <MediaCard
      id={track.id}
      title={track.title}
      subtitle={track.artist ?? track.album}
      coverUrl={coverUrl}
      badge={source.badge}
      badgeColor={source.badgeColor}
      aspectRatio="1/1"
      isFavorite={track.isFavorite}
      isFocused={index === focusedIndex}
      missing={track.missing}
      onSelect={onSelect}
      onFavorite={onFavorite}
    />
  );
});

const MusicListItem: React.FC<{
  track: MusicTrack;
  index: number;
  focusedIndex: number;
  onSelect: () => void;
  onFavorite: () => void;
}> = React.memo(({ track, index, focusedIndex, onSelect, onFavorite }) => {
  const loadThumbnail = useMusicStore((s) => s.loadThumbnail);
  const cachedUrl = useCoverCacheStore((s) => s.urls[track.id]);
  const coverUrl = track.albumArtUrl ?? cachedUrl;
  const isFocused = index === focusedIndex;

  React.useEffect(() => {
    if (!coverUrl) {
      loadThumbnail(track.id);
    }
  }, [track.id, coverUrl, loadThumbnail]);

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
        className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-cover bg-center"
        style={{
          backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
          backgroundColor: !coverUrl ? "var(--color-surface-raised)" : undefined,
          filter: track.missing ? "grayscale(80%)" : undefined,
          opacity: track.missing ? 0.6 : undefined,
        }}
      />
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div
          className="font-medium truncate text-sm"
          style={{ color: isFocused ? "var(--color-accent)" : "var(--color-text)" }}
        >
          {track.title}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--color-text-dim)" }}>
          {track.artist}
          {track.artist && track.album ? ` · ${track.album}` : ""}
          {track.year ? ` · ${track.year}` : ""}
        </div>
      </div>
      {track.duration && (
        <span
          className="text-xs tabular-nums flex-shrink-0"
          style={{ color: "var(--color-text-dim)" }}
        >
          {Math.floor(track.duration / 60)}:{String(Math.round(track.duration % 60)).padStart(2, "0")}
        </span>
      )}
      {track.isFavorite && (
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="var(--color-accent)">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      )}
    </div>
  );
});

export const MusicContent: React.FC<MusicContentProps> = React.memo(({
  items,
  viewMode,
  focusedIndex,
  isFocused,
  onSelect,
  onFavorite,
  activeNav,
  onColumnCountChange,
  scrollRef,
}) => {
  const gridRef = useRef<VirtualGridHandle>(null);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < items.length) {
      gridRef.current?.scrollToItem(focusedIndex);
    }
  }, [focusedIndex, items.length]);

  const renderGridItem = useCallback(
    (track: MusicTrack, index: number) => (
      <div className="p-1.5 w-full h-full flex flex-col min-w-0">
        <LazyMusicCard
          track={track}
          index={index}
          focusedIndex={focusedIndex}
          onSelect={() => onSelect(track, index)}
          onFavorite={() => onFavorite(track)}
        />
      </div>
    ),
    [focusedIndex, onSelect, onFavorite]
  );

  const renderListItem = useCallback(
    (track: MusicTrack, index: number) => (
      <MusicListItem
        track={track}
        index={index}
        focusedIndex={focusedIndex}
        onSelect={() => onSelect(track, index)}
        onFavorite={() => onFavorite(track)}
      />
    ),
    [focusedIndex, onSelect, onFavorite]
  );

  const skeletonItems = useMemo(() => Array.from({ length: 6 }), []);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2 opacity-30">♪</div>
          <div style={{ color: "var(--color-text-dim)" }}>
            {activeNav === "streaming"
              ? "No streaming services configured"
              : "No music found"}
          </div>
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
