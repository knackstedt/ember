/**
 * Base interface for deep-integrated streaming service adapters.
 * Each adapter knows how to authenticate, browse/search, and control playback
 * for a specific streaming service.
 */

export interface StreamingAdapterConfig {
  /** Client ID / API key for the service (user-provided) */
  clientId?: string;
  /** Stored access token */
  accessToken?: string;
  /** Stored refresh token */
  refreshToken?: string;
  /** Token expiry timestamp (epoch ms) */
  tokenExpiry?: number;
  /** Extra service-specific config as JSON string */
  extra?: string;
}

export interface StreamingSearchResult {
  id: string;
  name: string;
  type: "track" | "album" | "artist" | "playlist";
  uri?: string;
  thumbnailUrl?: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export interface StreamingTrack {
  id: string;
  name: string;
  uri: string;
  artist?: string;
  album?: string;
  duration?: number;
  thumbnailUrl?: string;
  trackNumber?: number;
}

export interface StreamingAlbum {
  id: string;
  name: string;
  uri: string;
  artist?: string;
  thumbnailUrl?: string;
  tracks: StreamingTrack[];
  year?: number;
}

export interface StreamingPlaylist {
  id: string;
  name: string;
  uri: string;
  thumbnailUrl?: string;
  owner?: string;
  tracks: StreamingTrack[];
  trackCount: number;
}

export interface StreamingDevice {
  id: string;
  name: string;
  type: "computer" | "smartphone" | "speaker" | "tv" | "game_console" | "automobile" | "cast_video" | "cast_audio" | "unknown";
  isActive: boolean;
  volumePercent?: number;
}

export interface CurrentlyPlaying {
  track?: StreamingTrack;
  isPlaying: boolean;
  progressMs?: number;
  device?: StreamingDevice;
}

export type StreamingAdapterState = "disconnected" | "connecting" | "connected" | "error";

export interface BaseStreamingAdapter {
  readonly serviceId: string;
  readonly serviceName: string;

  /** Current adapter state */
  getState(): StreamingAdapterState;

  /** Initialize with stored config */
  initialize(config: StreamingAdapterConfig): Promise<void>;

  /** Start OAuth 2.0 authentication flow (returns new config with tokens) */
  authenticate(): Promise<StreamingAdapterConfig>;

  /** Disconnect and clear tokens */
  disconnect(): Promise<void>;

  /** Search for content */
  search(query: string, types?: ("track" | "album" | "artist" | "playlist")[]): Promise<StreamingSearchResult[]>;

  /** Get track details */
  getTrack(id: string): Promise<StreamingTrack | null>;

  /** Get album with tracks */
  getAlbum(id: string): Promise<StreamingAlbum | null>;

  /** Get playlist with tracks */
  getPlaylist(id: string): Promise<StreamingPlaylist | null>;

  /** Get what's currently playing */
  getCurrentlyPlaying(): Promise<CurrentlyPlaying | null>;

  /** Start playback on active device (URI optional — resumes if omitted) */
  play(uri?: string): Promise<void>;

  /** Pause playback */
  pause(): Promise<void>;

  /** Skip to next track */
  next(): Promise<void>;

  /** Skip to previous track */
  previous(): Promise<void>;

  /** List available playback devices */
  getDevices(): Promise<StreamingDevice[]>;
}
