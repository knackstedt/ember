import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useMoviesStore } from "../../store/media.store";
import { ChipFilters } from "../../components/ChipFilters/ChipFilters";
import {
  VirtualGrid,
  VirtualGridHandle,
} from "../../components/VirtualGrid/VirtualGrid";
import { MediaCard } from "../../components/MediaCard/MediaCard";
import { DetailPanel } from "../../components/DetailPanel/DetailPanel";
import { OskInput } from "../../components/OnScreenKeyboard/OnScreenKeyboard";
import { RecentlyPlayedRow } from "../../components/RecentlyPlayedRow/RecentlyPlayedRow";
import { Movie } from "../../../../shared/types";
import { useVideoPlayerStore } from "../../store/videoPlayer.store";
import { StreamingTile } from "../../components/StreamingTile/StreamingTile";
import { StreamingService } from "../../../../shared/types";
import { useGridFocus } from "../../hooks/useGridFocus";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";
import { useCollectionsStore, evaluateSmartFilter, sortByCollection } from "../../store/collections.store";
import { CollectionsBar } from "../../components/CollectionsBar/CollectionsBar";
import { CollectionManager } from "../../components/CollectionManager/CollectionManager";
import { useToastStore } from "../../store/toast.store";

type SubTab = "local" | "streaming";

export const MoviesTab: React.FC = () => {
  const movies = useMoviesStore((s) => s.movies);
  const loading = useMoviesStore((s) => s.loading);
  const scanning = useMoviesStore((s) => s.scanning);
  const searchQuery = useMoviesStore((s) => s.searchQuery);
  const activeGenre = useMoviesStore((s) => s.activeGenre);
  const load = useMoviesStore((s) => s.load);
  const scan = useMoviesStore((s) => s.scan);
  const toggleFavorite = useMoviesStore((s) => s.toggleFavorite);
  const setSearch = useMoviesStore((s) => s.setSearch);
  const setGenre = useMoviesStore((s) => s.setGenre);
  const setTags = useMoviesStore((s) => s.setTags);
  const filtered = useMoviesStore((s) => s.filtered);
  const hide = useMoviesStore((s) => s.hide);
  const regenerateThumbnail = useMoviesStore((s) => s.regenerateThumbnail);
  const regeneratingIds = useMoviesStore((s) => s.regeneratingIds);
  const openVideo = useVideoPlayerStore((s) => s.open);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("local");
  const [columnCount, setColumnCount] = useState(5);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string>>(new Set());
  const [streamingServices, setStreamingServices] = useState<StreamingService[]>([]);
  const gridRef = useRef<VirtualGridHandle>(null);

  const collections = useCollectionsStore((s) => s.collections);
  const loadCollections = useCollectionsStore((s) => s.load);
  const addItem = useCollectionsStore((s) => s.addItem);
  const listItems = useCollectionsStore((s) => s.listItems);

  useEffect(() => {
    load();
    loadCollections();
  }, []);

  useEffect(() => {
    if (subTab === "streaming") {
      window.htpc.streaming.list("video").then(setStreamingServices).catch(() => {});
    }
  }, [subTab]);

  useEffect(() => {
    if (!activeCollectionId) {
      setCollectionItemIds(new Set());
      return;
    }
    const collection = collections.find((c) => c.id === activeCollectionId);
    if (!collection) return;

    if (collection.type === "smart" && collection.filter) {
      const result = evaluateSmartFilter(movies, collection.filter);
      setCollectionItemIds(new Set(result.map((m) => m.id)));
    } else {
      listItems(activeCollectionId).then((items) => {
        setCollectionItemIds(new Set(items.map((i) => i.itemId)));
      });
    }
  }, [activeCollectionId, collections, movies]);

  useEffect(() => {
    const handler = () => setSelected(null);
    window.addEventListener("htpc:escape", handler);
    return () => window.removeEventListener("htpc:escape", handler);
  }, []);

  const allGenres = useMemo(
    () => [...new Set(movies.flatMap((m) => m.genres ?? []))].sort(),
    [movies],
  );
  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId),
    [collections, activeCollectionId],
  );

  const items = useMemo(() => {
    const base = filtered();
    if (!activeCollectionId) return base;
    const result = base.filter((m) => collectionItemIds.has(m.id));
    return sortByCollection<Movie>(result, activeCollection);
  }, [filtered, movies, searchQuery, activeGenre, activeCollectionId, collectionItemIds, activeCollection]);
  const { focusedIndex } = useGridFocus({
    items,
    columnCount,
    gridRef,
    onConfirm: (movie) => setSelected(movie),
    enabled: subTab === "local" && !selected,
  });

  const movieCollections = useMemo(
    () => collections.filter((c) => c.itemType === "movie" || c.itemType === "mixed"),
    [collections],
  );

  const { menu, bindItem } = useContextMenu({
    items,
    focusedIndex,
    getOptions: (movie): ContextMenuOption[] => {
      const opts: ContextMenuOption[] = [
        {
          id: "favorite",
          label: movie.isFavorite ? "Unfavorite" : "Favorite",
          icon: movie.isFavorite ? "★" : "☆",
        },
        { id: "hide", label: "Hide", icon: "🙈", destructive: true },
        { id: "tags", label: "Update metadata / tags", icon: "🏷" },
        {
          id: "regenerate",
          label: "Regenerate thumbnail",
          icon: "🔄",
          disabled: !movie.filePath,
        },
        {
          id: "folder",
          label: "Open containing folder",
          icon: "📂",
          disabled: !movie.filePath,
        },
      ];
      if (movieCollections.length > 0) {
        opts.push({ id: "__sep__", label: "Collections", icon: "", disabled: true });
        for (const c of movieCollections) {
          opts.push({
            id: `add-to-coll:${c.id}`,
            label: c.name,
            icon: c.icon || "📁",
          });
        }
      }
      return opts;
    },
    onAction: (movie, optionId) => {
      if (optionId.startsWith("add-to-coll:")) {
        const collectionId = optionId.slice("add-to-coll:".length);
        void addItem(collectionId, movie.id, "movie");
        useToastStore.getState().push({
          type: "success",
          message: `Added to ${movieCollections.find((c) => c.id === collectionId)?.name ?? "collection"}`,
        });
        return;
      }
      switch (optionId) {
        case "favorite":
          toggleFavorite(movie.id);
          break;
        case "hide":
          hide(movie.id);
          break;
        case "tags":
          setSelected(movie);
          break;
        case "regenerate":
          void regenerateThumbnail(movie.id);
          break;
        case "folder":
          if (movie.filePath) {
            void window.htpc.shell.showItemInFolder(movie.filePath);
          }
          break;
      }
    },
  });

  const renderItem = useCallback(
    (movie: Movie, index: number) => (
      <div className="p-1.5 w-full h-full flex flex-col min-w-0" {...bindItem(movie, index)}>
        <MediaCard
          key={movie.id}
          id={movie.id}
          title={movie.title}
          subtitle={movie.releaseYear ? String(movie.releaseYear) : undefined}
          coverUrl={movie.coverUrl}
          isFavorite={movie.isFavorite}
          isFocused={index === focusedIndex}
          isLoading={regeneratingIds.has(movie.id)}
          progress={movie.watchProgress}
          onSelect={() => setSelected(movie)}
          onFavorite={() => toggleFavorite(movie.id)}
        />
      </div>
    ),
    [bindItem, focusedIndex, regeneratingIds, toggleFavorite],
  );

  const recentlyPlayed = [...movies]
    .filter((m) => m.lastPlayed && m.lastPlayed > 0)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, 8);

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div className="flex gap-3 items-center flex-shrink-0">
        <div className="flex gap-1">
          {(["local", "streaming"] as SubTab[]).map((t) => (
            <button
              key={t}
              className="px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors"
              style={{
                background:
                  subTab === t
                    ? "var(--color-accent)"
                    : "var(--color-surface-raised)",
                color:
                  subTab === t ? "var(--color-bg)" : "var(--color-text-dim)",
                border: "1px solid var(--color-border)",
              }}
              onClick={() => setSubTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {subTab === "local" && (
          <>
            <OskInput
              value={searchQuery}
              onChange={setSearch}
              placeholder="Search movies…"
              className="text-sm"
              style={{ maxWidth: 240 } as React.CSSProperties}
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
          </>
        )}
      </div>

      {subTab === "local" && (
        <>
          <RecentlyPlayedRow
            items={recentlyPlayed.map((m) => ({
              id: m.id,
              title: m.title,
              coverUrl: m.coverUrl,
              subtitle: m.releaseYear ? String(m.releaseYear) : undefined,
            }))}
            onLaunch={(id) => {
              const movie = movies.find((m) => m.id === id);
              if (movie)
                openVideo(
                  `file://${movie.filePath}`,
                  movie.title,
                  movie.id,
                  movie.watchProgress,
                );
            }}
          />

          <CollectionsBar
            itemType="movie"
            activeCollectionId={activeCollectionId}
            onSelect={setActiveCollectionId}
            onManage={() => setShowCollectionManager(true)}
            className="flex-shrink-0"
          />

          <ChipFilters
            filters={[
              { id: "", label: "All Genres" },
              ...allGenres.map((g) => ({ id: g, label: g })),
            ]}
            active={activeGenre ?? ""}
            onSelect={(g) => {
              setActiveCollectionId(null);
              setGenre(g || null);
            }}
            className="flex-shrink-0"
          />

          {loading ? (
            <div
              className="flex-1 flex items-center justify-center"
              style={{ color: "var(--color-text-dim)" }}
            >
              Loading movies…
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
              <span className="text-sm">Scanning for movies…</span>
            </div>
          ) : items.length === 0 ? (
            <div
              className="flex-1 flex flex-col items-center justify-center gap-4"
              style={{ color: "var(--color-text-dim)" }}
            >
              <p>No movies found.</p>
              <motion.button
                className="px-6 py-2.5 rounded-[var(--radius-card)] font-medium"
                style={{
                  background: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
                onClick={scan}
                whileTap={{ scale: 0.96 }}
              >
                Scan for movies
              </motion.button>
            </div>
          ) : (
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
              <VirtualGrid
                ref={gridRef}
                items={items}
                minItemWidth={200}
                onColumnCountChange={setColumnCount}
                rowHeight={300}
                renderItem={renderItem}
              />
            </div>
          )}
        </>
      )}

      {subTab === "streaming" && (
        <div className="pt-2">
          <StreamingTile services={streamingServices} />
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
                selected.releaseYear
                  ? { label: "Year", value: String(selected.releaseYear) }
                  : null,
                selected.director
                  ? { label: "Director", value: selected.director }
                  : null,
                selected.runtime
                  ? {
                      label: "Runtime",
                      value: `${Math.round(selected.runtime / 60)}min`,
                    }
                  : null,
                selected.resolution
                  ? { label: "Resolution", value: selected.resolution }
                  : null,
                selected.codec
                  ? { label: "Codec", value: selected.codec }
                  : null,
              ].filter(Boolean) as { label: string; value: string }[])
            : []
        }
        tags={selected?.tags ?? []}
        onTagsChange={
          selected ? (newTags) => setTags(selected.id, newTags) : undefined
        }
        actions={
          selected && (
            <>
              <motion.button
                className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
                style={{
                  background: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
                onClick={() => {
                  openVideo(
                    `file://${selected!.filePath}`,
                    selected!.title,
                    selected!.id,
                    selected!.watchProgress,
                  );
                  setSelected(null);
                }}
                whileTap={{ scale: 0.96 }}
              >
                ▶ Play
              </motion.button>
              <motion.button
                className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onClick={() => {
                  const url = selected!.tmdbId
                    ? `https://www.themoviedb.org/movie/${selected!.tmdbId}/videos`
                    : `https://www.youtube.com/results?search_query=${encodeURIComponent(selected!.title + " official trailer")}`;
                  void window.htpc.shell.openExternal(url);
                }}
                whileTap={{ scale: 0.96 }}
              >
                ▶ Trailer
              </motion.button>
            </>
          )
        }
      >
        {selected && (
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: "var(--color-text-dim)" }}
            >
              Cast &amp; Crew
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              {selected.director && (
                <div className="flex gap-2">
                  <span
                    style={{ color: "var(--color-text-dim)", minWidth: 64 }}
                  >
                    Director
                  </span>
                  <span style={{ color: "var(--color-text)" }}>
                    {selected.director}
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <span style={{ color: "var(--color-text-dim)", minWidth: 64 }}>
                  Cast
                </span>
                <span style={{ color: "var(--color-text)" }}>TBD</span>
              </div>
            </div>
          </div>
        )}
      </DetailPanel>
      {subTab === "local" && menu}
      <CollectionManager
        open={showCollectionManager}
        onClose={() => setShowCollectionManager(false)}
        itemType="movie"
      />
    </div>
  );
};
