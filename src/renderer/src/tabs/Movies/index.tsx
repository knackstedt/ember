import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useMoviesStore } from '../../store/media.store'
import { ChipFilters } from '../../components/ChipFilters/ChipFilters'
import { VirtualGrid } from '../../components/VirtualGrid/VirtualGrid'
import { MediaCard } from '../../components/MediaCard/MediaCard'
import { DetailPanel } from '../../components/DetailPanel/DetailPanel'
import { OskInput } from '../../components/OnScreenKeyboard/OnScreenKeyboard'
import { Movie } from '../../../../shared/types'
import { useVideoPlayerStore } from '../../store/videoPlayer.store'

const STREAMING_SERVICES = [
  { name: 'Netflix', url: 'https://netflix.com', color: '#E50914' },
  { name: 'Prime Video', url: 'https://primevideo.com', color: '#00A8E1' },
  { name: 'Disney+', url: 'https://disneyplus.com', color: '#113CCF' },
  { name: 'Hulu', url: 'https://hulu.com', color: '#1CE783' },
  { name: 'HBO Max', url: 'https://max.com', color: '#8B5CF6' },
  { name: 'Apple TV+', url: 'https://tv.apple.com', color: '#555555' }
]

type SubTab = 'local' | 'streaming'

const COLUMN_COUNT = 5

export const MoviesTab: React.FC = () => {
  const {
    movies, loading, searchQuery, activeGenre, load, scan, toggleFavorite,
    setSearch, setGenre, filtered
  } = useMoviesStore()
  const openVideo = useVideoPlayerStore((s) => s.open)
  const [selected, setSelected] = useState<Movie | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('local')

  useEffect(() => { load() }, [])

  const allGenres = [...new Set(movies.flatMap((m) => m.genres ?? []))].sort()
  const items = filtered()

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div className="flex gap-3 items-center flex-shrink-0">
        <div className="flex gap-1">
          {(['local', 'streaming'] as SubTab[]).map((t) => (
            <button
              key={t}
              className="px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors"
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
            <OskInput
              value={searchQuery}
              onChange={setSearch}
              placeholder="Search movies…"
              className="text-sm"
              style={{ maxWidth: 240 } as React.CSSProperties}
            />
            <motion.button
              className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
              style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              onClick={scan}
              whileTap={{ scale: 0.96 }}
            >
              ↺ Scan
            </motion.button>
          </>
        )}
      </div>

      {subTab === 'local' && (
        <>
          <ChipFilters
            filters={[
              { id: '', label: 'All Genres' },
              ...allGenres.map((g) => ({ id: g, label: g }))
            ]}
            active={activeGenre ?? ''}
            onSelect={(g) => setGenre(g || null)}
            className="flex-shrink-0"
          />

          {loading ? (
            <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--color-text-dim)' }}>
              Loading movies…
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <VirtualGrid
                items={items}
                columnCount={COLUMN_COUNT}
                rowHeight={300}
                renderItem={(movie) => (
                  <div className="p-1.5">
                    <MediaCard
                      key={movie.id}
                      id={movie.id}
                      title={movie.title}
                      subtitle={movie.releaseYear ? String(movie.releaseYear) : undefined}
                      coverUrl={movie.coverUrl}
                      isFavorite={movie.isFavorite}
                      onSelect={() => setSelected(movie)}
                      onFavorite={() => toggleFavorite(movie.id)}
                    />
                  </div>
                )}
              />
            </div>
          )}
        </>
      )}

      {subTab === 'streaming' && (
        <div className="flex-1 grid grid-cols-3 gap-4 content-start pt-2">
          {STREAMING_SERVICES.map((svc) => (
            <motion.button
              key={svc.name}
              className="flex items-center justify-center rounded-[var(--radius-card)] h-28 text-lg font-bold text-white"
              style={{ background: svc.color, boxShadow: 'var(--shadow-card)' }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => window.open(svc.url, '_blank')}
            >
              {svc.name}
            </motion.button>
          ))}
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
          selected.releaseYear ? { label: 'Year', value: String(selected.releaseYear) } : null,
          selected.director ? { label: 'Director', value: selected.director } : null,
          selected.runtime ? { label: 'Runtime', value: `${Math.round(selected.runtime / 60)}min` } : null,
          selected.resolution ? { label: 'Resolution', value: selected.resolution } : null,
          selected.codec ? { label: 'Codec', value: selected.codec } : null
        ].filter(Boolean) as { label: string; value: string }[] : []}
        actions={selected && (
          <>
            <motion.button
              className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
              onClick={() => { openVideo(`file://${selected!.filePath}`, selected!.title); setSelected(null) }}
              whileTap={{ scale: 0.96 }}
            >
              ▶ Play
            </motion.button>
            <motion.button
              className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
              style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              onClick={() => {
                const url = selected!.tmdbId
                  ? `https://www.themoviedb.org/movie/${selected!.tmdbId}/videos`
                  : `https://www.youtube.com/results?search_query=${encodeURIComponent(selected!.title + ' official trailer')}`
                void window.htpc.shell.openExternal(url)
              }}
              whileTap={{ scale: 0.96 }}
            >
              ▶ Trailer
            </motion.button>
          </>
        )}
      >
        {selected && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-dim)' }}>
              Cast &amp; Crew
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              {selected.director && (
                <div className="flex gap-2">
                  <span style={{ color: 'var(--color-text-dim)', minWidth: 64 }}>Director</span>
                  <span style={{ color: 'var(--color-text)' }}>{selected.director}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span style={{ color: 'var(--color-text-dim)', minWidth: 64 }}>Cast</span>
                <span style={{ color: 'var(--color-text)' }}>TBD</span>
              </div>
            </div>
          </div>
        )}
      </DetailPanel>
    </div>
  )
}
