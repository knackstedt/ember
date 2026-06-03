const MB_BASE = "https://musicbrainz.org/ws/2";
const MB_COVER_BASE = "https://coverartarchive.org";

const headers = {
  "User-Agent": "HTPC/0.1.0 (htpc@localhost)",
  Accept: "application/json",
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MbArtistCredit {
  artist: { name: string; id: string; "sort-name"?: string };
  joinphrase?: string;
}

export interface MbRelease {
  id: string;
  title: string;
  date?: string;
  status?: string;
  country?: string;
  "artist-credit"?: MbArtistCredit[];
  "release-group"?: { id: string; "primary-type"?: string };
  "label-info"?: { label?: { name: string; id: string } }[];
  genres?: { name: string }[];
  media?: { position: number; "track-count": number; format?: string }[];
}

export interface MbRecording {
  id: string;
  title: string;
  length?: number;
  "artist-credit"?: MbArtistCredit[];
  releases?: MbRelease[];
  genres?: { name: string; count: number }[];
  tags?: { name: string; count: number }[];
}

export interface MbArtist {
  id: string;
  name: string;
  "sort-name"?: string;
  type?: string;
  country?: string;
  "life-span"?: { begin?: string; end?: string; ended?: boolean };
  genres?: { name: string; count: number }[];
  tags?: { name: string; count: number }[];
}

export interface MbReleaseGroup {
  id: string;
  title: string;
  "primary-type"?: string;
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit[];
}

export interface CoverArtImage {
  id: string;
  types: string[];
  front: boolean;
  back: boolean;
  image: string;
  comment?: string;
  approved: boolean;
  thumbnails: {
    250?: string;
    500?: string;
    1200?: string;
    small?: string;
    large?: string;
  };
}

export interface CoverArtResponse {
  images: CoverArtImage[];
  release: string;
}

export interface MbRecordingSearchResult {
  mbid: string;
  title: string;
  artistMbid?: string;
  artistName?: string;
  releaseMbid?: string;
  releaseTitle?: string;
  releaseGroupMbid?: string;
  genres?: string[];
  duration?: number;
  label?: string;
  country?: string;
  totalTracks?: number;
}

/* ------------------------------------------------------------------ */
/*  Recording search (enhanced)                                        */
/* ------------------------------------------------------------------ */

export async function searchRecording(
  title: string,
  artist?: string,
): Promise<{ mbid?: string; albumMbid?: string } | null> {
  try {
    const q = [`recording:"${title}"`, artist ? `artistname:"${artist}"` : ""]
      .filter(Boolean)
      .join(" AND ");

    const params = new URLSearchParams({ query: q, limit: "1", fmt: "json" });
    const res = await fetch(`${MB_BASE}/recording?${params}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const rec = data.recordings?.[0];
    if (!rec) return null;
    return {
      mbid: rec.id,
      albumMbid: rec.releases?.[0]?.id,
    };
  } catch {
    return null;
  }
}

/**
 * Search for a recording and return rich metadata from MusicBrainz.
 * Includes artist MBID, release group, genres, label, and country.
 */
export async function searchRecordingDetailed(
  title: string,
  artist?: string,
): Promise<MbRecordingSearchResult | null> {
  try {
    const q = [`recording:"${title}"`, artist ? `artistname:"${artist}"` : ""]
      .filter(Boolean)
      .join(" AND ");

    const params = new URLSearchParams({ query: q, limit: "1", fmt: "json" });
    const res = await fetch(`${MB_BASE}/recording?${params}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const rec = data.recordings?.[0] as MbRecording | undefined;
    if (!rec) return null;

    const artistCredit = rec["artist-credit"]?.[0];
    const release = rec.releases?.[0];
    const genres = rec.genres?.sort((a, b) => b.count - a.count).map((g) => g.name) ?? [];

    const result: MbRecordingSearchResult = {
      mbid: rec.id,
      title: rec.title,
      artistMbid: artistCredit?.artist.id,
      artistName: artistCredit?.artist.name,
      releaseMbid: release?.id,
      releaseTitle: release?.title,
      releaseGroupMbid: release?.["release-group"]?.id,
      genres: genres.length > 0 ? genres : undefined,
      duration: rec.length,
    };

    // If we have a release, fetch label and country
    if (release) {
      result.country = release.country;
      result.label = release["label-info"]?.[0]?.label?.name;
      const media = release.media?.[0];
      if (media) result.totalTracks = media["track-count"];
    }

    return result;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Artist lookup                                                       */
/* ------------------------------------------------------------------ */

/**
 * Lookup a MusicBrainz artist by MBID with genres and tags.
 */
export async function lookupArtist(
  artistMbid: string,
): Promise<MbArtist | null> {
  try {
    const params = new URLSearchParams({ fmt: "json", inc: "genres+tags" });
    const res = await fetch(`${MB_BASE}/artist/${artistMbid}?${params}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as MbArtist;
  } catch {
    return null;
  }
}

/**
 * Search for an artist by name.
 */
export async function searchArtist(
  name: string,
): Promise<MbArtist | null> {
  try {
    const params = new URLSearchParams({
      query: `artist:"${name}"`,
      limit: "1",
      fmt: "json",
    });
    const res = await fetch(`${MB_BASE}/artist?${params}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.artists?.[0] as MbArtist) ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Release lookup                                                      */
/* ------------------------------------------------------------------ */

/**
 * Lookup a MusicBrainz release by MBID with full details.
 */
export async function lookupRelease(
  releaseMbid: string,
): Promise<MbRelease | null> {
  try {
    const params = new URLSearchParams({
      fmt: "json",
      inc: "artist-credits+labels+genres+release-groups",
    });
    const res = await fetch(`${MB_BASE}/release/${releaseMbid}?${params}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as MbRelease;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Cover Art Archive                                                   */
/* ------------------------------------------------------------------ */

export async function getReleaseCoverUrl(
  releaseMbid: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${MB_COVER_BASE}/release/${releaseMbid}/front-250`, {
      method: "HEAD",
    });
    if (res.ok || res.redirected) {
      return `${MB_COVER_BASE}/release/${releaseMbid}/front-250`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch all cover art images for a release from the Cover Art Archive.
 * Returns structured metadata including thumbnails at multiple sizes.
 */
export async function getReleaseCoverArtList(
  releaseMbid: string,
): Promise<CoverArtResponse | null> {
  try {
    const res = await fetch(`${MB_COVER_BASE}/release/${releaseMbid}/`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as CoverArtResponse;
  } catch {
    return null;
  }
}

/**
 * Get front cover URL for a release-group (compilation/best-of cover).
 * Supports size variants: 250, 500, 1200 (pixels).
 */
export async function getReleaseGroupCoverUrl(
  releaseGroupMbid: string,
  size: 250 | 500 | 1200 = 500,
): Promise<string | null> {
  try {
    const url = `${MB_COVER_BASE}/release-group/${releaseGroupMbid}/front-${size}`;
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok || res.redirected) return url;
    return null;
  } catch {
    return null;
  }
}

/**
 * Get all cover art images for a release-group.
 */
export async function getReleaseGroupCoverArtList(
  releaseGroupMbid: string,
): Promise<CoverArtResponse | null> {
  try {
    const res = await fetch(`${MB_COVER_BASE}/release-group/${releaseGroupMbid}/`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as CoverArtResponse;
  } catch {
    return null;
  }
}
