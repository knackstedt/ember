import { existsSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'
import { Game, GamePlatform } from '../../shared/types'

const DEFAULT_ROM_DIRS = [
  join(homedir(), 'Games', 'GameCube'),
  join(homedir(), 'Games', 'Wii'),
  join(homedir(), 'ROMs', 'GameCube'),
  join(homedir(), 'ROMs', 'Wii'),
  '/mnt/games/GameCube',
  '/mnt/games/Wii'
]

const GC_EXTS = new Set(['.iso', '.gcm', '.gcz', '.ciso', '.rvz'])
const WII_EXTS = new Set(['.iso', '.wbfs', '.gcz', '.rvz', '.wia'])

function platformFromExt(ext: string, dirName: string): GamePlatform {
  const lower = dirName.toLowerCase()
  if (lower.includes('wii') && !lower.includes('gamecube')) return 'dolphin-wii'
  if (lower.includes('gamecube') || lower.includes('gc')) return 'dolphin-gc'
  if (WII_EXTS.has(ext) && ext === '.wbfs') return 'dolphin-wii'
  return 'dolphin-gc'
}

function titleFromFilename(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function scanDolphinGames(extraPaths: string[] = []): Game[] {
  const dirs = [...DEFAULT_ROM_DIRS, ...extraPaths].filter(existsSync)
  const games: Game[] = []
  const seen = new Set<string>()

  for (const dir of dirs) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const ext = extname(entry).toLowerCase()

      if (!GC_EXTS.has(ext) && !WII_EXTS.has(ext)) continue
      if (seen.has(fullPath)) continue

      try {
        const stat = statSync(fullPath)
        if (!stat.isFile()) continue
      } catch {
        continue
      }

      seen.add(fullPath)
      const platform = platformFromExt(ext, dir)
      const title = titleFromFilename(entry)

      games.push({
        id: `dolphin_${Buffer.from(fullPath).toString('base64').slice(0, 16)}`,
        title,
        platform,
        romPath: fullPath,
        execPath: `dolphin-emu --exec="${fullPath}"`,
        tags: []
        // STUB: Dolphin cover art CRC database lookup
      })
    }
  }

  return games
}
