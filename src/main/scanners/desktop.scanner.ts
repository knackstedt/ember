import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getXdgDesktopDirs } from './xdg'
import { Game } from '../../shared/types'

interface DesktopEntry {
  Name?: string
  Exec?: string
  Icon?: string
  Categories?: string
  Comment?: string
  NoDisplay?: string
  Hidden?: string
}

function parseDesktopFile(content: string): DesktopEntry {
  const entry: DesktopEntry = {}
  for (const line of content.split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim() as keyof DesktopEntry
    const value = line.slice(eq + 1).trim()
    entry[key] = value
  }
  return entry
}

function resolveExec(exec: string): string {
  return exec
    .replace(/%[uUfFdDnNickvm]/g, '')
    .replace(/^"(.+)"$/, '$1')
    .trim()
    .split(' ')[0]
}

function isGameCategory(categories?: string): boolean {
  if (!categories) return false
  const cats = categories.split(';').map((c) => c.toLowerCase())
  return cats.some((c) => c === 'game' || c === 'games')
}

export function scanDesktopGames(): Game[] {
  const dirs = getXdgDesktopDirs()
  const games: Game[] = []
  const seen = new Set<string>()

  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.endsWith('.desktop')) continue
      const fullPath = join(dir, entry)
      if (seen.has(fullPath)) continue
      seen.add(fullPath)

      try {
        const content = readFileSync(fullPath, 'utf-8')
        const data = parseDesktopFile(content)

        if (data.NoDisplay === 'true' || data.Hidden === 'true') continue
        if (!isGameCategory(data.Categories)) continue
        if (!data.Name || !data.Exec) continue

        const execBin = resolveExec(data.Exec)
        if (!execBin || !existsSync(execBin)) continue

        let coverUrl: string | undefined
        if (data.Icon) {
          const iconPaths = [
            data.Icon,
            `/usr/share/pixmaps/${data.Icon}.png`,
            `/usr/share/icons/hicolor/256x256/apps/${data.Icon}.png`,
            `/usr/share/icons/hicolor/128x128/apps/${data.Icon}.png`
          ]
          coverUrl = iconPaths.find(existsSync)
          if (coverUrl) coverUrl = `file://${coverUrl}`
        }

        games.push({
          id: `desktop_${Buffer.from(fullPath).toString('base64').slice(0, 16)}`,
          title: data.Name,
          platform: 'desktop',
          execPath: data.Exec,
          coverUrl,
          description: data.Comment,
          tags: []
        })
      } catch {
        continue
      }
    }
  }

  return games
}
