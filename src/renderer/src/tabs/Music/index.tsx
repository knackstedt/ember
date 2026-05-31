import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useMusicStore } from '../../store/media.store'
import { ChipFilters } from '../../components/ChipFilters/ChipFilters'
import { VirtualGrid, VirtualGridHandle } from '../../components/VirtualGrid/VirtualGrid'
import { MediaCard } from '../../components/MediaCard/MediaCard'
import { DetailPanel } from '../../components/DetailPanel/DetailPanel'
import { OskInput } from '../../components/OnScreenKeyboard/OnScreenKeyboard'
import { MusicTrack } from '../../../../shared/types'
import { useMusicPlayerStore } from '../../store/musicPlayer.store'
import { StreamingTile, MUSIC_STREAMING_SERVICES } from '../../components/StreamingTile/StreamingTile'
import { useGridFocus } from '../../hooks/useGridFocus'

type SubTab = 'local' | 'streaming'
const COLUMN_COUNT = 6

export const MusicTab: React.FC = () => {
  const {
    tracks, loading, searchQuery, activeArtist, activeAlbum, activeGenre, activeYear,
    load, scan, toggleFavorite, setTags, setSearch, setArtist, setAlbum, setGenre, setYear,
    searchCoverArt, pickCoverImage, filtered
  } = useMusicStore()
  const play = useMusicPlayerStore((s) => s.play)
  const [selected, setSelected] = useState<MusicTrack | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('local')
  const [activeFilterType, setActiveFilterType] = useState<'artist' | 'album' | 'genre' | 'year'>('artist')
  const gridRef = useRef<VirtualGridHandle>(null)

  useEffect(() => {
    const handler = () => setSelected(null)
    window.addEventListener('htpc:escape', handler)
    return () => window.removeEventListener('htpc:escape', handler)
  }, [])

  const albumTracks = useMemo(() => {
    if (!selected?.album) return []
    return tracks
      .filter((t) => t.album === selected.album)
      .sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
  }, [selected?.album, tracks])

  useEffect(() => { load() }, [])

  const items = filtered()
  const { focusedIndex } = useGridFocus({
    items,
    columnCount: COLUMN_COUNT,
    gridRef,
    onConfirm: (track, index) => { play(items, index); setSelected(track) },
    enabled: subTab === 'local' && !selected
  })
  const artists = [...new Set(tracks.map((t) => t.artist).filter(Boolean) as string[])].sort()
  const albums = [...new Set(tracks.map((t) => t.album).filter(Boolean) as string[])].sort()
  const genres = [...new Set(tracks.map((t) => t.genre).filter(Boolean) as string[])].sort()
  const years = [...new Set(tracks.map((t) => t.year).filter(Boolean) as number[])].sort((a, b) => b - a)

  const filterChips = {
    artist: [{ id: '', label: 'All Artists' }, ...artists.map((a) => ({ id: a, label: a }))],
    album: [{ id: '', label: 'All Albums' }, ...albums.map((a) => ({ id: a, label: a }))],
    genre: [{ id: '', label: 'All Genres' }, ...genres.map((g) => ({ id: g, label: g }))],
    year: [{ id: '', label: 'All Years' }, ...years.map((y) => ({ id: String(y), label: String(y) }))]
  }

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div className="flex gap-3 items-center flex-shrink-0">
        <div className="flex gap-1">
          {(['local', 'streaming'] as SubTab[]).map((t) => (
            <button
              key={t}
              className="px-4 py-1.5 rounded-full text-sm font-medium capitalize"
              style={{
                background: subTab === t ? 'var(--color-accent)' : 'var(--color-surface-raised)',
                color: subTab === t ? 'var(--color-bg)' : 'var(--color-text-dim)',
                border: '1px solid var(--color-border)'
              }}
              onClick={() => setSubTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {subTab === 'local' && (
          <>
            <OskInput value={searchQuery} onChange={setSearch} placeholder="Search music…" className="text-sm" style={{ maxWidth: 240 } as React.CSSProperties} />
            <motion.button className="px-4 py-2 rounded-[var(--radius-card)] text-sm" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }} onClick={scan} whileTap={{ scale: 0.96 }}>↺ Scan</motion.button>
          </>
        )}
      </div>

      {subTab === 'local' && (
        <>
          <div className="flex gap-2 flex-shrink-0">
            {(['artist', 'album', 'genre', 'year'] as const).map((ft) => (
              <button
                key={ft}
                className="px-3 py-1 rounded text-xs font-medium capitalize"
                style={{
                  background: activeFilterType === ft ? 'var(--color-accent-dim)' : 'var(--color-surface-raised)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)'
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
              activeFilterType === 'artist' ? (activeArtist ?? '') :
              activeFilterType === 'album' ? (activeAlbum ?? '') :
              activeFilterType === 'genre' ? (activeGenre ?? '') :
              (activeYear ? String(activeYear) : '')
            }
            onSelect={(v) => {
              if (activeFilterType === 'artist') setArtist(v || null)
              else if (activeFilterType === 'album') setAlbum(v || null)
              else if (activeFilterType === 'genre') setGenre(v || null)
              else setYear(v ? parseInt(v) : null)
            }}
            className="flex-shrink-0"
          />
          {loading ? (
            <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--color-text-dim)' }}>Loading music…</div>
          ) : (
            <div className="flex-1 min-h-0">
              <VirtualGrid
                ref={gridRef}
                items={items}
                columnCount={COLUMN_COUNT}
                rowHeight={240}
                renderItem={(track, index) => (
                  <div className="p-1.5 w-full h-full flex flex-col min-w-0">
                    <MediaCard
                      key={track.id}
                      id={track.id}
                      title={track.title}
                      subtitle={track.artist ?? track.album}
                      coverUrl={track.albumArtUrl}
                      aspectRatio="1/1"
                      isFavorite={track.isFavorite}
                      isFocused={index === focusedIndex}
                      onSelect={() => { play(items, index); setSelected(track) }}
                      onFavorite={() => toggleFavorite(track.id)}
                    />
                  </div>
                )}
              />
            </div>
          )}
        </>
      )}

      {subTab === 'streaming' && (
        <div className="pt-2">
          <StreamingTile services={MUSIC_STREAMING_SERVICES} />
        </div>
      )}

      <DetailPanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        coverUrl={selected?.albumArtUrl}
        metadata={selected ? [
          selected.artist ? { label: 'Artist', value: selected.artist } : null,
          selected.album ? { label: 'Album', value: selected.album } : null,
          selected.year ? { label: 'Year', value: String(selected.year) } : null,
          selected.genre ? { label: 'Genre', value: selected.genre } : null,
          selected.duration ? { label: 'Duration', value: `${Math.floor(selected.duration / 60)}:${String(Math.round(selected.duration % 60)).padStart(2, '0')}` } : null
        ].filter(Boolean) as { label: string; value: string }[] : []}
        tags={selected?.tags ?? []}
        onTagsChange={selected ? (newTags) => setTags(selected.id, newTags) : undefined}
        actions={selected && (
          <>
            <motion.button
              className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
              onClick={() => { play(items, items.findIndex((t) => t.id === selected!.id)); setSelected(null) }}
              whileTap={{ scale: 0.96 }}
            >
              ▶ Play
            </motion.button>
            {albumTracks.length > 1 && (
              <motion.button
                className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
                style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                onClick={() => { play(albumTracks, 0); setSelected(null) }}
                whileTap={{ scale: 0.96 }}
              >
                ▶ Play Album
              </motion.button>
            )}
            <motion.button
              className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
              style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              onClick={() => { if (selected) searchCoverArt(selected.id) }}
              whileTap={{ scale: 0.96 }}
            >
              Search Cover
            </motion.button>
            <motion.button
              className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
              style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              onClick={() => { if (selected) pickCoverImage(selected.id) }}
              whileTap={{ scale: 0.96 }}
            >
              Upload Cover
            </motion.button>
          </>
        )}
      >
        {selected?.album && albumTracks.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-dim)' }}>
              {selected.album}
            </div>
            <div className="flex flex-col gap-0.5">
              {albumTracks.map((track, i) => (
                <div
                  key={track.id}
                  className="flex items-center gap-2 py-1.5 px-2 rounded text-sm cursor-pointer hover:bg-white/5"
                  style={{
                    background: track.id === selected.id ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent'
                  }}
                  onClick={() => { play(albumTracks, i); setSelected(track) }}
                >
                  <span style={{ color: 'var(--color-text-dim)', minWidth: '1.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {track.trackNumber ?? i + 1}
                  </span>
                  <span className="flex-1 truncate" style={{ color: track.id === selected.id ? 'var(--color-accent)' : 'var(--color-text)' }}>
                    {track.title}
                  </span>
                  {track.duration && (
                    <span style={{ color: 'var(--color-text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.floor(track.duration / 60)}:{String(Math.round(track.duration % 60)).padStart(2, '0')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DetailPanel>
    </div>
  )
}
