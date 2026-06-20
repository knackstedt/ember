import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Link2, Unlink } from "lucide-react";
import { useMusicStore } from "../store/media.store";
import { useMusicPlayerStore } from "../store/musicPlayer.store";
import { usePlaylistsStore } from "../store/playlists.store";
import { useFocusZoneStore } from "../store/focusZone.store";
import { useToastStore } from "../store/toast.store";
import { useSettingsStore } from "../store/settings.store";
import { MusicTrack, Playlist, AudioTags, StreamingService, StreamingExtension } from "../../../shared/types";
import type { MusicNavItem, MusicViewMode, MusicSortOption } from "./types";
import { useMusicFocus } from "./hooks/useMusicFocus";
import { MusicNavRail } from "./components/MusicNavRail";
import { MusicToolbar } from "./components/MusicToolbar";
import { MusicContent } from "./components/MusicContent";
import { MusicGroupContent, MusicGroup } from "./components/MusicGroupContent";
import { MusicTagEditor } from "./components/MusicTagEditor";
import { OnScreenKeyboard } from "../components/OnScreenKeyboard/OnScreenKeyboard";
import { StreamingWebview } from "../components/StreamingWebview/StreamingWebview";

const NAV_ITEMS: MusicNavItem[] = [
  "all",
  "genre",
  "artists",
  "albums",
  "folders",
  "playlists",
  "streaming",
];

const GROUP_NAVS: MusicNavItem[] = ["genre", "artists", "albums", "folders"];

function getFolderName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const dirs = paths.map((p) => getFolderName(p.replace(/\\/g, "/")));
  let prefix = dirs[0];
  for (const dir of dirs) {
    while (!dir.startsWith(prefix + "/") && dir !== prefix) {
      prefix = getFolderName(prefix);
      if (!prefix) return "";
    }
  }
  return prefix;
}

function getMusicRoots(tracks: MusicTrack[]): string[] {
  const prefix = findCommonPrefix(tracks.map((t) => t.filePath));
  return prefix ? [prefix] : [];
}

function getRelativeDir(filePath: string, roots: string[]): string {
  const normalized = filePath.replace(/\\/g, "/");
  for (const root of roots) {
    if (normalized.startsWith(root + "/")) {
      const rel = normalized.slice(root.length + 1);
      const dirIdx = rel.lastIndexOf("/");
      return dirIdx >= 0 ? rel.slice(0, dirIdx) : "";
    }
  }
  return "";
}

function getFolderSubdirs(
  tracks: MusicTrack[],
  currentPath: string,
  roots: string[],
): { name: string; path: string; tracks: MusicTrack[]; coverUrl?: string }[] {
  const result = new Map<string, { name: string; path: string; tracks: MusicTrack[]; coverUrl?: string }>();

  for (const t of tracks) {
    const relDir = getRelativeDir(t.filePath, roots);

    if (currentPath === "") {
      const firstSlash = relDir.indexOf("/");
      const firstDir = firstSlash >= 0 ? relDir.slice(0, firstSlash) : relDir;
      if (!firstDir) continue;

      if (!result.has(firstDir)) {
        result.set(firstDir, { name: firstDir, path: firstDir, tracks: [] });
      }
      result.get(firstDir)!.tracks.push(t);
    } else {
      if (relDir.startsWith(currentPath + "/")) {
        const remainder = relDir.slice(currentPath.length + 1);
        const firstSlash = remainder.indexOf("/");
        const nextDir = firstSlash >= 0 ? remainder.slice(0, firstSlash) : remainder;
        const nextPath = currentPath + "/" + nextDir;

        if (!result.has(nextPath)) {
          result.set(nextPath, { name: nextDir, path: nextPath, tracks: [] });
        }
        result.get(nextPath)!.tracks.push(t);
      }
    }
  }

  return Array.from(result.values())
    .map((g) => ({
      ...g,
      coverUrl: g.tracks.find((t) => t.albumArtUrl)?.albumArtUrl,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getTracksInFolder(tracks: MusicTrack[], folderPath: string, roots: string[]): MusicTrack[] {
  return tracks.filter((t) => getRelativeDir(t.filePath, roots) === folderPath);
}

function folderHasSubdirs(tracks: MusicTrack[], folderPath: string, roots: string[]): boolean {
  for (const t of tracks) {
    const relDir = getRelativeDir(t.filePath, roots);
    if (folderPath === "") {
      if (relDir.includes("/")) return true;
    } else {
      if (relDir.startsWith(folderPath + "/")) return true;
    }
  }
  return false;
}

export const MusicTab: React.FC = () => {
  const tracks = useMusicStore((s) => s.tracks);
  const loading = useMusicStore((s) => s.loading);
  const load = useMusicStore((s) => s.load);
  const toggleFavorite = useMusicStore((s) => s.toggleFavorite);
  const writeTags = useMusicStore((s) => s.writeTags);
  const setSearch = useMusicStore((s) => s.setSearch);
  const searchQuery = useMusicStore((s) => s.searchQuery);
  const artistThumbnails = useMusicStore((s) => s.artistThumbnails);
  const loadArtistThumbnail = useMusicStore((s) => s.loadArtistThumbnail);

  const playlists = usePlaylistsStore((s) => s.playlists);
  const playlistsLoading = usePlaylistsStore((s) => s.loading);
  const loadPlaylists = usePlaylistsStore((s) => s.load);
  const createPlaylist = usePlaylistsStore((s) => s.create);

  const play = useMusicPlayerStore((s) => s.play);
  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);

  const globalZone = useFocusZoneStore((s) => s.activeZone);
  const setZone = useFocusZoneStore((s) => s.setZone);

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);

  const [activeNav, setActiveNav] = useState<MusicNavItem>("all");
  const [viewMode, setViewMode] = useState<MusicViewMode>("grid");
  const [sortBy, setSortBy] = useState<MusicSortOption>("title");
  const [columnCount, setColumnCount] = useState(6);
  const [showSearchOsk, setShowSearchOsk] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null);

  // Streaming state
  const [streamingServices, setStreamingServices] = useState<StreamingService[]>([]);
  const [streamingLoading, setStreamingLoading] = useState(false);
  const [activeStreamingService, setActiveStreamingService] = useState<StreamingService | null>(null);
  const [showStreamingOverlay, setShowStreamingOverlay] = useState(false);
  const [connectedAdapters, setConnectedAdapters] = useState<Set<string>>(new Set());

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load tracks and playlists on mount
  useEffect(() => {
    load();
    loadPlaylists();
  }, [load, loadPlaylists]);

  // Load streaming services when nav is streaming
  useEffect(() => {
    if (activeNav === "streaming") {
      setStreamingLoading(true);
      window.htpc.streaming.list("music")
        .then((list) => {
          setStreamingServices(list.filter((s) => s.enabled !== false));
        })
        .catch(() => setStreamingServices([]))
        .finally(() => setStreamingLoading(false));
    }
  }, [activeNav]);

  // Clear selected group when changing nav
  useEffect(() => {
    setSelectedGroup(null);
  }, [activeNav, searchQuery]);

  // Media key injection listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!showStreamingOverlay || !activeStreamingService) return;
      if (e.key === "MediaPlayPause" || e.code === "MediaPlayPause") {
        e.preventDefault();
        window.htpc.streaming.mediaKeys("play");
      } else if (e.key === "MediaTrackNext" || e.code === "MediaTrackNext") {
        e.preventDefault();
        window.htpc.streaming.mediaKeys("next");
      } else if (e.key === "MediaTrackPrevious" || e.code === "MediaTrackPrevious") {
        e.preventDefault();
        window.htpc.streaming.mediaKeys("previous");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showStreamingOverlay, activeStreamingService]);

  // Build groups for artist/album/genre/playlist views
  const groups = useMemo<MusicGroup[]>(() => {
    if (activeNav === "playlists") {
      let source = playlists;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        source = source.filter((p) => p.name.toLowerCase().includes(q));
      }
      return source
        .map((p) => ({
          id: p.id,
          name: p.name,
          subtitle: p.description,
          coverUrl: p.coverUrl,
          trackCount: p.trackIds.length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }

    if (activeNav === "folders") {
      const roots = getMusicRoots(tracks.filter((t) => !t.hidden));
      if (roots.length === 0) return [];
      let source = tracks.filter((t) => !t.hidden);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        source = source.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.artist?.toLowerCase().includes(q) ||
            t.album?.toLowerCase().includes(q)
        );
      }
      const subdirs = getFolderSubdirs(source, selectedGroup ?? "", roots);
      return subdirs.map((g) => ({
        id: g.path,
        name: g.name,
        subtitle: `${g.tracks.length} track${g.tracks.length !== 1 ? "s" : ""}`,
        coverUrl: g.coverUrl,
        trackCount: g.tracks.length,
      }));
    }

    if (!GROUP_NAVS.includes(activeNav)) return [];

    let source = tracks.filter((t) => !t.hidden);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      source = source.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q)
      );
    }

    const map = new Map<string, { name: string; tracks: MusicTrack[] }>();

    for (const t of source) {
      let key: string | undefined;
      switch (activeNav) {
        case "artists":
          key = t.artist;
          break;
        case "albums":
          key = t.album;
          break;
        case "genre":
          key = t.genre;
          break;
      }
      if (!key) continue;
      const lower = key.toLowerCase();
      if (!map.has(lower)) map.set(lower, { name: key, tracks: [] });
      map.get(lower)!.tracks.push(t);
    }

    return Array.from(map.values())
      .map((g) => {
        const coverUrl =
          activeNav === "artists"
            ? artistThumbnails[g.name]
            : g.tracks.find((t) => t.albumArtUrl)?.albumArtUrl;
        return {
          id: g.name,
          name: g.name,
          subtitle: activeNav === "artists" ? undefined : g.tracks[0]?.artist,
          coverUrl,
          trackCount: g.tracks.length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [tracks, playlists, activeNav, searchQuery, artistThumbnails, selectedGroup]);

  // Batch-load artist thumbnails for visible groups
  useEffect(() => {
    if (activeNav !== "artists" || selectedGroup) return;
    const artists = groups.map((g) => g.name);
    let i = 0;
    const interval = setInterval(() => {
      if (i >= artists.length) {
        clearInterval(interval);
        return;
      }
      const batch = artists.slice(i, i + 5);
      batch.forEach((artist) => loadArtistThumbnail(artist));
      i += 5;
    }, 300);
    return () => clearInterval(interval);
  }, [activeNav, selectedGroup, groups, loadArtistThumbnail]);

  // Build track list based on active nav and selected group
  const trackItems = useMemo(() => {
    let filtered = tracks.filter((t) => !t.hidden);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q)
      );
    }

    switch (activeNav) {
      case "all":
        break;
      case "streaming":
        filtered = filtered.filter((t) => t.sourceLocation && t.sourceLocation !== "local");
        break;
      case "artists":
        if (selectedGroup) {
          filtered = filtered.filter((t) => t.artist?.toLowerCase() === selectedGroup.toLowerCase());
          filtered.sort((a, b) => {
            const albumCmp = (a.album ?? "").localeCompare(b.album ?? "");
            if (albumCmp !== 0) return albumCmp;
            return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
          });
        } else {
          return []; // show groups instead
        }
        break;
      case "albums":
        if (selectedGroup) {
          filtered = filtered.filter((t) => t.album?.toLowerCase() === selectedGroup.toLowerCase());
          filtered.sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
        } else {
          return []; // show groups instead
        }
        break;
      case "genre":
        if (selectedGroup) {
          filtered = filtered.filter((t) => t.genre?.toLowerCase() === selectedGroup.toLowerCase());
          filtered.sort((a, b) => {
            const artistCmp = (a.artist ?? "").localeCompare(b.artist ?? "");
            if (artistCmp !== 0) return artistCmp;
            const albumCmp = (a.album ?? "").localeCompare(b.album ?? "");
            if (albumCmp !== 0) return albumCmp;
            return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
          });
        } else {
          return []; // show groups instead
        }
        break;
      case "folders":
        if (selectedGroup) {
          const roots = getMusicRoots(tracks.filter((t) => !t.hidden));
          filtered = getTracksInFolder(filtered, selectedGroup, roots);
        } else {
          return []; // show groups instead
        }
        break;
      case "playlists":
        if (selectedGroup) {
          const playlist = playlists.find((p) => p.id === selectedGroup);
          if (playlist) {
            const trackMap = new Map(tracks.map((t) => [t.id, t]));
            filtered = playlist.trackIds
              .map((id) => trackMap.get(id))
              .filter((t): t is MusicTrack => !!t);
          } else {
            filtered = [];
          }
        } else {
          return []; // show groups instead
        }
        break;
    }

    // Sort
    if (activeNav !== "albums" || !selectedGroup) {
      filtered.sort((a, b) => {
        switch (sortBy) {
          case "title":
            return a.title.localeCompare(b.title);
          case "artist":
            return (a.artist ?? "").localeCompare(b.artist ?? "");
          case "album":
            return (a.album ?? "").localeCompare(b.album ?? "");
          case "year":
            return (b.year ?? 0) - (a.year ?? 0);
          default:
            return a.title.localeCompare(b.title);
        }
      });
    }

    return filtered;
  }, [tracks, playlists, activeNav, sortBy, searchQuery, selectedGroup]);

  const roots = getMusicRoots(tracks.filter((t) => !t.hidden));
  const showingGroups = activeNav === "folders"
    ? selectedGroup
      ? folderHasSubdirs(tracks.filter((t) => !t.hidden), selectedGroup, roots)
      : true
    : (GROUP_NAVS.includes(activeNav) || activeNav === "playlists") && !selectedGroup;
  const isStreamingNav = activeNav === "streaming";
  const canEditTags = !showingGroups && !isStreamingNav && trackItems.length > 0;
  const toolbarItemCount = (activeNav === "playlists" ? 4 : 3) + (canEditTags ? 1 : 0);

  // Focus management — only enabled when global zone is 'tab'
  const {
    zone,
    navIndex,
    toolbarIndex,
    contentIndex,
    setZone: setMusicZone,
    setContentIndex,
    isNavFocused,
    isToolbarFocused,
    isContentFocused,
  } = useMusicFocus({
    enabled: globalZone === "tab" && !showStreamingOverlay,
    navItemCount: NAV_ITEMS.length,
    toolbarItemCount,
    contentColumnCount: viewMode === "grid" ? columnCount : 1,
    contentItemCount: isStreamingNav
      ? streamingServices.length
      : showingGroups
        ? groups.length
        : trackItems.length,
    onNavSelect: (index) => {
      setActiveNav(NAV_ITEMS[index]);
      setSelectedGroup(null);
      setContentIndex(0);
    },
    onToolbarSelect: (index) => {
      if (index === 0) setViewMode((prev) => (prev === "grid" ? "list" : "grid"));
      if (index === 1) {
        const options: MusicSortOption[] = ["title", "artist", "album", "year", "date-added", "rating"];
        const idx = options.indexOf(sortBy);
        setSortBy(options[(idx + 1) % options.length]);
      }
      if (index === 2) setOskOpen(true);
      if (index === 3 && activeNav === "playlists") {
        handleCreatePlaylist();
      }
      if (canEditTags && index === (activeNav === "playlists" ? 4 : 3)) {
        const track = trackItems[contentIndex];
        if (!track) return;
        const isLocal =
          (!track.sourceLocation || track.sourceLocation === "local") &&
          track.filePath &&
          (track.filePath.startsWith("/") || track.filePath.startsWith("file://"));
        if (isLocal) {
          setEditingTrack(track);
        } else {
          useToastStore.getState().push({
            type: "error",
            message: "Tag editing is only available for local files.",
          });
        }
      }
    },
    onContentConfirm: (index) => {
      if (showingGroups) {
        const group = groups[index];
        if (group) {
          setSelectedGroup(group.id);
          setContentIndex(0);
        }
      } else if (isStreamingNav) {
        const svc = streamingServices[index];
        if (svc) openStreamingOverlay(svc);
      } else {
        const track = trackItems[index];
        if (track) {
          play(trackItems, index);
        }
      }
    },
    onPlayerExpand: () => {
      if (hasPlayer) {
        setZone("player");
      }
    },
  });

  const handleFavorite = useCallback(
    (track: MusicTrack) => {
      void toggleFavorite(track.id);
    },
    [toggleFavorite]
  );

  const handleSearchOskChange = useCallback(
    (query: string) => {
      setSearch(query);
    },
    [setSearch]
  );

  const activeFilterLabel = useMemo(() => {
    if (selectedGroup) {
      if (activeNav === "playlists") {
        const playlist = playlists.find((p) => p.id === selectedGroup);
        return playlist ? `Playlist: ${playlist.name}` : "Playlist";
      }
      if (activeNav === "folders") {
        return undefined; // breadcrumb handles this
      }
      const label = activeNav === "artists" ? "Artist" : activeNav === "albums" ? "Album" : "Genre";
      return `${label}: ${selectedGroup}`;
    }
    if (searchQuery) return `Search: ${searchQuery}`;
    return undefined;
  }, [selectedGroup, activeNav, searchQuery, playlists]);

  const handleClearFilter = useCallback(() => {
    if (selectedGroup) {
      setSelectedGroup(null);
      setContentIndex(0);
    } else {
      setSearch("");
    }
  }, [selectedGroup, setSearch, setContentIndex]);

  const handleSelectGroup = useCallback((group: MusicGroup, _index: number) => {
    setSelectedGroup(group.id);
    setContentIndex(0);
  }, []);

  const handleCreatePlaylist = useCallback(async () => {
    const name = window.prompt("Enter playlist name:");
    if (!name || !name.trim()) return;
    await createPlaylist(name.trim());
  }, [createPlaylist]);

  // Streaming overlay management
  const openStreamingOverlay = useCallback((svc: StreamingService) => {
    setActiveStreamingService(svc);
    setShowStreamingOverlay(true);
    setMusicZone("content");
  }, [setMusicZone]);

  const closeStreamingOverlay = useCallback(() => {
    setShowStreamingOverlay(false);
  }, []);

  const handleStreamingServiceClick = useCallback((svc: StreamingService) => {
    openStreamingOverlay(svc);
  }, [openStreamingOverlay]);

  const handleAdapterConnect = useCallback(async (svc: StreamingService, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.htpc.streaming.adapter.authenticate(svc.id);
      setConnectedAdapters((prev) => new Set(prev).add(svc.id));
      useToastStore.getState().push({ type: "success", message: `Connected to ${svc.name}` });
    } catch (err) {
      useToastStore.getState().push({
        type: "error",
        message: err instanceof Error ? err.message : `Failed to connect to ${svc.name}`,
      });
    }
  }, []);

  const handleAdapterDisconnect = useCallback(async (svc: StreamingService, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.htpc.streaming.adapter.disconnect(svc.id);
    setConnectedAdapters((prev) => {
      const next = new Set(prev);
      next.delete(svc.id);
      return next;
    });
    useToastStore.getState().push({ type: "info", message: `Disconnected from ${svc.name}` });
  }, []);

  const hasDeepAdapter = useCallback((svc: StreamingService) => {
    return svc.id === "spotify";
  }, []);

  const extensions: StreamingExtension[] = settings?.streamingExtensions ?? [];
  const partition = activeStreamingService ? `persist:streaming-music-${activeStreamingService.id}` : "";

  return (
    <div className="flex flex-col h-full relative">
      {/* Main content area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Nav rail */}
        <MusicNavRail
          activeItem={activeNav}
          onSelect={(item) => {
            setActiveNav(item);
            setSelectedGroup(null);
            setMusicZone("nav");
            setContentIndex(0);
          }}
          focusedIndex={navIndex}
          isFocused={isNavFocused}
        />

        {/* Content area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <MusicToolbar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortBy={sortBy}
            onSortChange={setSortBy}
            searchQuery={searchQuery}
            onSearchChange={setSearch}
            onClearSearch={() => setSearch("")}
            activeFilterLabel={activeFilterLabel}
            onClearFilter={activeFilterLabel ? handleClearFilter : undefined}
            focusedIndex={toolbarIndex}
            isFocused={isToolbarFocused}
            onCreatePlaylist={activeNav === "playlists" ? handleCreatePlaylist : undefined}
            onEditTags={canEditTags ? () => {
              const track = trackItems[contentIndex];
              if (track) setEditingTrack(track);
            } : undefined}
            onOpenOsk={() => setShowSearchOsk(true)}
          />

          {/* Back / breadcrumb for drill-down */}
          {activeNav === "folders" && selectedGroup ? (
            <div className="px-4 py-1.5 flex-shrink-0 flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
              <button
                className="px-2 py-1 rounded hover:bg-white/10 transition-colors"
                style={{ color: "var(--color-text)" }}
                onClick={() => { setSelectedGroup(null); setContentIndex(0); }}
              >
                Library
              </button>
              {selectedGroup.split("/").map((segment, idx) => {
                const path = selectedGroup.split("/").slice(0, idx + 1).join("/");
                const isLast = idx === selectedGroup.split("/").length - 1;
                return (
                  <React.Fragment key={path}>
                    <span>/</span>
                    {isLast ? (
                      <span style={{ color: "var(--color-accent)" }}>{segment}</span>
                    ) : (
                      <button
                        className="px-1 rounded hover:bg-white/10 transition-colors"
                        style={{ color: "var(--color-text)" }}
                        onClick={() => { setSelectedGroup(path); setContentIndex(0); }}
                      >
                        {segment}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ) : selectedGroup && (
            <div className="px-4 py-1.5 flex-shrink-0 flex items-center gap-2">
              <motion.button
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onClick={() => {
                  setSelectedGroup(null);
                  setContentIndex(0);
                }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft size={12} /> Back
              </motion.button>
            </div>
          )}

          <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto relative">
            {loading || (activeNav === "playlists" && playlistsLoading) || (isStreamingNav && streamingLoading) ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
              </div>
            ) : showingGroups ? (
              <MusicGroupContent
                items={groups}
                viewMode={viewMode}
                focusedIndex={contentIndex}
                isFocused={isContentFocused}
                onSelect={handleSelectGroup}
                onColumnCountChange={setColumnCount}
                scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
              />
            ) : isStreamingNav ? (
              <div className="p-4">
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  }}
                >
                  {streamingServices.map((svc, index) => (
                    <motion.button
                      key={svc.id}
                      className="relative flex flex-col justify-between rounded-[var(--radius-card)] overflow-hidden p-4 text-left"
                      style={{
                        background: svc.color || "var(--color-surface-raised)",
                        color: svc.textColor || "var(--color-text)",
                        aspectRatio: "16/10",
                        boxShadow: "var(--shadow-card)",
                        border: isContentFocused(index)
                          ? "2px solid var(--color-accent)"
                          : "2px solid transparent",
                      }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleStreamingServiceClick(svc)}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-4xl leading-none select-none" aria-hidden>
                          {svc.icon}
                        </span>
                        {hasDeepAdapter(svc) && (
                          <span
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                            style={{
                              background: "rgba(0,0,0,0.25)",
                              color: "#fff",
                            }}
                            onClick={
                              connectedAdapters.has(svc.id)
                                ? (e) => handleAdapterDisconnect(svc, e as unknown as React.MouseEvent)
                                : (e) => handleAdapterConnect(svc, e as unknown as React.MouseEvent)
                            }
                          >
                            {connectedAdapters.has(svc.id) ? (
                              <>
                                <Unlink size={12} /> Disconnect
                              </>
                            ) : (
                              <>
                                <Link2 size={12} /> Connect
                              </>
                            )}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-bold leading-tight">
                        {svc.name}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              <MusicContent
                items={trackItems}
                viewMode={viewMode}
                focusedIndex={contentIndex}
                isFocused={isContentFocused}
                onSelect={(track, index) => {
                  play(trackItems, index);
                }}
                onFavorite={handleFavorite}
                activeNav={activeNav}
                onColumnCountChange={setColumnCount}
                scrollRef={scrollContainerRef as React.RefObject<HTMLElement>}
              />
            )}

            {/* Streaming webview overlay (keep-alive: hidden when closed, not unmounted) */}
            <AnimatePresence>
              {activeStreamingService && (
                <motion.div
                  className="absolute inset-0 z-20 flex flex-col"
                  style={{
                    background: "var(--color-surface)",
                    display: showStreamingOverlay ? "flex" : "none",
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: showStreamingOverlay ? 1 : 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Overlay header */}
                  <div
                    className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
                    style={{
                      background: "var(--color-surface-raised)",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <motion.button
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                      style={{
                        background: "var(--color-surface)",
                        color: "var(--color-text)",
                        border: "1px solid var(--color-border)",
                      }}
                      whileTap={{ scale: 0.95 }}
                      onClick={closeStreamingOverlay}
                    >
                      <ArrowLeft size={14} /> Back
                    </motion.button>
                    <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                      {activeStreamingService.name}
                    </span>
                    <div className="flex-1" />
                    {/* Media key controls */}
                    <div className="flex items-center gap-2">
                      <motion.button
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{
                          background: "var(--color-surface)",
                          color: "var(--color-text)",
                          border: "1px solid var(--color-border)",
                        }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => window.htpc.streaming.mediaKeys("previous")}
                      >
                        Prev
                      </motion.button>
                      <motion.button
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{
                          background: "var(--color-surface)",
                          color: "var(--color-text)",
                          border: "1px solid var(--color-border)",
                        }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => window.htpc.streaming.mediaKeys("play")}
                      >
                        Play/Pause
                      </motion.button>
                      <motion.button
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{
                          background: "var(--color-surface)",
                          color: "var(--color-text)",
                          border: "1px solid var(--color-border)",
                        }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => window.htpc.streaming.mediaKeys("next")}
                      >
                        Next
                      </motion.button>
                    </div>
                    <motion.button
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                      style={{
                        background: "var(--color-surface)",
                        color: "var(--color-text)",
                        border: "1px solid var(--color-border)",
                      }}
                      whileTap={{ scale: 0.95 }}
                      onClick={closeStreamingOverlay}
                    >
                      <X size={14} />
                    </motion.button>
                  </div>

                  {/* Webview */}
                  <div className="flex-1 min-h-0 relative overflow-hidden">
                    <StreamingWebview
                      service={activeStreamingService}
                      partition={partition}
                      extensions={extensions}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* On-screen keyboard for controller search */}
      <AnimatePresence>
        {showSearchOsk && (
          <motion.div
            className="absolute inset-0 z-[100] flex items-end justify-center pb-8 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="pointer-events-auto w-full max-w-2xl px-4">
              <OnScreenKeyboard
                value={searchQuery}
                onChange={handleSearchOskChange}
                onClose={() => setShowSearchOsk(false)}
                onSubmit={() => setShowSearchOsk(false)}
                label="Search music"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tag editor */}
      <MusicTagEditor
        track={editingTrack}
        onClose={() => setEditingTrack(null)}
        onSave={async (tags: AudioTags) => {
          if (!editingTrack) return { success: false, error: "No track selected" };
          return writeTags(editingTrack.id, tags);
        }}
      />
    </div>
  );
};
