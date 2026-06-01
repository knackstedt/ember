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
import {
  StreamingTile,
  MUSIC_STREAMING_SERVICES,
} from "../../components/StreamingTile/StreamingTile";
import { useGridFocus } from "../../hooks/useGridFocus";
import { useCoverCacheStore } from "../../store/coverCache.store";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";

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
      aspectRatio="1/1"
      isFavorite={track.isFavorite}
      isFocused={index === focusedIndex}
      onSelect={onSelect}
      onFavorite={onFavorite}
    />
  );
});

type SubTab = "local" | "streaming";
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
  const artistThumbnails = useMusicStore((s) => s.artistThumbnails);
  const artistThumbnailsLoading = useMusicStore((s) => s.artistThumbnailsLoading);
  const loadArtistThumbnail = useMusicStore((s) => s.loadArtistThumbnail);
  const play = useMusicPlayerStore((s) => s.play);
  const [selected, setSelected] = useState<MusicTrack | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("local");
  const [browseMode, setBrowseMode] = useState<BrowseMode>("artists");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [activeFilterType, setActiveFilterType] = useState<
    "artist" | "album" | "genre" | "year"
  >("artist");
  const [trackColumnCount, setTrackColumnCount] = useState(6);
  const [groupColumnCount, setGroupColumnCount] = useState(6);
  const trackGridRef = useRef<VirtualGridHandle>(null);
  const groupGridRef = useRef<VirtualGridHandle>(null);

  useEffect(() => {
    const handler = () => {
      if (selected) setSelected(null);
      else if (selectedGroup) setSelectedGroup(null);
    };
    window.addEventListener("htpc:escape", handler);
    return () => window.removeEventListener("htpc:escape", handler);
  }, [selected, selectedGroup]);

  const albumTracks = useMemo(() => {
    if (!selected?.album) return [];
    return tracks
      .filter((t) => t.album === selected.album)
      .sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  }, [selected?.album, tracks]);

  useEffect(() => {
    load();
  }, []);

  const artistGroups = useMemo(() => {
    const map = new Map<string, { name: string; tracks: MusicTrack[] }>();
    for (const t of tracks) {
      if (!t.artist || t.hidden) continue;
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
  }, [tracks]);

  const genreGroups = useMemo(() => {
    const map = new Map<string, { name: string; tracks: MusicTrack[] }>();
    for (const t of tracks) {
      if (!t.genre || t.hidden) continue;
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
  }, [tracks]);

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
  }, [tracks, selectedGroup, browseMode, activeArtist, activeAlbum, activeGenre, activeYear, searchQuery]);

  const { focusedIndex: groupFocusedIndex } = useGridFocus<MusicGroup>({
    items: groupItems,
    columnCount: groupColumnCount,
    gridRef: groupGridRef,
    onConfirm: (group) => setSelectedGroup(group.name),
    enabled: subTab === "local" && !selected && !selectedGroup && browseMode !== "tracks",
  });

  const { focusedIndex: trackFocusedIndex } = useGridFocus<MusicTrack>({
    items: trackItems,
    columnCount: trackColumnCount,
    gridRef: trackGridRef,
    onConfirm: (track, index) => {
      play(trackItems, index);
      setSelected(track);
    },
    enabled: subTab === "local" && !selected && (browseMode === "tracks" || !!selectedGroup),
  });

  const { menu: trackCtxMenu, bindItem: bindTrackItem } = useContextMenu<MusicTrack>({
    items: trackItems,
    focusedIndex: trackFocusedIndex,
    enabled: subTab === "local" && (browseMode === "tracks" || !!selectedGroup),
    getOptions: (track): ContextMenuOption[] => [
      {
        id: "favorite",
        label: track.isFavorite ? "Unfavorite" : "Favorite",
        icon: track.isFavorite ? "★" : "☆",
      },
      { id: "hide", label: "Hide", icon: "🙈", destructive: true },
      { id: "tags", label: "Update metadata / tags", icon: "🏷" },
      {
        id: "searchCover",
        label: "Search cover art",
        icon: "🔄",
      },
      {
        id: "folder",
        label: "Open containing folder",
        icon: "📂",
        disabled: !track.filePath,
      },
    ],
    onAction: (track, optionId) => {
      switch (optionId) {
        case "favorite":
          toggleFavorite(track.id);
          break;
        case "hide":
          hide(track.id);
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
      { id: "play", label: "Play All", icon: "▶" },
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
          onSelect={() => setSelectedGroup(group.name)}
        />
      </div>
    ),
    [bindGroupItem, groupFocusedIndex, artistThumbnails, artistThumbnailsLoading, browseMode],
  );

  const renderTrackItem = useCallback(
    (track: MusicTrack, index: number) => (
      <div className="p-1.5 w-full h-full flex flex-col min-w-0" {...bindTrackItem(track, index)}>
        <LazyMusicCard
          track={track}
          index={index}
          focusedIndex={trackFocusedIndex}
          onSelect={() => {
            play(trackItems, index);
            setSelected(track);
          }}
          onFavorite={() => toggleFavorite(track.id)}
        />
      </div>
    ),
    [bindTrackItem, trackFocusedIndex, play, trackItems, toggleFavorite],
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

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div className="flex gap-3 items-center flex-shrink-0">
        <div className="flex gap-1">
          {(["local", "streaming"] as SubTab[]).map((t) => (
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
              {t}
            </button>
          ))}
        </div>
        {subTab === "local" && (
          <>
            <OskInput
              value={searchQuery}
              onChange={setSearch}
              placeholder="Search music…"
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
          <div className="flex gap-2 flex-shrink-0 items-center">
            <ChipFilters
              filters={[
                { id: "artists", label: "Artists" },
                { id: "genres", label: "Genres" },
                { id: "tracks", label: "All Tracks" },
              ]}
              active={browseMode}
              onSelect={(v) => {
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

          {loading ? (
            <div
              className="flex-1 flex items-center justify-center"
              style={{ color: "var(--color-text-dim)" }}
            >
              Loading music…
            </div>
          ) : scanning && trackItems.length === 0 && groupItems.length === 0 ? (
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
              <span className="text-sm">Scanning for music…</span>
            </div>
          ) : trackItems.length === 0 && groupItems.length === 0 ? (
            <div
              className="flex-1 flex flex-col items-center justify-center gap-4"
              style={{ color: "var(--color-text-dim)" }}
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
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
              <VirtualGrid
                key="groups"
                ref={groupGridRef}
                items={groupItems}
                minItemWidth={180}
                onColumnCountChange={setGroupColumnCount}
                rowHeight={240}
                renderItem={renderGroupItem}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
              <VirtualGrid
                key="tracks"
                ref={trackGridRef}
                items={trackItems}
                minItemWidth={180}
                onColumnCountChange={setTrackColumnCount}
                rowHeight={240}
                renderItem={renderTrackItem}
              />
            </div>
          )}
        </>
      )}

      {subTab === "streaming" && (
        <div className="pt-2">
          <StreamingTile services={MUSIC_STREAMING_SERVICES} />
        </div>
      )}

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
                ▶ Play
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
                  ▶ Play Album
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
    </div>
  );
};
