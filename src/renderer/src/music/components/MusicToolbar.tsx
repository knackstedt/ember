import React from "react";
import { motion } from "framer-motion";
import { LayoutGrid, List, ArrowUpDown, Search, ArrowLeft, X, Plus, Tag } from "lucide-react";
import type { MusicViewMode, MusicSortOption } from "../types";

interface MusicToolbarProps {
  viewMode: MusicViewMode;
  onViewModeChange: (mode: MusicViewMode) => void;
  sortBy: MusicSortOption;
  onSortChange: (sort: MusicSortOption) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
  activeFilterLabel?: string;
  onClearFilter?: () => void;
  focusedIndex: number;
  isFocused: (index: number) => boolean;
  onCreatePlaylist?: () => void;
  onEditTags?: () => void;
  onOpenOsk?: () => void;
}

const SORT_OPTIONS: { value: MusicSortOption; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "artist", label: "Artist" },
  { value: "album", label: "Album" },
  { value: "year", label: "Year" },
  { value: "date-added", label: "Date Added" },
  { value: "rating", label: "Rating" },
];

export const MusicToolbar: React.FC<MusicToolbarProps> = React.memo(({
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
  onClearSearch,
  activeFilterLabel,
  onClearFilter,
  focusedIndex,
  isFocused,
  onCreatePlaylist,
  onEditTags,
  onOpenOsk,
}) => {
  const toolbarItems: React.ReactNode[] = [];

  // Item 0: View toggle
  toolbarItems.push(
    <div key="view" className="flex items-center gap-1">
      <button
        className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
          isFocused(0) ? "ring-2 ring-accent" : ""
        }`}
        style={{
          background: viewMode === "grid" ? "var(--color-accent-dim)" : "var(--color-surface)",
          color: viewMode === "grid" ? "var(--color-accent)" : "var(--color-text-dim)",
        }}
        onClick={() => onViewModeChange("grid")}
        title="Grid view"
      >
        <LayoutGrid size={16} />
      </button>
      <button
        className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
          isFocused(0) ? "ring-2 ring-accent" : ""
        }`}
        style={{
          background: viewMode === "list" ? "var(--color-accent-dim)" : "var(--color-surface)",
          color: viewMode === "list" ? "var(--color-accent)" : "var(--color-text-dim)",
        }}
        onClick={() => onViewModeChange("list")}
        title="List view"
      >
        <List size={16} />
      </button>
    </div>
  );

  // Item 1: Sort
  toolbarItems.push(
    <div key="sort" className="relative">
      <button
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          isFocused(1) ? "ring-2 ring-accent" : ""
        }`}
        style={{
          background: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={() => {
          const idx = SORT_OPTIONS.findIndex((o) => o.value === sortBy);
          const next = SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length];
          onSortChange(next.value);
        }}
        title="Sort by"
      >
        <ArrowUpDown size={14} />
        <span>{SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Sort"}</span>
      </button>
    </div>
  );

  // Item 2: Search input
  toolbarItems.push(
    <div
      key="search"
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors ${
        isFocused(2) ? "ring-2 ring-accent" : ""
      }`}
      style={{
        background: searchQuery ? "var(--color-accent-dim)" : "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <Search size={14} style={{ color: searchQuery ? "var(--color-accent)" : "var(--color-text-dim)", flexShrink: 0 }} />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onOpenOsk?.()}
        placeholder="Search..."
        className="bg-transparent outline-none text-sm min-w-0 w-32"
        style={{
          color: searchQuery ? "var(--color-accent)" : "var(--color-text)",
        }}
      />
      {searchQuery && (
        <button
          className="flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onClearSearch();
          }}
          style={{ color: "var(--color-text-dim)" }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );

  // Item 3: Create playlist (optional)
  if (onCreatePlaylist) {
    toolbarItems.push(
      <button
        key="create-playlist"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          isFocused(3) ? "ring-2 ring-accent" : ""
        }`}
        style={{
          background: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={onCreatePlaylist}
        title="Create playlist"
      >
        <Plus size={14} />
        <span>New Playlist</span>
      </button>
    );
  }

  // Item 3 or 4: Edit tags (optional)
  if (onEditTags) {
    const editIndex = onCreatePlaylist ? 4 : 3;
    toolbarItems.push(
      <button
        key="edit-tags"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          isFocused(editIndex) ? "ring-2 ring-accent" : ""
        }`}
        style={{
          background: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={onEditTags}
        title="Edit tags"
      >
        <Tag size={14} />
        <span>Edit Tags</span>
      </button>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
      style={{
        background: "var(--color-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {activeFilterLabel && onClearFilter && (
        <motion.button
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg)",
          }}
          onClick={onClearFilter}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft size={12} />
          {activeFilterLabel}
        </motion.button>
      )}
      <div className="flex items-center gap-2">
        {toolbarItems}
      </div>
    </div>
  );
});
