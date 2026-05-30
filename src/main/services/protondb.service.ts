import { ProtonRating } from '../../shared/types'

const PROTONDB_BASE = 'https://www.protondb.com/api/v1'

interface ProtonDbSummary {
  score: number
  tier: string
  trendingTier: string
  total: number
  bestReportedTier: string
}

const TIER_MAP: Record<string, ProtonRating> = {
  platinum: 'platinum',
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  borked: 'borked',
  pending: 'unknown'
}

export async function getProtonRating(steamAppId: number): Promise<ProtonRating> {
  try {
    const res = await fetch(`${PROTONDB_BASE}/reports/summaries/${steamAppId}.json`)
    if (!res.ok) return 'unknown'
    const data: ProtonDbSummary = await res.json()
    return TIER_MAP[data.tier?.toLowerCase()] ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
