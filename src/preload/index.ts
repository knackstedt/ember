import { contextBridge, ipcRenderer, shell, webFrame } from "electron";
import { join } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import {
  AppSettings,
  Game,
  GameEmulatorConfig,
  WineRunner,
  GamePlatform,
  Movie,
  MusicTrack,
  TVShow,
  NormalizedInputEvent,
  ControllerDevice,
  ButtonMapping,
  ScanProgress,
  Collection,
  CollectionItem,
  Playlist,
  SmartFilterGroup,
  StreamingService,
  ExtensionInstallResult,
  StreamingExtension,
  ManagedPackage,
  PackageOperationProgress,
  AudioTags,
  ReorganizeResult,
  StreamingAdapterConfig,
  StreamingSearchResult,
  StreamingTrack,
  StreamingAlbum,
  StreamingPlaylist,
  StreamingDevice,
  CurrentlyPlaying,
  RemoteTestResult,
  DiscoveredDevice,
  UpdaterState,
  GitHubRelease,
  OAuthResult,
} from "../shared/types";
import { GameMetadata } from "../shared/metadata";

import { libretroApi } from "./libretro";
import { WebGLVideoRenderer } from "./webgl-renderer";
import { ffmpegVideoDecoder } from "./ffmpeg-decoder";

function findFileRecursive(dir: string, targetName: string): string | null {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          const found = findFileRecursive(full, targetName);
          if (found) return found;
        } else if (entry === targetName) {
          return full;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore unreadable dirs
  }
  return null;
}

// ---------------------------------------------------------------------------
// Video decoder — mpv worker (child process) when available, otherwise
// ffmpeg child-process fallback.
// ---------------------------------------------------------------------------

let mpvAvailable: boolean | null = null;
function isMpvAvailable(): boolean {
  if (mpvAvailable !== null) return mpvAvailable;
  try {
    const start = performance.now();
    mpvAvailable = ipcRenderer.sendSync("mpv:available");
    const elapsed = performance.now() - start;
    if (elapsed > 20) {
      console.warn(`[preload] mpv:available sendSync took ${elapsed.toFixed(1)}ms`);
    }
  } catch {
    mpvAvailable = false;
  }
  return mpvAvailable ?? false;
}

// Frame cache for mpv worker path — rendered immediately on arrival.
const mpvRenderers = new Map<string, WebGLVideoRenderer>();
const mpvLatestFrame = new Map<string, { width: number; height: number; timestampMs: number }>();
const mpvPendingEvents = new Map<string, string>();

ipcRenderer.on("mpv:event", (_e, payload: { id: string; event: string }) => {
  mpvPendingEvents.set(payload.id, payload.event);
});

ipcRenderer.on("mpv:frame", (_e, payload: { id: string; width: number; height: number; data: any; timestampMs: number }) => {
  const renderer = mpvRenderers.get(payload.id);
  if (renderer) {
    const data = payload.data instanceof Uint8Array ? payload.data : new Uint8Array(payload.data);
    const expected = payload.width * payload.height * 4;
    if (data.length === expected) {
      renderer.render(data, payload.width, payload.height);
    }
    mpvLatestFrame.set(payload.id, {
      width: payload.width,
      height: payload.height,
      timestampMs: payload.timestampMs,
    });
  }
});

async function resolveVideoPath(path: string): Promise<string> {
  if (path.startsWith("ember://remote/")) {
    throw new Error(`Unresolved remote URL passed to decoder: ${path}.`);
  }
  if (
    path &&
    !path.startsWith("/") &&
    !path.startsWith("http://") &&
    !path.startsWith("https://") &&
    !path.startsWith("file://") &&
    !path.startsWith("ember://")
  ) {
    if (existsSync(path)) return path;
    const videosDir = join(
      process.env.XDG_VIDEOS_DIR ?? join(homedir(), "Videos"),
    );
    const candidate = join(videosDir, path);
    if (existsSync(candidate)) return candidate;
    const basename = path.split("/").pop() || path;
    const found = findFileRecursive(videosDir, basename);
    if (found) return found;
    throw new Error(`Video file not found: ${path}.`);
  }
  return path;
}

const videoDecoderApi = {
  async create(id: string): Promise<boolean> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:create", id);
    } else {
      ffmpegVideoDecoder.create(id);
    }
    return true;
  },
  async open(id: string, path: string): Promise<void> {
    const resolved = await resolveVideoPath(path);
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:open", id, resolved);
    } else {
      await ffmpegVideoDecoder.open(id, resolved);
    }
  },
  attachCanvas(id: string, canvasId: string): boolean {
    if (isMpvAvailable()) {
      let canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
      if (!canvas) {
        for (let i = 0; i < 20; i++) {
          canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
          if (canvas) break;
          const start = Date.now();
          while (Date.now() - start < 5) { /* spin */ }
        }
      }
      if (!canvas) throw new Error(`Canvas #${canvasId} not found`);
      mpvRenderers.set(id, new WebGLVideoRenderer(canvas));
      return true;
    }
    return ffmpegVideoDecoder.attachCanvas(id, canvasId);
  },
  resizeCanvas(id: string, width: number, height: number): void {
    if (isMpvAvailable()) {
      const renderer = mpvRenderers.get(id);
      if (renderer) renderer.resize(width, height);
      const dpr = window.devicePixelRatio || 1;
      ipcRenderer.invoke("mpv:setRenderSize", id, Math.floor(width * dpr), Math.floor(height * dpr));
    } else {
      ffmpegVideoDecoder.resizeCanvas(id, width, height);
    }
  },
  renderNextFrame(id: string): { width: number; height: number } | null {
    if (isMpvAvailable()) {
      const frame = mpvLatestFrame.get(id);
      // Return cached metadata if available; otherwise return a dummy so the
      // rAF pump doesn't kill itself before the first IPC frame arrives.
      return frame ? { width: frame.width, height: frame.height } : { width: 1, height: 1 };
    }
    return ffmpegVideoDecoder.renderNextFrame(id);
  },
  getMpvEvent(id: string): string | null {
    if (!isMpvAvailable()) return null;
    const ev = mpvPendingEvents.get(id) ?? null;
    mpvPendingEvents.delete(id);
    return ev;
  },
  async seek(id: string, timestampMs: number): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:seek", id, timestampMs);
    } else {
      ffmpegVideoDecoder.seek(id, timestampMs);
    }
  },
  async pause(id: string): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:pause", id);
    } else {
      ffmpegVideoDecoder.pause(id);
    }
  },
  async resume(id: string): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:play", id);
    } else {
      ffmpegVideoDecoder.resume(id);
    }
  },
  async getMetadata(id: string): Promise<{
    width: number;
    height: number;
    durationMs: number;
    frameRate: number;
  }> {
    if (isMpvAvailable()) {
      const meta = await ipcRenderer.invoke("mpv:getMetadata", id);
      if (!meta) throw new Error("Decoder not opened");
      return meta;
    }
    const meta = ffmpegVideoDecoder.getMetadata(id);
    if (!meta) throw new Error("Decoder not opened");
    return meta;
  },
  async setCurrentTime(id: string, timeMs: number): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:setCurrentTime", id, timeMs);
    } else {
      ffmpegVideoDecoder.setCurrentTime(id, timeMs);
    }
  },
  async getCurrentTime(id: string): Promise<number> {
    if (isMpvAvailable()) {
      return await ipcRenderer.invoke("mpv:getTimePosMs", id);
    }
    return ffmpegVideoDecoder.getCurrentTime(id);
  },
  async destroy(id: string): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:destroy", id);
      mpvRenderers.delete(id);
      mpvLatestFrame.delete(id);
    } else {
      ffmpegVideoDecoder.destroy(id);
    }
  },
  resolveUrl(path: string): Promise<string> {
    return ipcRenderer.invoke("videoDecoder:resolveUrl", path);
  },
  resolveSubtitlePaths(videoPath: string): Promise<string[]> {
    return ipcRenderer.invoke("videoDecoder:resolveSubtitlePaths", videoPath);
  },
  // Subtitle / Audio / Chapter APIs (mpv only; no-op on ffmpeg fallback)
  async listSubtitleTracks(id: string): Promise<Array<{ id: number; title?: string; lang?: string; selected?: boolean; default?: boolean }>> {
    if (isMpvAvailable()) {
      return await ipcRenderer.invoke("mpv:listSubtitleTracks", id);
    }
    return [];
  },
  async selectSubtitleTrack(id: string, trackId: number): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:selectSubtitleTrack", id, trackId);
    }
  },
  async loadExternalSubtitle(id: string, path: string): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:loadExternalSubtitle", id, path);
    }
  },
  async listAudioTracks(id: string): Promise<Array<{ id: number; title?: string; lang?: string; selected?: boolean; default?: boolean }>> {
    if (isMpvAvailable()) {
      return await ipcRenderer.invoke("mpv:listAudioTracks", id);
    }
    return [];
  },
  async selectAudioTrack(id: string, trackId: number): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:selectAudioTrack", id, trackId);
    }
  },
  async getVolume(id: string): Promise<number> {
    if (isMpvAvailable()) {
      return await ipcRenderer.invoke("mpv:getVolume", id);
    }
    return 100;
  },
  async setVolume(id: string, vol: number): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:setVolume", id, vol);
    }
  },
  async getMute(id: string): Promise<boolean> {
    if (isMpvAvailable()) {
      return await ipcRenderer.invoke("mpv:getMute", id);
    }
    return false;
  },
  async setMute(id: string, mute: boolean): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:setMute", id, mute);
    }
  },
  async getSpeed(id: string): Promise<number> {
    if (isMpvAvailable()) {
      return await ipcRenderer.invoke("mpv:getSpeed", id);
    }
    return 1;
  },
  async setSpeed(id: string, speed: number): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:setSpeed", id, speed);
    }
  },
  async listChapters(id: string): Promise<Array<{ index: number; title: string; timeMs: number }>> {
    if (isMpvAvailable()) {
      return await ipcRenderer.invoke("mpv:listChapters", id);
    }
    return [];
  },
  async getChapter(id: string): Promise<number> {
    if (isMpvAvailable()) {
      return await ipcRenderer.invoke("mpv:getChapter", id);
    }
    return -1;
  },
  async setChapter(id: string, idx: number): Promise<void> {
    if (isMpvAvailable()) {
      await ipcRenderer.invoke("mpv:setChapter", id, idx);
    }
  },
};

const htpc = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
    set: (partial: Partial<AppSettings>): Promise<void> =>
      ipcRenderer.invoke("settings:set", partial),
  },

  app: {
    setFullscreen: (value: boolean): Promise<void> =>
      ipcRenderer.invoke("app:fullscreen", value),
    quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),
    restart: (): Promise<void> => ipcRenderer.invoke("app:restart"),
    shutdown: (): Promise<void> => ipcRenderer.invoke("app:shutdown"),
    getXdgDefaults: (): Promise<{
      videosDir: string;
      musicDir: string;
      roms: string[];
      steam: string[];
      heroic: string[];
      lutris: string[];
      desktop: string[];
      retroarch: string[];
      bottles: string[];
      itch: string[];
      kodi: string[];
      jellyfin: string[];
      plex: string[];
      mounts: string[];
    }> =>
      ipcRenderer.invoke("app:xdg-defaults"),
    getPreloadPath: (name: string): Promise<string> =>
      ipcRenderer.invoke("app:getPreloadPath", name),
    zoomIn: (): void => {
      const level = webFrame.getZoomLevel();
      webFrame.setZoomLevel(level + 1);
    },
    zoomOut: (): void => {
      const level = webFrame.getZoomLevel();
      webFrame.setZoomLevel(level - 1);
    },
    resetZoom: (): void => {
      webFrame.setZoomLevel(0);
    },
  },

  games: {
    scan: (extraPaths?: string[]): Promise<void> =>
      ipcRenderer.invoke("games:scan", extraPaths),
    list: (): Promise<Game[]> => ipcRenderer.invoke("games:list"),
    launch: (game: Game): Promise<void> =>
      ipcRenderer.invoke("games:launch", game),
    favorite: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("games:favorite", id, value),
    tag: (id: string, tags: string[]): Promise<void> =>
      ipcRenderer.invoke("games:tag", id, tags),
    // Legacy metadata fetcher
    fetchMetadata: (title: string, steamAppId?: number): Promise<unknown> =>
      ipcRenderer.invoke("games:metadata", title, steamAppId),

    // New comprehensive metadata APIs
    searchMetadata: (title: string, platform?: string, steamAppId?: number): Promise<GameMetadata | null> =>
      ipcRenderer.invoke("games:metadata:search", title, platform, steamAppId),

    fetchMetadataByIds: (options: {
      steamAppId?: number;
      igdbId?: number;
      rawgSlug?: string;
      mobyGamesId?: string;
      theGamesDbId?: string;
      launchBoxDbId?: string;
    }): Promise<GameMetadata | null> =>
      ipcRenderer.invoke("games:metadata:fetch", options),

    enrichMetadata: (game: { title: string; platform?: string; steamAppId?: number }): Promise<GameMetadata | null> =>
      ipcRenderer.invoke("games:metadata:enrich", game),

    quickMetadata: (title: string, platform?: string): Promise<GameMetadata | null> =>
      ipcRenderer.invoke("games:metadata:quick", title, platform),

    getMetadataProviders: (): Promise<{
      all: string[];
      primary: string[];
      retro: string[];
      artwork: string[];
      video: string[];
      supplementary: string[];
    }> => ipcRenderer.invoke("games:metadata:providers"),

    // Lazy loading APIs for detail view
    fetchLazyMetadata: (options: {
      gameId: string;
      title: string;
      platform?: string;
      steamAppId?: number;
      igdbId?: number;
      rawgSlug?: string;
      theGamesDbId?: string;
      launchBoxDbId?: string;
    }): Promise<GameMetadata | null> =>
      ipcRenderer.invoke("games:metadata:lazy", options),

    fetchAchievements: (options: {
      gameId: string;
      consoleId?: number;
      steamAppId?: number;
      retroAchievementsGameId?: number;
    }): Promise<{ achievements: unknown[]; count: number }> =>
      ipcRenderer.invoke("games:metadata:achievements", options),

    fetchArtwork: (options: {
      gameId: string;
      steamAppId?: number;
      theGamesDbId?: string;
      title?: string;
    }): Promise<{
      coverUrl?: string;
      bannerUrl?: string;
      iconUrl?: string;
      screenshots?: string[];
    } | null> => ipcRenderer.invoke("games:metadata:artwork", options),

    fetchVideos: (options: {
      gameId: string;
      title: string;
    }): Promise<unknown[]> =>
      ipcRenderer.invoke("games:metadata:videos", options),

    getLocalScreenshots: (gameId: string): Promise<string[]> =>
      ipcRenderer.invoke("games:localScreenshots", gameId),

    fetchProtonRating: (steamAppId: number): Promise<string> =>
      ipcRenderer.invoke("games:metadata:proton", steamAppId),
    hide: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("games:hide", id, value),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke("games:delete", id),
    countBySource: (source: string): Promise<number> =>
      ipcRenderer.invoke("games:countBySource", source),
    deleteBySource: (source: string): Promise<number> =>
      ipcRenderer.invoke("games:deleteBySource", source),
    uninstall: (game: Game): Promise<{ success: boolean; error?: string; method?: string }> =>
      ipcRenderer.invoke("games:uninstall", game),
    emulatorConfig: {
      get: (id: string): Promise<GameEmulatorConfig> =>
        ipcRenderer.invoke("games:emulatorConfig:get", id),
      set: (id: string, config: GameEmulatorConfig): Promise<void> =>
        ipcRenderer.invoke("games:emulatorConfig:set", id, config),
    },
    sessionConfig: {
      set: (id: string, config: {
        launchCommand?: string | null;
        launchArgs?: string[] | null;
        launchWorkingDir?: string | null;
        launchEnv?: Record<string, string> | null;
        sessionHooks?: import("../shared/types").SessionHook[] | null;
      }): Promise<void> =>
        ipcRenderer.invoke("games:sessionConfig:set", id, config),
    },
    wineConfig: {
      set: (id: string, config: { wineRunner?: WineRunner; wineCustomCommand?: string | null; umuCustomCommand?: string | null }): Promise<void> =>
        ipcRenderer.invoke("games:wineConfig:set", id, config),
    },
    playTime: {
      start: (id: string): Promise<void> =>
        ipcRenderer.invoke("games:playTime:start", id),
      stop: (id: string): Promise<void> =>
        ipcRenderer.invoke("games:playTime:stop", id),
    },
    loadThumbnail: (game: Game): Promise<string | null> =>
      ipcRenderer.invoke("games:loadThumbnail", game),
    regenerateThumbnail: (game: Game): Promise<string | null> =>
      ipcRenderer.invoke("games:regenerateThumbnail", game),
    compress: (game: Game): Promise<{ success: boolean; outputPath?: string; format?: string; error?: string; originalSize?: number; compressedSize?: number }> =>
      ipcRenderer.invoke("games:compress", game),
    compressAll: (): Promise<{ success: number; failed: number; skipped: number; errors: string[] }> =>
      ipcRenderer.invoke("games:compressAll"),
    compressionTools: (): Promise<{ chdman: { available: boolean }; dolphinTool: { available: boolean }; maxcso: { available: boolean }; nsz: { available: boolean }; sevenZip: { available: boolean } }> =>
      ipcRenderer.invoke("games:compression:tools"),
    canCompress: (game: Game): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke("games:compression:canCompress", game),
    desktopEntry: {
      create: (game: Game): Promise<void> =>
        ipcRenderer.invoke("games:desktopEntry:create", game),
      remove: (gameId: string): Promise<void> =>
        ipcRenderer.invoke("games:desktopEntry:remove", gameId),
      removeAll: (): Promise<{ count: number }> =>
        ipcRenderer.invoke("games:desktopEntry:removeAll"),
      has: (gameId: string): Promise<boolean> =>
        ipcRenderer.invoke("games:desktopEntry:has", gameId),
    },
    getPendingLaunch: (): Promise<Game | null> =>
      ipcRenderer.invoke("games:pendingLaunch"),
    clearPendingLaunch: (): Promise<void> =>
      ipcRenderer.invoke("games:clearPendingLaunch"),
  },

  dolphin: {
    openSettings: (): Promise<boolean> =>
      ipcRenderer.invoke("dolphin:openSettings"),
    openConfig: (): Promise<boolean> =>
      ipcRenderer.invoke("dolphin:openConfig"),
  },

  controller: {
    openMapping: (): Promise<boolean> =>
      ipcRenderer.invoke("controller:openMapping"),
    resetMappings: (): Promise<boolean> =>
      ipcRenderer.invoke("controller:resetMappings"),
  },

  movies: {
    scan: (extraPaths?: string[]): Promise<void> =>
      ipcRenderer.invoke("movies:scan", extraPaths),
    list: (): Promise<Movie[]> => ipcRenderer.invoke("movies:list"),
    launch: (movie: Movie): Promise<void> =>
      ipcRenderer.invoke("movies:launch", movie),
    favorite: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("movies:favorite", id, value),
    tag: (id: string, tags: string[]): Promise<void> =>
      ipcRenderer.invoke("movies:tag", id, tags),
    setProgress: (id: string, progress: number | null): Promise<void> =>
      ipcRenderer.invoke("movies:progress:set", id, progress),
    setProgressSync: (id: string, progress: number | null): void => {
      const start = performance.now();
      ipcRenderer.sendSync("movies:progress:set:sync", id, progress);
      const elapsed = performance.now() - start;
      if (elapsed > 20) {
        console.warn(`[preload] movies:progress:set:sync sendSync took ${elapsed.toFixed(1)}ms`);
      }
    },
    setSubtitleTrack: (id: string, trackId: number | null): Promise<void> =>
      ipcRenderer.invoke("movies:subtitleTrack:set", id, trackId),
    setAudioTrack: (id: string, trackId: number | null): Promise<void> =>
      ipcRenderer.invoke("movies:audioTrack:set", id, trackId),
    setPlaybackSpeed: (id: string, speed: number): Promise<void> =>
      ipcRenderer.invoke("movies:playbackSpeed:set", id, speed),
    fetchMetadata: (title: string): Promise<unknown> =>
      ipcRenderer.invoke("movies:metadata", title),
    hide: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("movies:hide", id, value),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke("movies:delete", id),
    uninstall: (movie: Movie): Promise<{ success: boolean; error?: string; method?: string }> =>
      ipcRenderer.invoke("movies:uninstall", movie),
    regenerateThumbnail: (movie: Movie): Promise<string | null> =>
      ipcRenderer.invoke("movies:regenerateThumbnail", movie),
  },

  music: {
    scan: (extraPaths?: string[]): Promise<void> =>
      ipcRenderer.invoke("music:scan", extraPaths),
    list: (): Promise<MusicTrack[]> => ipcRenderer.invoke("music:list"),
    launch: (track: MusicTrack): Promise<void> =>
      ipcRenderer.invoke("music:launch", track),
    favorite: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("music:favorite", id, value),
    tag: (id: string, tags: string[]): Promise<void> =>
      ipcRenderer.invoke("music:tag", id, tags),
    writeTags: (filePath: string, tags: AudioTags): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("music:writeTags", filePath, tags),
    searchCoverArt: (track: MusicTrack): Promise<string | null> =>
      ipcRenderer.invoke("music:searchCoverArt", track),
    pickCoverImage: (track: MusicTrack): Promise<string | null> =>
      ipcRenderer.invoke("music:pickCoverImage", track),
    loadThumbnail: (track: MusicTrack): Promise<string | null> =>
      ipcRenderer.invoke("music:loadThumbnail", track),
    regenerateThumbnail: (track: MusicTrack): Promise<string | null> =>
      ipcRenderer.invoke("music:regenerateThumbnail", track),
    artistThumbnail: (artist: string): Promise<string | null> =>
      ipcRenderer.invoke("music:artistThumbnail", artist),
    hide: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("music:hide", id, value),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke("music:delete", id),
    uninstall: (track: MusicTrack): Promise<{ success: boolean; error?: string; method?: string }> =>
      ipcRenderer.invoke("music:uninstall", track),
    enrich: (track: MusicTrack): Promise<{
      updates: Partial<MusicTrack>;
      coverArtUrl?: string;
      artistImageUrl?: string;
    } | null> => ipcRenderer.invoke("music:enrich", track),
    enrichBatch: (tracks: MusicTrack[]): Promise<
      Record<string, {
        updates: Partial<MusicTrack>;
        coverArtUrl?: string;
        artistImageUrl?: string;
      }>
    > => ipcRenderer.invoke("music:enrichBatch", tracks),
    setLastPlayed: (id: string, timestamp: number): Promise<void> =>
      ipcRenderer.invoke("music:lastPlayed", id, timestamp),
    reorganizePreview: (pattern: string): Promise<ReorganizeResult> =>
      ipcRenderer.invoke("music:reorganizePreview", pattern),
    reorganize: (pattern: string): Promise<ReorganizeResult> =>
      ipcRenderer.invoke("music:reorganize", pattern),
  },

  tv: {
    scan: (extraPaths?: string[]): Promise<void> =>
      ipcRenderer.invoke("tv:scan", extraPaths),
    list: (): Promise<TVShow[]> => ipcRenderer.invoke("tv:list"),
    launch: (filePath: string): Promise<void> =>
      ipcRenderer.invoke("tv:launch", filePath),
    favorite: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("tv:favorite", id, value),
    tag: (id: string, tags: string[]): Promise<void> =>
      ipcRenderer.invoke("tv:tag", id, tags),
    fetchMetadata: (title: string): Promise<unknown> =>
      ipcRenderer.invoke("tv:metadata", title),
    hide: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("tv:hide", id, value),
    regenerateThumbnail: (show: TVShow): Promise<string | null> =>
      ipcRenderer.invoke("tv:regenerateThumbnail", show),
  },

  input: {
    devices: (): Promise<ControllerDevice[]> =>
      ipcRenderer.invoke("input:devices"),
    getMappings: (deviceId: string): Promise<ButtonMapping[]> =>
      ipcRenderer.invoke("input:mappings:get", deviceId),
    setMapping: (
      deviceId: string,
      inputCode: string,
      action: string,
    ): Promise<void> =>
      ipcRenderer.invoke("input:mappings:set", deviceId, inputCode, action),
    resetMappings: (deviceId: string): Promise<void> =>
      ipcRenderer.invoke("input:mappings:reset", deviceId),
    getAlias: (deviceId: string): Promise<string | null> =>
      ipcRenderer.invoke("input:alias:get", deviceId),
    setAlias: (deviceId: string, alias: string): Promise<void> =>
      ipcRenderer.invoke("input:alias:set", deviceId, alias),
    removeAlias: (deviceId: string): Promise<void> =>
      ipcRenderer.invoke("input:alias:remove", deviceId),
    reconnectDevice: (deviceId: string): Promise<void> =>
      ipcRenderer.invoke("input:device:reconnect", deviceId),
    onEvent: (cb: (buffer: ArrayBuffer) => void) => {
      const handler = (_: Electron.IpcRendererEvent, buffer: ArrayBuffer) =>
        cb(buffer);
      ipcRenderer.on("input:event", handler);
      return () => ipcRenderer.removeListener("input:event", handler);
    },
    onEventKeyboard: (cb: (event: NormalizedInputEvent) => void) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        ev: NormalizedInputEvent,
      ) => cb(ev);
      ipcRenderer.on("input:event-keyboard", handler);
      return () => ipcRenderer.removeListener("input:event-keyboard", handler);
    },
    onDeviceConnected: (cb: (device: ControllerDevice) => void) => {
      const handler = (_: Electron.IpcRendererEvent, dev: ControllerDevice) =>
        cb(dev);
      ipcRenderer.on("input:device-connected", handler);
      return () =>
        ipcRenderer.removeListener("input:device-connected", handler);
    },
    onDeviceDisconnected: (cb: (payload: { deviceId: string; controllerIdx: number }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: { deviceId: string; controllerIdx: number }) => cb(payload);
      ipcRenderer.on("input:device-disconnected", handler);
      return () =>
        ipcRenderer.removeListener("input:device-disconnected", handler);
    },
  },

  plugins: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke("plugins:list"),
    reload: (): Promise<unknown[]> => ipcRenderer.invoke("plugins:reload"),
    discover: (): Promise<unknown[]> => ipcRenderer.invoke("plugins:discover"),
    discoverAll: (): Promise<unknown[]> => ipcRenderer.invoke("plugins:discover-all"),
    managedList: (): Promise<unknown[]> => ipcRenderer.invoke("plugins:managed-list"),
    install: (plugin: unknown): Promise<boolean> => ipcRenderer.invoke("plugins:install", plugin),
    uninstall: (id: string): Promise<boolean> => ipcRenderer.invoke("plugins:uninstall", id),
    update: (plugin: unknown): Promise<boolean> => ipcRenderer.invoke("plugins:update", plugin),
    setEnabled: (id: string, enabled: boolean): Promise<boolean> => ipcRenderer.invoke("plugins:set-enabled", id, enabled),
    launchGame: (game: unknown): Promise<{ type: string; url?: string; pluginId: string } | null> =>
      ipcRenderer.invoke("plugins:launch-game", game),
  },

  themes: {
    list: (): Promise<import("../shared/types").ThemeRegistration[]> => ipcRenderer.invoke("themes:list"),
    getCss: (themeId: string): Promise<string | null> => ipcRenderer.invoke("themes:getCss", themeId),
  },

  db: {
    clear: (): Promise<boolean> => ipcRenderer.invoke("db:clear"),
    clearAll: (): Promise<boolean> => ipcRenderer.invoke("db:clear-all"),
    wipeThumbnails: (): Promise<boolean> => ipcRenderer.invoke("db:wipe-thumbnails"),
    deleteMissing: (): Promise<{ games: number; movies: number; music: number }> =>
      ipcRenderer.invoke("db:delete-missing"),
    listCorrupt: (): Promise<{ games: Game[]; movies: Movie[]; music: MusicTrack[] }> =>
      ipcRenderer.invoke("db:list-corrupt"),
    deleteCorrupt: (): Promise<{ games: number; movies: number; music: number }> =>
      ipcRenderer.invoke("db:delete-corrupt"),
    query: <T = any>(table: string, odataQuery: string): Promise<{ results: T[]; count?: number }> =>
      ipcRenderer.invoke("db:query", table, odataQuery),
  },

  openDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:open-directory"),
  openFile: (opts?: { filters?: Electron.FileFilter[]; title?: string }): Promise<string | null> =>
    ipcRenderer.invoke("dialog:open-file", opts),

  shell: {
    openExternal: (url: string): Promise<void> => shell.openExternal(url),
    openPath: (path: string): Promise<string> => shell.openPath(path),
    showItemInFolder: (path: string): Promise<void> =>
      Promise.resolve(shell.showItemInFolder(path)),
  },

  files: {
    read: (filePath: string): Promise<Uint8Array | null> =>
      ipcRenderer.invoke("files:read", filePath),
  },

  libretro: {
    ...libretroApi,
    launch: (opts: {
      romPath: string;
      title: string;
      platform: GamePlatform;
      gameId: string;
      shader?: string;
      corePath?: string;
    }): Promise<boolean> => ipcRenderer.invoke("libretro:launch", opts),
    onOpen: (cb: (opts: {
      romPath: string;
      title: string;
      platform: GamePlatform;
      gameId: string;
      shader?: string;
      corePath?: string;
    }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: {
        romPath: string;
        title: string;
        platform: GamePlatform;
        gameId: string;
        shader?: string;
        corePath?: string;
      }) => cb(payload);
      ipcRenderer.on("libretro:open", handler);
      return () => ipcRenderer.removeListener("libretro:open", handler);
    },
    onCoreListChanged: (cb: () => void) => {
      const handler = () => {
        libretroApi.invalidateCoreCache();
        cb();
      };
      ipcRenderer.on("libretro:cores:changed", handler);
      return () => ipcRenderer.removeListener("libretro:cores:changed", handler);
    },
  },

  flashFilters: {
    list: (): Promise<{ id: string; name: string; content: string }[]> =>
      ipcRenderer.invoke("flash-filters:list"),
    openDir: (): Promise<void> =>
      ipcRenderer.invoke("flash-filters:open-dir"),
  },

  collections: {
    list: (): Promise<Collection[]> => ipcRenderer.invoke("collections:list"),
    get: (id: string): Promise<Collection | null> => ipcRenderer.invoke("collections:get", id),
    create: (collection: Collection): Promise<void> => ipcRenderer.invoke("collections:create", collection),
    update: (collection: Collection): Promise<void> => ipcRenderer.invoke("collections:update", collection),
    delete: (id: string): Promise<void> => ipcRenderer.invoke("collections:delete", id),
    items: {
      list: (collectionId: string): Promise<CollectionItem[]> => ipcRenderer.invoke("collections:items:list", collectionId),
      add: (item: CollectionItem): Promise<void> => ipcRenderer.invoke("collections:items:add", item),
      remove: (collectionId: string, itemId: string): Promise<void> => ipcRenderer.invoke("collections:items:remove", collectionId, itemId),
    },
    smartEvaluate: (itemType: string, filter: SmartFilterGroup): Promise<string[]> => ipcRenderer.invoke("collections:smart:evaluate", itemType, filter),
  },

  playlist: {
    list: (): Promise<Playlist[]> => ipcRenderer.invoke("playlist:list"),
    create: (playlist: Playlist): Promise<Playlist> => ipcRenderer.invoke("playlist:create", playlist),
    update: (id: string, data: Partial<Playlist>): Promise<Playlist> => ipcRenderer.invoke("playlist:update", id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke("playlist:delete", id),
    addTracks: (id: string, trackIds: string[]): Promise<Playlist | null> => ipcRenderer.invoke("playlist:addTracks", id, trackIds),
    removeTracks: (id: string, trackIds: string[]): Promise<Playlist | null> => ipcRenderer.invoke("playlist:removeTracks", id, trackIds),
    reorder: (id: string, trackIds: string[]): Promise<Playlist | null> => ipcRenderer.invoke("playlist:reorder", id, trackIds),
  },

  localAi: {
    available: (): Promise<boolean> => ipcRenderer.invoke("localAi:available"),
    nlToFilter: (query: string, itemType: string): Promise<SmartFilterGroup | null> =>
      ipcRenderer.invoke("localAi:nlToFilter", query, itemType),
    groupItems: (items: Array<{
      id: string;
      title: string;
      genres?: string[];
      tags?: string[];
      description?: string;
      platform?: string;
      artist?: string;
      album?: string;
      genre?: string;
    }>, groupCount: number): Promise<Array<{ id: string; label: string; itemIds: string[]; centerItemId: string }>> =>
      ipcRenderer.invoke("localAi:groupItems", items, groupCount),
  },

  streaming: {
    list: (category?: string): Promise<StreamingService[]> =>
      ipcRenderer.invoke("streaming:list", category),
    add: (service: Omit<StreamingService, "isBuiltin" | "sortOrder">): Promise<StreamingService> =>
      ipcRenderer.invoke("streaming:add", service),
    update: (service: StreamingService): Promise<void> =>
      ipcRenderer.invoke("streaming:update", service),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke("streaming:delete", id),
    setEnabled: (id: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke("streaming:setEnabled", id, enabled),
    detectDesktopApp: (command: string): Promise<boolean> =>
      ipcRenderer.invoke("streaming:detectDesktopApp", command),
    launch: (service: StreamingService): Promise<void> =>
      ipcRenderer.invoke("streaming:launch", service),
    frontpage: {
      report: (serviceId: string, items: import("../shared/types").StreamingFrontpageItem[]): Promise<{ success: boolean; count: number }> =>
        ipcRenderer.invoke("streaming:frontpage:report", serviceId, items),
      list: (serviceId: string): Promise<import("../shared/types").StreamingFrontpageItem[]> =>
        ipcRenderer.invoke("streaming:frontpage:list", serviceId),
      listAll: (): Promise<import("../shared/types").StreamingFrontpageItem[]> =>
        ipcRenderer.invoke("streaming:frontpage:listAll"),
      clear: (maxAgeMs?: number): Promise<{ success: boolean }> =>
        ipcRenderer.invoke("streaming:frontpage:clear", maxAgeMs),
    },
    usage: {
      start: (id: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke("streaming:usage:start", id),
      stop: (id: string, seconds: number): Promise<{ success: boolean }> =>
        ipcRenderer.invoke("streaming:usage:stop", id, seconds),
    },
    extensions: {
      ensureDefaults: (): Promise<void> =>
        ipcRenderer.invoke("streaming:extensions:ensureDefaults"),
      download: (extId: string, url: string, version: string): Promise<ExtensionInstallResult> =>
        ipcRenderer.invoke("streaming:extensions:download", extId, url, version),
      load: (extId: string, partition: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke("streaming:extensions:load", extId, partition),
      unload: (extId: string, partition: string): Promise<void> =>
        ipcRenderer.invoke("streaming:extensions:unload", extId, partition),
      remove: (extId: string): Promise<void> =>
        ipcRenderer.invoke("streaming:extensions:remove", extId),
      apply: (partition: string, extensions: StreamingExtension[]): Promise<void> =>
        ipcRenderer.invoke("streaming:extensions:apply", partition, extensions),
    },
    adapter: {
      authenticate: (serviceId: string): Promise<StreamingAdapterConfig> =>
        ipcRenderer.invoke("streaming:adapter:authenticate", serviceId),
      disconnect: (serviceId: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke("streaming:adapter:disconnect", serviceId),
      search: (serviceId: string, query: string, types?: ("track" | "album" | "artist" | "playlist")[]): Promise<StreamingSearchResult[]> =>
        ipcRenderer.invoke("streaming:adapter:search", serviceId, query, types),
      play: (serviceId: string, uri?: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke("streaming:adapter:play", serviceId, uri),
      pause: (serviceId: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke("streaming:adapter:pause", serviceId),
      next: (serviceId: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke("streaming:adapter:next", serviceId),
      previous: (serviceId: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke("streaming:adapter:previous", serviceId),
      currentlyPlaying: (serviceId: string): Promise<CurrentlyPlaying | null> =>
        ipcRenderer.invoke("streaming:adapter:currentlyPlaying", serviceId),
      getDevices: (serviceId: string): Promise<StreamingDevice[]> =>
        ipcRenderer.invoke("streaming:adapter:getDevices", serviceId),
      getTrack: (serviceId: string, id: string): Promise<StreamingTrack | null> =>
        ipcRenderer.invoke("streaming:adapter:getTrack", serviceId, id),
      getAlbum: (serviceId: string, id: string): Promise<StreamingAlbum | null> =>
        ipcRenderer.invoke("streaming:adapter:getAlbum", serviceId, id),
      getPlaylist: (serviceId: string, id: string): Promise<StreamingPlaylist | null> =>
        ipcRenderer.invoke("streaming:adapter:getPlaylist", serviceId, id),
    },
    mediaKeys: (action: "play" | "pause" | "next" | "previous") => {
      ipcRenderer.send("streaming:mediaKeys", action);
    },
  },

  packages: {
    list: (): Promise<ManagedPackage[]> => ipcRenderer.invoke("packages:list"),
    search: (query: string): Promise<ManagedPackage[]> => ipcRenderer.invoke("packages:search", query),
    install: (packageId: string): Promise<boolean> => ipcRenderer.invoke("packages:install", packageId),
    uninstall: (packageId: string): Promise<boolean> => ipcRenderer.invoke("packages:uninstall", packageId),
    update: (): Promise<void> => ipcRenderer.invoke("packages:update"),
    setAptPassword: (password: string): Promise<void> => ipcRenderer.invoke("packages:setAptPassword", password),
    detectCores: (): Promise<{ platform: string; corePath: string; coreName: string; extensions: string[] }[]> =>
      ipcRenderer.invoke("packages:detectCores"),
    detectWineRunner: (): Promise<import("../shared/types").WineRunner | null> =>
      ipcRenderer.invoke("packages:detectWineRunner"),
    onProgress: (cb: (progress: PackageOperationProgress) => void) => {
      const handler = (_: Electron.IpcRendererEvent, p: PackageOperationProgress) => cb(p);
      ipcRenderer.on("packages:progress", handler);
      return () => ipcRenderer.removeListener("packages:progress", handler);
    },
  },

  store: {
    itch: {
      status: (): Promise<{ authenticated: boolean; username?: string; error?: string }> =>
        ipcRenderer.invoke("store:itch:status"),
      login: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke("store:itch:login"),
      logout: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke("store:itch:logout"),
      library: (): Promise<{ id: string; title: string; coverUrl?: string; developer?: string; installed?: boolean; installPath?: string; execPath?: string; version?: string }[]> =>
        ipcRenderer.invoke("store:itch:library"),
      install: (gameId: string, title: string): Promise<{ success: boolean; error?: string; installPath?: string }> =>
        ipcRenderer.invoke("store:itch:install", gameId, title),
      uninstall: (gameId: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke("store:itch:uninstall", gameId),
      launch: (game: Game): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke("store:itch:launch", game),
      update: (gameId: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke("store:itch:update", gameId),
      updates: (): Promise<{ gameId: string; title: string; latestVersion?: string }[]> =>
        ipcRenderer.invoke("store:itch:updates"),
      download: (downloadUrl: string, destPath: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke("store:itch:download", downloadUrl, destPath),
    },
    providers: (): Promise<{ id: string; name: string; url: string; icon?: string }[]> =>
      ipcRenderer.invoke("store:providers:list"),
  },

  onScanProgress: (cb: (progress: ScanProgress) => void) => {
    const handler = (_: Electron.IpcRendererEvent, p: ScanProgress) => cb(p);
    ipcRenderer.on("scan:progress", handler);
    return () => ipcRenderer.removeListener("scan:progress", handler);
  },

  onScanTrigger: (cb: (payload: { types: ("games" | "movies" | "music")[] }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { types: ("games" | "movies" | "music")[] }) => cb(payload);
    ipcRenderer.on("scan:trigger", handler);
    return () => ipcRenderer.removeListener("scan:trigger", handler);
  },

  onBackgroundScanComplete: (cb: (payload: { type: "games" | "movies" | "music" }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { type: "games" | "movies" | "music" }) => cb(payload);
    ipcRenderer.on("scan:background:complete", handler);
    return () => ipcRenderer.removeListener("scan:background:complete", handler);
  },

  onMusicFilesMoved: (cb: (payload: { moves: import("../shared/types").ReorganizeMove[] }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { moves: import("../shared/types").ReorganizeMove[] }) => cb(payload);
    ipcRenderer.on("music:filesMoved", handler);
    return () => ipcRenderer.removeListener("music:filesMoved", handler);
  },

  videoDecoder: videoDecoderApi,

  system: {
    getDiagnostics: (): Promise<any> =>
      ipcRenderer.invoke("system:getDiagnostics"),
  },

  onSaveState: (cb: () => void) => {
    const handler = (_: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on("app:save-state", handler);
    return () => ipcRenderer.removeListener("app:save-state", handler);
  },

  onSessionHookError: (cb: (detail: { gameTitle: string; timing: string; reason: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, detail: { gameTitle: string; timing: string; reason: string }) => cb(detail);
    ipcRenderer.on("session-hook:error", handler);
    return () => ipcRenderer.removeListener("session-hook:error", handler);
  },

  onToastPush: (cb: (toast: { type: "info" | "success" | "error" | "progress"; message: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, toast: { type: "info" | "success" | "error" | "progress"; message: string }) => cb(toast);
    ipcRenderer.on("toast:push", handler);
    return () => ipcRenderer.removeListener("toast:push", handler);
  },

  onGameLaunching: (cb: (detail: { gameId: string; title: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, detail: { gameId: string; title: string }) => cb(detail);
    ipcRenderer.on("game:launching", handler);
    return () => ipcRenderer.removeListener("game:launching", handler);
  },

  onGameLaunchFailed: (cb: (detail: { gameId: string; reason: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, detail: { gameId: string; reason: string }) => cb(detail);
    ipcRenderer.on("game:launch-failed", handler);
    return () => ipcRenderer.removeListener("game:launch-failed", handler);
  },

  onGameStarted: (cb: (gameId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, gameId: string) => cb(gameId);
    ipcRenderer.on("game:started", handler);
    return () => ipcRenderer.removeListener("game:started", handler);
  },

  onGameStopped: (cb: (gameId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, gameId: string) => cb(gameId);
    ipcRenderer.on("game:stopped", handler);
    return () => ipcRenderer.removeListener("game:stopped", handler);
  },

  devtools: {
    isOpen: (): Promise<boolean> => ipcRenderer.invoke("devtools:is-open"),
    onChange: (cb: (open: boolean) => void) => {
      const handler = (_: Electron.IpcRendererEvent, open: boolean) => cb(open);
      ipcRenderer.on("devtools:changed", handler);
      return () => ipcRenderer.removeListener("devtools:changed", handler);
    },
  },

  rclone: {
    available: (): Promise<boolean> =>
      ipcRenderer.invoke("rclone:available"),
    list: (): Promise<import("../shared/types").RemoteSource[]> =>
      ipcRenderer.invoke("rclone:list"),
    add: (source: Omit<import("../shared/types").RemoteSource, "id">, creds: Record<string, string | undefined>): Promise<import("../shared/types").RemoteSource> =>
      ipcRenderer.invoke("rclone:add", source, creds),
    update: (source: import("../shared/types").RemoteSource, creds?: Record<string, string | undefined>): Promise<void> =>
      ipcRenderer.invoke("rclone:update", source, creds),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke("rclone:remove", id),
    listFiles: (source: import("../shared/types").RemoteSource, path: string): Promise<{ name: string; isDir: boolean; size?: number; modTime?: string }[]> =>
      ipcRenderer.invoke("rclone:listFiles", source, path),
    startServe: (source: import("../shared/types").RemoteSource): Promise<number | null> =>
      ipcRenderer.invoke("rclone:startServe", source),
    stopServe: (id: string): Promise<void> =>
      ipcRenderer.invoke("rclone:stopServe", id),
    getServePort: (id: string): Promise<number | undefined> =>
      ipcRenderer.invoke("rclone:getServePort", id),
    getAllServePorts: (): Promise<Record<string, number>> =>
      ipcRenderer.invoke("rclone:getAllServePorts"),
    checkAuth: (source: import("../shared/types").RemoteSource): Promise<boolean> =>
      ipcRenderer.invoke("rclone:checkAuth", source),
    testConnection: (source: import("../shared/types").RemoteSource): Promise<RemoteTestResult> =>
      ipcRenderer.invoke("rclone:testConnection", source),
    testCredentials: (source: import("../shared/types").RemoteSource): Promise<RemoteTestResult> =>
      ipcRenderer.invoke("rclone:testCredentials", source),
    testPath: (source: import("../shared/types").RemoteSource): Promise<RemoteTestResult> =>
      ipcRenderer.invoke("rclone:testPath", source),
  },

  remote: {
    checkAvailability: (): Promise<void> =>
      ipcRenderer.invoke("remote:checkAvailability"),
    deleteMissing: (type: "movie" | "music" | "game"): Promise<number> =>
      ipcRenderer.invoke("remote:deleteMissing", type),
  },

  network: {
    discover: (): Promise<DiscoveredDevice[]> =>
      ipcRenderer.invoke("network:discover"),
  },

  updater: {
    getState: (): Promise<UpdaterState> =>
      ipcRenderer.invoke("updater:state"),
    check: (): Promise<void> => ipcRenderer.invoke("updater:check"),
    download: (): Promise<void> => ipcRenderer.invoke("updater:download"),
    install: (): Promise<void> => ipcRenderer.invoke("updater:install"),
    rollback: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("updater:rollback"),
    releases: (): Promise<GitHubRelease[]> =>
      ipcRenderer.invoke("updater:releases"),
    pin: (versionTag: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("updater:pin", versionTag),
    schedule: (): Promise<void> => ipcRenderer.invoke("updater:schedule"),
    onState: (cb: (state: UpdaterState) => void) => {
      const handler = (_: Electron.IpcRendererEvent, s: UpdaterState) => cb(s);
      ipcRenderer.on("updater:state", handler);
      return () => ipcRenderer.removeListener("updater:state", handler);
    },
    onProgress: (cb: (progress: { percent: number; speed?: number }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, p: { percent: number; speed?: number }) => cb(p);
      ipcRenderer.on("updater:progress", handler);
      return () => ipcRenderer.removeListener("updater:progress", handler);
    },
  },

  triggerGC: (): void => {
    if (typeof (global as any).gc === "function") {
      (global as any).gc();
    }
    // Also ask main process to collect
    void ipcRenderer.invoke("gc:trigger");
  },

  oauth: {
    start: (authUrl: string, redirectPatterns: string[]): Promise<OAuthResult> =>
      ipcRenderer.invoke("oauth:start", authUrl, redirectPatterns),
  },

  credentials: {
    setMasterPassword: (password: string): Promise<void> =>
      ipcRenderer.invoke("credentials:setMasterPassword", password),
    clearMasterPassword: (): Promise<void> =>
      ipcRenderer.invoke("credentials:clearMasterPassword"),
    hasMasterPassword: (): Promise<boolean> =>
      ipcRenderer.invoke("credentials:hasMasterPassword"),
    needsMasterPassword: (sources: import("../shared/types").RemoteSource[]): Promise<boolean> =>
      ipcRenderer.invoke("credentials:needsMasterPassword", sources),
    needsSessionReauth: (sources: import("../shared/types").RemoteSource[]): Promise<import("../shared/types").RemoteSource[]> =>
      ipcRenderer.invoke("credentials:needsSessionReauth", sources),
  },
};

contextBridge.exposeInMainWorld("htpc", htpc);

declare global {
  interface Window {
    htpc: typeof htpc;
  }
}
