import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useGamesStore } from '../../store/games.store'
import { ChipFilters, ChipFilter } from '../../components/ChipFilters/ChipFilters'
import { VirtualGrid } from '../../components/VirtualGrid/VirtualGrid'
import { MediaCard } from '../../components/MediaCard/MediaCard'
import { DetailPanel } from '../../components/DetailPanel/DetailPanel'
import { OskInput } from '../../components/OnScreenKeyboard/OnScreenKeyboard'
import { Game, GamePlatform } from '../../../../shared/types'

const PLATFORM_FILTERS: ChipFilter<GamePlatform | 'all' | 'couch-coop' | 'favorites'>[] = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: '★ Favorites' },
  { id: 'couch-coop', label: '🎮 Couch Co-op' },
  { id: 'steam', label: 'Steam' },
  { id: 'gog', label: 'GOG' },
  { id: 'heroic', label: 'Heroic/Epic' },
  { id: 'lutris', label: 'Lutris' },
  { id: 'dolphin-gc', label: 'GameCube' },
  { id: 'dolphin-wii', label: 'Wii' },
  { id: 'nes', label: 'NES' },
  { id: 'snes', label: 'SNES' },
  { id: 'gb', label: 'Game Boy' },
  { id: 'gba', label: 'GBA' },
  { id: 'flash', label: 'Flash' },
  { id: 'desktop', label: 'Other' }
]

const PROTON_COLORS: Record<string, string> = {
  platinum: '#b5e3ff',
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',
  borked: '#ff4444'
}

function gameBadge(game: Game): { label: string; color: string } | undefined {
  if (game.protonRating && game.protonRating !== 'unknown') {
    return { label: game.protonRating, color: PROTON_COLORS[game.protonRating] }
  }
  return undefined
}

const COLUMN_COUNT = 6

export const GamingTab: React.FC = () => {
  const { games, loading, scanning, activeFilter, searchQuery, load, scan, setFilter, setSearch, filtered, toggleFavorite } = useGamesStore()
  const [selected, setSelected] = useState<Game | null>(null)

  useEffect(() => {
    load()
  }, [])

  const items = filtered()
  const badge = selected ? gameBadge(selected) : undefined

  const launch = (game: Game): void => {
    window.htpc.games.launch(game)
  }

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div className="flex items-center gap-3 flex-shrink-0">
        <OskInput
          value={searchQuery}
          onChange={setSearch}
          placeholder="Search games…"
          className="text-sm"
          style={{ maxWidth: 280 } as React.CSSProperties}
        />
        <motion.button
          className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium"
          style={{
            background: 'var(--color-surface-raised)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)'
          }}
          onClick={scan}
          whileTap={{ scale: 0.96 }}
          disabled={scanning}
        >
          {scanning ? '⟳ Scanning…' : '↺ Scan'}
        </motion.button>
        <span className="text-sm" style={{ color: 'var(--color-text-dim)' }}>
          {items.length} games
        </span>
      </div>

      <ChipFilters
        filters={PLATFORM_FILTERS}
        active={activeFilter}
        onSelect={setFilter}
        className="flex-shrink-0"
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--color-text-dim)' }}>
          Loading games…
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ color: 'var(--color-text-dim)' }}>
          <p>No games found.</p>
          <motion.button
            className="px-6 py-2.5 rounded-[var(--radius-card)] font-medium"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
            onClick={scan}
            whileTap={{ scale: 0.96 }}
          >
            Scan for games
          </motion.button>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <VirtualGrid
            items={items}
            columnCount={COLUMN_COUNT}
            rowHeight={260}
            renderItem={(game) => {
              const b = gameBadge(game)
              return (
                <div className="p-1.5" style={{ contain: 'layout style paint' }}>
                  <MediaCard
                    key={game.id}
                    id={game.id}
                    title={game.title}
                    subtitle={game.developer}
                    coverUrl={game.coverUrl}
                    badge={b?.label}
                    badgeColor={b?.color}
                    isFavorite={game.isFavorite}
                    onSelect={() => setSelected(game)}
                    onFavorite={() => toggleFavorite(game.id)}
                  />
                </div>
              )
            }}
          />
        </div>
      )}

      <DetailPanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        coverUrl={selected?.coverUrl}
        description={selected?.description}
        metadata={selected ? [
          selected.developer ? { label: 'Developer', value: selected.developer } : null,
          selected.releaseYear ? { label: 'Year', value: String(selected.releaseYear) } : null,
          selected.protonRating && selected.protonRating !== 'unknown'
            ? { label: 'ProtonDB', value: selected.protonRating }
            : null,
          selected.playerCount ? { label: 'Players', value: `${selected.playerCount.min}–${selected.playerCount.max}` } : null,
          { label: 'Platform', value: selected.platform }
        ].filter(Boolean) as { label: string; value: string }[] : []}
        actions={selected && (
          <motion.button
            className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
            onClick={() => { launch(selected); setSelected(null) }}
            whileTap={{ scale: 0.96 }}
          >
            ▶ Launch
          </motion.button>
        )}
      />
    </div>
  )
}
