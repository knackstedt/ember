/**
 * PCGamingWiki Metadata Provider
 * Covers: PC games (Windows, Linux, macOS)
 * Provides: Compatibility info, technical metadata, fixes
 * Access: Free (MediaWiki API)
 * API Docs: https://www.pcgamingwiki.com/wiki/PCGamingWiki:API
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataFetchOptions, MetadataSource } from './types';

const PCGW_BASE = 'https://www.pcgamingwiki.com/w/api.php';

interface PCGWSearchResult {
  query?: {
    search?: {
      pageid: number;
      title: string;
      snippet: string;
    }[];
  };
}

interface PCGWPageInfo {
  query?: {
    pages?: Record<string, {
      pageid: number;
      title: string;
      extract?: string;
      categories?: { title: string }[];
      revisions?: {
        slots?: {
          main?: {
            '*': string; // wikitext content
          };
        };
      }[];
    }>;
  };
}

interface PCGWInfoboxData {
  steamAppId?: number;
  gogId?: string;
  series?: string;
  developer?: string;
  publisher?: string;
  engine?: string;
  releaseDate?: string;
  genres?: string[];
  platforms?: string[];
  wineSupport?: 'native' | 'perfect' | 'playable' | 'runs' | 'broken' | 'none';
  protonSupport?: 'native' | 'perfect' | 'playable' | 'runs' | 'broken' | 'none';
}

/**
 * Strip wikitext templates and extract the last pipe-delimited parameter.
 * Turns `{{Infobox game/row/developer|Studio Name}}` into `Studio Name`.
 */
function stripWikiTemplates(value: string): string {
  return value
    .replace(/\{\{([^|}]+(?:\|[^}]+)+)\}\}/g, (_, inner) => {
      const parts = inner.split('|');
      return parts[parts.length - 1].trim();
    })
    .replace(/\{\{[^}]+\}\}/g, '')
    .trim();
}

/**
 * Parse PCGamingWiki infobox wikitext to extract structured data
 */
function parseInfobox(wikitext: string): PCGWInfoboxData {
  const data: PCGWInfoboxData = {};

  // Extract Steam App ID
  const steamMatch = wikitext.match(/\|\s*steam_appid\s*=\s*(\d+)/);
  if (steamMatch) {
    data.steamAppId = parseInt(steamMatch[1], 10);
  }

  // Extract GOG ID
  const gogMatch = wikitext.match(/\|\s*gogcom_id\s*=\s*(\d+)/);
  if (gogMatch) {
    data.gogId = gogMatch[1];
  }

  // Extract series
  const seriesMatch = wikitext.match(/\|\s*series\s*=\s*([^\n]+)/);
  if (seriesMatch) {
    data.series = stripWikiTemplates(seriesMatch[1]);
  }

  // Extract developer
  const devMatch = wikitext.match(/\|\s*developers\s*=\s*([^\n]+)/);
  if (devMatch) {
    data.developer = stripWikiTemplates(devMatch[1]).split(',').map(d => d.trim())[0];
  }

  // Extract publisher
  const pubMatch = wikitext.match(/\|\s*publishers\s*=\s*([^\n]+)/);
  if (pubMatch) {
    data.publisher = stripWikiTemplates(pubMatch[1]).split(',').map(p => p.trim())[0];
  }

  // Extract engine
  const engineMatch = wikitext.match(/\|\s*engines?\s*=\s*([^\n]+)/);
  if (engineMatch) {
    data.engine = stripWikiTemplates(engineMatch[1]);
  }

  // Extract release date
  const dateMatch = wikitext.match(/\|\s*release_date\s*=\s*([^\n]+)/);
  if (dateMatch) {
    data.releaseDate = stripWikiTemplates(dateMatch[1]);
  }

  // Extract genres
  const genreMatch = wikitext.match(/\|\s*genres\s*=\s*([^\n]+)/);
  if (genreMatch) {
    data.genres = stripWikiTemplates(genreMatch[1]).split(',').map(g => g.trim()).filter(Boolean);
  }

  // Extract Linux support
  const linuxMatch = wikitext.match(/\|\s*wine\s*=\s*([^\n]+)/);
  if (linuxMatch) {
    const wineText = stripWikiTemplates(linuxMatch[1]).toLowerCase();
    if (wineText.includes('native')) data.wineSupport = 'native';
    else if (wineText.includes('perfect')) data.wineSupport = 'perfect';
    else if (wineText.includes('playable')) data.wineSupport = 'playable';
    else if (wineText.includes('runs')) data.wineSupport = 'runs';
    else if (wineText.includes('broken')) data.wineSupport = 'broken';
  }

  // Extract Proton support
  const protonMatch = wikitext.match(/\|\s*proton\s*=\s*([^\n]+)/);
  if (protonMatch) {
    const protonText = stripWikiTemplates(protonMatch[1]).toLowerCase();
    if (protonText.includes('native')) data.protonSupport = 'native';
    else if (protonText.includes('platinum')) data.protonSupport = 'perfect';
    else if (protonText.includes('gold')) data.protonSupport = 'playable';
    else if (protonText.includes('silver')) data.protonSupport = 'runs';
    else if (protonText.includes('bronze')) data.protonSupport = 'runs';
    else if (protonText.includes('borked')) data.protonSupport = 'broken';
  }

  return data;
}

async function pcgwRequest(params: Record<string, string>): Promise<unknown> {
  const queryParams = new URLSearchParams({
    format: 'json',
    origin: '*',
    ...params,
  });

  const res = await fetch(`${PCGW_BASE}?${queryParams}`);

  if (!res.ok) {
    throw new Error(`PCGamingWiki API error: ${res.status}`);
  }

  return res.json();
}

async function searchPage(title: string): Promise<number | null> {
  try {
    const data = await pcgwRequest({
      action: 'query',
      list: 'search',
      srsearch: title,
      srlimit: '1',
    }) as PCGWSearchResult;

    return data.query?.search?.[0]?.pageid || null;
  } catch {
    return null;
  }
}

async function getPageInfo(pageId: number): Promise<PCGWPageInfo['query']['pages'][string] | null> {
  try {
    const data = await pcgwRequest({
      action: 'query',
      pageids: String(pageId),
      prop: 'extracts|categories|revisions',
      rvslots: 'main',
      rvprop: 'content',
      exlimit: '1',
      exintro: '1',
      explaintext: '1',
    }) as PCGWPageInfo;

    return data.query?.pages?.[String(pageId)] || null;
  } catch {
    return null;
  }
}

function mapPCGWToMetadata(infobox: PCGWInfoboxData, page?: PCGWPageInfo['query']['pages'][string]): GameMetadata {
  const source: MetadataSource = {
    name: 'PCGamingWiki',
    type: 'supplementary',
    confidence: 0.9,
    fieldCoverage: ['developer', 'publisher', 'genres', 'steamAppId', 'pcgwEngine', 'pcgwSeries'],
  };

  const releaseYear = infobox.releaseDate
    ? parseInt(infobox.releaseDate.split('-')[0], 10)
    : undefined;

  // Map Proton support to our rating
  let protonRating: GameMetadata['protonRating'];
  if (infobox.protonSupport === 'native') protonRating = 'platinum';
  else if (infobox.protonSupport === 'perfect') protonRating = 'platinum';
  else if (infobox.protonSupport === 'playable') protonRating = 'gold';
  else if (infobox.protonSupport === 'runs') protonRating = 'silver';
  else if (infobox.protonSupport === 'broken') protonRating = 'borked';

  return {
    title: page?.title || '',
    description: page?.extract,
    releaseDate: infobox.releaseDate,
    releaseYear,
    developer: infobox.developer,
    publisher: infobox.publisher,
    genres: infobox.genres,
    platforms: infobox.platforms,
    steamAppId: infobox.steamAppId,
    protonRating,
    pcgwEngine: infobox.engine,
    pcgwSeries: infobox.series,
    sources: [source],
  };
}

export const PCGamingWikiProvider: MetadataProvider = {
  name: 'PCGamingWiki',
  type: 'supplementary',
  priority: 85,
  requiresApiKey: false,

  isAvailable(): boolean {
    return true; // No API key required
  },

  async search(options: MetadataSearchOptions): Promise<GameMetadata | null> {
    try {
      const pageId = await searchPage(options.title);
      if (!pageId) return null;

      const page = await getPageInfo(pageId);
      if (!page) return null;

      // Parse infobox from wikitext
      const wikitext = page.revisions?.[0]?.slots?.main?.['*'] || '';
      const infobox = parseInfobox(wikitext);

      return mapPCGWToMetadata(infobox, page);
    } catch (err) {
      console.error('[PCGamingWiki] Search error:', err);
      return null;
    }
  },

  async fetch(options: MetadataFetchOptions): Promise<GameMetadata | null> {
    // PCGamingWiki can be queried by Steam App ID through search
    if (options.steamAppId) {
      try {
        const pageId = await searchPage(`Steam app ${options.steamAppId}`);
        if (!pageId) {
          // Try searching without the Steam prefix
          return null;
        }

        const page = await getPageInfo(pageId);
        if (!page) return null;

        const wikitext = page.revisions?.[0]?.slots?.main?.['*'] || '';
        const infobox = parseInfobox(wikitext);

        // Verify the Steam ID matches
        if (infobox.steamAppId === options.steamAppId) {
          return mapPCGWToMetadata(infobox, page);
        }
      } catch (err) {
        console.error('[PCGamingWiki] Fetch error:', err);
      }
    }

    return null;
  },
};

// Export utility functions for testing
export {
  parseInfobox,
  searchPage,
  getPageInfo,
  mapPCGWToMetadata,
  pcgwRequest,
};
export type { PCGWInfoboxData, PCGWPageInfo, PCGWSearchResult };
