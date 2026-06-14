import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useMusicStore } from "../../store/media.store";
import { ChipFilters } from "../../components/ChipFilters/ChipFilters";
import {
  VirtualGrid,
  VirtualGridHandle,
} from "../../components/VirtualGrid/VirtualGrid";
import { MediaCard } from "../../components/MediaCard/MediaCard";
import { DetailPanel } from "../../components/DetailPanel/DetailPanel";
import { OskInput } from "../../components/OnScreenKeyboard/OnScreenKeyboard";
import { MusicTrack } from "../../../../shared/types";
import { useMusicPlayerStore } from "../../store/musicPlayer.store";
import { useFocusZoneStore } from "../../store/focusZone.store";
import { StreamingTile } from "../../components/StreamingTile/StreamingTile";
import { StreamingService } from "../../../../shared/types";
import { useGridFocus } from "../../hooks/useGridFocus";
import { useDetailController } from "../../hooks/useDetailController";
import { useCoverCacheStore } from "../../store/coverCache.store";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";
import {
  Star,
  StarOff,
  EyeOff,
  Tag,
  RotateCw,
  FolderOpen,
  Play,
  Folder,
  Loader,
  Sparkles,
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

  useEffect(() => {
    if (!coverUrl) {
      loadThumbnail(track.id);
    }
  }, [track.id, coverUrl, loadThumbnail]);

  return (
    <MediaCard
      key={track.id}
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

type SubTab = "local" | "streaming" | "ai-groups";
type BrowseMode = "artists" | "genres" | "tracks";

interface MusicGroup {
  name: string;
  trackCount: number;
  coverUrl?: string;
}

export const MusicTab: React.FC = () => {
  const tracks = useMusicStore((s) => s.tracks);
  const loading = useMusicStore((s) => s.loading);
  const scanning = useMusicStore((s) => s.scanning);
  const remoteScanning = useMusicStore((s) => s.remoteScanning);
  const searchQuery = useMusicStore((s) => s.searchQuery);
  const activeArtist = useMusicStore((s) => s.activeArtist);
  const activeAlbum = useMusicStore((s) => s.activeAlbum);
  const activeGenre = useMusicStore((s) => s.activeGenre);
  const activeYear = useMusicStore((s) => s.activeYear);
  const load = useMusicStore((s) => s.load);
  const scan = useMusicStore((s) => s.scan);
  const toggleFavorite = useMusicStore((s) => s.toggleFavorite);
  const setTags = useMusicStore((s) => s.setTags);
  const setSearch = useMusicStore((s) => s.setSearch);
  const setArtist = useMusicStore((s) => s.setArtist);
  const setAlbum = useMusicStore((s) => s.setAlbum);
  const setGenre = useMusicStore((s) => s.setGenre);
  const setYear = useMusicStore((s) => s.setYear);
  const searchCoverArt = useMusicStore((s) => s.searchCoverArt);
  const pickCoverImage = useMusicStore((s) => s.pickCoverImage);
  const hide = useMusicStore((s) => s.hide);
  const deleteTrack = useMusicStore((s) => s.delete);
  const artistThumbnails = useMusicStore((s) => s.artistThumbnails);
  const artistThumbnailsLoading = useMusicStore((s) => s.artistThumbnailsLoading);
  const loadArtistThumbnail = useMusicStore((s) => s.loadArtistThumbnail);
  const play = useMusicPlayerStore((s) => s.play);
  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);
  const bladeCollapsed = useMusicPlayerStore((s) => s.bladeCollapsed);
  const setZone = useFocusZoneStore((s) => s.setZone);
  const [selected, setSelected] = useState<MusicTrack | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("local");
  const [browseMode, setBrowseMode] = useState<BrowseMode>("artists");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [activeFilterType, setActiveFilterType] = useState<
    "artist" | "album" | "genre" | "year"
  >("artist");
  const [trackColumnCount, setTrackColumnCount] = useState(6);
  const [groupColumnCount, setGroupColumnCount] = useState(6);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string>>(new Set());
  const [streamingServices, setStreamingServices] = useState<StreamingService[]>([]);
  const trackGridRef = useRef<VirtualGridHandle>(null);
  const groupGridRef = useRef<VirtualGridHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
    const handler = () => {
      if (selected) setSelected(null);
      else if (selectedGroup) setSelectedGroup(null);
    };
    window.addEventListener("htpc:escape", handler);
    return () => window.removeEventListener("htpc:escape", handler);
  }, [selected, selectedGroup]);

  /* Dispatch selection changes for command palette context */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("htpc:select-music", {
        detail: {
          id: selected?.id ?? null,
          artist: selected?.artist ?? (browseMode === "artists" ? selectedGroup ?? null : null),
          album: selected?.album ?? null,
        },
      }),
    );
  }, [selected?.id, selected?.artist, selected?.album, selectedGroup, browseMode]);

  /* Listen for view-mode commands from command palette */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      if (["tracks", "ai-groups"].includes(detail)) {
        setSubTab(detail as SubTab);
      }
    };
    window.addEventListener("htpc:music-view", handler);
    return () => window.removeEventListener("htpc:music-view", handler);
  }, []);

  const albumTracks = useMemo(() => {
    if (!selected?.album) return [];
    return tracks
      .filter((t) => t.album === selected.album)
      .sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  }, [selected?.album, tracks]);

  useEffect(() => {
    load();
    loadCollections();
  }, []);

  useEffect(() => {
    if (subTab === "streaming") {
      window.htpc.streaming.list("music").then(setStreamingServices).catch(() => {});
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
      const result = evaluateSmartFilter(tracks, collection.filter);
      setCollectionItemIds(new Set(result.map((t) => t.id)));
    } else {
      listItems(activeCollectionId).then((items) => {
        setCollectionItemIds(new Set(items.map((i) => i.itemId)));
      });
    }
  }, [activeCollectionId, collections, tracks]);

  /* Auto-generate AI groups when subTab switches to ai-groups and tracks are loaded */
  useEffect(() => {
    if (subTab !== "ai-groups" || tracks.length === 0) return;
    if (aiGroups.length > 0) return;
    setAiGroupsLoading(true);
    if (aiGroupTimeoutRef.current) clearTimeout(aiGroupTimeoutRef.current);

    window.htpc.localAi
      .groupItems(
        tracks.map((t) => ({
          id: t.id,
          title: t.title,
          genres: t.genre ? [t.genre] : undefined,
          tags: t.tags,
          artist: t.artist,
          album: t.album,
        })),
        Math.min(6, Math.max(2, Math.floor(tracks.length / 8))),
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
  }, [subTab, tracks]);

  const artistGroups = useMemo(() => {
    let source = tracks.filter((t) => !t.hidden);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      source = source.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q),
      );
    }
    const map = new Map<string, { name: string; tracks: MusicTrack[] }>();
    for (const t of source) {
      if (!t.artist) continue;
      const key = t.artist.toLowerCase();
      if (!map.has(key)) map.set(key, { name: t.artist, tracks: [] });
      map.get(key)!.tracks.push(t);
    }
    return Array.from(map.values())
      .map((g) => ({
        name: g.name,
        trackCount: g.tracks.length,
        coverUrl: g.tracks.find((t) => t.albumArtUrl)?.albumArtUrl,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [tracks, searchQuery]);

  const genreGroups = useMemo(() => {
    let source = tracks.filter((t) => !t.hidden);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      source = source.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q),
      );
    }
    const map = new Map<string, { name: string; tracks: MusicTrack[] }>();
    for (const t of source) {
      if (!t.genre) continue;
      const key = t.genre.toLowerCase();
      if (!map.has(key)) map.set(key, { name: t.genre, tracks: [] });
      map.get(key)!.tracks.push(t);
    }
    return Array.from(map.values())
      .map((g) => ({
        name: g.name,
        trackCount: g.tracks.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [tracks, searchQuery]);

  const groupItems: MusicGroup[] = useMemo(() => {
    if (browseMode === "artists") return artistGroups;
    if (browseMode === "genres") return genreGroups;
    return [];
  }, [browseMode, artistGroups, genreGroups]);

  /* batch-load artist thumbnails in background — avoids IPC flood & re-render storms */
  useEffect(() => {
    if (browseMode !== "artists") return;

    let i = 0;
    const BATCH = 8;
    const INTERVAL = 200;
    const timer = setInterval(() => {
      const state = useMusicStore.getState();
      const pending = artistGroups
        .filter((g) => !state.artistThumbnails[g.name] && !state.artistThumbnailsFailed[g.name])
        .map((g) => g.name);
      if (pending.length === 0) {
        clearInterval(timer);
        return;
      }
      const batch = pending.slice(i, i + BATCH);
      batch.forEach((a) => loadArtistThumbnail(a));
      i += BATCH;
      if (i >= pending.length) i = 0; // loop back for any newly visible artists
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [browseMode, artistGroups, loadArtistThumbnail]);

  const trackItems = useMemo(() => {
    let r = tracks.filter((t) => !t.hidden);
    if (selectedGroup) {
      if (browseMode === "artists") {
        r = r.filter((t) => t.artist?.toLowerCase() === selectedGroup.toLowerCase());
      } else if (browseMode === "genres") {
        r = r.filter((t) => t.genre?.toLowerCase() === selectedGroup.toLowerCase());
      }
    } else {
      if (activeArtist) r = r.filter((t) => t.artist?.toLowerCase() === activeArtist.toLowerCase());
      if (activeAlbum) r = r.filter((t) => t.album === activeAlbum);
      if (activeGenre) r = r.filter((t) => t.genre === activeGenre);
      if (activeYear) r = r.filter((t) => t.year === activeYear);
    }
    if (activeCollectionId) {
      r = r.filter((t) => collectionItemIds.has(t.id));
    }
    const activeCollection = collections.find((c) => c.id === activeCollectionId);
    if (activeCollection) {
      r = sortByCollection<MusicTrack>(r, activeCollection);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q),
      );
    }
    return r;
  }, [tracks, selectedGroup, browseMode, activeArtist, activeAlbum, activeGenre, activeYear, searchQuery, activeCollectionId, collectionItemIds]);

  const displayTrackItems = useMemo(() => {
    if (subTab !== "ai-groups" || !selectedAiGroupId) return trackItems;
    const group = aiGroups.find((g) => g.id === selectedAiGroupId);
    if (!group) return trackItems;
    const ids = new Set(group.itemIds);
    return trackItems.filter((t) => ids.has(t.id));
  }, [trackItems, subTab, aiGroups, selectedAiGroupId]);

  const facetSourceItems = displayTrackItems;

  const gridTrackItems = useMemo(() => {
    let r = facetSourceItems;
    for (const [field, value] of Object.entries(facetFilters)) {
      if (!value) continue;
      r = r.filter((track) => {
        const raw = track[field as keyof MusicTrack];
        if (raw === undefined || raw === null) return false;
        if (Array.isArray(raw)) return raw.some((v) => String(v).toLowerCase() === value.toLowerCase());
        return String(raw).toLowerCase() === value.toLowerCase();
      });
    }
    return r;
  }, [facetSourceItems, facetFilters]);

  const musicFacetFields: FacetField[] = useMemo(() => [
    { key: "genre", label: "Genre", accessor: (t) => (t as Record<string, unknown>).genre as string | undefined, sort: "count", maxValues: 8 },
    { key: "artist", label: "Artist", accessor: (t) => (t as Record<string, unknown>).artist as string | undefined, sort: "count", maxValues: 8 },
    { key: "album", label: "Album", accessor: (t) => (t as Record<string, unknown>).album as string | undefined, sort: "count", maxValues: 6 },
    { key: "year", label: "Year", accessor: (t) => String((t as Record<string, unknown>).year ?? ""), maxValues: 8 },
    { key: "tags", label: "Tag", accessor: (t) => (t as Record<string, unknown>).tags as string[] | undefined, sort: "count", maxValues: 5 },
  ], []);

  const handleEdge = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (direction === "right" && hasPlayer) {
        setZone("queue");
      } else if (direction === "down" && hasPlayer) {
        setZone("player");
      }
    },
    [hasPlayer, setZone],
  );

  const { focusedIndex: groupFocusedIndex, setFocusedIndex: setGroupFocusedIndex } = useGridFocus<MusicGroup>({
    items: groupItems,
    columnCount: groupColumnCount,
    gridRef: groupGridRef,
    onConfirm: (group) => setSelectedGroup(group.name),
    enabled: subTab === "local" && !selected && !selectedGroup && browseMode !== "tracks",
    onEdge: handleEdge,
  });

  const { focusedIndex: trackFocusedIndex, setFocusedIndex: setTrackFocusedIndex } = useGridFocus<MusicTrack>({
    items: gridTrackItems,
    columnCount: trackColumnCount,
    gridRef: trackGridRef,
    onConfirm: (track, index) => {
      play(gridTrackItems, index);
      setSelected(track);
    },
    enabled: subTab === "local" && !selected && (browseMode === "tracks" || !!selectedGroup),
    onEdge: handleEdge,
  });

  const musicCollections = useMemo(
    () => collections.filter((c) => c.itemType === "music" || c.itemType === "mixed"),
    [collections],
  );

  const { menu: trackCtxMenu, bindItem: bindTrackItem } = useContextMenu<MusicTrack>({
    items: gridTrackItems,
    focusedIndex: trackFocusedIndex,
    enabled: subTab === "local" && (browseMode === "tracks" || !!selectedGroup),
    getOptions: (track): ContextMenuOption[] => {
      const opts: ContextMenuOption[] = [
        {
          id: "favorite",
          label: track.isFavorite ? "Unfavorite" : "Favorite",
          icon: track.isFavorite ? <Star size={16} /> : <StarOff size={16} />,
        },
        { id: "hide", label: "Hide", icon: <EyeOff size={16} />, destructive: true },
        { id: "tags", label: "Update metadata / tags", icon: <Tag size={16} /> },
        {
          id: "searchCover",
          label: "Search cover art",
          icon: <RotateCw size={16} />,
        },
        {
          id: "folder",
          label: "Open containing folder",
          icon: <FolderOpen size={16} />,
          disabled: !track.filePath,
        },
      ];
      if (track.missing) {
        opts.push({
          id: "delete",
          label: "Delete missing entry",
          icon: <Trash2 size={16} />,
          destructive: true,
        });
      }
      if (musicCollections.length > 0) {
        opts.push({ id: "__sep__", label: "Collections", disabled: true });
        for (const c of musicCollections) {
          opts.push({
            id: `add-to-coll:${c.id}`,
            label: c.name,
            icon: c.icon || <Folder size={16} />,
          });
        }
      }
      return opts;
    },
    onAction: (track, optionId) => {
      if (optionId.startsWith("add-to-coll:")) {
        const collectionId = optionId.slice("add-to-coll:".length);
        void addItem(collectionId, track.id, "music");
        useToastStore.getState().push({
          type: "success",
          message: `Added to ${musicCollections.find((c) => c.id === collectionId)?.name ?? "collection"}`,
        });
        return;
      }
      switch (optionId) {
        case "favorite":
          toggleFavorite(track.id);
          break;
        case "hide":
          hide(track.id);
          break;
        case "delete":
          deleteTrack(track.id);
          break;
        case "tags":
          setSelected(track);
          break;
        case "searchCover":
          void searchCoverArt(track.id);
          break;
        case "folder":
          if (track.filePath) {
            void window.htpc.shell.showItemInFolder(track.filePath);
          }
          break;
      }
    },
  });

  const { menu: groupCtxMenu, bindItem: bindGroupItem } = useContextMenu<MusicGroup>({
    items: groupItems,
    focusedIndex: groupFocusedIndex,
    enabled: subTab === "local" && !selectedGroup && browseMode !== "tracks",
    getOptions: (group): ContextMenuOption[] => [
      { id: "play", label: "Play All", icon: <Play size={16} /> },
    ],
    onAction: (group, optionId) => {
      if (optionId === "play") {
        const groupTracks = tracks.filter((t) => {
          if (t.hidden) return false;
          if (browseMode === "artists") return t.artist?.toLowerCase() === group.name.toLowerCase();
          return t.genre?.toLowerCase() === group.name.toLowerCase();
        });
        if (groupTracks.length > 0) {
          play(groupTracks, 0);
          setSelectedGroup(null);
        }
      }
    },
  });

  const renderGroupItem = useCallback(
    (group: MusicGroup, index: number) => (
      <div className="p-1.5 w-full h-full flex flex-col min-w-0" {...bindGroupItem(group, index)}>
        <MediaCard
          id={group.name}
          title={group.name}
          subtitle={`${group.trackCount} track${group.trackCount !== 1 ? "s" : ""}`}
          coverUrl={artistThumbnails[group.name] ?? group.coverUrl}
          aspectRatio="1/1"
          isFocused={index === groupFocusedIndex}
          isLoading={browseMode === "artists" && !!artistThumbnailsLoading[group.name]}
          onSelect={() => { setGroupFocusedIndex(index); setSelectedGroup(group.name); }}
        />
      </div>
    ),
    [bindGroupItem, groupFocusedIndex, setGroupFocusedIndex, artistThumbnails, artistThumbnailsLoading, browseMode],
  );

  const renderTrackItem = useCallback(
    (track: MusicTrack, index: number) => (
      <div className="p-1.5 w-full h-full flex flex-col min-w-0" {...bindTrackItem(track, index)}>
        <LazyMusicCard
          track={track}
          index={index}
          focusedIndex={trackFocusedIndex}
          onSelect={() => {
            setTrackFocusedIndex(index);
            play(trackItems, index);
            setSelected(track);
          }}
          onFavorite={() => toggleFavorite(track.id)}
        />
      </div>
    ),
    [bindTrackItem, trackFocusedIndex, setTrackFocusedIndex, play, trackItems, toggleFavorite],
  );

  const artists = [
    ...tracks
      .reduce((map, t) => {
        const a = t.artist;
        if (!a) return map;
        const key = a.toLowerCase();
        if (!map.has(key)) map.set(key, a);
        return map;
      }, new Map<string, string>())
      .values(),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const albums = [
    ...new Set(tracks.map((t) => t.album).filter(Boolean) as string[]),
  ].sort();
  const genres = [
    ...new Set(tracks.map((t) => t.genre).filter(Boolean) as string[]),
  ].sort();
  const years = [
    ...new Set(tracks.map((t) => t.year).filter(Boolean) as number[]),
  ].sort((a, b) => b - a);

  const filterChips = {
    artist: [
      { id: "", label: "All Artists" },
      ...artists.map((a) => ({ id: a, label: a })),
    ],
    album: [
      { id: "", label: "All Albums" },
      ...albums.map((a) => ({ id: a, label: a })),
    ],
    genre: [
      { id: "", label: "All Genres" },
      ...genres.map((g) => ({ id: g, label: g })),
    ],
    year: [
      { id: "", label: "All Years" },
      ...years.map((y) => ({ id: String(y), label: String(y) })),
    ],
  };

  useDetailController({
    enabled: !!selected,
    onConfirm: () => {
      if (selected) {
        const idx = trackItems.findIndex((t) => t.id === selected.id);
        if (idx >= 0) {
          play(trackItems, idx);
        }
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
            <CollectionsBar
              itemType="music"
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
          {(subTab === "local" || subTab === "ai-groups") && (
            <>
              <OskInput
                value={searchQuery}
                onChange={setSearch}
                placeholder="Search music…"
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
          {subTab === "local" && (
            <>
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "var(--color-surface-raised)",
                  color: "var(--color-text-dim)",
                  border: "1px solid var(--color-border)",
                }}
              >
                Browse: {browseMode === "artists" ? "Artists" : browseMode === "genres" ? "Genres" : "Tracks"}
              </span>
              {selectedGroup && (
                <motion.button
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "var(--color-bg)",
                  }}
                  onClick={() => setSelectedGroup(null)}
                  whileTap={{ scale: 0.95 }}
                  title="Back to groups"
                >
                  {selectedGroup} <X size={12} />
                </motion.button>
              )}
              {browseMode === "tracks" && activeArtist && (
                <motion.button
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-bg)" }}
                  onClick={() => setArtist(null)}
                  whileTap={{ scale: 0.95 }}
                  title="Clear artist filter"
                >
                  Artist: {activeArtist} <X size={12} />
                </motion.button>
              )}
              {browseMode === "tracks" && activeAlbum && (
                <motion.button
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-bg)" }}
                  onClick={() => setAlbum(null)}
                  whileTap={{ scale: 0.95 }}
                  title="Clear album filter"
                >
                  Album: {activeAlbum} <X size={12} />
                </motion.button>
              )}
              {browseMode === "tracks" && activeGenre && (
                <motion.button
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-bg)" }}
                  onClick={() => setGenre(null)}
                  whileTap={{ scale: 0.95 }}
                  title="Clear genre filter"
                >
                  Genre: {activeGenre} <X size={12} />
                </motion.button>
              )}
              {browseMode === "tracks" && activeYear && (
                <motion.button
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-bg)" }}
                  onClick={() => setYear(null)}
                  whileTap={{ scale: 0.95 }}
                  title="Clear year filter"
                >
                  Year: {activeYear} <X size={12} />
                </motion.button>
              )}
            </>
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
                {musicFacetFields.find((f) => f.key === key)?.label ?? key}: {value} <X size={12} />
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
                    className="px-4 py-1.5 rounded-full text-sm font-medium capitalize"
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
                <div className="flex gap-2 flex-shrink-0 items-center">
                  <ChipFilters
                    filters={[
                      { id: "artists", label: "Artists" },
                      { id: "genres", label: "Genres" },
                      { id: "tracks", label: "All Tracks" },
                    ]}
                    active={browseMode}
                    onSelect={(v) => {
                      setActiveCollectionId(null);
                      setBrowseMode(v as BrowseMode);
                      setSelectedGroup(null);
                    }}
                  />
                  {selectedGroup && (
                    <motion.button
                      className="px-3 py-1.5 rounded-full text-sm font-medium"
                      style={{
                        background: "var(--color-surface-raised)",
                        color: "var(--color-text)",
                        border: "1px solid var(--color-border)",
                      }}
                      onClick={() => setSelectedGroup(null)}
                      whileTap={{ scale: 0.95 }}
                    >
                      ← Back
                    </motion.button>
                  )}
                </div>

                {browseMode === "tracks" && !selectedGroup && (
                  <>
                    <div className="flex gap-2 flex-shrink-0">
                      {(["artist", "album", "genre", "year"] as const).map((ft) => (
                        <button
                          key={ft}
                          className="px-3 py-1 rounded text-xs font-medium capitalize"
                          style={{
                            background:
                              activeFilterType === ft
                                ? "var(--color-accent-dim)"
                                : "var(--color-surface-raised)",
                            color: "var(--color-text)",
                            border: "1px solid var(--color-border)",
                          }}
                          onClick={() => setActiveFilterType(ft)}
                        >
                          {ft}
                        </button>
                      ))}
                    </div>
                    <ChipFilters
                      filters={filterChips[activeFilterType]}
                      active={
                        activeFilterType === "artist"
                          ? (activeArtist ?? "")
                          : activeFilterType === "album"
                            ? (activeAlbum ?? "")
                            : activeFilterType === "genre"
                              ? (activeGenre ?? "")
                              : activeYear
                                ? String(activeYear)
                                : ""
                      }
                      onSelect={(v) => {
                        if (activeFilterType === "artist") setArtist(v || null);
                        else if (activeFilterType === "album") setAlbum(v || null);
                        else if (activeFilterType === "genre") setGenre(v || null);
                        else setYear(v ? parseInt(v) : null);
                      }}
                      className="flex-shrink-0"
                    />
                  </>
                )}

                {/* Dynamic metadata facets */}
                {gridTrackItems.length > 0 && browseMode === "tracks" && (
                  <DynamicFacetFilters
                    items={facetSourceItems}
                    fields={musicFacetFields}
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
                {gridTrackItems.length > 0 && (
                  <DynamicFacetFilters
                    items={facetSourceItems}
                    fields={musicFacetFields}
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
                Loading music…
              </div>
            ) : (scanning || remoteScanning) && trackItems.length === 0 && groupItems.length === 0 ? (
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
                <span className="text-sm">Scanning for music…</span>
              </div>
            ) : trackItems.length === 0 && groupItems.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-4"
                style={{ color: "var(--color-text-dim)", minHeight: 200 }}
              >
                <p>No music found.</p>
                <motion.button
                  className="px-6 py-2.5 rounded-[var(--radius-card)] font-medium"
                  style={{
                    background: "var(--color-accent)",
                    color: "var(--color-bg)",
                  }}
                  onClick={scan}
                  whileTap={{ scale: 0.96 }}
                >
                  Scan for music
                </motion.button>
              </div>
            ) : browseMode !== "tracks" && !selectedGroup ? (
              <VirtualGrid
                key="groups"
                ref={groupGridRef}
                items={groupItems}
                minItemWidth={180}
                onColumnCountChange={setGroupColumnCount}
                rowHeight={240}
                renderItem={renderGroupItem}
                scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
              />
            ) : (
              <VirtualGrid
                key="tracks"
                ref={trackGridRef}
                items={gridTrackItems}
                minItemWidth={180}
                onColumnCountChange={setTrackColumnCount}
                rowHeight={240}
                renderItem={renderTrackItem}
                scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
              />
            )}
          </>
        )}

        {subTab === "ai-groups" && (
          <>
            {gridTrackItems.length === 0 ? (
              <div className="flex items-center justify-center" style={{ color: "var(--color-text-dim)", minHeight: 200 }}>
                <p>No tracks found.</p>
              </div>
            ) : (
              <VirtualGrid
                ref={trackGridRef}
                items={gridTrackItems}
                minItemWidth={160}
                onColumnCountChange={setTrackColumnCount}
                rowHeight={240}
                renderItem={renderTrackItem}
                scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
              />
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
        coverUrl={selected?.albumArtUrl}
        metadata={
          selected
            ? ([
                selected.artist
                  ? { label: "Artist", value: selected.artist }
                  : null,
                selected.album
                  ? { label: "Album", value: selected.album }
                  : null,
                selected.year
                  ? { label: "Year", value: String(selected.year) }
                  : null,
                selected.genre
                  ? { label: "Genre", value: selected.genre }
                  : null,
                selected.duration
                  ? {
                      label: "Duration",
                      value: `${Math.floor(selected.duration / 60)}:${String(Math.round(selected.duration % 60)).padStart(2, "0")}`,
                    }
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
                  play(
                    trackItems,
                    trackItems.findIndex((t) => t.id === selected!.id),
                  );
                  setSelected(null);
                }}
                whileTap={{ scale: 0.96 }}
              >
                <Play size={14} /> Play
              </motion.button>
              {albumTracks.length > 1 && (
                <motion.button
                  className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
                  style={{
                    background: "var(--color-surface-raised)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                  }}
                  onClick={() => {
                    play(albumTracks, 0);
                    setSelected(null);
                  }}
                  whileTap={{ scale: 0.96 }}
                >
                  <Play size={14} /> Play Album
                </motion.button>
              )}
              <motion.button
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onClick={() => {
                  if (selected) searchCoverArt(selected.id);
                }}
                whileTap={{ scale: 0.96 }}
              >
                Search Cover
              </motion.button>
              <motion.button
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onClick={() => {
                  if (selected) pickCoverImage(selected.id);
                }}
                whileTap={{ scale: 0.96 }}
              >
                Upload Cover
              </motion.button>
            </>
          )
        }
      >
        {selected?.album && albumTracks.length > 0 && (
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: "var(--color-text-dim)" }}
            >
              {selected.album}
            </div>
            <div className="flex flex-col gap-0.5">
              {albumTracks.map((track, i) => (
                <div
                  key={track.id}
                  className="flex items-center gap-2 py-1.5 px-2 rounded text-sm cursor-pointer hover:bg-white/5"
                  style={{
                    background:
                      track.id === selected.id
                        ? "color-mix(in srgb, var(--color-accent) 15%, transparent)"
                        : "transparent",
                  }}
                  onClick={() => {
                    play(albumTracks, i);
                    setSelected(track);
                  }}
                >
                  <span
                    style={{
                      color: "var(--color-text-dim)",
                      minWidth: "1.5rem",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {track.trackNumber ?? i + 1}
                  </span>
                  <span
                    className="flex-1 truncate"
                    style={{
                      color:
                        track.id === selected.id
                          ? "var(--color-accent)"
                          : "var(--color-text)",
                    }}
                  >
                    {track.title}
                  </span>
                  {track.duration && (
                    <span
                      style={{
                        color: "var(--color-text-dim)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {Math.floor(track.duration / 60)}:
                      {String(Math.round(track.duration % 60)).padStart(2, "0")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DetailPanel>
      {subTab === "local" && trackCtxMenu}
      {subTab === "local" && groupCtxMenu}
      <CollectionManager
        open={showCollectionManager}
        onClose={() => setShowCollectionManager(false)}
        itemType="music"
      />
    </div>
  );
};
