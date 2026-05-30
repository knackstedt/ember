import { existsSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { createHash } from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getXdgVideosDir } from './xdg'
import { Movie, TVShow, TVSeason, TVEpisode } from '../../shared/types'

const execAsync = promisify(exec)

const VIDEO_EXTS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.m2ts', '.webm', '.flv'
])

const TV_PATTERN = /[Ss](\d+)[Ee](\d+)/

interface FfprobeStream {
  codec_type: string
  codec_name: string
  width?: number
  height?: number
}

interface FfprobeData {
  streams?: FfprobeStream[]
  format?: { duration?: string; tags?: Record<string, string> }
}

async function probVideo(filePath: string): Promise<{
  duration?: number
  resolution?: string
  codec?: string
  title?: string
} | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams -show_format "${filePath.replace(/"/g, '\\"')}"`
    )
    const data: FfprobeData = JSON.parse(stdout)
    const video = data.streams?.find((s) => s.codec_type === 'video')
    return {
      duration: data.format?.duration ? parseFloat(data.format.duration) : undefined,
      resolution: video ? `${video.width}x${video.height}` : undefined,
      codec: video?.codec_name,
      title: data.format?.tags?.title
    }
  } catch {
    return null
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
      } else if (VIDEO_EXTS.has(extname(entry).toLowerCase())) {
        results.push(full)
      }
    } catch {
      continue
    }
  }
}

function isTvEpisode(filePath: string): boolean {
  return TV_PATTERN.test(basename(filePath))
}

export async function scanMovieFiles(extraPaths: string[] = []): Promise<Movie[]> {
  const roots = [getXdgVideosDir(), ...extraPaths].filter(existsSync)
  const allFiles: string[] = []
  for (const root of roots) walkDir(root, allFiles)

  const movies: Movie[] = []

  for (const filePath of allFiles) {
    if (isTvEpisode(filePath)) continue
    const probe = await probVideo(filePath)
    const name = basename(filePath, extname(filePath))
      .replace(/\.\d{4}\..*$/, '')
      .replace(/[._]/g, ' ')
      .trim()

    const id = createHash('md5').update(filePath).digest('hex').slice(0, 16)

    movies.push({
      id,
      title: probe?.title ?? name,
      filePath,
      duration: probe?.duration,
      resolution: probe?.resolution,
      codec: probe?.codec,
      tags: []
    })
  }

  return movies
}

export async function scanTvShows(extraPaths: string[] = []): Promise<TVShow[]> {
  const roots = [getXdgVideosDir(), ...extraPaths].filter(existsSync)
  const showMap = new Map<string, { episodes: { season: number; ep: number; path: string }[] }>()

  for (const root of roots) {
    let dirs: string[]
    try {
      dirs = readdirSync(root)
    } catch {
      continue
    }
    for (const dir of dirs) {
      const showPath = join(root, dir)
      if (!statSync(showPath).isDirectory()) continue
      const epFiles: string[] = []
      walkDir(showPath, epFiles)
      const tvEps = epFiles.filter((f) => isTvEpisode(f))
      if (tvEps.length === 0) continue

      const episodes = tvEps.map((f) => {
        const m = TV_PATTERN.exec(basename(f))!
        return { season: parseInt(m[1]), ep: parseInt(m[2]), path: f }
      })

      showMap.set(showPath, { episodes })
    }
  }

  const shows: TVShow[] = []

  for (const [dirPath, { episodes }] of showMap) {
    const seasonMap = new Map<number, TVEpisode[]>()
    for (const { season, ep, path } of episodes) {
      if (!seasonMap.has(season)) seasonMap.set(season, [])
      seasonMap.get(season)!.push({ episodeNumber: ep, filePath: path })
    }

    const seasons: TVSeason[] = [...seasonMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([seasonNumber, eps]) => ({
        seasonNumber,
        episodes: eps.sort((a, b) => a.episodeNumber - b.episodeNumber)
      }))

    const title = basename(dirPath).replace(/[._]/g, ' ').trim()
    const id = createHash('md5').update(dirPath).digest('hex').slice(0, 16)

    shows.push({ id, title, dirPath, seasons, tags: [] })
  }

  return shows
}
