const MB_BASE = 'https://musicbrainz.org/ws/2'
const MB_COVER_BASE = 'https://coverartarchive.org/release'

const headers = {
  'User-Agent': 'HTPC/0.1.0 (htpc@localhost)',
  Accept: 'application/json'
}

export interface MbRelease {
  id: string
  title: string
  date?: string
  'artist-credit'?: { artist: { name: string; id: string } }[]
  genres?: { name: string }[]
  media?: { 'track-count': number }[]
}

export async function searchRecording(
  title: string,
  artist?: string
): Promise<{ mbid?: string; albumMbid?: string } | null> {
  try {
    const q = [
      `recording:"${title}"`,
      artist ? `artistname:"${artist}"` : ''
    ]
      .filter(Boolean)
      .join(' AND ')

    const params = new URLSearchParams({ query: q, limit: '1', fmt: 'json' })
    const res = await fetch(`${MB_BASE}/recording?${params}`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    const rec = data.recordings?.[0]
    if (!rec) return null
    return {
      mbid: rec.id,
      albumMbid: rec.releases?.[0]?.id
    }
  } catch {
    return null
  }
}

export async function getReleaseCoverUrl(releaseMbid: string): Promise<string | null> {
  try {
    const res = await fetch(`${MB_COVER_BASE}/${releaseMbid}/front-250`, {
      method: 'HEAD'
    })
    if (res.ok || res.redirected) {
      return `${MB_COVER_BASE}/${releaseMbid}/front-250`
    }
    return null
  } catch {
    return null
  }
}
