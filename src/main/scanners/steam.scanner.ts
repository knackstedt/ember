import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { Game } from '../../shared/types'

const STEAM_ROOTS = [
  join(homedir(), '.steam', 'steam'),
  join(homedir(), '.local', 'share', 'Steam'),
  '/usr/share/steam'
]

function findSteamRoot(): string | null {
  return STEAM_ROOTS.find((p) => existsSync(p)) ?? null
}

function parseAcf(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const matches = content.matchAll(/"(\w+)"\s+"([^"]+)"/g)
  for (const [, key, value] of matches) {
    result[key] = value
  }
  return result
}

function findLibraryFolders(steamRoot: string): string[] {
  const libraryFoldersPath = join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  const paths: string[] = [join(steamRoot, 'steamapps')]

  if (!existsSync(libraryFoldersPath)) return paths

  const content = readFileSync(libraryFoldersPath, 'utf-8')
  const pathMatches = content.matchAll(/"path"\s+"([^"]+)"/g)
  for (const [, p] of pathMatches) {
    const libPath = join(p, 'steamapps')
    if (existsSync(libPath)) paths.push(libPath)
  }

  return paths
}

function findGridDir(steamRoot: string): string | null {
  const userdataDir = join(steamRoot, 'userdata')
  if (!existsSync(userdataDir)) return null
  const users = readdirSync(userdataDir)
  for (const user of users) {
    const gridDir = join(userdataDir, user, 'config', 'grid')
    if (existsSync(gridDir)) return gridDir
  }
  return null
}

function findCover(gridDir: string | null, appId: string): string | undefined {
  if (!gridDir) return undefined
  const exts = ['jpg', 'jpeg', 'png', 'webp']
  const suffixes = ['p', '_p', '']
  for (const sfx of suffixes) {
    for (const ext of exts) {
      const candidate = join(gridDir, `${appId}${sfx}.${ext}`)
      if (existsSync(candidate)) return `file://${candidate}`
    }
  }
  return undefined
}

export function scanSteamGames(): Game[] {
  const steamRoot = findSteamRoot()
  if (!steamRoot) return []

  const libraries = findLibraryFolders(steamRoot)
  const gridDir = findGridDir(steamRoot)
  const games: Game[] = []

  for (const lib of libraries) {
    if (!existsSync(lib)) continue
    let entries: string[]
    try {
      entries = readdirSync(lib)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue
      try {
        const content = readFileSync(join(lib, entry), 'utf-8')
        const data = parseAcf(content)
        const appId = data['appid']
        if (!appId || !data['name']) continue

        const cover = findCover(gridDir, appId)

        games.push({
          id: `steam_${appId}`,
          title: data['name'],
          platform: 'steam',
          steamAppId: parseInt(appId),
          coverUrl: cover,
          execPath: `steam://rungameid/${appId}`,
          tags: []
        })
      } catch {
        continue
      }
    }
  }

  return games
}
