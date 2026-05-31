import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, readSync } from 'fs'
import { join, extname, dirname, basename } from 'path'
import { app, dialog } from 'electron'
import { MusicTrack } from '../../shared/types'
import { getDb } from '../db'

const coverCache = join(app.getPath('userData'), 'covers', 'music')
const generatedCache = join(coverCache, 'generated')
mkdirSync(generatedCache, { recursive: true })

/* ------------------------------------------------------------------ */
/*  Procedural cover-art generator (deterministic SVG)                */
/* ------------------------------------------------------------------ */

function hashFileHead(filePath: string): Buffer {
  try {
    const fd = openSync(filePath, 'r')
    const buf = Buffer.alloc(4096)
    const n = readSync(fd, buf, 0, 4096, 0)
    closeSync(fd)
    return createHash('sha256').update(buf.subarray(0, n)).digest()
  } catch {
    return createHash('sha256').update(filePath).digest()
  }
}

function byteHue(b: number): number {
  return Math.round((b / 255) * 360)
}

function bytePct(b: number, min: number, max: number): number {
  return min + (b / 255) * (max - min)
}

function buildProceduralSVG(hash: Buffer): string {
  const bytes = Array.from(hash)
  const w = 512
  const h = 512

  const hueBg1 = byteHue(bytes[0])
  const hueBg2 = byteHue(bytes[1])
  const sat = Math.round(bytePct(bytes[2], 40, 70))
  const light1 = Math.round(bytePct(bytes[3], 10, 18))
  const light2 = Math.round(bytePct(bytes[4], 14, 24))

  const hueAccent = byteHue(bytes[5])

  // Background gradient
  const bg = `hsl(${hueBg1}, ${sat}%, ${light1}%)`
  const bg2 = `hsl(${hueBg2}, ${sat}%, ${light2}%)`

  // Low-contrast editorial block behind everything
  const blockHue = (hueBg1 + 160 + Math.floor(bytes[6] / 4)) % 360
  const blockSat = Math.round(bytePct(bytes[7], 30, 55))
  const blockLight = Math.round(bytePct(bytes[8], 28, 48))
  const blockW = Math.round(bytePct(bytes[9], 200, 380))
  const blockH = h
  const blockX = bytePct(bytes[10], 0, 1) < 0.5 ? 0 : w - blockW
  const blockColor = `hsl(${blockHue}, ${blockSat}%, ${blockLight}%)`

  // Construct overlapping rectangles (replaces vinyl rings)
  let rects = ''
  for (let i = 0; i < 3; i++) {
    const rw = Math.round(bytePct(bytes[(11 + i * 6) % bytes.length], 160, 360))
    const rh = Math.round(bytePct(bytes[(12 + i * 6) % bytes.length], 120, 300))
    const rx = Math.round(bytePct(bytes[(13 + i * 6) % bytes.length], 40, w - rw - 40))
    const ry = Math.round(bytePct(bytes[(14 + i * 6) % bytes.length], 40, h - rh - 40))
    const rot = Math.round(bytePct(bytes[(15 + i * 6) % bytes.length], -10, 10))
    const rHue = (hueBg1 + Math.floor(bytes[(16 + i * 6) % bytes.length] / 8)) % 360
    const rSat = Math.round(bytePct(bytes[(17 + i * 6) % bytes.length], 20, 40))
    const rOp = bytePct(bytes[(18 + i * 6) % bytes.length], 0.04, 0.14).toFixed(2)
    rects += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="2" fill="hsl(${rHue},${rSat}%,55%)" opacity="${rOp}" transform="rotate(${rot}, ${rx + rw / 2}, ${ry + rh / 2})"/>`
  }

  // Waveform bars (bottom area) — single solid color, low contrast
  const barCount = 48
  const barMaxH = 70
  const barW = 6
  const barGap = 4
  const barStartX = (w - barCount * (barW + barGap)) / 2 + barGap / 2
  const barBaseY = 430
  const barColor = `hsl(${hueAccent}, ${Math.max(10, sat - 10)}%, ${light1 + 22}%)`

  let bars = ''
  for (let i = 0; i < barCount; i++) {
    const bh = Math.round(bytePct(bytes[(19 + i) % bytes.length], 8, barMaxH))
    const bx = Math.round(barStartX + i * (barW + barGap))
    const by = barBaseY - bh
    const opacity = bytePct(bytes[(23 + i) % bytes.length], 0.25, 0.55).toFixed(2)
    bars += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="${barColor}" opacity="${opacity}"/>`
  }

  // Thin accent line
  const lineY = Math.round(bytePct(bytes[24], 200, 380))
  const lineHue = (hueAccent + 120) % 360

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="28" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
  <!-- Editorial block -->
  <rect x="${blockX}" y="0" width="${blockW}" height="${blockH}" fill="${blockColor}" opacity="0.18"/>
  <!-- Construct rectangles -->
  <g>${rects}</g>
  <!-- Accent line -->
  <line x1="80" y1="${lineY}" x2="432" y2="${lineY}" stroke="hsl(${lineHue},20%,50%)" stroke-width="0.5" opacity="0.25"/>
  <!-- Waveform -->
  <g>${bars}</g>
</svg>`
}

export async function generateProceduralCover(
  filePath: string,
  id: string,
  artist?: string,
  album?: string
): Promise<string | undefined> {
  const dest = join(generatedCache, `${id}.svg`)
  if (existsSync(dest)) {
    return `htpc-thumb://covers/music/generated/${id}.svg`
  }
  try {
    const hash = hashFileHead(filePath)
    const svg = buildProceduralSVG(hash)
    writeFileSync(dest, svg)
    return `htpc-thumb://covers/music/generated/${id}.svg`
  } catch (err) {
    console.error('[generateProceduralCover]', err)
    return undefined
  }
}

/* ------------------------------------------------------------------ */
/*  Online cover-art search (MusicBrainz + Cover Art Archive)         */
/* ------------------------------------------------------------------ */

function escapeMbQuery(term: string): string {
  return term.replace(/[\\"]/g, '\\$&')
}

export async function searchCoverArt(artist: string, album: string): Promise<string | undefined> {
  if (!artist && !album) return undefined

  const parts: string[] = []
  if (artist) parts.push(`artist:"${escapeMbQuery(artist)}"`)
  if (album) parts.push(`release:"${escapeMbQuery(album)}"`)
  const query = parts.join(' AND ')

  try {
    const searchUrl = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json`
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'HTPC-App/0.1.0' }
    })
    if (!searchRes.ok) return undefined
    const data = await searchRes.json()
    const release = data.releases?.[0]
    if (!release?.id) return undefined

    // Check Cover Art Archive for this release
    const caaUrl = `https://coverartarchive.org/release/${release.id}/front-250`
    const head = await fetch(caaUrl, { method: 'HEAD' })
    if (head.ok) return caaUrl

    // Fallback to release-group front cover
    const rgId = release['release-group']?.id
    if (rgId) {
      const rgUrl = `https://coverartarchive.org/release-group/${rgId}/front-250`
      const rgHead = await fetch(rgUrl, { method: 'HEAD' })
      if (rgHead.ok) return rgUrl
    }

    return undefined
  } catch (err) {
    console.error('[searchCoverArt]', err)
    return undefined
  }
}

/* ------------------------------------------------------------------ */
/*  Download image from URL                                             */
/* ------------------------------------------------------------------ */

export async function downloadImage(url: string): Promise<Buffer | undefined> {
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (err) {
    console.error('[downloadImage]', err)
    return undefined
  }
}

/* ------------------------------------------------------------------ */
/*  Embed / save cover art                                              */
/* ------------------------------------------------------------------ */

export async function embedCoverArt(track: MusicTrack, imageBuffer: Buffer): Promise<string | undefined> {
  const ext = extname(track.filePath).toLowerCase()
  const cachePath = join(coverCache, `${track.id}.jpg`)

  try {
    writeFileSync(cachePath, imageBuffer)
  } catch (err) {
    console.error('[embedCoverArt] cache write failed', err)
    return undefined
  }

  let embedded = false
  if (ext === '.mp3') {
    embedded = await embedMp3Cover(track.filePath, imageBuffer)
  }

  if (!embedded) {
    // Save as folder art for formats we can't embed into
    const dir = dirname(track.filePath)
    const coverPath = join(dir, 'cover.jpg')
    try {
      writeFileSync(coverPath, imageBuffer)
    } catch (err) {
      console.error('[embedCoverArt] folder write failed', err)
    }
  }

  // Update DB
  const htpcUrl = `htpc-thumb://covers/music/${track.id}.jpg`
  try {
    const db = getDb()
    await db.query(`UPDATE music_track:⟨${track.id}⟩ SET albumArtUrl = $url`, { url: htpcUrl })
  } catch (err) {
    console.error('[embedCoverArt] db update failed', err)
  }

  return htpcUrl
}

async function embedMp3Cover(filePath: string, imageBuffer: Buffer): Promise<boolean> {
  try {
    const mod = await import('node-id3')
    const NodeID3 = (mod as any).default ?? mod
    const tags = {
      APIC: {
        mimeType: 'image/jpeg',
        type: { id: 3, name: 'front cover' },
        description: 'Cover',
        imageBuffer
      }
    }
    const result = NodeID3.write(tags, filePath)
    return result === true || typeof result === 'object'
  } catch (err) {
    console.error('[embedMp3Cover]', err)
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Pick cover image from disk via dialog                               */
/* ------------------------------------------------------------------ */

export async function pickCoverImage(track: MusicTrack): Promise<string | undefined> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }
    ],
    title: `Choose cover art for ${track.title}`
  })
  if (canceled || !filePaths[0]) return undefined

  const imageBuffer = readFileSync(filePaths[0])
  return embedCoverArt(track, imageBuffer)
}
