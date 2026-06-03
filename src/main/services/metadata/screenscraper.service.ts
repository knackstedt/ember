/**
 * ScreenScraper Metadata Provider
 * Covers: Retro ROMs
 * Provides: Metadata, artwork, videos
 * Access: Free account required (donations increase limits)
 * API Docs: https://github.com/ScreenScraper/api.pdf
 */

import { MetadataProvider, GameMetadata, MetadataSearchOptions, MetadataSource, RomHashInfo } from './types';

const SCREENSCRAPER_BASE = 'https://api.screenscraper.fr/api2';

interface ScreenScraperGame {
  id: number;
  romid: number;
  parentid?: number;
  cloneof?: string;
  jeu?: {
    id: number;
    nom?: { text: string; region?: string }[];
    noms?: { text: string; region?: string; langue?: string }[];
    synonymes?: { text: string }[];
    regions?: { shortname: string; parent?: string }[];
    dates?: { text: string; region?: string }[];
    editeur?: { text: string; id?: number };
    developpeur?: { text: string; id?: number };
    joueurs?: { text: string };
    notation?: { text: string };
    media?: {
      screenshot?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      "video-normalized"?: { url: string; region?: string };
      video?: { url: string; region?: string };
      wheel?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      "wheel-hd"?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      marquee?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      fanart?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      screenmarquee?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      "screenmarquee-vierge"?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      steamgrid?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      box2d?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      box3d?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      support2d?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      support3d?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      bezel?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      panel?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
      controller?: { url: string; region?: string; crc?: string; md5?: string; sha1?: string; size?: number };
    };
    genres?: { id: number; noms?: { text: string; langue: string }[] }[];
    familles?: { id: number; noms?: { text: string; langue: string }[] }[];
    nums?: { id: number; text: string }[];
    synopsis?: { text: string; langue?: string }[];
    classescheevos?: { text: string; region?: string }[];
  };
  rom?: {
    id: number;
    romnumsupport: string;
    romtotalsupport: string;
    romfilesname: string;
    romfilename: string;
    romtype: string;
    romsupporttype: string;
    romregion: string;
    romlangue?: { text: string }[];
    serial?: string;
    dates?: { text: string };
    crc32?: string;
    md5?: string;
    sha1?: string;
    size: number;
  };
}

interface ScreenScraperResponse {
  response?: {
    jeu?: ScreenScraperGame['jeu'];
    rom?: ScreenScraperGame['rom'];
  };
}

// System IDs for ScreenScraper
const SYSTEM_MAP: Record<string, number> = {
  'pc': 135,
  'dos': 135,
  'windows': 135,
  'nes': 3,
  'snes': 4,
  'n64': 14,
  'gamecube': 16,
  'wii': 18,
  'wiiu': 183,
  'switch': 203,
  'gb': 9,
  'gbc': 10,
  'gba': 12,
  'nds': 15,
  '3ds': 17,
  'genesis': 1,
  'megadrive': 1,
  'mastersystem': 2,
  'gamegear': 21,
  'saturn': 20,
  'dreamcast': 23,
  'segacd': 20,
  'psx': 57,
  'ps2': 58,
  'psp': 61,
  'psvita': 62,
  'xbox': 32,
  'xbox360': 33,
  'pce': 31,
  'tg16': 31,
  'pcecd': 31,
  'neogeo': 24,
  'neogeoaes': 24,
  'neogeocd': 142,
  'arcade': 75,
  'mame': 75,
  'atari2600': 26,
  'atari5200': 40,
  'atari7800': 41,
  'atarijaguar': 27,
  'lynx': 28,
  '3do': 29,
  'cdi': 49,
  'amiga': 64,
  'c64': 66,
  'msx': 113,
  'ngp': 25,
  'ngpc': 25,
  'wonderswan': 53,
  'wonderswancolor': 53,
  'intellivision': 42,
  'colecovision': 44,
  'vectrex': 46,
  'pcengine': 31,
  'turbografx': 31,
};

function normalizeSystemId(platform?: string): number | undefined {
  if (!platform) return undefined;
  const normalized = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SYSTEM_MAP[normalized];
}

function getLocalizedText(noms?: { text: string; region?: string; langue?: string }[], lang = 'en'): string | undefined {
  if (!noms || noms.length === 0) return undefined;

  // Try preferred language first
  const langMatch = noms.find(n => n.langue === lang || n.region === lang);
  if (langMatch) return langMatch.text;

  // Try English fallback
  const enMatch = noms.find(n => n.langue === 'en' || n.region === 'us' || n.region === 'eu' || n.region === 'wor');
  if (enMatch) return enMatch.text;

  // Return first available
  return noms[0].text;
}

function mapScreenScraperToMetadata(data: ScreenScraperResponse): GameMetadata {
  const jeu = data.response?.jeu;
  const rom = data.response?.rom;

  if (!jeu) {
    throw new Error('No game data in ScreenScraper response');
  }

  const title = getLocalizedText(jeu.noms) || getLocalizedText(jeu.nom);
  const description = getLocalizedText(jeu.synopsis);

  // Parse release date
  const dateEntry = jeu.dates?.[0];
  const releaseDate = dateEntry?.text;
  const releaseYear = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : undefined;

  // Developer and publisher
  const developer = jeu.developpeur?.text;
  const publisher = jeu.editeur?.text;

  // Parse genres
  const genres = jeu.genres?.map(g =>
    g.noms?.find(n => n.langue === 'en')?.text ||
    g.noms?.[0]?.text
  ).filter(Boolean) as string[];

  // Media URLs
  const media = jeu.media;
  const coverUrl = media?.box2d?.url || media?.box3d?.url;
  const bannerUrl = media?.fanart?.url || media?.screenmarquee?.url;
  const iconUrl = media?.wheel?.url || media?.['wheel-hd']?.url;

  // Screenshots
  const screenshots: string[] = [];
  if (media?.screenshot?.url) screenshots.push(media.screenshot.url);

  // Video
  const videos = media?.video?.url ? [{
    type: 'gameplay' as const,
    url: media.video.url,
    source: 'ScreenScraper',
  }] : undefined;

  // Player count
  let playerCount: { min: number; max: number } | undefined;
  if (jeu.joueurs?.text) {
    const match = jeu.joueurs.text.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = match[2] ? parseInt(match[2], 10) : min;
      playerCount = { min, max };
    }
  }

  // Rating
  let rating: number | undefined;
  if (jeu.notation?.text) {
    const ratingVal = parseFloat(jeu.notation.text);
    if (!isNaN(ratingVal)) rating = ratingVal / 10; // Convert to 0-10 scale
  }

  // Region and language from ROM
  const region = rom?.romregion || jeu.regions?.[0]?.shortname;
  const language = rom?.romlangue?.[0]?.text;

  const source: MetadataSource = {
    name: 'ScreenScraper',
    type: 'retro',
    confidence: 0.95,
    fieldCoverage: ['title', 'description', 'releaseDate', 'developer', 'publisher', 'genres', 'coverUrl', 'screenshots', 'videos'],
  };

  return {
    title: title || '',
    description,
    releaseDate,
    releaseYear,
    developer,
    publisher,
    genres,
    rating,
    coverUrl,
    bannerUrl,
    iconUrl,
    screenshots: screenshots.length > 0 ? screenshots : undefined,
    videos,
    playerCount,
    region,
    language,
    romHash: rom?.crc32 || rom?.md5 || rom?.sha1,
    romHashType: rom?.crc32 ? 'crc32' : rom?.md5 ? 'md5' : rom?.sha1 ? 'sha1' : undefined,
    serialNumber: rom?.serial,
    sources: [source],
  };
}

export const ScreenScraperProvider: MetadataProvider = {
  name: 'ScreenScraper',
  type: 'retro',
  priority: 95,
  requiresApiKey: false, // Uses username/password in devid/devpassword format

  isAvailable(apiKey?: string): boolean {
    // ScreenScraper uses devid:devpassword format
    // Without credentials, there are strict rate limits (1 request per minute)
    return true; // Available but limited without auth
  },

  async search(options: MetadataSearchOptions, apiKey?: string): Promise<GameMetadata | null> {
    try {
      const systemId = normalizeSystemId(options.platform);

      // Parse credentials if provided (format: "devid:devpassword" or "devid:devpassword:ssid:sspassword")
      let devId = '';
      let devPassword = '';
      let ssId = '';
      let ssPassword = '';

      if (apiKey) {
        const parts = apiKey.split(':');
        if (parts.length >= 2) {
          [devId, devPassword] = parts;
        }
        if (parts.length >= 4) {
          [devId, devPassword, ssId, ssPassword] = parts;
        }
      }

      // Build URL
      let url: string;

      if (options.romHash && systemId) {
        // Search by hash (most accurate)
        const hashType = options.romHashType || 'crc32';
        url = `${SCREENSCRAPER_BASE}/jeuInfos.php?devid=${devId}&devpassword=${devPassword}&softname=htpc&output=json&${hashType}=${options.romHash}&systemeid=${systemId}`;
      } else if (options.romPath && systemId) {
        // Search by ROM name
        const romName = options.romPath.split('/').pop()?.split('\\').pop();
        url = `${SCREENSCRAPER_BASE}/jeuInfos.php?devid=${devId}&devpassword=${devPassword}&softname=htpc&output=json&romnom=${encodeURIComponent(romName || options.title)}&systemeid=${systemId}`;
      } else {
        // Search by game name
        url = `${SCREENSCRAPER_BASE}/jeuInfos.php?devid=${devId}&devpassword=${devPassword}&softname=htpc&output=json&gameid=0&romtype=rom`;

        if (systemId) {
          url += `&systemeid=${systemId}`;
        }

        // Add game name
        url += `&romnom=${encodeURIComponent(options.title)}`;
      }

      if (ssId && ssPassword) {
        url += `&ssid=${ssId}&sspassword=${ssPassword}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          console.warn('[ScreenScraper] Rate limit exceeded - consider registering for higher limits');
        }
        return null;
      }

      const data: ScreenScraperResponse = await res.json();

      if (!data.response?.jeu) return null;

      return mapScreenScraperToMetadata(data);
    } catch (err) {
      console.error('[ScreenScraper] Search error:', err);
      return null;
    }
  },
};

export { mapScreenScraperToMetadata, normalizeSystemId, getLocalizedText };
