import { existsSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { createHash } from 'crypto'
import { parseFile, selectCover } from 'music-metadata'
import { getXdgMusicDir } from './xdg'
import { MusicTrack } from '../../shared/types'
import { app } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.ogg', '.m4a', '.aac', '.wav', '.opus', '.wma'])

const coverCache = join(app.getPath('userData'), 'covers', 'music')
mkdirSync(coverCache, { recursive: true })

async function extractCover(filePath: string, id: string): Promise<string | undefined> {
  try {
    const meta = await parseFile(filePath, { skipCovers: false })
    const picture = selectCover(meta.common.picture)
    if (!picture) return undefined
    const dest = join(coverCache, `${id}.jpg`)
    if (!existsSync(dest)) {
      writeFileSync(dest, picture.data)
    }
    return `file://${dest}`
  } catch {
    return undefined
  }
}

function walkDir(dir: string, results: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    try {
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walkDir(full, results)
      } else if (AUDIO_EXTS.has(extname(entry).toLowerCase())) {
        results.push(full)
      }
    } catch {
      continue
    }
  }
}

export async function scanMusicFiles(extraPaths: string[] = []): Promise<MusicTrack[]> {
  const roots = [getXdgMusicDir(), ...extraPaths].filter(existsSync)
  const allFiles: string[] = []
  for (const root of roots) walkDir(root, allFiles)

  const tracks: MusicTrack[] = []

  for (const filePath of allFiles) {
    try {
      const meta = await parseFile(filePath, { skipCovers: true })
      const { title, artist, album, genre, year, track } = meta.common
      const id = createHash('md5').update(filePath).digest('hex').slice(0, 16)

      const albumArtUrl = await extractCover(filePath, id)

      tracks.push({
        id,
        title: title ?? filePath.split('/').pop()!.replace(/\.[^.]+$/, ''),
        filePath,
        artist,
        album,
        albumArtUrl,
        genre: Array.isArray(genre) ? genre[0] : genre,
        year,
        trackNumber: track?.no ?? undefined,
        duration: meta.format.duration,
        tags: []
      })
    } catch {
      continue
    }
  }

  return tracks
}
