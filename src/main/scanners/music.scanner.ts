import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, extname, dirname } from 'path'
import { createHash } from 'crypto'
import { loadMusicMetadata } from 'music-metadata'
import { getXdgMusicDir } from './xdg'
import { MusicTrack } from '../../shared/types'
import { app } from 'electron'
import { generateProceduralCover } from '../services/music-cover.service'

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.ogg', '.m4a', '.aac', '.wav', '.opus', '.wma'])

const coverCache = join(app.getPath('userData'), 'covers', 'music')
mkdirSync(coverCache, { recursive: true })

let musicMetadata: any = null

async function getMusicMetadata() {
  if (!musicMetadata) musicMetadata = await loadMusicMetadata()
  return musicMetadata
}

async function extractCover(filePath: string, id: string, pictures?: any[]): Promise<string | undefined> {
  try {
    const mm = await getMusicMetadata()
    const meta = pictures ? { common: { picture: pictures } } : await mm.parseFile(filePath, { skipCovers: false })
    const picture = mm.selectCover(meta.common.picture)
    if (!picture) return undefined
    const dest = join(coverCache, `${id}.jpg`)
    if (!existsSync(dest)) {
      writeFileSync(dest, picture.data)
    }
    return `htpc-thumb://covers/music/${id}.jpg`
  } catch {
    return undefined
  }
}

const FOLDER_ART_NAMES = [
  'cover.jpg', 'folder.jpg', 'album.jpg', 'front.jpg', 'art.jpg', 'thumbnail.jpg',
  'cover.png', 'folder.png', 'album.png', 'front.png', 'art.png', 'thumbnail.png'
]

function findFolderArt(filePath: string, id: string): string | undefined {
  try {
    const dir = dirname(filePath)
    for (const name of FOLDER_ART_NAMES) {
      const full = join(dir, name)
      if (existsSync(full)) {
        const dest = join(coverCache, `${id}.jpg`)
        if (!existsSync(dest)) {
          const data = readFileSync(full)
          writeFileSync(dest, data)
        }
        return `htpc-thumb://covers/music/${id}.jpg`
      }
    }
    return undefined
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
  console.log('[music:scan] roots:', roots)
  const allFiles: string[] = []
  for (const root of roots) walkDir(root, allFiles)
  console.log('[music:scan] found', allFiles.length, 'audio files')

  const tracks: MusicTrack[] = []

  for (let i = 0; i < allFiles.length; i++) {
    const filePath = allFiles[i]
    if (i % 100 === 0) console.log(`[music:scan] parsing ${i + 1}/${allFiles.length} ${filePath}`)
    try {
      const mm = await getMusicMetadata()
      const meta = await mm.parseFile(filePath, { skipCovers: false })
      const { title, artist, album, genre, year, track } = meta.common
      const id = createHash('md5').update(filePath).digest('hex').slice(0, 16)

      let albumArtUrl = await extractCover(filePath, id, meta.common.picture)
      if (!albumArtUrl) {
        albumArtUrl = findFolderArt(filePath, id)
      }
      if (!albumArtUrl) {
        albumArtUrl = await generateProceduralCover(filePath, id, artist, album)
      }

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
    } catch (err: any) {
      console.error('[music:scan] failed to parse', filePath, err?.message ?? String(err))
      continue
    }
  }

  console.log('[music:scan] completed, tracks:', tracks.length)
  return tracks
}
