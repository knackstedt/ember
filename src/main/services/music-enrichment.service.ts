import { MusicTrack } from "../../shared/types";
import {
  searchRecordingDetailed,
  lookupArtist,
  lookupRelease,
  getReleaseCoverUrl,
  getReleaseGroupCoverUrl,
  getReleaseCoverArtList,
  getReleaseGroupCoverArtList,
  MbRecordingSearchResult,
} from "./musicbrainz.service";
import {
  searchArtist as tadbSearchArtist,
  searchAlbum as tadbSearchAlbum,
  searchArtistByMbid as tadbSearchArtistByMbid,
  TadbArtistResult,
  TadbAlbumResult,
} from "./theaudiodb.service";
import { createLogger } from "../util/logger";

const log = createLogger("info");

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EnrichmentResult {
  /** Fields to merge into the MusicTrack record */
  updates: Partial<MusicTrack>;
  /** Best cover art URL found (highest quality available) */
  coverArtUrl?: string;
  /** Artist thumbnail URL from TheAudioDB */
  artistImageUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Rate-limit aware delay                                             */
/* ------------------------------------------------------------------ */

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/* ------------------------------------------------------------------ */
/*  Main enrichment pipeline                                           */
/* ------------------------------------------------------------------ */

/**
 * Enrich a music track by querying MusicBrainz, Cover Art Archive, and TheAudioDB.
 *
 * Pipeline:
 * 1. MusicBrainz recording search → MBID, artist MBID, release MBID, genres, label, country
 * 2. MusicBrainz artist lookup → genres, country (if not already found)
 * 3. Cover Art Archive → best cover art (release → release-group fallback)
 * 4. TheAudioDB artist search → biography, mood, style, artist image
 * 5. TheAudioDB album search → album art, mood, style, description
 *
 * Respects MusicBrainz rate limits (~1 req/sec). TheAudioDB has no strict limit.
 */
export async function enrichTrack(
  track: MusicTrack,
  options: { tadbApiKey?: string } = {},
): Promise<EnrichmentResult> {
  const updates: Partial<MusicTrack> = {};
  let coverArtUrl: string | undefined;
  let artistImageUrl: string | undefined;

  const { title, artist, album } = track;
  const tadbKey = options.tadbApiKey || "2";

  // ── Step 1: MusicBrainz recording search ──────────────────────────
  let mbResult: MbRecordingSearchResult | null = null;
  try {
    mbResult = await searchRecordingDetailed(title, artist);
  } catch (err) {
    log.error("enrichTrack:mb-recording", String(err));
  }

  if (mbResult) {
    if (mbResult.mbid) updates.mbid = mbResult.mbid;
    if (mbResult.artistMbid) updates.artistMbid = mbResult.artistMbid;
    if (mbResult.releaseMbid) updates.releaseMbid = mbResult.releaseMbid;
    if (mbResult.releaseGroupMbid) updates.releaseGroupMbid = mbResult.releaseGroupMbid;
    if (mbResult.genres?.length && !track.genre) {
      updates.genre = mbResult.genres[0];
    }
    if (mbResult.label) updates.label = mbResult.label;
    if (mbResult.country) updates.country = mbResult.country;
    if (mbResult.totalTracks) updates.totalTracks = mbResult.totalTracks;
  }

  // ── Step 2: MusicBrainz artist lookup (for country/genres) ────────
  await delay(1100); // respect rate limit
  const artistMbid = updates.artistMbid || track.artistMbid;
  if (artistMbid) {
    try {
      const mbArtist = await lookupArtist(artistMbid);
      if (mbArtist) {
        if (!updates.country && mbArtist.country) updates.country = mbArtist.country;
        if (!updates.genre && mbArtist.genres?.length) {
          const topGenre = mbArtist.genres.sort((a, b) => b.count - a.count)[0];
          if (topGenre) updates.genre = topGenre.name;
        }
      }
    } catch (err) {
      log.error("enrichTrack:mb-artist", String(err));
    }
  }

  // ── Step 3: Cover Art Archive ─────────────────────────────────────
  await delay(1100);
  const releaseMbid = updates.releaseMbid || track.releaseMbid;
  const releaseGroupMbid = updates.releaseGroupMbid || track.releaseGroupMbid;

  if (releaseMbid) {
    try {
      // Try to get the full image list for best quality
      const caaList = await getReleaseCoverArtList(releaseMbid);
      if (caaList?.images?.length) {
        const front = caaList.images.find((img) => img.front);
        if (front) {
          // Prefer 500px thumbnail, fall back to 250px
          coverArtUrl = front.thumbnails[500] || front.thumbnails[250] || front.image;
        }
      }

      // Fall back to simple front cover URL
      if (!coverArtUrl) {
        coverArtUrl = (await getReleaseCoverUrl(releaseMbid)) ?? undefined;
      }
    } catch (err) {
      log.error("enrichTrack:caa-release", String(err));
    }
  }

  // Release-group fallback
  if (!coverArtUrl && releaseGroupMbid) {
    await delay(1100);
    try {
      const rgCover = await getReleaseGroupCoverUrl(releaseGroupMbid, 500);
      if (rgCover) coverArtUrl = rgCover;
      else {
        const rgList = await getReleaseGroupCoverArtList(releaseGroupMbid);
        const front = rgList?.images?.find((img) => img.front);
        if (front) {
          coverArtUrl = front.thumbnails[500] || front.thumbnails[250] || front.image;
        }
      }
    } catch (err) {
      log.error("enrichTrack:caa-rg", String(err));
    }
  }

  // ── Step 4: TheAudioDB artist search ──────────────────────────────
  let tadbArtist: TadbArtistResult | null = null;
  if (artist) {
    try {
      // Try by MBID first (more accurate), fall back to name search
      if (artistMbid) {
        tadbArtist = await tadbSearchArtistByMbid(artistMbid, tadbKey);
      }
      if (!tadbArtist) {
        tadbArtist = await tadbSearchArtist(artist, tadbKey);
      }
    } catch (err) {
      log.error("enrichTrack:tadb-artist", String(err));
    }
  }

  if (tadbArtist) {
    updates.tadbArtistId = tadbArtist.id;
    if (tadbArtist.biography && !updates.biography) updates.biography = tadbArtist.biography;
    if (tadbArtist.mood && !updates.mood) updates.mood = tadbArtist.mood;
    if (tadbArtist.style && !updates.style) updates.style = tadbArtist.style;
    if (tadbArtist.country && !updates.country) updates.country = tadbArtist.country;
    if (tadbArtist.label && !updates.label) updates.label = tadbArtist.label;
    if (tadbArtist.thumbUrl) artistImageUrl = tadbArtist.thumbUrl;
    if (!updates.genre && tadbArtist.genre) updates.genre = tadbArtist.genre;
  }

  // ── Step 5: TheAudioDB album search ───────────────────────────────
  let tadbAlbum: TadbAlbumResult | null = null;
  if (artist && album) {
    try {
      tadbAlbum = await tadbSearchAlbum(artist, album, tadbKey);
    } catch (err) {
      log.error("enrichTrack:tadb-album", String(err));
    }
  }

  if (tadbAlbum) {
    updates.tadbAlbumId = tadbAlbum.id;
    if (tadbAlbum.mood && !updates.mood) updates.mood = tadbAlbum.mood;
    if (tadbAlbum.style && !updates.style) updates.style = tadbAlbum.style;
    if (tadbAlbum.label && !updates.label) updates.label = tadbAlbum.label;
    if (tadbAlbum.year && !track.year) updates.year = tadbAlbum.year;
    if (!updates.genre && tadbAlbum.genre) updates.genre = tadbAlbum.genre;

    // TheAudioDB album art as fallback if CAA didn't find anything
    if (!coverArtUrl) {
      coverArtUrl = tadbAlbum.thumbHqUrl || tadbAlbum.thumbUrl || undefined;
    }
  }

  return { updates, coverArtUrl, artistImageUrl };
}

/**
 * Batch-enrich multiple tracks. Inserts delays between tracks to respect
 * rate limits across all sources.
 */
export async function enrichTracks(
  tracks: MusicTrack[],
  options: {
    tadbApiKey?: string;
    onProgress?: (current: number, total: number) => void;
  } = {},
): Promise<Map<string, EnrichmentResult>> {
  const results = new Map<string, EnrichmentResult>();
  const total = tracks.length;

  for (let i = 0; i < total; i++) {
    const track = tracks[i];
    options.onProgress?.(i + 1, total);
    try {
      const result = await enrichTrack(track, { tadbApiKey: options.tadbApiKey });
      results.set(track.id, result);
    } catch (err) {
      log.error("enrichTracks", `Failed for "${track.title}": ${err}`);
    }
    // Brief gap between tracks to avoid piling up requests
    if (i < total - 1) await delay(500);
  }

  return results;
}
