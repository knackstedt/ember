import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Star, StarOff, EyeOff, Tag, FolderOpen, Trash2, RotateCw, ListPlus, ListStart, Shuffle } from "lucide-react";
import { useMusicStore } from "../store/media.store";
import { useMusicPlayerStore } from "../store/musicPlayer.store";
import { usePlaylistsStore } from "../store/playlists.store";
import { useFocusZoneStore } from "../store/focusZone.store";
import { useToastStore } from "../store/toast.store";
import { MusicTrack, Playlist, AudioTags } from "../../../shared/types";
import type { MusicNavItem, MusicViewMode, MusicSortOption } from "./types";
import { useMusicFocus } from "./hooks/useMusicFocus";
import { MusicNavRail } from "./components/MusicNavRail";
import { MusicToolbar } from "./components/MusicToolbar";
import { MusicContent } from "./components/MusicContent";
import { MusicGroupContent, MusicGroup } from "./components/MusicGroupContent";
import { MusicTagEditor } from "./components/MusicTagEditor";
import { OnScreenKeyboard } from "../components/OnScreenKeyboard/OnScreenKeyboard";
import { getTrackDisplayName } from "./lib/track-title";
import { useContextMenu } from "../hooks/useContextMenu";
import { ContextMenuOption } from "../components/ContextMenu/ContextMenu";
import { ConfirmDialog } from "../components/ConfirmDialog/ConfirmDialog";
import { PromptDialog } from "../components/PromptDialog/PromptDialog";

const NAV_ITEMS: MusicNavItem[] = [
  "all",
  "genre",
  "artists",
  "albums",
  "folders",
  "playlists",
];

const GROUP_NAVS: MusicNavItem[] = ["genre", "artists", "albums", "folders"];

let devToolsOpen = false;
window.htpc.devtools
  ?.isOpen?.()
  .then((open) => { devToolsOpen = open; })
  .catch(() => { /* ignore */ });
window.htpc.devtools?.onChange?.((open) => { devToolsOpen = open; });

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

function getSearchFolderGroups(
  tracks: MusicTrack[],
  roots: string[],
): { name: string; path: string; tracks: MusicTrack[]; coverUrl?: string }[] {
  const map = new Map<string, { name: string; path: string; tracks: MusicTrack[]; coverUrl?: string }>();

  for (const t of tracks) {
    const relDir = getRelativeDir(t.filePath, roots);
    const key = relDir || "";
    if (!map.has(key)) {
      const name = relDir ? relDir.split("/").pop() || relDir : "(root)";
      map.set(key, { name, path: relDir, tracks: [] });
    }
    map.get(key)!.tracks.push(t);
  }

  return Array.from(map.values())
    .map((g) => ({
      ...g,
      coverUrl: g.tracks.find((t) => t.albumArtUrl)?.albumArtUrl,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
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
  const hideTrack = useMusicStore((s) => s.hide);
  const deleteTrack = useMusicStore((s) => s.delete);
  const regenerateThumbnail = useMusicStore((s) => s.regenerateThumbnail);
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
  const addToQueue = useMusicPlayerStore((s) => s.addToQueue);
  const queueNext = useMusicPlayerStore((s) => s.queueNext);
  const randomInsert = useMusicPlayerStore((s) => s.randomInsert);
  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);

  const globalZone = useFocusZoneStore((s) => s.activeZone);
  const setZone = useFocusZoneStore((s) => s.setZone);

  const [activeNav, setActiveNav] = useState<MusicNavItem>("all");
  const [viewMode, setViewMode] = useState<MusicViewMode>("grid");
  const [sortBy, setSortBy] = useState<MusicSortOption>("title");
  const [columnCount, setColumnCount] = useState(6);
  const [showSearchOsk, setShowSearchOsk] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null);

  // Confirm dialog state
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; track: MusicTrack | null }>({
    open: false,
    track: null,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load tracks and playlists on mount
  useEffect(() => {
    load();
    loadPlaylists();
  }, [load, loadPlaylists]);

  // Clear selected group when changing nav
  useEffect(() => {
    setSelectedGroup(null);
  }, [activeNav, searchQuery]);

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
            getTrackDisplayName(t).toLowerCase().includes(q) ||
            t.artist?.toLowerCase().includes(q) ||
            t.album?.toLowerCase().includes(q)
        );
        const folderGroups = getSearchFolderGroups(source, roots);
        return folderGroups.map((g) => ({
          id: g.path,
          name: g.name,
          subtitle: g.path.includes("/") ? g.path.slice(0, g.path.lastIndexOf("/")) : undefined,
          coverUrl: g.coverUrl,
          trackCount: g.tracks.length,
        }));
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
          getTrackDisplayName(t).toLowerCase().includes(q) ||
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
          getTrackDisplayName(t).toLowerCase().includes(q) ||
          t.artist?.toLowerCase().includes(q) ||
          t.album?.toLowerCase().includes(q)
      );
    }

    switch (activeNav) {
      case "all":
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
            return getTrackDisplayName(a).localeCompare(getTrackDisplayName(b));
          case "artist":
            return (a.artist ?? "").localeCompare(b.artist ?? "");
          case "album":
            return (a.album ?? "").localeCompare(b.album ?? "");
          case "year":
            return (b.year ?? 0) - (a.year ?? 0);
          default:
            return getTrackDisplayName(a).localeCompare(getTrackDisplayName(b));
        }
      });
    }

    return filtered;
  }, [tracks, playlists, activeNav, sortBy, searchQuery, selectedGroup]);

  const roots = getMusicRoots(tracks.filter((t) => !t.hidden));
  const showingGroups = activeNav === "folders"
    ? searchQuery.trim()
      ? !selectedGroup
      : selectedGroup
        ? folderHasSubdirs(tracks.filter((t) => !t.hidden), selectedGroup, roots)
        : true
    : (GROUP_NAVS.includes(activeNav) || activeNav === "playlists") && !selectedGroup;
  const canEditTags = !showingGroups && trackItems.length > 0;
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
    enabled: globalZone === "tab",
    navItemCount: NAV_ITEMS.length,
    toolbarItemCount,
    contentColumnCount: viewMode === "grid" ? columnCount : 1,
    contentItemCount: showingGroups ? groups.length : trackItems.length,
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
      if (index === 2) setShowSearchOsk(true);
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

  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);

  const handleCreatePlaylist = useCallback(() => {
    setPlaylistDialogOpen(true);
  }, []);

  const getGroupTracks = useCallback((group: MusicGroup): MusicTrack[] => {
    const source = tracks.filter((t) => !t.hidden);
    if (activeNav === "playlists") {
      const playlist = playlists.find((p) => p.id === group.id);
      if (!playlist) return [];
      const trackMap = new Map(tracks.map((t) => [t.id, t]));
      return playlist.trackIds
        .map((id) => trackMap.get(id))
        .filter((t): t is MusicTrack => !!t);
    }
    if (activeNav === "folders") {
      const roots = getMusicRoots(source);
      let folderTracks = getTracksInFolder(source, group.id, roots);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        folderTracks = folderTracks.filter(
          (t) =>
            getTrackDisplayName(t).toLowerCase().includes(q) ||
            t.artist?.toLowerCase().includes(q) ||
            t.album?.toLowerCase().includes(q)
        );
      }
      return folderTracks;
    }
    const lower = group.id.toLowerCase();
    if (activeNav === "artists") return source.filter((t) => t.artist?.toLowerCase() === lower);
    if (activeNav === "albums") return source.filter((t) => t.album?.toLowerCase() === lower);
    if (activeNav === "genre") return source.filter((t) => t.genre?.toLowerCase() === lower);
    return [];
  }, [tracks, playlists, activeNav, searchQuery]);

  const { menu, bindItem } = useContextMenu({
    items: trackItems,
    focusedIndex: contentIndex,
    getOptions: (track): ContextMenuOption[] => {
      const isLocal =
        (!track.sourceLocation || track.sourceLocation === "local") &&
        track.filePath &&
        (track.filePath.startsWith("/") || track.filePath.startsWith("file://"));
      const opts: ContextMenuOption[] = [
        { id: "play", label: "Play", icon: <ListStart size={16} /> },
        { id: "play-next", label: "Play Next", icon: <ListStart size={16} /> },
        { id: "queue", label: "Queue", icon: <ListPlus size={16} /> },
        { id: "random-insert", label: "Random Insert", icon: <Shuffle size={16} /> },
        { id: "__sep1", label: "", icon: null, disabled: true },
        {
          id: "favorite",
          label: track.isFavorite ? "Unfavorite" : "Favorite",
          icon: track.isFavorite ? <Star size={16} /> : <StarOff size={16} />,
        },
        { id: "hide", label: "Hide", icon: <EyeOff size={16} />, destructive: true },
        { id: "tags", label: "Update metadata / tags", icon: <Tag size={16} />, disabled: !isLocal },
        { id: "folder", label: "Open file location", icon: <FolderOpen size={16} />, disabled: !isLocal },
        { id: "delete", label: "Delete file", icon: <Trash2 size={16} />, destructive: true },
      ];
      if (devToolsOpen) {
        opts.push({ id: "regenerate", label: "Regenerate thumbnail", icon: <RotateCw size={16} /> });
      }
      return opts;
    },
    onAction: (track, optionId) => {
      switch (optionId) {
        case "play":
          play([track], 0);
          break;
        case "play-next":
          queueNext([track]);
          break;
        case "queue":
          addToQueue([track]);
          break;
        case "random-insert":
          randomInsert([track]);
          break;
        case "favorite":
          void toggleFavorite(track.id);
          break;
        case "hide":
          void hideTrack(track.id);
          break;
        case "tags": {
          const isLocal =
            (!track.sourceLocation || track.sourceLocation === "local") &&
            track.filePath &&
            (track.filePath.startsWith("/") || track.filePath.startsWith("file://"));
          if (isLocal) setEditingTrack(track);
          break;
        }
        case "folder":
          if (track.filePath) void window.htpc.shell.showItemInFolder(track.filePath);
          break;
        case "delete":
          setConfirmDelete({ open: true, track });
          break;
        case "regenerate":
          void regenerateThumbnail(track.id);
          break;
      }
    },
    enabled: !showingGroups,
  });

  const { menu: groupMenu, bindItem: groupBindItem } = useContextMenu({
    items: groups,
    focusedIndex: contentIndex,
    getOptions: (group): ContextMenuOption[] => {
      const groupTracks = getGroupTracks(group);
      if (groupTracks.length === 0) return [];
      return [
        { id: "play", label: "Play", icon: <ListStart size={16} /> },
        { id: "play-next", label: "Play Next", icon: <ListStart size={16} /> },
        { id: "queue", label: "Queue", icon: <ListPlus size={16} /> },
        { id: "random-insert", label: "Random Insert", icon: <Shuffle size={16} /> },
      ];
    },
    onAction: (group, optionId) => {
      const groupTracks = getGroupTracks(group);
      if (groupTracks.length === 0) return;
      switch (optionId) {
        case "play":
          play(groupTracks, 0);
          break;
        case "play-next":
          queueNext(groupTracks);
          break;
        case "queue":
          addToQueue(groupTracks);
          break;
        case "random-insert":
          randomInsert(groupTracks);
          break;
      }
    },
    enabled: showingGroups,
  });

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
            <div className="px-4 py-1.5 flex-shrink-0 flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              <button
                className="px-2 py-1 rounded hover:bg-white/10 transition-colors"
                style={{ color: "var(--text-primary)" }}
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
                      <span style={{ color: "var(--accent)" }}>{segment}</span>
                    ) : (
                      <button
                        className="px-1 rounded hover:bg-white/10 transition-colors"
                        style={{ color: "var(--text-primary)" }}
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
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
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
            {loading || (activeNav === "playlists" && playlistsLoading) ? (
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
                bindItem={groupBindItem}
              />
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
                bindItem={bindItem}
              />
            )}
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

      {menu}
      {groupMenu}

      <ConfirmDialog
        isOpen={confirmDelete.open}
        title="Delete File"
        message={
          confirmDelete.track
            ? `Are you sure you want to delete "${getTrackDisplayName(confirmDelete.track)}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete.track) {
            void deleteTrack(confirmDelete.track.id);
          }
          setConfirmDelete({ open: false, track: null });
        }}
        onCancel={() => setConfirmDelete({ open: false, track: null })}
      />

      <PromptDialog
        isOpen={playlistDialogOpen}
        title="Create Playlist"
        label="Enter playlist name:"
        placeholder="Playlist name"
        confirmLabel="Create"
        onConfirm={(name) => {
          const trimmed = name.trim();
          if (trimmed) {
            void createPlaylist(trimmed);
          }
          setPlaylistDialogOpen(false);
        }}
        onCancel={() => setPlaylistDialogOpen(false)}
      />
    </div>
  );
};
