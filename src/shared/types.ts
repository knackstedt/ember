export type ThemeName =
  | "dark-oled"
  | "glassmorphism"
  | "neon-cyberpunk"
  | "terminal-tui"
  | "custom";

export type TabId =
  | "gaming"
  | "movies"
  | "music"
  | "tv-shows"
  | "settings"
  | "controllers";

export type GamePlatform =
  | "steam"
  | "gog"
  | "lutris"
  | "heroic"
  | "dolphin-gc"
  | "dolphin-wii"
  | "nes"
  | "snes"
  | "gb"
  | "gba"
  | "flash"
  | "desktop"
  | "unknown";

export type ProtonRating =
  | "platinum"
  | "gold"
  | "silver"
  | "bronze"
  | "borked"
  | "unknown";

export interface Game {
  id: string;
  title: string;
  platform: GamePlatform;
  execPath?: string;
  coverUrl?: string;
  coverSource?: string;
  bannerUrl?: string;
  description?: string;
  genres?: string[];
  releaseYear?: number;
  developer?: string;
  publisher?: string;
  playerCount?: { min: number; max: number };
  protonRating?: ProtonRating;
  steamAppId?: number;
  rawgSlug?: string;
  romPath?: string;
  isFavorite?: boolean;
  tags?: string[];
  lastPlayed?: number;
  playTime?: number;
  rating?: number;
  hidden?: boolean;
}

export interface Movie {
  id: string;
  title: string;
  filePath: string;
  coverUrl?: string;
  backdropUrl?: string;
  description?: string;
  genres?: string[];
  releaseYear?: number;
  director?: string;
  runtime?: number;
  resolution?: string;
  codec?: string;
  tmdbId?: number;
  isFavorite?: boolean;
  tags?: string[];
  lastPlayed?: number;
  rating?: number;
  watchProgress?: number;
  hidden?: boolean;
}

export interface MusicTrack {
  id: string;
  title: string;
  filePath: string;
  artist?: string;
  album?: string;
  albumArtUrl?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  duration?: number;
  mbid?: string;
  isFavorite?: boolean;
  tags?: string[];
  hidden?: boolean;
}

export interface TVShow {
  id: string;
  title: string;
  dirPath: string;
  coverUrl?: string;
  backdropUrl?: string;
  description?: string;
  genres?: string[];
  firstAirYear?: number;
  creator?: string;
  seasons?: TVSeason[];
  tmdbId?: number;
  isFavorite?: boolean;
  tags?: string[];
  rating?: number;
  hidden?: boolean;
}

export interface TVSeason {
  seasonNumber: number;
  episodes: TVEpisode[];
}

export interface TVEpisode {
  episodeNumber: number;
  title?: string;
  filePath: string;
  duration?: number;
  airDate?: string;
  description?: string;
  stillUrl?: string;
  watchProgress?: number;
}

export type InputEventType =
  | "button_press"
  | "button_release"
  | "axis"
  | "key_down"
  | "key_up"
  | "mouse_move"
  | "mouse_button";

export type InputSource = "keyboard" | "mouse" | "gamepad" | "wiimote";

export interface NormalizedInputEvent {
  source: InputSource;
  deviceId: string;
  deviceName: string;
  type: InputEventType;
  action?: string;
  axis?: string;
  value?: number;
  rawCode?: number;
  timestamp: number;
}

export type ControllerType =
  | "xbox"
  | "ps1"
  | "ps2"
  | "ps3"
  | "ps4"
  | "ps5"
  | "gamecube"
  | "wiimote"
  | "generic";

export interface ControllerDevice {
  id: string;
  name: string;
  type: ControllerType;
  vendorId?: number;
  productId?: number;
  axisCount: number;
  buttonCount: number;
}

export interface ButtonMapping {
  deviceId: string;
  inputCode: string;
  action: string;
}

export type FlashAspectRatio = "free" | "4:3" | "16:9" | "16:10";
export type FlashUpscaleStyle = "none" | "gaussian" | "pixelate";
export type FlashCanvasSize =
  | "window"
  | "550x400"
  | "640x480"
  | "800x600"
  | "1024x768"
  | "custom";

export interface FlashControllerMap {
  south: string;
  east: string;
  north: string;
  west: string;
  left_bumper: string;
  right_bumper: string;
  select: string;
  start: string;
  dpad_up: string;
  dpad_down: string;
  dpad_left: string;
  dpad_right: string;
}

export type FlashFilterType =
  | "none"
  | "dither"
  | "edge-detect"
  | "scanlines"
  | "crt"
  | "pixelate"
  | "grayscale"
  | "invert"
  | "posterize"
  | "chromatic"
  | "custom";

export interface FlashFilterDefinition {
  id: string;
  name: string;
  source: "builtin" | "custom";
  content?: string;
}

export interface FlashSettings {
  aspectRatio: FlashAspectRatio;
  canvasSize: FlashCanvasSize;
  customWidth: number;
  customHeight: number;
  upscaleStyle: FlashUpscaleStyle;
  controllerMap: FlashControllerMap;
  stickToMouse: boolean;
  stickSensitivity: number;
  aiUpscaling: boolean;
  filter: FlashFilterType;
  filterIntensity: number;
  pixelateSize: number;
  ditherLevels: number;
  customFilterId?: string;
}

export type DailyBackgroundSource =
  | "bing"
  | "unsplash"
  | "picsum"
  | "custom";

export interface DailyBackgroundSettings {
  enabled: boolean;
  source: DailyBackgroundSource;
  customUrl?: string;
}

export interface AppSettings {
  theme: ThemeName;
  fullscreen: boolean;
  defaultTab: TabId;
  moviePaths: string[];
  musicPaths: string[];
  romPaths: string[];
  gamePaths: string[];
  tmdbApiKey?: string;
  rawgApiKey?: string;
  acoustidApiKey?: string;
  enableAnalytics: boolean;
  startOnBoot: boolean;
  hardwareAcceleration: boolean;
  flashSettings?: FlashSettings;
  disabledTabs: TabId[];
  dailyBackground: DailyBackgroundSettings;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  entryPoint: string;
  permissions?: string[];
}

export interface ScanProgress {
  scanner: string;
  current: number;
  total: number;
  status: "scanning" | "done" | "error";
  message?: string;
}

export type IpcChannel =
  | "settings:get"
  | "settings:set"
  | "games:scan"
  | "games:list"
  | "games:launch"
  | "games:favorite"
  | "games:tag"
  | "movies:scan"
  | "movies:list"
  | "movies:launch"
  | "movies:favorite"
  | "movies:tag"
  | "movies:progress:set"
  | "music:scan"
  | "music:list"
  | "music:launch"
  | "music:favorite"
  | "music:tag"
  | "tv:scan"
  | "tv:list"
  | "tv:launch"
  | "tv:favorite"
  | "tv:tag"
  | "input:devices"
  | "input:mappings:get"
  | "input:mappings:set"
  | "input:mappings:reset"
  | "plugins:list"
  | "plugins:reload"
  | "scan:progress"
  | "input:event"
  | "app:fullscreen"
  | "app:quit"
  | "app:xdg-defaults"
  | "games:hide"
  | "movies:hide"
  | "music:hide"
  | "tv:hide"
  | "movies:regenerateThumbnail"
  | "tv:regenerateThumbnail"
  | "games:regenerateThumbnail"
  | "shell:openPath"
  | "shell:showItemInFolder";
