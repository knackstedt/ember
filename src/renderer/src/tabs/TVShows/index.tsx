import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTvStore } from "../../store/media.store";
import {
  VirtualGrid,
  VirtualGridHandle,
} from "../../components/VirtualGrid/VirtualGrid";
import { MediaCard } from "../../components/MediaCard/MediaCard";
import { DetailPanel } from "../../components/DetailPanel/DetailPanel";
import { OskInput } from "../../components/OnScreenKeyboard/OnScreenKeyboard";
import { TVShow } from "../../../../shared/types";
import { useVideoPlayerStore } from "../../store/videoPlayer.store";
import { useGridFocus } from "../../hooks/useGridFocus";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";
import { useCollectionsStore, evaluateSmartFilter, sortByCollection } from "../../store/collections.store";
import { CollectionsBar } from "../../components/CollectionsBar/CollectionsBar";
import { CollectionManager } from "../../components/CollectionManager/CollectionManager";
import { useToastStore } from "../../store/toast.store";
import { AiGroup } from "../../../../shared/types";

type SubTab = "ai-groups" | "all";

export const TVShowsTab: React.FC = () => {
  const shows = useTvStore((s) => s.shows);
  const loading = useTvStore((s) => s.loading);
  const scanning = useTvStore((s) => s.scanning);
  const searchQuery = useTvStore((s) => s.searchQuery);
  const load = useTvStore((s) => s.load);
  const scan = useTvStore((s) => s.scan);
  const toggleFavorite = useTvStore((s) => s.toggleFavorite);
  const setTags = useTvStore((s) => s.setTags);
  const setSearch = useTvStore((s) => s.setSearch);
  const filtered = useTvStore((s) => s.filtered);
  const hide = useTvStore((s) => s.hide);
  const regenerateThumbnail = useTvStore((s) => s.regenerateThumbnail);
  const regeneratingIds = useTvStore((s) => s.regeneratingIds);
  const openVideo = useVideoPlayerStore((s) => s.open);
  const [selected, setSelected] = useState<TVShow | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [columnCount, setColumnCount] = useState(5);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string>>(new Set());
  const gridRef = useRef<VirtualGridHandle>(null);

  const [subTab, setSubTab] = useState<SubTab>("ai-groups");
  const [aiGroups, setAiGroups] = useState<AiGroup[]>([]);
  const [aiGroupsLoading, setAiGroupsLoading] = useState(false);
  const [selectedAiGroup, setSelectedAiGroup] = useState<string | null>(null);
  const aiGroupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const collections = useCollectionsStore((s) => s.collections);
  const loadCollections = useCollectionsStore((s) => s.load);
  const addItem = useCollectionsStore((s) => s.addItem);
  const listItems = useCollectionsStore((s) => s.listItems);

  useEffect(() => {
    load();
    loadCollections();
  }, []);

  useEffect(() => {
    if (!activeCollectionId) {
      setCollectionItemIds(new Set());
      return;
    }
    const collection = collections.find((c) => c.id === activeCollectionId);
    if (!collection) return;

    if (collection.type === "smart" && collection.filter) {
      const result = evaluateSmartFilter(shows, collection.filter);
      setCollectionItemIds(new Set(result.map((s) => s.id)));
    } else {
      listItems(activeCollectionId).then((items) => {
        setCollectionItemIds(new Set(items.map((i) => i.itemId)));
      });
    }
  }, [activeCollectionId, collections, shows]);

  useEffect(() => {
    const handler = () => setSelected(null);
    window.addEventListener("htpc:escape", handler);
    return () => window.removeEventListener("htpc:escape", handler);
  }, []);

  /* Auto-generate AI groups when subTab switches to ai-groups and shows are loaded */
  useEffect(() => {
    if (subTab !== "ai-groups" || shows.length === 0) return;
    if (aiGroups.length > 0) return;
    setAiGroupsLoading(true);
    if (aiGroupTimeoutRef.current) clearTimeout(aiGroupTimeoutRef.current);

    window.htpc.localAi
      .groupItems(
        shows.map((s) => ({
          id: s.id,
          title: s.title,
          genres: s.genres,
          tags: s.tags,
          description: s.description,
        })),
        Math.min(6, Math.max(2, Math.floor(shows.length / 8))),
      )
      .then((groups) => {
        setAiGroups(groups);
        setAiGroupsLoading(false);
      })
      .catch(() => {
        setAiGroupsLoading(false);
        setSubTab("all");
      });

    aiGroupTimeoutRef.current = setTimeout(() => {
      if (aiGroupsLoading) {
        setAiGroupsLoading(false);
        setSubTab("all");
      }
    }, 15000);

    return () => {
      if (aiGroupTimeoutRef.current) clearTimeout(aiGroupTimeoutRef.current);
    };
  }, [subTab, shows]);

  useEffect(() => {
    if (selected?.seasons?.length) {
      setSelectedSeason(selected.seasons[0].seasonNumber);
    }
  }, [selected?.id]);

  const currentSeasonEpisodes = useMemo(() => {
    if (!selected?.seasons) return [];
    return (
      selected.seasons.find((s) => s.seasonNumber === selectedSeason)
        ?.episodes ?? []
    );
  }, [selected, selectedSeason]);

  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId),
    [collections, activeCollectionId],
  );

  const items = useMemo(() => {
    const base = filtered();
    if (!activeCollectionId) return base;
    const result = base.filter((s) => collectionItemIds.has(s.id));
    return sortByCollection<TVShow>(result, activeCollection);
  }, [filtered, shows, searchQuery, activeCollectionId, collectionItemIds, activeCollection]);

  const displayItems = useMemo(() => {
    if (subTab !== "ai-groups" || !selectedAiGroup) return items;
    const group = aiGroups.find((g) => g.label === selectedAiGroup);
    if (!group) return items;
    const ids = new Set(group.itemIds);
    return items.filter((s) => ids.has(s.id));
  }, [items, subTab, aiGroups, selectedAiGroup]);

  const gridItems = subTab === "ai-groups" ? displayItems : items;

  const { focusedIndex } = useGridFocus({
    items: gridItems,
    columnCount,
    gridRef,
    onConfirm: (show) => setSelected(show),
    enabled: !selected,
  });

  const tvCollections = useMemo(
    () => collections.filter((c) => c.itemType === "tv" || c.itemType === "mixed"),
    [collections],
  );

  const { menu, bindItem } = useContextMenu({
    items,
    focusedIndex,
    getOptions: (show): ContextMenuOption[] => {
      const opts: ContextMenuOption[] = [
        {
          id: "favorite",
          label: show.isFavorite ? "Unfavorite" : "Favorite",
          icon: show.isFavorite ? "★" : "☆",
        },
        { id: "hide", label: "Hide", icon: "🙈", destructive: true },
        { id: "tags", label: "Update metadata / tags", icon: "🏷" },
        {
          id: "regenerate",
          label: "Regenerate thumbnail",
          icon: "🔄",
          disabled: !show.dirPath,
        },
        {
          id: "folder",
          label: "Open containing folder",
          icon: "📂",
          disabled: !show.dirPath,
        },
      ];
      if (tvCollections.length > 0) {
        opts.push({ id: "__sep__", label: "Collections", icon: "", disabled: true });
        for (const c of tvCollections) {
          opts.push({
            id: `add-to-coll:${c.id}`,
            label: c.name,
            icon: c.icon || "📁",
          });
        }
      }
      return opts;
    },
    onAction: (show, optionId) => {
      if (optionId.startsWith("add-to-coll:")) {
        const collectionId = optionId.slice("add-to-coll:".length);
        void addItem(collectionId, show.id, "tv");
        useToastStore.getState().push({
          type: "success",
          message: `Added to ${tvCollections.find((c) => c.id === collectionId)?.name ?? "collection"}`,
        });
        return;
      }
      switch (optionId) {
        case "favorite":
          toggleFavorite(show.id);
          break;
        case "hide":
          hide(show.id);
          break;
        case "tags":
          setSelected(show);
          break;
        case "regenerate":
          void regenerateThumbnail(show.id);
          break;
        case "folder":
          if (show.dirPath) {
            void window.htpc.shell.openPath(show.dirPath);
          }
          break;
      }
    },
  });

  const renderItem = useCallback(
    (show: TVShow, index: number) => (
      <div className="p-1.5 w-full h-full flex flex-col min-w-0" {...bindItem(show, index)}>
        <MediaCard
          key={show.id}
          id={show.id}
          title={show.title}
          subtitle={
            show.seasons
              ? `${show.seasons.length} season${show.seasons.length !== 1 ? "s" : ""}`
              : undefined
          }
          coverUrl={show.coverUrl}
          isFavorite={show.isFavorite}
          isFocused={index === focusedIndex}
          isLoading={regeneratingIds.has(show.id)}
          onSelect={() => setSelected(show)}
          onFavorite={() => toggleFavorite(show.id)}
        />
      </div>
    ),
    [bindItem, focusedIndex, regeneratingIds, toggleFavorite],
  );

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div className="flex gap-3 items-center flex-shrink-0">
        <OskInput
          value={searchQuery}
          onChange={setSearch}
          placeholder="Search TV shows…"
          className="text-sm"
          style={{ maxWidth: 280 } as React.CSSProperties}
        />
        <motion.button
          className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={scan}
          whileTap={{ scale: 0.96 }}
          disabled={scanning}
        >
          {scanning ? "⟳ Scanning…" : "↺ Scan"}
        </motion.button>
        <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          {items.length} shows
        </span>
      </div>

      <CollectionsBar
        itemType="tv"
        activeCollectionId={activeCollectionId}
        onSelect={setActiveCollectionId}
        onManage={() => setShowCollectionManager(true)}
        className="flex-shrink-0"
      />

      {/* View-mode sub-tabs */}
      <div className="flex gap-2 flex-shrink-0 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {(["ai-groups", "all"] as SubTab[]).map((m) => (
          <motion.button
            key={m}
            onClick={() => {
              setSubTab(m);
              setSelectedAiGroup(null);
            }}
            className="relative flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none"
            style={{
              backgroundColor: subTab === m
                ? "var(--color-accent)"
                : "var(--color-surface-raised)",
              color: subTab === m ? "var(--color-bg)" : "var(--color-text-dim)",
              border: `1px solid ${subTab === m ? "var(--color-accent)" : "var(--color-border)"}`,
              boxShadow: subTab === m ? "var(--shadow-glow)" : "none",
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {m === "ai-groups" ? "✨ Groups" : "All"}
          </motion.button>
        ))}
      </div>

      {/* AI group chips */}
      {subTab === "ai-groups" && aiGroups.length > 0 && (
        <div className="flex gap-2 flex-shrink-0 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <motion.button
            onClick={() => setSelectedAiGroup(null)}
            className="relative flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none"
            style={{
              backgroundColor: !selectedAiGroup
                ? "var(--color-accent)"
                : "var(--color-surface-raised)",
              color: !selectedAiGroup ? "var(--color-bg)" : "var(--color-text-dim)",
              border: `1px solid ${!selectedAiGroup ? "var(--color-accent)" : "var(--color-border)"}`,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            All Groups
          </motion.button>
          {aiGroups.map((g, i) => (
            <motion.button
              key={`ai-${g.label}-${i}`}
              onClick={() => setSelectedAiGroup(g.label)}
              className="relative flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none"
              style={{
                backgroundColor: selectedAiGroup === g.label
                  ? "var(--color-accent)"
                  : "var(--color-surface-raised)",
                color: selectedAiGroup === g.label ? "var(--color-bg)" : "var(--color-text-dim)",
                border: `1px solid ${selectedAiGroup === g.label ? "var(--color-accent)" : "var(--color-border)"}`,
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {g.label} ({g.itemIds.length})
            </motion.button>
          ))}
        </div>
      )}

      {subTab === "ai-groups" && aiGroupsLoading && (
        <div className="flex items-center gap-2 flex-shrink-0" style={{ color: "var(--color-text-dim)" }}>
          <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
          <span className="text-xs">Generating smart groups…</span>
        </div>
      )}

      {loading ? (
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: "var(--color-text-dim)" }}
        >
          Loading TV shows…
        </div>
      ) : scanning && items.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-3"
          style={{ color: "var(--color-text-dim)" }}
        >
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{
              borderColor: "var(--color-accent)",
              borderTopColor: "transparent",
            }}
          />
          <span className="text-sm">Scanning for shows…</span>
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-4"
          style={{ color: "var(--color-text-dim)" }}
        >
          <p>No TV shows found.</p>
          <motion.button
            className="px-6 py-2.5 rounded-[var(--radius-card)] font-medium"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-bg)",
            }}
            onClick={scan}
            whileTap={{ scale: 0.96 }}
          >
            Scan for shows
          </motion.button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <VirtualGrid
            ref={gridRef}
            items={gridItems}
            minItemWidth={200}
            onColumnCountChange={setColumnCount}
            rowHeight={300}
            renderItem={renderItem}
          />
        </div>
      )}

      <DetailPanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        coverUrl={selected?.coverUrl}
        backdropUrl={selected?.backdropUrl}
        description={selected?.description}
        metadata={
          selected
            ? ([
                selected.firstAirYear
                  ? {
                      label: "First Aired",
                      value: String(selected.firstAirYear),
                    }
                  : null,
                selected.creator
                  ? { label: "Creator", value: selected.creator }
                  : null,
                selected.seasons
                  ? { label: "Seasons", value: String(selected.seasons.length) }
                  : null,
                selected.genres?.length
                  ? { label: "Genres", value: selected.genres.join(", ") }
                  : null,
              ].filter(Boolean) as { label: string; value: string }[])
            : []
        }
        tags={selected?.tags ?? []}
        onTagsChange={
          selected ? (newTags) => setTags(selected.id, newTags) : undefined
        }
      >
        {selected?.seasons && (
          <div className="flex flex-col gap-3">
            <div
              className="flex gap-1 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              {selected.seasons.map((season) => (
                <button
                  key={season.seasonNumber}
                  className="px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 transition-colors"
                  style={{
                    background:
                      selectedSeason === season.seasonNumber
                        ? "var(--color-accent)"
                        : "var(--color-surface-raised)",
                    color:
                      selectedSeason === season.seasonNumber
                        ? "var(--color-bg)"
                        : "var(--color-text-dim)",
                    border: "1px solid var(--color-border)",
                  }}
                  onClick={() => setSelectedSeason(season.seasonNumber)}
                >
                  Season {season.seasonNumber}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              {currentSeasonEpisodes.map((ep) => (
                <div
                  key={ep.episodeNumber}
                  className="flex items-center gap-2 py-2 px-2 rounded text-sm hover:bg-white/5"
                >
                  <span
                    style={{
                      color: "var(--color-text-dim)",
                      minWidth: "1.75rem",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {ep.episodeNumber}
                  </span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span
                      className="truncate"
                      style={{ color: "var(--color-text)" }}
                    >
                      {ep.title ?? `Episode ${ep.episodeNumber}`}
                    </span>
                    <div
                      className="flex gap-2 text-xs"
                      style={{ color: "var(--color-text-dim)" }}
                    >
                      {ep.duration && (
                        <span>
                          {Math.floor(ep.duration / 60)}:
                          {String(Math.round(ep.duration % 60)).padStart(
                            2,
                            "0",
                          )}
                        </span>
                      )}
                      {ep.airDate && <span>{ep.airDate}</span>}
                    </div>
                  </div>
                  <button
                    className="px-2.5 py-1 rounded text-xs font-semibold flex-shrink-0"
                    style={{
                      background: "var(--color-accent)",
                      color: "var(--color-bg)",
                    }}
                    onClick={() =>
                      openVideo(
                        `file://${ep.filePath}`,
                        ep.title ?? `Episode ${ep.episodeNumber}`,
                      )
                    }
                  >
                    ▶ Play
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DetailPanel>
      {menu}
      <CollectionManager
        open={showCollectionManager}
        onClose={() => setShowCollectionManager(false)}
        itemType="tv"
      />
    </div>
  );
};
