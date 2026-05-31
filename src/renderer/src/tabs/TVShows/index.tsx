import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTvStore } from '../../store/media.store'
import { VirtualGrid, VirtualGridHandle } from '../../components/VirtualGrid/VirtualGrid'
import { MediaCard } from '../../components/MediaCard/MediaCard'
import { DetailPanel } from '../../components/DetailPanel/DetailPanel'
import { OskInput } from '../../components/OnScreenKeyboard/OnScreenKeyboard'
import { TVShow } from '../../../../shared/types'
import { useVideoPlayerStore } from '../../store/videoPlayer.store'
import { useGridFocus } from '../../hooks/useGridFocus'

const COLUMN_COUNT = 5

export const TVShowsTab: React.FC = () => {
  const { shows, loading, searchQuery, load, scan, toggleFavorite, setTags, setSearch, filtered } = useTvStore()
  const openVideo = useVideoPlayerStore((s) => s.open)
  const [selected, setSelected] = useState<TVShow | null>(null)
  const [selectedSeason, setSelectedSeason] = useState<number>(1)
  const gridRef = useRef<VirtualGridHandle>(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handler = () => setSelected(null)
    window.addEventListener('htpc:escape', handler)
    return () => window.removeEventListener('htpc:escape', handler)
  }, [])

  useEffect(() => {
    if (selected?.seasons?.length) {
      setSelectedSeason(selected.seasons[0].seasonNumber)
    }
  }, [selected?.id])

  const currentSeasonEpisodes = useMemo(() => {
    if (!selected?.seasons) return []
    return selected.seasons.find((s) => s.seasonNumber === selectedSeason)?.episodes ?? []
  }, [selected, selectedSeason])

  const items = filtered()
  const { focusedIndex } = useGridFocus({
    items,
    columnCount: COLUMN_COUNT,
    gridRef,
    onConfirm: (show) => setSelected(show),
    enabled: !selected
  })

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div className="flex gap-3 items-center flex-shrink-0">
        <OskInput value={searchQuery} onChange={setSearch} placeholder="Search TV shows…" className="text-sm" style={{ maxWidth: 280 } as React.CSSProperties} />
        <motion.button
          className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
          style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          onClick={scan}
          whileTap={{ scale: 0.96 }}
        >
          ↺ Scan
        </motion.button>
        <span className="text-sm" style={{ color: 'var(--color-text-dim)' }}>{items.length} shows</span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--color-text-dim)' }}>Loading TV shows…</div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ color: 'var(--color-text-dim)' }}>
          <p>No TV shows found.</p>
          <motion.button
            className="px-6 py-2.5 rounded-[var(--radius-card)] font-medium"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
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
            items={items}
            columnCount={COLUMN_COUNT}
            rowHeight={300}
            renderItem={(show, index) => (
              <div className="p-1.5 w-full h-full flex flex-col min-w-0">
                <MediaCard
                  key={show.id}
                  id={show.id}
                  title={show.title}
                  subtitle={show.seasons ? `${show.seasons.length} season${show.seasons.length !== 1 ? 's' : ''}` : undefined}
                  coverUrl={show.coverUrl}
                  isFavorite={show.isFavorite}
                  isFocused={index === focusedIndex}
                  onSelect={() => setSelected(show)}
                  onFavorite={() => toggleFavorite(show.id)}
                />
              </div>
            )}
          />
        </div>
      )}

      <DetailPanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        coverUrl={selected?.coverUrl}
        backdropUrl={selected?.backdropUrl}
        description={selected?.description}
        metadata={selected ? [
          selected.firstAirYear ? { label: 'First Aired', value: String(selected.firstAirYear) } : null,
          selected.creator ? { label: 'Creator', value: selected.creator } : null,
          selected.seasons ? { label: 'Seasons', value: String(selected.seasons.length) } : null,
          selected.genres?.length ? { label: 'Genres', value: selected.genres.join(', ') } : null
        ].filter(Boolean) as { label: string; value: string }[] : []}
        tags={selected?.tags ?? []}
        onTagsChange={selected ? (newTags) => setTags(selected.id, newTags) : undefined}
      >
        {selected?.seasons && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {selected.seasons.map((season) => (
                <button
                  key={season.seasonNumber}
                  className="px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 transition-colors"
                  style={{
                    background: selectedSeason === season.seasonNumber ? 'var(--color-accent)' : 'var(--color-surface-raised)',
                    color: selectedSeason === season.seasonNumber ? 'var(--color-bg)' : 'var(--color-text-dim)',
                    border: '1px solid var(--color-border)'
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
                  <span style={{ color: 'var(--color-text-dim)', minWidth: '1.75rem', fontVariantNumeric: 'tabular-nums' }}>
                    {ep.episodeNumber}
                  </span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="truncate" style={{ color: 'var(--color-text)' }}>
                      {ep.title ?? `Episode ${ep.episodeNumber}`}
                    </span>
                    <div className="flex gap-2 text-xs" style={{ color: 'var(--color-text-dim)' }}>
                      {ep.duration && (
                        <span>{Math.floor(ep.duration / 60)}:{String(Math.round(ep.duration % 60)).padStart(2, '0')}</span>
                      )}
                      {ep.airDate && <span>{ep.airDate}</span>}
                    </div>
                  </div>
                  <button
                    className="px-2.5 py-1 rounded text-xs font-semibold flex-shrink-0"
                    style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
                    onClick={() => openVideo(`file://${ep.filePath}`, ep.title ?? `Episode ${ep.episodeNumber}`)}
                  >
                    ▶ Play
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DetailPanel>
    </div>
  )
}
