import React from "react";
import { motion } from "framer-motion";
import { Search, X, RotateCw, Loader, Folder } from "lucide-react";
import type {
  GamingNavItem,
  GamingLibraryFilter,
  GamingPlayerCountFilter,
  GamingMultiplayerTypeFilter,
  GamingPlayStatusFilter,
  GamingCompletionFilter,
} from "../types";
import { ONLINE_PLATFORMS, NAV_PLATFORM_GROUPS } from "../types";
import { Dropdown } from "../../../components/Dropdown/Dropdown";

interface GamingToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
  activeNav: GamingNavItem;
  libraryFilter: GamingLibraryFilter;
  onLibraryFilterChange: (filter: GamingLibraryFilter) => void;
  playerCountFilter: GamingPlayerCountFilter;
  onPlayerCountFilterChange: (filter: GamingPlayerCountFilter) => void;
  multiplayerTypeFilter: GamingMultiplayerTypeFilter;
  onMultiplayerTypeFilterChange: (filter: GamingMultiplayerTypeFilter) => void;
  playStatusFilter: GamingPlayStatusFilter;
  onPlayStatusFilterChange: (filter: GamingPlayStatusFilter) => void;
  completionFilter: GamingCompletionFilter;
  onCompletionFilterChange: (filter: GamingCompletionFilter) => void;
  gameCount: number;
  scanning: boolean;
  onScan: () => void;
  activeCollectionId: string | null;
  collectionOptions: { value: string; label: string }[];
  onCollectionChange: (id: string | null) => void;
  onManageCollections: () => void;
}

const PLAYER_COUNT_OPTIONS: { value: GamingPlayerCountFilter; label: string }[] = [
  { value: "all", label: "Players" },
  { value: "1", label: "1 Player" },
  { value: "2", label: "2 Player" },
  { value: "4", label: "4 Player" },
  { value: "4+", label: "4+ Player" },
];

const MULTIPLAYER_OPTIONS: { value: GamingMultiplayerTypeFilter; label: string }[] = [
  { value: "all", label: "Mode" },
  { value: "single", label: "Single" },
  { value: "local", label: "Local MP" },
];

const PLAY_STATUS_OPTIONS: { value: GamingPlayStatusFilter; label: string }[] = [
  { value: "all", label: "Status" },
  { value: "played", label: "Played" },
  { value: "unplayed", label: "Unplayed" },
];

const COMPLETION_OPTIONS: { value: GamingCompletionFilter; label: string }[] = [
  { value: "all", label: "Completion" },
  { value: "completed", label: "Completed" },
  { value: "incomplete", label: "Incomplete" },
];

const LIBRARY_OPTIONS: { value: GamingLibraryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "installed", label: "Installed" },
  { value: "uninstalled", label: "Not Installed" },
];

function isOnlinePlatformNav(nav: GamingNavItem): boolean {
  const platforms = NAV_PLATFORM_GROUPS[nav];
  return platforms.length > 0 && platforms.some((p) => ONLINE_PLATFORMS.includes(p));
}

function CycleFilterButton<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const active = options.find((o) => o.value === value);
  const isDefault = value === options[0].value;
  return (
    <button
      className="px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap"
      style={{
        background: isDefault ? "var(--surface-0)" : "var(--accent-muted)",
        color: isDefault ? "var(--text-secondary)" : "var(--accent)",
        border: `1px solid ${isDefault ? "var(--border-default)" : "color-mix(in srgb, var(--accent) 30%, transparent)"}`,
      }}
      onClick={() => {
        const idx = options.findIndex((o) => o.value === value);
        const next = options[(idx + 1) % options.length];
        onChange(next.value);
      }}
      title={active?.label}
    >
      {active?.label}
    </button>
  );
}

export const GamingToolbar: React.FC<GamingToolbarProps> = React.memo(({
  searchQuery,
  onSearchChange,
  onClearSearch,
  activeNav,
  libraryFilter,
  onLibraryFilterChange,
  playerCountFilter,
  onPlayerCountFilterChange,
  multiplayerTypeFilter,
  onMultiplayerTypeFilterChange,
  playStatusFilter,
  onPlayStatusFilterChange,
  completionFilter,
  onCompletionFilterChange,
  gameCount,
  scanning,
  onScan,
  activeCollectionId,
  collectionOptions,
  onCollectionChange,
  onManageCollections,
}) => {
  const showLibraryFilter = isOnlinePlatformNav(activeNav);
  const hasActiveFilters =
    playerCountFilter !== "all" ||
    multiplayerTypeFilter !== "all" ||
    playStatusFilter !== "all" ||
    completionFilter !== "all" ||
    libraryFilter !== "all" ||
    searchQuery.trim().length > 0 ||
    activeCollectionId !== null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 flex-shrink-0 flex-wrap"
      style={{
        background: "var(--surface-base)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      {/* Search */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors"
        style={{
          background: searchQuery ? "var(--accent-muted)" : "var(--surface-0)",
          border: "1px solid var(--border-default)",
        }}
      >
        <Search size={14} style={{ color: searchQuery ? "var(--accent)" : "var(--text-secondary)", flexShrink: 0 }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search..."
          className="bg-transparent outline-none text-sm min-w-0 w-32"
          style={{
            color: searchQuery ? "var(--accent)" : "var(--text-primary)",
          }}
        />
        {searchQuery && (
          <button
            className="flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onClearSearch();
            }}
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Scan */}
      <motion.button
        className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1"
        style={{
          background: "var(--surface-0)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-default)",
        }}
        onClick={onScan}
        whileTap={{ scale: 0.96 }}
        disabled={scanning}
      >
        {scanning ? <><Loader size={14} className="animate-spin" /> Scanning</> : <><RotateCw size={14} /> Scan</>}
      </motion.button>

      {/* Game count */}
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {gameCount} games
      </span>

      {/* Divider */}
      <div className="w-px h-5 flex-shrink-0" style={{ background: "var(--border-default)" }} />

      {/* Library filter (online platforms only) */}
      {showLibraryFilter && (
        <CycleFilterButton
          options={LIBRARY_OPTIONS}
          value={libraryFilter}
          onChange={onLibraryFilterChange}
        />
      )}

      {/* Quick filters */}
      <CycleFilterButton
        options={PLAYER_COUNT_OPTIONS}
        value={playerCountFilter}
        onChange={onPlayerCountFilterChange}
      />
      <CycleFilterButton
        options={MULTIPLAYER_OPTIONS}
        value={multiplayerTypeFilter}
        onChange={onMultiplayerTypeFilterChange}
      />
      <CycleFilterButton
        options={PLAY_STATUS_OPTIONS}
        value={playStatusFilter}
        onChange={onPlayStatusFilterChange}
      />
      <CycleFilterButton
        options={COMPLETION_OPTIONS}
        value={completionFilter}
        onChange={onCompletionFilterChange}
      />

      {/* Collection filter */}
      {collectionOptions.length > 0 && (
        <div className="flex items-center gap-1.5">
          <div style={{ width: 140 }}>
            <Dropdown
              value={activeCollectionId ?? "__none__"}
              options={[
                { value: "__none__", label: "All Collections" },
                ...collectionOptions,
                { value: "__manage__", label: "+ Manage Collections" },
              ]}
              placeholder="Collections"
              onChange={(v) => {
                if (v === "__manage__") { onManageCollections(); return; }
                onCollectionChange(v === "__none__" ? null : v);
              }}
            />
          </div>
          {activeCollectionId && (
            <button
              className="flex-shrink-0 px-1.5 py-1 rounded text-xs font-medium flex items-center gap-0.5"
              style={{
                background: "var(--accent-muted)",
                color: "var(--accent)",
                border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
              }}
              onClick={() => onCollectionChange(null)}
              title="Clear collection filter"
            >
              <Folder size={12} />
              <X size={10} />
            </button>
          )}
        </div>
      )}

      {/* Clear all */}
      {hasActiveFilters && (
        <motion.button
          className="px-2 py-1 rounded text-xs font-medium"
          style={{
            background: "var(--accent-muted)",
            color: "var(--accent)",
          }}
          onClick={() => {
            onClearSearch();
            onLibraryFilterChange("all");
            onPlayerCountFilterChange("all");
            onMultiplayerTypeFilterChange("all");
            onPlayStatusFilterChange("all");
            onCompletionFilterChange("all");
            onCollectionChange(null);
          }}
          whileTap={{ scale: 0.95 }}
        >
          Clear
        </motion.button>
      )}
    </div>
  );
});
