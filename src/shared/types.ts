export type ThemeName =
  | "dark-oled"
  | "glassmorphism"
  | "neon-cyberpunk"
  | "terminal-tui"
  | "custom"
  | "synthwave-sunset"
  | "deep-ocean"
  | "monokai"
  | "nord-aurora"
  | "warm-paper";

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
  | "n64"
  | "genesis"
  | "sms"
  | "gamegear"
  | "pce"
  | "psx"
  | "ps2"
  | "ps3"
  | "psp"
  | "xbox360"
  | "nds"
  | "dreamcast"
  | "flash"
  | "dos"
  | "windows"
  | "desktop"
  | "unknown";

export type WineRunner = "wine" | "proton-ge" | "system-proton" | "umu-run";

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
  wineRunner?: WineRunner;
  coverUrl?: string;
  coverSource?: string;
  corrupt?: boolean;
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
  wineCustomCommand?: string;
  umuCustomCommand?: string;
  isFavorite?: boolean;
  tags?: string[];
  lastPlayed?: number;
  playTime?: number;
  rating?: number;
  hidden?: boolean;
  // Extended metadata (lazy loaded)
  metacriticScore?: number;
  openCriticScore?: number;
  achievementCount?: number;
  videos?: { name?: string; url: string; type?: string }[];
  steamReviewScore?: number;
  steamOwnersEstimate?: number;
  platforms?: string[];
  playtime?: number;
  igdbId?: number;
  mobyGamesId?: number;
  theGamesDbId?: number;
  launchBoxDbId?: string;
  romHash?: string;
  romHashType?: string;
  region?: string;
  language?: string;
  serialNumber?: string;
  pcgwEngine?: string;
  pcgwSeries?: string;
  /** Path to emulator-compatible compressed ROM (e.g. .chd, .rvz) */
  compressedRomPath?: string;
  /** Compression format used for compressedRomPath */
  compressionFormat?: string;
}

export interface GameEmulatorConfig {
  shader?: string;
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
  artistMbid?: string;
  releaseMbid?: string;
  releaseGroupMbid?: string;
  label?: string;
  albumArtist?: string;
  discNumber?: number;
  totalTracks?: number;
  biography?: string;
  mood?: string;
  style?: string;
  country?: string;
  tadbArtistId?: number;
  tadbAlbumId?: number;
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
  | "sepia"
  | "bloom"
  | "noise"
  | "sharpen"
  | "blur"
  | "vignette"
  | "heatwave"
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

export type BackgroundType =
  | "theme"
  | "matrix-preset"
  | "daily"
  | "image"
  | "solid"
  | "gradient";

export type ImageFitMode = "cover" | "contain" | "stretch" | "center" | "tile";

export type MatrixPreset =
  | "cyberpunk"
  | "ocean-blue"
  | "fire-red"
  | "monochrome"
  | "purple-haze"
  | "neon-pink"
  | "matrix"
  | "digital-rain";

export interface BackgroundSettings {
  type: BackgroundType;
  matrixPreset?: MatrixPreset;
  dailySource?: DailyBackgroundSource;
  dailyCustomUrl?: string;
  imagePath?: string;
  imageFit?: ImageFitMode;
  solidColor?: string;
  gradient?: string;
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
  steamApiKey?: string;
  acoustidApiKey?: string;
  theaudiodbApiKey?: string;
  enableAnalytics: boolean;
  startOnBoot: boolean;
  hardwareAcceleration: boolean;
  flashSettings?: FlashSettings;
  disabledTabs: TabId[];
  /** @deprecated Use background.type === "daily" instead */
  dailyBackground: DailyBackgroundSettings;
  background?: BackgroundSettings;
  defaultEmulatorShader?: string;
  emulatorShaders?: Partial<Record<GamePlatform, string>>;
  /** Dolphin emulator post-processing effect */
  dolphinPostProcessing?: string;
  /** Custom keyboard shortcuts: command id → shortcut string (e.g. "Ctrl+P") */
  commandKeybinds?: Record<string, string>;
  /** Custom controller button mappings: command id → button action (e.g. "north", "select") */
  commandControllerMap?: Record<string, string>;
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

export type CollectionItemType = "game" | "movie" | "music" | "tv" | "mixed";
export type CollectionType = "manual" | "smart";
export type SortOrder = "title" | "releaseYear" | "lastPlayed" | "rating" | "playTime" | "added";
export type SortDirection = "asc" | "desc";

export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "in"
  | "startsWith"
  | "endsWith"
  | "exists";

export interface SmartFilterRule {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface SmartFilterGroup {
  logic: "and" | "or";
  rules: (SmartFilterRule | SmartFilterGroup)[];
}

export interface Collection {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  itemType: CollectionItemType;
  type: CollectionType;
  filter?: SmartFilterGroup;
  sortOrder?: SortOrder;
  sortDirection?: SortDirection;
  createdAt: number;
  updatedAt: number;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  itemId: string;
  itemType: CollectionItemType;
  addedAt: number;
}

export interface CollectionWithItems extends Collection {
  items: CollectionItem[];
}

export interface LocalAiConfig {
  enabled: boolean;
  provider: "ollama" | "lmstudio" | "custom";
  baseUrl: string;
  model: string;
}

export interface AiGroup {
  id: string;
  label: string;
  itemIds: string[];
  centerItemId: string;
}

export type StreamingServiceCategory = "music" | "video";

export interface StreamingService {
  id: string;
  name: string;
  category: StreamingServiceCategory;
  url: string;
  color: string;
  textColor: string;
  icon: string;
  desktopApp?: string;
  desktopAppArgs?: string[];
  enabled: boolean;
  isBuiltin: boolean;
  sortOrder: number;
}

export type PackageManager = "apt" | "flatpak" | "appimage" | "winehq" | "proton-ge" | "buildbot";

export interface ManagedPackage {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  manager: PackageManager;
  version?: string;
  installedVersion?: string;
  isInstalled: boolean;
  isPinned: boolean;
  autoUpdate: boolean;
  category: "core" | "emulator" | "dependency" | "media-codec" | "other" | "game";
  platforms?: string[];
  sourceUrl?: string;
  installArgs?: string[];
  installPath?: string;
}

export interface PackageOperationProgress {
  packageId: string;
  operation: "install" | "uninstall" | "update" | "search";
  status: "pending" | "running" | "success" | "error";
  message?: string;
  percent?: number;
}

export type IpcChannel =
  | "settings:get"
  | "settings:set"
  | "games:scan"
  | "games:list"
  | "games:launch"
  | "games:favorite"
  | "games:tag"
  | "games:emulatorConfig:get"
  | "games:emulatorConfig:set"
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
  | "shell:showItemInFolder"
  | "libretro:cores:list"
  | "libretro:cores:detect"
  | "libretro:core:load"
  | "libretro:game:load"
  | "libretro:start"
  | "libretro:stop"
  | "libretro:reset"
  | "libretro:unload"
  | "libretro:unloadAll"
  | "libretro:frame:get"
  | "libretro:avinfo:get"
  | "libretro:input:set"
  | "libretro:analog:set"
  | "collections:list"
  | "collections:get"
  | "collections:create"
  | "collections:update"
  | "collections:delete"
  | "collections:items:add"
  | "collections:items:remove"
  | "collections:items:list"
  | "collections:smart:evaluate"
  | "streaming:list"
  | "streaming:add"
  | "streaming:update"
  | "streaming:delete"
  | "streaming:setEnabled"
  | "streaming:detectDesktopApp"
  | "streaming:launch"
  | "packages:list"
  | "packages:search"
  | "packages:install"
  | "packages:uninstall"
  | "packages:pin"
  | "packages:setAutoUpdate"
  | "packages:checkUpdates"
  | "packages:progress"
  | "packages:apt:password";
