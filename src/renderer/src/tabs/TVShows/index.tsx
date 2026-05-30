import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useTvStore } from '../../store/media.store'
import { VirtualGrid } from '../../components/VirtualGrid/VirtualGrid'
import { MediaCard } from '../../components/MediaCard/MediaCard'
import { DetailPanel } from '../../components/DetailPanel/DetailPanel'
import { OskInput } from '../../components/OnScreenKeyboard/OnScreenKeyboard'
import { TVShow } from '../../../../shared/types'
import { useVideoPlayerStore } from '../../store/videoPlayer.store'

const COLUMN_COUNT = 5

export const TVShowsTab: React.FC = () => {
  const { shows, loading, searchQuery, load, scan, toggleFavorite, setSearch, filtered } = useTvStore()
  const openVideo = useVideoPlayerStore((s) => s.open)
  const [selected, setSelected] = useState<TVShow | null>(null)

  useEffect(() => { load() }, [])

  const items = filtered()

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
        <div className="flex-1 min-h-0">
          <VirtualGrid
            items={items}
            columnCount={COLUMN_COUNT}
            rowHeight={300}
            renderItem={(show) => (
              <div className="p-1.5">
                <MediaCard
                  key={show.id}
                  id={show.id}
                  title={show.title}
                  subtitle={show.seasons ? `${show.seasons.length} season${show.seasons.length !== 1 ? 's' : ''}` : undefined}
                  coverUrl={show.coverUrl}
                  isFavorite={show.isFavorite}
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
      >
        {selected?.seasons && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Episodes</h3>
            {selected.seasons.map((season) => (
              <div key={season.seasonNumber}>
                <div className="text-xs font-medium mb-1 uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
                  Season {season.seasonNumber}
                </div>
                {season.episodes.map((ep) => (
                  <div
                    key={ep.episodeNumber}
                    className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-white/5 text-sm"
                    onClick={() => openVideo(`file://${ep.filePath}`, ep.title ?? `Episode ${ep.episodeNumber}`)}
                  >
                    <span style={{ color: 'var(--color-text-dim)', minWidth: '1.5rem' }}>
                      {ep.episodeNumber}
                    </span>
                    <span style={{ color: 'var(--color-text)' }}>
                      {ep.title ?? `Episode ${ep.episodeNumber}`}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </DetailPanel>
    </div>
  )
}
