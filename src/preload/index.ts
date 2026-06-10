import { contextBridge, ipcRenderer, shell } from "electron";
import {
  AppSettings,
  Game,
  GameEmulatorConfig,
  WineRunner,
  Movie,
  MusicTrack,
  TVShow,
  NormalizedInputEvent,
  ControllerDevice,
  ButtonMapping,
  ScanProgress,
  Collection,
  CollectionItem,
  SmartFilterGroup,
  StreamingService,
  ManagedPackage,
  PackageOperationProgress,
} from "../shared/types";
import { GameMetadata } from "../shared/metadata";
import { libretroApi } from "./libretro";

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
  },

  games: {
    scan: (extraPaths?: string[]): Promise<Game[]> =>
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

    fetchProtonRating: (steamAppId: number): Promise<string> =>
      ipcRenderer.invoke("games:metadata:proton", steamAppId),
    hide: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("games:hide", id, value),
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
    scan: (extraPaths?: string[]): Promise<Movie[]> =>
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
    setProgressSync: (id: string, progress: number | null): void =>
      ipcRenderer.sendSync("movies:progress:set:sync", id, progress),
    fetchMetadata: (title: string): Promise<unknown> =>
      ipcRenderer.invoke("movies:metadata", title),
    hide: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("movies:hide", id, value),
    regenerateThumbnail: (movie: Movie): Promise<string | null> =>
      ipcRenderer.invoke("movies:regenerateThumbnail", movie),
  },

  music: {
    scan: (extraPaths?: string[]): Promise<MusicTrack[]> =>
      ipcRenderer.invoke("music:scan", extraPaths),
    list: (): Promise<MusicTrack[]> => ipcRenderer.invoke("music:list"),
    launch: (track: MusicTrack): Promise<void> =>
      ipcRenderer.invoke("music:launch", track),
    favorite: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("music:favorite", id, value),
    tag: (id: string, tags: string[]): Promise<void> =>
      ipcRenderer.invoke("music:tag", id, tags),
    searchCoverArt: (track: MusicTrack): Promise<string | null> =>
      ipcRenderer.invoke("music:searchCoverArt", track),
    pickCoverImage: (track: MusicTrack): Promise<string | null> =>
      ipcRenderer.invoke("music:pickCoverImage", track),
    loadThumbnail: (track: MusicTrack): Promise<string | null> =>
      ipcRenderer.invoke("music:loadThumbnail", track),
    artistThumbnail: (artist: string): Promise<string | null> =>
      ipcRenderer.invoke("music:artistThumbnail", artist),
    hide: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("music:hide", id, value),
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
  },

  tv: {
    scan: (extraPaths?: string[]): Promise<TVShow[]> =>
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
    onEvent: (cb: (event: NormalizedInputEvent) => void) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        ev: NormalizedInputEvent,
      ) => cb(ev);
      ipcRenderer.on("input:event", handler);
      return () => ipcRenderer.removeListener("input:event", handler);
    },
    onDeviceConnected: (cb: (device: ControllerDevice) => void) => {
      const handler = (_: Electron.IpcRendererEvent, dev: ControllerDevice) =>
        cb(dev);
      ipcRenderer.on("input:device-connected", handler);
      return () =>
        ipcRenderer.removeListener("input:device-connected", handler);
    },
    onDeviceDisconnected: (cb: (id: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, id: string) => cb(id);
      ipcRenderer.on("input:device-disconnected", handler);
      return () =>
        ipcRenderer.removeListener("input:device-disconnected", handler);
    },
  },

  plugins: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke("plugins:list"),
    reload: (): Promise<unknown[]> => ipcRenderer.invoke("plugins:reload"),
  },

  db: {
    clear: (): Promise<boolean> => ipcRenderer.invoke("db:clear"),
    clearAll: (): Promise<boolean> => ipcRenderer.invoke("db:clear-all"),
    wipeThumbnails: (): Promise<boolean> => ipcRenderer.invoke("db:wipe-thumbnails"),
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
      platform: string;
      gameId: string;
      shader?: string;
      corePath?: string;
    }): Promise<boolean> => ipcRenderer.invoke("libretro:launch", opts),
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

  devtools: {
    isOpen: (): Promise<boolean> => ipcRenderer.invoke("devtools:is-open"),
    onChange: (cb: (open: boolean) => void) => {
      const handler = (_: Electron.IpcRendererEvent, open: boolean) => cb(open);
      ipcRenderer.on("devtools:changed", handler);
      return () => ipcRenderer.removeListener("devtools:changed", handler);
    },
  },

  rclone: {
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
    testConnection: (source: import("../shared/types").RemoteSource): Promise<import("../main/services/rclone-manager").RemoteTestResult> =>
      ipcRenderer.invoke("rclone:testConnection", source),
    testCredentials: (source: import("../shared/types").RemoteSource): Promise<import("../main/services/rclone-manager").RemoteTestResult> =>
      ipcRenderer.invoke("rclone:testCredentials", source),
    testPath: (source: import("../shared/types").RemoteSource): Promise<import("../main/services/rclone-manager").RemoteTestResult> =>
      ipcRenderer.invoke("rclone:testPath", source),
  },

  network: {
    discover: (): Promise<import("../main/services/network-discovery").DiscoveredDevice[]> =>
      ipcRenderer.invoke("network:discover"),
  },

  oauth: {
    start: (authUrl: string, redirectPatterns: string[]): Promise<import("../main/services/oauth-webview").OAuthResult> =>
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
