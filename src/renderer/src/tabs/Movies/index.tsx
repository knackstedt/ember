import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useMoviesStore } from "../../store/media.store";
import { ChipFilters } from "../../components/ChipFilters/ChipFilters";
import {
  VirtualGrid,
  VirtualGridHandle,
} from "../../components/VirtualGrid/VirtualGrid";
import {
  ListView,
  HexGridView,
  BookshelfView,
  SpreadDeckView,
  NeonGridView,
  GalleryImage,
  useGalleryView,
  useIsNeonGrid,
} from "../../components/GalleryView";
import { MediaCard } from "../../components/MediaCard/MediaCard";
import { DetailPanel } from "../../components/DetailPanel/DetailPanel";
import { OskInput } from "../../components/OnScreenKeyboard/OnScreenKeyboard";
import { RecentlyPlayedRow } from "../../components/RecentlyPlayedRow/RecentlyPlayedRow";
import { Movie } from "../../../../shared/types";
import { resolveMediaUrl } from "../../../../shared/path-utils";
import { useVideoPlayerStore } from "../../store/videoPlayer.store";
import { StreamingTile } from "../../components/StreamingTile/StreamingTile";
import { StreamingService } from "../../../../shared/types";
import { useGridFocus, NavAction } from "../../hooks/useGridFocus";
import { useDetailController } from "../../hooks/useDetailController";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";
import {
  Star,
  StarOff,
  EyeOff,
  Tag,
  FolderOpen,
  Folder,
  Loader,
  RotateCw,
  Sparkles,
  Play,
  X,
  Globe,
  Trash2,
} from "lucide-react";
import { useCollectionsStore, evaluateSmartFilter, sortByCollection } from "../../store/collections.store";
import { CollectionsBar } from "../../components/CollectionsBar/CollectionsBar";
import { CollectionManager } from "../../components/CollectionManager/CollectionManager";
import { useToastStore } from "../../store/toast.store";
import { AiGroup } from "../../../../shared/types";
import { DynamicFacetFilters, FacetField } from "../../components/DynamicFacetFilters/DynamicFacetFilters";
import { getSourceBadge } from "../../lib/source-badge";

type SubTab = "local" | "streaming" | "ai-groups";

export const MoviesTab: React.FC = () => {
  const movies = useMoviesStore((s) => s.movies);
  const loading = useMoviesStore((s) => s.loading);
  const scanning = useMoviesStore((s) => s.scanning);
  const remoteScanning = useMoviesStore((s) => s.remoteScanning);
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
  const deleteMovie = useMoviesStore((s) => s.delete);
  const regenerateThumbnail = useMoviesStore((s) => s.regenerateThumbnail);
  const regeneratingIds = useMoviesStore((s) => s.regeneratingIds);
  const openVideo = useVideoPlayerStore((s) => s.open);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("ai-groups");
  const [columnCount, setColumnCount] = useState(5);
  const [viewColumnCount, setViewColumnCount] = useState(5);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string>>(new Set());
  const [streamingServices, setStreamingServices] = useState<StreamingService[]>([]);
  const gridRef = useRef<VirtualGridHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const galleryView = useGalleryView();
  const isNeonGrid = useIsNeonGrid();

  const [aiGroups, setAiGroups] = useState<AiGroup[]>([]);
  const [aiGroupsLoading, setAiGroupsLoading] = useState(false);
  const [selectedAiGroupId, setSelectedAiGroupId] = useState<string | null>(null);
  const aiGroupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [facetFilters, setFacetFilters] = useState<Record<string, string | null>>({});
  const applyFacetFilter = (field: string, value: string | null) => {
    setFacetFilters((prev) => ({ ...prev, [field]: value }));
  };
  const [filtersExpanded, setFiltersExpanded] = useState(false);

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

  /* Dispatch selection changes for command palette context */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("htpc:select-movie", { detail: { id: selected?.id ?? null } }),
    );
  }, [selected?.id]);

  /* Listen for view-mode commands from command palette */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      if (["all", "ai-groups", "local", "streaming"].includes(detail)) {
        setSubTab(detail as SubTab);
      }
    };
    window.addEventListener("htpc:movies-view", handler);
    return () => window.removeEventListener("htpc:movies-view", handler);
  }, []);

  /* Auto-generate AI groups when subTab switches to ai-groups and movies are loaded */
  useEffect(() => {
    if (subTab !== "ai-groups" || movies.length === 0) return;
    if (aiGroups.length > 0) return;
    setAiGroupsLoading(true);
    if (aiGroupTimeoutRef.current) clearTimeout(aiGroupTimeoutRef.current);

    window.htpc.localAi
      .groupItems(
        movies.map((m) => ({
          id: m.id,
          title: m.title,
          genres: m.genres,
          tags: m.tags,
          description: m.description,
        })),
        Math.min(6, Math.max(2, Math.floor(movies.length / 8))),
      )
      .then((groups) => {
        setAiGroups(groups);
        setAiGroupsLoading(false);
      })
      .catch(() => {
        setAiGroupsLoading(false);
        setSubTab("local");
      });

    aiGroupTimeoutRef.current = setTimeout(() => {
      if (aiGroupsLoading) {
        setAiGroupsLoading(false);
        setSubTab("local");
      }
    }, 15000);

    return () => {
      if (aiGroupTimeoutRef.current) clearTimeout(aiGroupTimeoutRef.current);
    };
  }, [subTab, movies]);

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

  const displayItems = useMemo(() => {
    if (subTab !== "ai-groups" || !selectedAiGroupId) return items;
    const group = aiGroups.find((g) => g.id === selectedAiGroupId);
    if (!group) return items;
    const ids = new Set(group.itemIds);
    return items.filter((m) => ids.has(m.id));
  }, [items, subTab, aiGroups, selectedAiGroupId]);

  const facetSourceItems = displayItems;

  const gridItems = useMemo(() => {
    let r = facetSourceItems;
    for (const [field, value] of Object.entries(facetFilters)) {
      if (!value) continue;
      r = r.filter((movie) => {
        const raw = movie[field as keyof Movie];
        if (raw === undefined || raw === null) return false;
        if (Array.isArray(raw)) return raw.some((v) => String(v).toLowerCase() === value.toLowerCase());
        return String(raw).toLowerCase() === value.toLowerCase();
      });
    }
    return r;
  }, [facetSourceItems, facetFilters]);

  const movieFacetFields: FacetField[] = useMemo(() => [
    { key: "genres", label: "Genre", accessor: (m) => (m as Record<string, unknown>).genres as string[] | undefined, sort: "count", maxValues: 10 },
    { key: "tags", label: "Tag", accessor: (m) => (m as Record<string, unknown>).tags as string[] | undefined, sort: "count", maxValues: 6 },
    { key: "releaseYear", label: "Year", accessor: (m) => String((m as Record<string, unknown>).releaseYear ?? ""), maxValues: 8 },
    { key: "director", label: "Director", accessor: (m) => (m as Record<string, unknown>).director as string | undefined, maxValues: 5 },
    { key: "rating", label: "Rating", accessor: (m) => String((m as Record<string, unknown>).rating ?? ""), maxValues: 5 },
  ], []);

  const isHexGrid = galleryView === "hex-grid";
  const { focusedIndex, setFocusedIndex } = useGridFocus({
    items: gridItems,
    columnCount: isHexGrid ? columnCount : viewColumnCount,
    gridRef,
    onConfirm: (movie) => setSelected(movie),
    enabled: subTab !== "streaming" && !selected,
    getNextIndex: isHexGrid
      ? (current, action) => {
          const handle = gridRef.current as unknown as { getNextIndex?(i: number, a: NavAction): number | null } | null;
          return handle?.getNextIndex?.(current, action) ?? null;
        }
      : undefined,
  });

  /* Reset grid focus when the view context changes so we don’t point at a stale item */
  useEffect(() => {
    setFocusedIndex(0);
  }, [subTab, selectedAiGroupId]);

  const movieCollections = useMemo(
    () => collections.filter((c) => c.itemType === "movie" || c.itemType === "mixed"),
    [collections],
  );

  const { menu, bindItem } = useContextMenu({
    items: gridItems,
    focusedIndex,
    getOptions: (movie): ContextMenuOption[] => {
      const opts: ContextMenuOption[] = [
        {
          id: "favorite",
          label: movie.isFavorite ? "Unfavorite" : "Favorite",
          icon: movie.isFavorite ? <Star size={16} /> : <StarOff size={16} />,
        },
        { id: "hide", label: "Hide", icon: <EyeOff size={16} />, destructive: true },
        { id: "tags", label: "Update metadata / tags", icon: <Tag size={16} /> },
        {
          id: "regenerate",
          label: "Regenerate thumbnail",
          icon: <RotateCw size={16} />,
          disabled: !movie.filePath,
        },
        {
          id: "folder",
          label: "Open containing folder",
          icon: <FolderOpen size={16} />,
          disabled: !movie.filePath,
        },
      ];
      if (movie.missing) {
        opts.push({
          id: "delete",
          label: "Delete missing entry",
          icon: <Trash2 size={16} />,
          destructive: true,
        });
      }
      if (movieCollections.length > 0) {
        opts.push({ id: "__sep__", label: "Collections", disabled: true });
        for (const c of movieCollections) {
          opts.push({
            id: `add-to-coll:${c.id}`,
            label: c.name,
            icon: c.icon || <Folder size={16} />,
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
        case "delete":
          deleteMovie(movie.id);
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
    (movie: Movie, index: number) => {
      const source = getSourceBadge(movie.sourceLocation);
      return (
        <div className="p-1.5 w-full h-full flex flex-col min-w-0" {...bindItem(movie, index)}>
          <MediaCard
            key={movie.id}
            id={movie.id}
            title={movie.title}
            subtitle={movie.releaseYear ? String(movie.releaseYear) : undefined}
            coverUrl={movie.coverUrl}
            badge={source.badge}
            badgeColor={source.badgeColor}
            isFavorite={movie.isFavorite}
            isFocused={index === focusedIndex}
            isLoading={regeneratingIds.has(movie.id)}
            progress={movie.watchProgress}
            missing={movie.missing}
            onSelect={() => { setFocusedIndex(index); setSelected(movie); }}
            onFavorite={() => toggleFavorite(movie.id)}
          />
        </div>
      );
    },
    [bindItem, focusedIndex, setFocusedIndex, regeneratingIds, toggleFavorite],
  );

  const renderHex = useCallback(
    (movie: Movie, index: number) => {
      const source = getSourceBadge(movie.sourceLocation);
      return {
        coverUrl: movie.coverUrl,
        title: movie.title,
        subtitle: movie.releaseYear ? String(movie.releaseYear) : undefined,
        badge: source.badge,
        badgeColor: source.badgeColor,
        isFavorite: movie.isFavorite,
        isLoading: regeneratingIds.has(movie.id),
        progress: movie.watchProgress,
        missing: movie.missing,
        onClick: () => { setFocusedIndex(index); setSelected(movie); },
        onFavorite: () => toggleFavorite(movie.id),
      };
    },
    [regeneratingIds, toggleFavorite],
  );

  const renderListItem = useCallback(
    (movie: Movie, index: number) => {
      const source = getSourceBadge(movie.sourceLocation);
      return (
        <div className="flex items-center gap-3 w-full h-full px-3" {...bindItem(movie, index)}>
          <div
            className="w-12 h-[72px] flex-shrink-0 rounded overflow-hidden bg-cover bg-center"
            style={{
              backgroundImage: movie.coverUrl ? `url(${movie.coverUrl})` : undefined,
              backgroundColor: !movie.coverUrl ? "#1a1a2e" : undefined,
              filter: movie.missing ? "grayscale(80%)" : undefined,
              opacity: movie.missing ? 0.6 : undefined,
            }}
          />
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div
              className={`font-medium truncate text-sm ${index === focusedIndex ? "text-accent" : ""}`}
              style={{ color: index === focusedIndex ? "var(--color-accent)" : "var(--color-text)" }}
            >
              {movie.title}
            </div>
            <div className="text-xs truncate" style={{ color: "var(--color-text-dim)" }}>
              {movie.releaseYear ? `${movie.releaseYear}` : ""}
              {movie.releaseYear && movie.director ? " · " : ""}
              {movie.director ? movie.director : ""}
              {movie.runtime ? ` · ${Math.round(movie.runtime / 60)}min` : ""}
            </div>
            {source.badge && (
              <span
                className="text-[10px] mt-0.5 w-fit px-1.5 py-0.5 rounded"
                style={{ background: source.badgeColor ?? "var(--color-surface-raised)", color: "#fff" }}
              >
                {source.badge}
              </span>
            )}
          </div>
          {movie.isFavorite && <Star size={14} style={{ color: "var(--color-accent)" }} />}
        </div>
      );
    },
    [bindItem, focusedIndex],
  );

  const renderSpine = useCallback(
    (movie: Movie, _index: number, { isHovered, isFocused }: { isHovered: boolean; isFocused: boolean }) => {
      const color = movie.coverUrl ? "#1a1a2e" : "#16213e";
      return (
        <div
          className="w-full h-full relative"
          style={{
            background: `linear-gradient(180deg, ${color}, #0f0f1e)`,
          }}
        >
          {!isHovered && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-[10px] font-bold text-white/80 tracking-wide"
                style={{
                  writingMode: "vertical-rl",
                  textOrientation: "mixed",
                  transform: "rotate(180deg)",
                  maxHeight: "85%",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {movie.title}
              </span>
            </div>
          )}
          {isHovered && (
            <>
              <GalleryImage
                src={movie.coverUrl}
                alt={movie.title}
                style={{ width: "100%", height: "100%" }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 p-2"
                style={{
                  background: "linear-gradient(to top, rgba(0,0,0,0.92), transparent)",
                }}
              >
                <div className="text-[10px] font-bold text-white truncate">{movie.title}</div>
                <div className="text-[9px] text-white/50 truncate">
                  {movie.releaseYear} · {movie.genres?.[0]}
                </div>
              </div>
            </>
          )}
          {isFocused && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: "inset 0 0 0 2px var(--color-accent)",
                zIndex: 10,
              }}
            />
          )}
        </div>
      );
    },
    [],
  );

  const renderDeckCard = useCallback(
    (movie: Movie, _index: number, { isHovered, isFocused }: { isHovered: boolean; isFocused: boolean }) => {
      return (
        <div className="w-full h-full relative">
          <GalleryImage
            src={movie.coverUrl}
            alt={movie.title}
            style={{ width: "100%", height: "100%" }}
          />
          {!isHovered && (
            <div className="absolute inset-0 bg-black/30 pointer-events-none" />
          )}
          {isHovered && (
            <div
              className="absolute bottom-0 left-0 right-0 p-2"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)" }}
            >
              <div className="text-xs font-bold text-white truncate">{movie.title}</div>
            </div>
          )}
          {isFocused && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: "inset 0 0 0 2px var(--color-accent)",
                zIndex: 10,
              }}
            />
          )}
        </div>
      );
    },
    [],
  );

  const renderNeonCard = useCallback(
    (movie: Movie, index: number) => {
      const source = getSourceBadge(movie.sourceLocation);
      return (
        <div className="p-1 w-full h-full flex flex-col min-w-0" {...bindItem(movie, index)}>
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, rgba(14,20,40,0.8), rgba(6,10,24,0.95))`,
              borderBottom: "1px solid rgba(24,30,46,0.8)",
            }}
          >
            {movie.coverUrl ? (
              <img
                src={movie.coverUrl}
                alt={movie.title}
                className="w-full h-full object-cover opacity-80"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-white/20 text-2xl font-bold">
                  {movie.title.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px)",
              }}
            />
          </div>
          <div className="px-1.5 py-1">
            <div
              className="text-[11px] font-bold truncate"
              style={{ color: index === focusedIndex ? "var(--color-accent)" : "var(--color-text)" }}
            >
              {movie.title}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px]" style={{ color: "var(--color-accent)" }}>
                {movie.releaseYear}
              </span>
              {source.badge && (
                <span className="text-[8px] px-1 rounded" style={{ background: source.badgeColor, color: "#fff" }}>
                  {source.badge}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    },
    [bindItem, focusedIndex],
  );

  useEffect(() => {
    switch (galleryView) {
      case "list": setColumnCount(1); setViewColumnCount(1); break;
      case "bookshelf": setColumnCount(12); setViewColumnCount(12); break;
      case "spread-deck": setColumnCount(16); setViewColumnCount(16); break;
      default: setColumnCount(5); setViewColumnCount(5); break;
    }
  }, [galleryView]);

  const renderGallery = useCallback(
    (itemsToRender: Movie[]) => {
      switch (galleryView) {
        case "list":
          return (
            <ListView
              ref={gridRef}
              items={itemsToRender}
              renderItem={renderListItem}
              rowHeight={80}
              scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
            />
          );
        case "hex-grid":
          return (
            <HexGridView
              ref={gridRef}
              items={itemsToRender}
              minItemWidth={200}
              onColumnCountChange={setColumnCount}
              renderHex={renderHex}
              focusedIndex={focusedIndex}
              bindItem={bindItem}
              scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
            />
          );
        case "bookshelf":
          return (
            <BookshelfView
              ref={gridRef}
              items={itemsToRender}
              renderSpine={renderSpine}
              focusedIndex={focusedIndex}
              onItemsPerRowChange={(count) => setViewColumnCount(count)}
              scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
            />
          );
        case "spread-deck":
          return (
            <SpreadDeckView
              ref={gridRef}
              items={itemsToRender}
              renderCard={renderDeckCard}
              focusedIndex={focusedIndex}
              onItemsPerRowChange={(count) => setViewColumnCount(count)}
              scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
            />
          );
        default:
          if (isNeonGrid) {
            return (
              <NeonGridView
                ref={gridRef}
                items={itemsToRender}
                minItemWidth={200}
                onColumnCountChange={setColumnCount}
                rowHeight={300}
                renderItem={renderNeonCard}
                scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
              />
            );
          }
          return (
            <VirtualGrid
              ref={gridRef}
              items={itemsToRender}
              minItemWidth={200}
              onColumnCountChange={setColumnCount}
              rowHeight={300}
              renderItem={renderItem}
              scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
            />
          );
      }
    },
    [galleryView, isNeonGrid, focusedIndex, gridRef, renderListItem, renderItem, renderSpine, renderDeckCard, renderNeonCard, scrollContainerRef],
  );

  const recentlyPlayed = [...movies]
    .filter((m) => m.lastPlayed && m.lastPlayed > 0)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, 8);

  useDetailController({
    enabled: !!selected,
    onConfirm: () => {
      if (selected?.filePath) {
        openVideo(resolveMediaUrl(selected.filePath)!, selected.title, selected.id, selected.watchProgress);
        setSelected(null);
      }
    },
    onCancel: () => setSelected(null),
  });

  return (
    <div className="flex flex-col h-full">
      <div style={{ padding: 16, paddingBottom: 0 }}>
        {/* Collapsible content — scrolls out of view */}
        {subTab === "local" && (
          <div className="flex flex-col gap-3 mb-3">
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
                    resolveMediaUrl(movie.filePath)!,
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
          </div>
        )}

        {/* Compact bar — search + active filter summary */}
        <div
          className="flex items-center gap-2 pb-3 flex-wrap"
          style={{ background: "var(--color-bg)" }}
        >
          {subTab === "local" && (
            <>
              <OskInput
                value={searchQuery}
                onChange={setSearch}
                placeholder="Search movies…"
                className="text-sm"
                style={{ maxWidth: 220 } as React.CSSProperties}
              />
              <motion.button
                className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onClick={scan}
                whileTap={{ scale: 0.96 }}
                disabled={scanning}
              >
                {scanning ? <><Loader size={14} className="animate-spin" /> Scanning…</> : <><RotateCw size={14} /> Scan</>}
              </motion.button>
              <motion.button
                className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium flex items-center gap-1"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("htpc:switch-tab", { detail: { tab: "settings" } }));
                }}
                whileTap={{ scale: 0.96 }}
              >
                <Globe size={14} /> Remote
              </motion.button>
            </>
          )}
          {/* Active tab chip */}
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg)",
            }}
          >
            {subTab === "ai-groups" ? <><Sparkles size={12} /> Groups</> : subTab}
          </span>
          {/* Active filter summary chips */}
          {subTab === "local" && activeGenre && (
            <motion.button
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg)",
              }}
              onClick={() => setGenre(null)}
              whileTap={{ scale: 0.95 }}
              title="Clear genre filter"
            >
              Genre: {activeGenre} <X size={12} />
            </motion.button>
          )}
          {subTab === "ai-groups" && selectedAiGroupId && (() => {
            const group = aiGroups.find((g) => g.id === selectedAiGroupId);
            return group ? (
              <motion.button
                className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
                onClick={() => setSelectedAiGroupId(null)}
                whileTap={{ scale: 0.95 }}
                title="Clear group filter"
              >
                Group: {group.label} <X size={12} />
              </motion.button>
            ) : null;
          })()}
          {Object.entries(facetFilters).map(([key, value]) =>
            value ? (
              <motion.button
                key={key}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
                onClick={() => applyFacetFilter(key, null)}
                whileTap={{ scale: 0.95 }}
                title={`Clear ${key} filter`}
              >
                {movieFacetFields.find((f) => f.key === key)?.label ?? key}: {value} <X size={12} />
              </motion.button>
            ) : null,
          )}
          <motion.button
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
            onClick={() => setFiltersExpanded((v) => !v)}
            whileTap={{ scale: 0.95 }}
          >
            {filtersExpanded ? "▲ Filters" : "▼ Filters"}
          </motion.button>
        </div>

        {/* Expanded filters — render below sticky bar so they stay visible */}
        {filtersExpanded && (
          <div className="flex flex-col gap-3 pb-3">
            <div className="flex gap-3 items-center flex-shrink-0">
              <div className="flex gap-1">
                {(["ai-groups", "local", "streaming"] as SubTab[]).map((t) => (
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
                    {t === "ai-groups" ? "✨ Groups" : t}
                  </button>
                ))}
              </div>
            </div>

            {subTab === "local" && (
              <>
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

                {/* Dynamic metadata facets */}
                {gridItems.length > 0 && (
                  <DynamicFacetFilters
                    items={facetSourceItems}
                    fields={movieFacetFields}
                    activeFilters={facetFilters}
                    onFilter={applyFacetFilter}
                    className="flex-shrink-0"
                  />
                )}
              </>
            )}

            {subTab === "ai-groups" && (
              <>
                {aiGroupsLoading && (
                  <div className="flex items-center gap-2 flex-shrink-0" style={{ color: "var(--color-text-dim)" }}>
                    <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
                    <span className="text-xs">Generating smart groups…</span>
                  </div>
                )}
                {aiGroups.length > 0 && (
                  <div className="flex gap-2 flex-shrink-0 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                    <motion.button
                      onClick={() => setSelectedAiGroupId(null)}
                      className="relative flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none"
                      style={{
                        backgroundColor: !selectedAiGroupId
                          ? "var(--color-accent)"
                          : "var(--color-surface-raised)",
                        color: !selectedAiGroupId ? "var(--color-bg)" : "var(--color-text-dim)",
                        border: `1px solid ${!selectedAiGroupId ? "var(--color-accent)" : "var(--color-border)"}`,
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      All Groups
                    </motion.button>
                    {aiGroups.map((g, i) => (
                      <motion.button
                        key={g.id}
                        onClick={() => setSelectedAiGroupId(g.id)}
                        className="relative flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none"
                        style={{
                          backgroundColor: selectedAiGroupId === g.id
                            ? "var(--color-accent)"
                            : "var(--color-surface-raised)",
                          color: selectedAiGroupId === g.id ? "var(--color-bg)" : "var(--color-text-dim)",
                          border: `1px solid ${selectedAiGroupId === g.id ? "var(--color-accent)" : "var(--color-border)"}`,
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {g.label} ({g.itemIds.length})
                      </motion.button>
                    ))}
                  </div>
                )}
                {gridItems.length > 0 && (
                  <DynamicFacetFilters
                    items={facetSourceItems}
                    fields={movieFacetFields}
                    activeFilters={facetFilters}
                    onFilter={applyFacetFilter}
                    className="flex-shrink-0"
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto gpu-scroll"
        style={{ padding: 16 }}
      >
        {/* Grid content */}
        {subTab === "local" && (
          <>
            {loading ? (
              <div
                className="flex items-center justify-center"
                style={{ color: "var(--color-text-dim)", minHeight: 200 }}
              >
                Loading movies…
              </div>
            ) : (scanning || remoteScanning) && items.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-3"
                style={{ color: "var(--color-text-dim)", minHeight: 200 }}
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
                className="flex flex-col items-center justify-center gap-4"
                style={{ color: "var(--color-text-dim)", minHeight: 200 }}
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
              renderGallery(gridItems)
            )}
          </>
        )}

        {subTab === "ai-groups" && (
          <>
            {gridItems.length === 0 ? (
              <div className="flex items-center justify-center" style={{ color: "var(--color-text-dim)", minHeight: 200 }}>
                <p>No movies found.</p>
              </div>
            ) : (
              renderGallery(gridItems)
            )}
          </>
        )}

        {subTab === "streaming" && (
          <div className="pt-2">
            <StreamingTile services={streamingServices} />
          </div>
        )}
      </div>

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
                selected.sourceLocation
                  ? { label: "Source", value: getSourceBadge(selected.sourceLocation).badge ?? selected.sourceLocation }
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
                    resolveMediaUrl(selected!.filePath)!,
                    selected!.title,
                    selected!.id,
                    selected!.watchProgress,
                  );
                  setSelected(null);
                }}
                whileTap={{ scale: 0.96 }}
              >
                <Play size={14} /> Play
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
                <Play size={14} /> Trailer
              </motion.button>
            </>
          )
        }
      />
      {menu}
      <CollectionManager
        open={showCollectionManager}
        onClose={() => setShowCollectionManager(false)}
        itemType="movie"
      />
    </div>
  );
};
