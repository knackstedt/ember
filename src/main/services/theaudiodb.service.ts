import { createLogger } from "../util/logger";

const log = createLogger("info");

const TADB_BASE = "https://www.theaudiodb.com/api/v1/json";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TadbArtist {
  idArtist: string;
  strArtist: string;
  strArtistAlternate?: string;
  strLabel?: string;
  idLabel?: string;
  intFormedYear?: string;
  intBornYear?: string;
  intDiedYear?: string;
  strDisbanded?: string;
  strStyle?: string;
  strGenre?: string;
  strMood?: string;
  strWebsite?: string;
  strFacebook?: string;
  strTwitter?: string;
  strBiographyEN?: string;
  strCountry?: string;
  strCountryCode?: string;
  strArtistThumb?: string;
  strArtistLogo?: string;
  strArtistCutout?: string;
  strArtistClearart?: string;
  strArtistWideThumb?: string;
  strArtistFanart?: string;
  strArtistFanart2?: string;
  strArtistFanart3?: string;
  strArtistFanart4?: string;
  strArtistBanner?: string;
  strMusicBrainzID?: string;
}

export interface TadbAlbum {
  idAlbum: string;
  idArtist: string;
  strAlbum: string;
  strArtist?: string;
  intYearReleased?: string;
  strStyle?: string;
  strGenre?: string;
  strMood?: string;
  strLabel?: string;
  strDescriptionEN?: string;
  strAlbumThumb?: string;
  strAlbumThumbHQ?: string;
  strAlbumThumbBack?: string;
  strAlbumCDart?: string;
  strAlbumSpine?: string;
  strAlbum3DCase?: string;
  strAlbum3DFlat?: string;
  strAlbum3DFace?: string;
  strAlbum3DThumb?: string;
  intScore?: string;
  strMusicBrainzID?: string;
  strMusicBrainzArtistID?: string;
}

export interface TadbTrack {
  idTrack: string;
  idAlbum: string;
  idArtist: string;
  strTrack: string;
  strAlbum?: string;
  strArtist?: string;
  intDuration?: string;
  strGenre?: string;
  strMood?: string;
  strStyle?: string;
  strDescriptionEN?: string;
  strTrackThumb?: string;
  strMusicVid?: string;
  intTrackNumber?: string;
  strMusicBrainzID?: string;
}

/* ------------------------------------------------------------------ */
/*  Normalized result types                                            */
/* ------------------------------------------------------------------ */

export interface TadbArtistResult {
  id: number;
  name: string;
  genre?: string;
  mood?: string;
  style?: string;
  biography?: string;
  country?: string;
  thumbUrl?: string;
  logoUrl?: string;
  fanartUrl?: string;
  bannerUrl?: string;
  mbid?: string;
  label?: string;
}

export interface TadbAlbumResult {
  id: number;
  artistId: number;
  title: string;
  artist?: string;
  year?: number;
  genre?: string;
  mood?: string;
  style?: string;
  label?: string;
  description?: string;
  thumbUrl?: string;
  thumbHqUrl?: string;
  cdArtUrl?: string;
  mbid?: string;
}

/* ------------------------------------------------------------------ */
/*  API functions                                                       */
/* ------------------------------------------------------------------ */

/**
 * Search for an artist by name on TheAudioDB.
 */
export async function searchArtist(
  artistName: string,
  apiKey = "2",
): Promise<TadbArtistResult | null> {
  if (!artistName) return null;
  try {
    const url = `${TADB_BASE}/${apiKey}/search.php?s=${encodeURIComponent(artistName)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HTPC/0.1.0 (htpc@localhost)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { artists?: TadbArtist[] | null };
    const artist = data.artists?.[0];
    if (!artist) return null;

    return {
      id: parseInt(artist.idArtist, 10),
      name: artist.strArtist,
      genre: artist.strGenre || undefined,
      mood: artist.strMood || undefined,
      style: artist.strStyle || undefined,
      biography: artist.strBiographyEN || undefined,
      country: artist.strCountry || undefined,
      thumbUrl: artist.strArtistThumb || undefined,
      logoUrl: artist.strArtistLogo || undefined,
      fanartUrl: artist.strArtistFanart || undefined,
      bannerUrl: artist.strArtistBanner || undefined,
      mbid: artist.strMusicBrainzID || undefined,
      label: artist.strLabel || undefined,
    };
  } catch (err) {
    log.error("tadb:searchArtist", String(err));
    return null;
  }
}

/**
 * Search for an album by artist + album name on TheAudioDB.
 */
export async function searchAlbum(
  artistName: string,
  albumName: string,
  apiKey = "2",
): Promise<TadbAlbumResult | null> {
  if (!artistName || !albumName) return null;
  try {
    const url = `${TADB_BASE}/${apiKey}/searchalbum.php?s=${encodeURIComponent(artistName)}&a=${encodeURIComponent(albumName)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HTPC/0.1.0 (htpc@localhost)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { album?: TadbAlbum[] | null };
    const album = data.album?.[0];
    if (!album) return null;

    return {
      id: parseInt(album.idAlbum, 10),
      artistId: parseInt(album.idArtist, 10),
      title: album.strAlbum,
      artist: album.strArtist || undefined,
      year: album.intYearReleased ? parseInt(album.intYearReleased, 10) : undefined,
      genre: album.strGenre || undefined,
      mood: album.strMood || undefined,
      style: album.strStyle || undefined,
      label: album.strLabel || undefined,
      description: album.strDescriptionEN || undefined,
      thumbUrl: album.strAlbumThumb || undefined,
      thumbHqUrl: album.strAlbumThumbHQ || undefined,
      cdArtUrl: album.strAlbumCDart || undefined,
      mbid: album.strMusicBrainzID || undefined,
    };
  } catch (err) {
    log.error("tadb:searchAlbum", String(err));
    return null;
  }
}

/**
 * Get artist details by TheAudioDB artist ID.
 */
export async function getArtistById(
  artistId: number,
  apiKey = "2",
): Promise<TadbArtistResult | null> {
  try {
    const url = `${TADB_BASE}/${apiKey}/artist.php?i=${artistId}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HTPC/0.1.0 (htpc@localhost)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { artists?: TadbArtist[] | null };
    const artist = data.artists?.[0];
    if (!artist) return null;

    return {
      id: parseInt(artist.idArtist, 10),
      name: artist.strArtist,
      genre: artist.strGenre || undefined,
      mood: artist.strMood || undefined,
      style: artist.strStyle || undefined,
      biography: artist.strBiographyEN || undefined,
      country: artist.strCountry || undefined,
      thumbUrl: artist.strArtistThumb || undefined,
      logoUrl: artist.strArtistLogo || undefined,
      fanartUrl: artist.strArtistFanart || undefined,
      bannerUrl: artist.strArtistBanner || undefined,
      mbid: artist.strMusicBrainzID || undefined,
      label: artist.strLabel || undefined,
    };
  } catch (err) {
    log.error("tadb:getArtistById", String(err));
    return null;
  }
}

/**
 * Get album details by TheAudioDB album ID.
 */
export async function getAlbumById(
  albumId: number,
  apiKey = "2",
): Promise<TadbAlbumResult | null> {
  try {
    const url = `${TADB_BASE}/${apiKey}/album.php?m=${albumId}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HTPC/0.1.0 (htpc@localhost)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { album?: TadbAlbum[] | null };
    const album = data.album?.[0];
    if (!album) return null;

    return {
      id: parseInt(album.idAlbum, 10),
      artistId: parseInt(album.idArtist, 10),
      title: album.strAlbum,
      artist: album.strArtist || undefined,
      year: album.intYearReleased ? parseInt(album.intYearReleased, 10) : undefined,
      genre: album.strGenre || undefined,
      mood: album.strMood || undefined,
      style: album.strStyle || undefined,
      label: album.strLabel || undefined,
      description: album.strDescriptionEN || undefined,
      thumbUrl: album.strAlbumThumb || undefined,
      thumbHqUrl: album.strAlbumThumbHQ || undefined,
      cdArtUrl: album.strAlbumCDart || undefined,
      mbid: album.strMusicBrainzID || undefined,
    };
  } catch (err) {
    log.error("tadb:getAlbumById", String(err));
    return null;
  }
}

/**
 * Search for an artist by MusicBrainz ID on TheAudioDB.
 */
export async function searchArtistByMbid(
  mbid: string,
  apiKey = "2",
): Promise<TadbArtistResult | null> {
  if (!mbid) return null;
  try {
    const url = `${TADB_BASE}/${apiKey}/artist-mb.php?i=${encodeURIComponent(mbid)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HTPC/0.1.0 (htpc@localhost)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { artists?: TadbArtist[] | null };
    const artist = data.artists?.[0];
    if (!artist) return null;

    return {
      id: parseInt(artist.idArtist, 10),
      name: artist.strArtist,
      genre: artist.strGenre || undefined,
      mood: artist.strMood || undefined,
      style: artist.strStyle || undefined,
      biography: artist.strBiographyEN || undefined,
      country: artist.strCountry || undefined,
      thumbUrl: artist.strArtistThumb || undefined,
      logoUrl: artist.strArtistLogo || undefined,
      fanartUrl: artist.strArtistFanart || undefined,
      bannerUrl: artist.strArtistBanner || undefined,
      mbid: artist.strMusicBrainzID || undefined,
      label: artist.strLabel || undefined,
    };
  } catch (err) {
    log.error("tadb:searchArtistByMbid", String(err));
    return null;
  }
}
