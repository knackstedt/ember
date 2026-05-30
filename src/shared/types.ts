export type ThemeName = 'dark-oled' | 'glassmorphism' | 'neon-cyberpunk' | 'terminal-tui' | 'custom'

export type TabId = 'gaming' | 'movies' | 'music' | 'tv-shows' | 'settings' | 'controllers'

export type GamePlatform =
  | 'steam'
  | 'gog'
  | 'lutris'
  | 'heroic'
  | 'dolphin-gc'
  | 'dolphin-wii'
  | 'nes'
  | 'snes'
  | 'gb'
  | 'gba'
  | 'flash'
  | 'desktop'
  | 'unknown'

export type ProtonRating = 'platinum' | 'gold' | 'silver' | 'bronze' | 'borked' | 'unknown'

export interface Game {
  id: string
  title: string
  platform: GamePlatform
  execPath?: string
  coverUrl?: string
  bannerUrl?: string
  description?: string
  genres?: string[]
  releaseYear?: number
  developer?: string
  publisher?: string
  playerCount?: { min: number; max: number }
  protonRating?: ProtonRating
  steamAppId?: number
  rawgSlug?: string
  romPath?: string
  isFavorite?: boolean
  tags?: string[]
  lastPlayed?: number
  playTime?: number
  rating?: number
}

export interface Movie {
  id: string
  title: string
  filePath: string
  coverUrl?: string
  backdropUrl?: string
  description?: string
  genres?: string[]
  releaseYear?: number
  director?: string
  runtime?: number
  resolution?: string
  codec?: string
  tmdbId?: number
  isFavorite?: boolean
  tags?: string[]
  lastPlayed?: number
  rating?: number
}

export interface MusicTrack {
  id: string
  title: string
  filePath: string
  artist?: string
  album?: string
  albumArtUrl?: string
  genre?: string
  year?: number
  trackNumber?: number
  duration?: number
  mbid?: string
  isFavorite?: boolean
  tags?: string[]
}

export interface TVShow {
  id: string
  title: string
  dirPath: string
  coverUrl?: string
  backdropUrl?: string
  description?: string
  genres?: string[]
  firstAirYear?: number
  creator?: string
  seasons?: TVSeason[]
  tmdbId?: number
  isFavorite?: boolean
  tags?: string[]
  rating?: number
}

export interface TVSeason {
  seasonNumber: number
  episodes: TVEpisode[]
}

export interface TVEpisode {
  episodeNumber: number
  title?: string
  filePath: string
  duration?: number
  airDate?: string
  description?: string
  stillUrl?: string
}

export type InputEventType =
  | 'button_press'
  | 'button_release'
  | 'axis'
  | 'key_down'
  | 'key_up'
  | 'mouse_move'
  | 'mouse_button'

export type InputSource = 'keyboard' | 'mouse' | 'gamepad' | 'wiimote'

export interface NormalizedInputEvent {
  source: InputSource
  deviceId: string
  deviceName: string
  type: InputEventType
  action?: string
  axis?: string
  value?: number
  rawCode?: number
  timestamp: number
}

export type ControllerType =
  | 'xbox'
  | 'ps1'
  | 'ps2'
  | 'ps3'
  | 'ps4'
  | 'ps5'
  | 'gamecube'
  | 'wiimote'
  | 'generic'

export interface ControllerDevice {
  id: string
  name: string
  type: ControllerType
  vendorId?: number
  productId?: number
  axisCount: number
  buttonCount: number
}

export interface ButtonMapping {
  deviceId: string
  inputCode: string
  action: string
}

export interface AppSettings {
  theme: ThemeName
  fullscreen: boolean
  defaultTab: TabId
  moviePaths: string[]
  musicPaths: string[]
  romPaths: string[]
  gamePaths: string[]
  tmdbApiKey?: string
  rawgApiKey?: string
  acoustidApiKey?: string
  enableAnalytics: boolean
  startOnBoot: boolean
  hardwareAcceleration: boolean
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  entryPoint: string
  permissions?: string[]
}

export interface ScanProgress {
  scanner: string
  current: number
  total: number
  status: 'scanning' | 'done' | 'error'
  message?: string
}

export type IpcChannel =
  | 'settings:get'
  | 'settings:set'
  | 'games:scan'
  | 'games:list'
  | 'games:launch'
  | 'games:favorite'
  | 'games:tag'
  | 'movies:scan'
  | 'movies:list'
  | 'movies:launch'
  | 'movies:favorite'
  | 'movies:tag'
  | 'music:scan'
  | 'music:list'
  | 'music:launch'
  | 'music:favorite'
  | 'music:tag'
  | 'tv:scan'
  | 'tv:list'
  | 'tv:launch'
  | 'tv:favorite'
  | 'tv:tag'
  | 'input:devices'
  | 'input:mappings:get'
  | 'input:mappings:set'
  | 'input:mappings:reset'
  | 'plugins:list'
  | 'plugins:reload'
  | 'scan:progress'
  | 'input:event'
  | 'app:fullscreen'
  | 'app:quit'
