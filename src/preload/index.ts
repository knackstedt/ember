import { contextBridge, ipcRenderer, shell } from "electron";
import {
  AppSettings,
  Game,
  Movie,
  MusicTrack,
  TVShow,
  NormalizedInputEvent,
  ControllerDevice,
  ButtonMapping,
  ScanProgress,
} from "../shared/types";

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
    getXdgDefaults: (): Promise<{ videosDir: string; musicDir: string }> =>
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
    fetchMetadata: (title: string, steamAppId?: number): Promise<unknown> =>
      ipcRenderer.invoke("games:metadata", title, steamAppId),
    hide: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("games:hide", id, value),
    loadThumbnail: (game: Game): Promise<string | null> =>
      ipcRenderer.invoke("games:loadThumbnail", game),
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
    fetchMetadata: (title: string): Promise<unknown> =>
      ipcRenderer.invoke("movies:metadata", title),
    hide: (id: string, value: boolean): Promise<void> =>
      ipcRenderer.invoke("movies:hide", id, value),
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
  },

  openDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:open-directory"),

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

  onScanProgress: (cb: (progress: ScanProgress) => void) => {
    const handler = (_: Electron.IpcRendererEvent, p: ScanProgress) => cb(p);
    ipcRenderer.on("scan:progress", handler);
    return () => ipcRenderer.removeListener("scan:progress", handler);
  },
};

contextBridge.exposeInMainWorld("htpc", htpc);

declare global {
  interface Window {
    htpc: typeof htpc;
  }
}
