const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

export interface TmdbMovie {
  id: number
  title: string
  overview?: string
  poster_path?: string
  backdrop_path?: string
  genre_ids?: number[]
  genres?: { id: number; name: string }[]
  release_date?: string
  vote_average?: number
  credits?: {
    crew?: { job: string; name: string }[]
  }
  runtime?: number
}

export interface TmdbShow {
  id: number
  name: string
  overview?: string
  poster_path?: string
  backdrop_path?: string
  genre_ids?: number[]
  genres?: { id: number; name: string }[]
  first_air_date?: string
  vote_average?: number
  created_by?: { name: string }[]
  seasons?: TmdbSeason[]
}

export interface TmdbSeason {
  season_number: number
  episode_count: number
  name: string
  episodes?: TmdbEpisode[]
}

export interface TmdbEpisode {
  episode_number: number
  name: string
  overview?: string
  still_path?: string
  air_date?: string
  runtime?: number
}

function posterUrl(path?: string): string | undefined {
  return path ? `${TMDB_IMAGE_BASE}${path}` : undefined
}

export async function searchMovie(
  title: string,
  apiKey?: string
): Promise<TmdbMovie | null> {
  if (!apiKey) return null
  try {
    const params = new URLSearchParams({ query: title, api_key: apiKey })
    const res = await fetch(`${TMDB_BASE}/search/movie?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    const result = data.results?.[0]
    if (!result) return null
    return {
      ...result,
      poster_path: posterUrl(result.poster_path),
      backdrop_path: posterUrl(result.backdrop_path)
    }
  } catch {
    return null
  }
}

export async function getMovieDetail(
  tmdbId: number,
  apiKey?: string
): Promise<TmdbMovie | null> {
  if (!apiKey) return null
  try {
    const res = await fetch(
      `${TMDB_BASE}/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits`
    )
    if (!res.ok) return null
    const data = await res.json()
    return {
      ...data,
      poster_path: posterUrl(data.poster_path),
      backdrop_path: posterUrl(data.backdrop_path)
    }
  } catch {
    return null
  }
}

export async function searchShow(
  title: string,
  apiKey?: string
): Promise<TmdbShow | null> {
  if (!apiKey) return null
  try {
    const params = new URLSearchParams({ query: title, api_key: apiKey })
    const res = await fetch(`${TMDB_BASE}/search/tv?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    const result = data.results?.[0]
    if (!result) return null
    return {
      ...result,
      poster_path: posterUrl(result.poster_path),
      backdrop_path: posterUrl(result.backdrop_path)
    }
  } catch {
    return null
  }
}
