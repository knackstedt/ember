import { createHash, randomBytes } from "crypto";
import {
  BaseStreamingAdapter,
  StreamingAdapterConfig,
  StreamingSearchResult,
  StreamingTrack,
  StreamingAlbum,
  StreamingPlaylist,
  StreamingDevice,
  CurrentlyPlaying,
  StreamingAdapterState,
} from "./base.adapter";
import { startOAuthFlow } from "../../oauth-webview";
import { createLogger } from "../../../util/logger";

const log = createLogger("info");

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";
const REDIRECT_URI = "http://localhost:9876/callback";

function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  return base64urlEncode(randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  return base64urlEncode(createHash("sha256").update(verifier).digest());
}

export class SpotifyAdapter implements BaseStreamingAdapter {
  readonly serviceId = "spotify";
  readonly serviceName = "Spotify";

  private state: StreamingAdapterState = "disconnected";
  private config: StreamingAdapterConfig = {};

  getState(): StreamingAdapterState {
    return this.state;
  }

  async initialize(config: StreamingAdapterConfig): Promise<void> {
    this.config = { ...config };
    if (this.config.accessToken) {
      const valid = await this.checkTokenValid();
      this.state = valid ? "connected" : "disconnected";
    }
  }

  async authenticate(): Promise<StreamingAdapterConfig> {
    if (!this.config.clientId) {
      throw new Error("Spotify client ID is required. Set it in settings.");
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const scopes = [
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
      "streaming",
      "playlist-read-private",
      "playlist-read-collaborative",
      "user-library-read",
      "user-read-private",
    ].join(" ");

    const authUrl =
      `${SPOTIFY_AUTH_URL}?client_id=${encodeURIComponent(this.config.clientId)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}`;

    log.info("spotify:adapter", "Starting OAuth flow");
    this.state = "connecting";

    const result = await startOAuthFlow(authUrl, [
      "^http://localhost:9876/callback",
    ]);

    if (!result.success || !result.token) {
      this.state = "error";
      throw new Error(result.error || "OAuth flow failed or was cancelled");
    }

    // Exchange code for tokens
    const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: result.token,
        redirect_uri: REDIRECT_URI,
        client_id: this.config.clientId,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "unknown");
      this.state = "error";
      throw new Error(`Token exchange failed: ${tokenRes.status} ${body}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    this.config.accessToken = tokenData.access_token;
    if (tokenData.refresh_token) {
      this.config.refreshToken = tokenData.refresh_token;
    }
    this.config.tokenExpiry = Date.now() + tokenData.expires_in * 1000;
    this.state = "connected";

    log.info("spotify:adapter", "Authenticated successfully");
    return { ...this.config };
  }

  async disconnect(): Promise<void> {
    this.config.accessToken = undefined;
    this.config.refreshToken = undefined;
    this.config.tokenExpiry = undefined;
    this.state = "disconnected";
  }

  // ---------------------------------------------------------------------------
  // API helpers
  // ---------------------------------------------------------------------------

  private async ensureToken(): Promise<string> {
    const token = this.config.accessToken;
    if (!token) throw new Error("Not authenticated with Spotify");

    if (this.config.tokenExpiry && Date.now() >= this.config.tokenExpiry - 60000) {
      await this.refreshToken();
    }

    if (!this.config.accessToken) throw new Error("Token refresh failed");
    return this.config.accessToken;
  }

  private async refreshToken(): Promise<void> {
    if (!this.config.refreshToken || !this.config.clientId) {
      this.state = "disconnected";
      throw new Error("No refresh token available");
    }

    log.info("spotify:adapter", "Refreshing access token");
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.config.refreshToken,
        client_id: this.config.clientId,
      }),
    });

    if (!res.ok) {
      this.state = "disconnected";
      throw new Error(`Token refresh failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    this.config.accessToken = data.access_token;
    if (data.refresh_token) {
      this.config.refreshToken = data.refresh_token;
    }
    this.config.tokenExpiry = Date.now() + data.expires_in * 1000;
    this.state = "connected";
  }

  private async apiGet<T>(path: string): Promise<T> {
    const token = await this.ensureToken();
    const res = await fetch(`${SPOTIFY_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      this.state = "disconnected";
      throw new Error("Spotify token expired or invalid");
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "unknown");
      throw new Error(`Spotify API error: ${res.status} ${body}`);
    }
    if (res.status === 204) {
      return undefined as unknown as T;
    }
    return res.json() as Promise<T>;
  }

  private async apiPut(path: string, body?: unknown): Promise<void> {
    const token = await this.ensureToken();
    const res = await fetch(`${SPOTIFY_API_URL}${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      this.state = "disconnected";
      throw new Error("Spotify token expired or invalid");
    }
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "unknown");
      throw new Error(`Spotify API error: ${res.status} ${text}`);
    }
  }

  private async apiPost(path: string, body?: unknown): Promise<void> {
    const token = await this.ensureToken();
    const res = await fetch(`${SPOTIFY_API_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      this.state = "disconnected";
      throw new Error("Spotify token expired or invalid");
    }
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "unknown");
      throw new Error(`Spotify API error: ${res.status} ${text}`);
    }
  }

  private async checkTokenValid(): Promise<boolean> {
    try {
      await this.apiGet("/me");
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API methods
  // ---------------------------------------------------------------------------

  async search(
    query: string,
    types: ("track" | "album" | "artist" | "playlist")[] = ["track", "album", "artist", "playlist"],
  ): Promise<StreamingSearchResult[]> {
    const typeStr = types.join(",");
    const data = await this.apiGet<{
      tracks?: { items: SpotifyTrack[] };
      albums?: { items: SpotifyAlbumSlim[] };
      artists?: { items: SpotifyArtist[] };
      playlists?: { items: SpotifyPlaylistSlim[] };
    }>(`/search?q=${encodeURIComponent(query)}&type=${typeStr}&limit=20`);

    const results: StreamingSearchResult[] = [];

    if (data.tracks?.items) {
      for (const t of data.tracks.items) {
        results.push({
          id: t.id,
          name: t.name,
          type: "track",
          uri: t.uri,
          thumbnailUrl: t.album?.images?.[0]?.url,
          artist: t.artists?.map((a) => a.name).join(", "),
          album: t.album?.name,
          duration: t.duration_ms,
        });
      }
    }

    if (data.albums?.items) {
      for (const a of data.albums.items) {
        results.push({
          id: a.id,
          name: a.name,
          type: "album",
          uri: a.uri,
          thumbnailUrl: a.images?.[0]?.url,
          artist: a.artists?.map((ar) => ar.name).join(", "),
        });
      }
    }

    if (data.artists?.items) {
      for (const a of data.artists.items) {
        results.push({
          id: a.id,
          name: a.name,
          type: "artist",
          uri: a.uri,
          thumbnailUrl: a.images?.[0]?.url,
        });
      }
    }

    if (data.playlists?.items) {
      for (const p of data.playlists.items) {
        results.push({
          id: p.id,
          name: p.name,
          type: "playlist",
          uri: p.uri,
          thumbnailUrl: p.images?.[0]?.url,
          artist: p.owner?.display_name || p.owner?.id,
        });
      }
    }

    return results;
  }

  async getTrack(id: string): Promise<StreamingTrack | null> {
    const t = await this.apiGet<SpotifyTrack>(`/tracks/${encodeURIComponent(id)}`);
    if (!t) return null;
    return {
      id: t.id,
      name: t.name,
      uri: t.uri,
      artist: t.artists?.map((a) => a.name).join(", "),
      album: t.album?.name,
      duration: t.duration_ms,
      thumbnailUrl: t.album?.images?.[0]?.url,
      trackNumber: t.track_number,
    };
  }

  async getAlbum(id: string): Promise<StreamingAlbum | null> {
    const data = await this.apiGet<SpotifyAlbum>(`/albums/${encodeURIComponent(id)}`);
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      uri: data.uri,
      artist: data.artists?.map((a) => a.name).join(", "),
      thumbnailUrl: data.images?.[0]?.url,
      year: data.release_date ? parseInt(data.release_date.slice(0, 4), 10) : undefined,
      tracks: data.tracks?.items?.map((t) => ({
        id: t.id,
        name: t.name,
        uri: t.uri,
        artist: t.artists?.map((a) => a.name).join(", "),
        duration: t.duration_ms,
        trackNumber: t.track_number,
      })) ?? [],
    };
  }

  async getPlaylist(id: string): Promise<StreamingPlaylist | null> {
    const data = await this.apiGet<SpotifyPlaylist>(`/playlists/${encodeURIComponent(id)}`);
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      uri: data.uri,
      thumbnailUrl: data.images?.[0]?.url,
      owner: data.owner?.display_name || data.owner?.id,
      trackCount: data.tracks?.total ?? 0,
      tracks: (data.tracks?.items?.map((item): StreamingTrack | null => {
        const t = item.track;
        if (!t) return null;
        return {
          id: t.id,
          name: t.name,
          uri: t.uri,
          artist: t.artists?.map((a) => a.name).join(", "),
          album: t.album?.name,
          duration: t.duration_ms,
          thumbnailUrl: t.album?.images?.[0]?.url,
          trackNumber: t.track_number,
        };
      }).filter((t) => t !== null) ?? []) as StreamingTrack[],
    };
  }

  async getCurrentlyPlaying(): Promise<CurrentlyPlaying | null> {
    try {
      const data = await this.apiGet<{
        is_playing: boolean;
        progress_ms: number;
        item: SpotifyTrack | null;
        device: SpotifyDevice | null;
      }>("/me/player/currently-playing");

      if (!data || !data.item) return null;

      return {
        isPlaying: data.is_playing ?? false,
        progressMs: data.progress_ms,
        track: {
          id: data.item.id,
          name: data.item.name,
          uri: data.item.uri,
          artist: data.item.artists?.map((a) => a.name).join(", "),
          album: data.item.album?.name,
          duration: data.item.duration_ms,
          thumbnailUrl: data.item.album?.images?.[0]?.url,
          trackNumber: data.item.track_number,
        },
        device: data.device
          ? {
              id: data.device.id || "unknown",
              name: data.device.name,
              type: data.device.type?.toLowerCase() as StreamingDevice["type"],
              isActive: data.device.is_active ?? false,
              volumePercent: data.device.volume_percent,
            }
          : undefined,
      };
    } catch {
      return null;
    }
  }

  async play(uri?: string): Promise<void> {
    if (uri) {
      await this.apiPut("/me/player/play", { uris: [uri] });
    } else {
      await this.apiPut("/me/player/play");
    }
  }

  async pause(): Promise<void> {
    await this.apiPut("/me/player/pause");
  }

  async next(): Promise<void> {
    await this.apiPost("/me/player/next");
  }

  async previous(): Promise<void> {
    await this.apiPost("/me/player/previous");
  }

  async getDevices(): Promise<StreamingDevice[]> {
    const data = await this.apiGet<{ devices: SpotifyDevice[] }>("/me/player/devices");
    return (
      data.devices?.map((d) => ({
        id: d.id || "unknown",
        name: d.name,
        type: d.type?.toLowerCase() as StreamingDevice["type"],
        isActive: d.is_active ?? false,
        volumePercent: d.volume_percent,
      })) ?? []
    );
  }
}

// ---------------------------------------------------------------------------
// Spotify API response types (internal)
// ---------------------------------------------------------------------------

interface SpotifyImage {
  url: string;
  height?: number;
  width?: number;
}

interface SpotifyArtist {
  id: string;
  name: string;
  uri?: string;
  images?: SpotifyImage[];
}

interface SpotifyAlbumSlim {
  id: string;
  name: string;
  uri: string;
  artists?: SpotifyArtist[];
  images?: SpotifyImage[];
}

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbumSlim;
  duration_ms: number;
  track_number?: number;
}

interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  artists?: SpotifyArtist[];
  images?: SpotifyImage[];
  release_date?: string;
  tracks?: {
    items: SpotifyTrack[];
  };
}

interface SpotifyPlaylistSlim {
  id: string;
  name: string;
  uri: string;
  owner?: { id: string; display_name?: string };
  images?: SpotifyImage[];
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  owner?: { id: string; display_name?: string };
  images?: SpotifyImage[];
  tracks?: {
    total: number;
    items: { track: SpotifyTrack | null }[];
  };
}

interface SpotifyDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent?: number;
}
