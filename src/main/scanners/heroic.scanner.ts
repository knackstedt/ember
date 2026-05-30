import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { Game, GamePlatform } from '../../shared/types'

const HEROIC_CONFIG = join(homedir(), '.config', 'heroic')
const HEROIC_LIBRARY_GOG = join(HEROIC_CONFIG, 'gog_store', 'library.json')
const HEROIC_LIBRARY_EPIC = join(HEROIC_CONFIG, 'store', 'library.json')
const HEROIC_IMAGES = join(homedir(), '.cache', 'heroic', 'images')

interface HeroicGame {
  app_name: string
  title: string
  install?: { executable?: string; platform?: string }
  art_cover?: string
  art_square?: string
  art_background?: string
  developer?: string
  extra?: { about?: { longDescription?: string } }
  store?: string
}

function coverFor(game: HeroicGame): string | undefined {
  const paths = [
    game.art_square,
    game.art_cover,
    join(HEROIC_IMAGES, `${game.app_name}.jpg`),
    join(HEROIC_IMAGES, `${game.app_name}.png`)
  ].filter((p): p is string => !!p && existsSync(p))
  return paths[0] ? `file://${paths[0]}` : undefined
}

function parseLibrary(path: string, platform: GamePlatform): Game[] {
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    const library: HeroicGame[] = data.games ?? data.library ?? []
    return library.map((g) => ({
      id: `heroic_${g.app_name}`,
      title: g.title,
      platform,
      execPath: g.install?.executable,
      coverUrl: coverFor(g),
      developer: g.developer,
      description: g.extra?.about?.longDescription,
      tags: []
    }))
  } catch {
    return []
  }
}

export function scanHeroicGames(): Game[] {
  return [
    ...parseLibrary(HEROIC_LIBRARY_GOG, 'gog'),
    ...parseLibrary(HEROIC_LIBRARY_EPIC, 'desktop')
  ]
}

const LUTRIS_GAMES_DIR = join(homedir(), '.local', 'share', 'lutris', 'games')

export function scanLutrisGames(): Game[] {
  if (!existsSync(LUTRIS_GAMES_DIR)) return []
  const games: Game[] = []
  let entries: string[]
  try {
    entries = readdirSync(LUTRIS_GAMES_DIR)
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      const data = JSON.parse(readFileSync(join(LUTRIS_GAMES_DIR, entry), 'utf-8'))
      if (!data.name) continue
      games.push({
        id: `lutris_${data.slug ?? entry}`,
        title: data.name,
        platform: 'desktop',
        execPath: data.exe,
        coverUrl: data.banner
          ? `file://${join(homedir(), '.cache', 'lutris', 'coverart', `${data.slug}.jpg`)}`
          : undefined,
        tags: []
      })
    } catch {
      continue
    }
  }

  return games
}
