const RAWG_BASE = "https://api.rawg.io/api";

export interface RawgGame {
  id: number;
  slug: string;
  name: string;
  background_image?: string;
  description_raw?: string;
  genres?: { name: string }[];
  released?: string;
  developers?: { name: string }[];
  publishers?: { name: string }[];
  playtime?: number;
  ratings_count?: number;
  rating?: number;
  metacritic?: number;
  platforms?: { platform: { name: string } }[];
}

function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function searchGame(
  title: string,
  apiKey?: string,
): Promise<RawgGame | null> {
  try {
    const params = new URLSearchParams({
      search: title,
      page_size: "1",
      ...(apiKey ? { key: apiKey } : {}),
    });
    const res = await fetchWithTimeout(`${RAWG_BASE}/games?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getGameDetail(
  slug: string,
  apiKey?: string,
): Promise<RawgGame | null> {
  try {
    const params = apiKey ? `?key=${apiKey}` : "";
    const res = await fetchWithTimeout(`${RAWG_BASE}/games/${slug}${params}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
