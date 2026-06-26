import type { ScanSourceId } from "./scan-sources";
export type { ScanSourceId };

export type ThemeName = string;

export type TabId =
  | "gaming"
  | "movies"
  | "music"
  | "streaming"
  | "store"
  | "settings"
  | "controllers"
  | "dashboard";

export type GalleryView =
  | "theme-default"
  | "grid"
  | "list"
  | "hex-grid"
  | "bookshelf"
  | "spread-deck";

export interface ScanProgress {
  scanner: string;
  status: "scanning" | "done" | "error";
  current: number;
  total: number;
  message?: string;
}

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
  | "itch"
  | "unknown";

export type WineRunner = "wine" | "proton-ge" | "system-proton" | "umu-run";

export type ProtonRating =
  | "platinum"
  | "gold"
  | "silver"
  | "bronze"
  | "borked"
  | "unknown";

export type SessionHookTiming =
  | "before-start-blocking"
  | "before-start"
  | "after-start"
  | "after-crash"
  | "after-close";

export interface SessionHook {
  id: string;
  timing: SessionHookTiming;
  command: string;
  args?: string[];
  timeout?: number;
  env?: Record<string, string>;
  workingDir?: string;
}

export type SourceLocation =
  | "local"
  | "remote"
  | `rclone:${RemoteSourceProtocol}`
  | "online";

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
  /** Override launch command (replaces execPath/romPath logic) */
  launchCommand?: string;
  /** Override launch arguments */
  launchArgs?: string[];
  /** Override working directory */
  launchWorkingDir?: string;
  /** Extra environment variables merged into the game process env */
  launchEnv?: Record<string, string>;
  /** Session lifecycle hooks */
  sessionHooks?: SessionHook[];
  /** Whether the game source is local or remote */
  sourceLocation?: SourceLocation;
  /** Whether the remote file is missing */
  missing?: boolean;
  /** The scanner source that discovered this game (e.g. steam, lutris, rom) */
  source?: ScanSourceId;
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
  subtitleTrackId?: number | null;
  audioTrackId?: number | null;
  playbackSpeed?: number;
  hidden?: boolean;
  /** Whether the movie source is local or remote */
  sourceLocation?: SourceLocation;
  /** Whether the remote file is missing */
  missing?: boolean;
  /** Whether the movie file is corrupt */
  corrupt?: boolean;
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
  /** Whether the music source is local or remote */
  sourceLocation?: SourceLocation;
  /** Whether the remote file is missing */
  missing?: boolean;
  /** Whether the music file is corrupt */
  corrupt?: boolean;
  /** Timestamp of last playback */
  lastPlayed?: number;
}

export interface AudioTags {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  comment?: string;
}

export interface ReorganizeMove {
  id: string;
  oldPath: string;
  newPath: string;
  sidecars: { oldPath: string; newPath: string }[];
}

export interface ReorganizeResult {
  moves: ReorganizeMove[];
  errors: { id: string; error: string }[];
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
  /** Whether the TV show source is local or remote */
  sourceLocation?: SourceLocation;
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
  | "n64"
  | "switch"
  | "wiimote"
  | "generic";

export type ControllerConnectionType =
  | "wired"
  | "bluetooth"
  | "dongle"
  | "wireless"
  | "unknown";

export interface ControllerDevice {
  id: string;
  name: string;
  type: ControllerType;
  vendorId?: number;
  productId?: number;
  axisCount: number;
  buttonCount: number;
  controllerIdx?: number;
  /** Connection type inferred from sysfs / phys path */
  connectionType?: ControllerConnectionType;
  /** Estimated latency in ms (kernel event time → Node.js processing) */
  latencyMs?: number;
  /** Signal strength 0–100 for wireless connections, if available */
  signalStrengthPercent?: number;
  /** Battery level 0–100, if available from sysfs/upower */
  batteryPercent?: number;
  /** Linux input driver name */
  driverName?: string;
  /** sysfs physical path (e.g. usb-… or bluetooth MAC) */
  physPath?: string;
  /** When the device was first seen (epoch ms) */
  connectedAt?: number;
  /** Last input event timestamp (epoch ms) */
  lastActivityAt?: number;
}

export interface ButtonMapping {
  deviceId: string;
  inputCode: string;
  action: string;
}

export interface BluetoothDevice {
  mac: string;
  name: string;
  /** Paired with the host adapter */
  paired: boolean;
  /** Trusted by the host adapter */
  trusted: boolean;
  /** Currently connected */
  connected: boolean;
  /** Icon type from bluetoothctl (e.g. "input-gaming", "input-keyboard") */
  icon?: string;
  /** Signal strength 0-100 if available */
  rssiPercent?: number;
  /** Battery level 0-100 if available */
  batteryPercent?: number;
}

export interface BluetoothAdapterState {
  powered: boolean;
  discovering: boolean;
  address: string;
  name: string;
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

export type MatrixPreset =
  | "cyberpunk"
  | "ocean-blue"
  | "fire-red"
  | "monochrome"
  | "matrix"
  | "purple-haze"
  | "neon-pink"
  | "digital-rain";

export type BackgroundSettings =
  | { type: "theme" }
  | { type: "matrix-preset"; matrixPreset?: MatrixPreset }
  | { type: "daily"; dailySource?: DailyBackgroundSource; dailyCustomUrl?: string }
  | { type: "image"; imagePath?: string; imageFit?: ImageFitMode }
  | { type: "solid"; solidColor?: string }
  | { type: "gradient"; gradient?: string };

export type ImageFitMode = "cover" | "contain" | "stretch" | "center" | "repeat";

export interface OverlayStyle {
  /** Visual mode for the in-game overlay */
  mode: "glass" | "tint";
  /** Base color for the tint mode (hex / rgba) */
  color?: string;
  /** Background opacity (0-1) */
  opacity?: number;
}

export type UpdateCheckFrequency = "day" | "week" | "off";

export interface AppSettings {
  theme: ThemeName;
  background: BackgroundSettings;
  customCss?: string;
  language?: string;
  region?: string;
  showClock?: boolean;
  clockFormat?: "12h" | "24h";
  /** Global volume level (0-1) */
  volume?: number;
  /** Path to custom CSS file */
  customCssPath?: string;
  /** Controller input settings */
  controllerInputEnabled?: boolean;
  /** Gamepad polling rate in Hz */
  gamepadPollingRate?: number;
  /** Enable haptic feedback */
  hapticEnabled?: boolean;
  /** Enable analytics */
  enableAnalytics?: boolean;
  /** Start app on system boot */
  startOnBoot?: boolean;
  /** Enable hardware acceleration */
  hardwareAcceleration?: boolean;
  /** Keybind mappings: action → key string */
  keybinds?: Record<string, string>;
  /** Path overrides for emulator binaries */
  emulatorPaths?: Record<string, string>;
  /** Per-platform shader presets for emulators */
  emulatorShaders?: Record<string, string>;
  /** Default emulator shader when no platform-specific preset is set */
  defaultEmulatorShader?: string;
  /** Dolphin post-processing effect */
  dolphinPostProcessing?: string;
  /** Extra directories to scan for ROMs */
  romPaths?: string[];
  /** Extra directories to scan for games (PC / native / Dolphin) */
  gamePaths?: string[];
  /** Extra directories to scan for movies */
  moviePaths?: string[];
  /** Extra directories to scan for music */
  musicPaths?: string[];
  /** Extra directories to scan for TV shows */
  tvPaths?: string[];
  /** Enable automatic game metadata fetching */
  autoFetchMetadata?: boolean;
  /** Enable Discord Rich Presence */
  discordRpcEnabled?: boolean;
  /** IGDB API credentials */
  igdbClientId?: string;
  igdbClientSecret?: string;
  /** Steam Web API key */
  steamApiKey?: string;
  /** RAWG API key */
  rawgApiKey?: string;
  /** MobyGames API key */
  mobygamesApiKey?: string;
  /** TheGamesDB API key */
  thegamesdbApiKey?: string;
  /** LaunchBox database file path */
  launchboxDbPath?: string;
  /** OpenCritic API key */
  opencriticApiKey?: string;
  /** ScreenScraper credentials */
  screenscraperUser?: string;
  screenscraperPassword?: string;
  /** RetroAchievements credentials */
  retroachievementsUser?: string;
  retroachievementsApiKey?: string;
  /** MusicBrainz / TheAudioDB settings */
  musicbrainzEnabled?: boolean;
  theaudiodbApiKey?: string;
  acoustidApiKey?: string;
  /** TMDB API key */
  tmdbApiKey?: string;
  /** Fanart.tv API key */
  fanarttvApiKey?: string;
  /** Enable automatic thumbnail generation for movies */
  autoGenerateThumbnails?: boolean;
  /** Enable network discovery for remote media sources */
  networkDiscoveryEnabled?: boolean;
  /** Enable music visualizations */
  musicVisualization?: boolean;
  /** Default music visualization style */
  visualizationStyle?: string;
  /** Enable game cover caching */
  coverCacheEnabled?: boolean;
  /** Custom keyboard shortcuts: command id → shortcut string (e.g. "Ctrl+P") */
  commandKeybinds?: Record<string, string>;
  /** Custom controller button mappings: command id → button action (e.g. "north", "select") */
  commandControllerMap?: Record<string, string>;
  controllerBrowser?: ControllerBrowserSettings;
  remoteSources?: RemoteSource[];
  /** Chrome extensions installed for streaming webviews */
  streamingExtensions?: StreamingExtension[];
  /** Streaming services that have had their first-launch extension prompt dismissed */
  streamingExtensionPromptDismissed?: string[];
  /** Tabs hidden from the main navigation bar */
  disabledTabs?: TabId[];
  /** Tab to open on app launch */
  defaultTab?: TabId;
  /** Whether the window is in fullscreen mode */
  fullscreen?: boolean;
  /** Gallery layout view mode */
  galleryView?: GalleryView;
  /** Max concurrent flash game thumbnail captures (1–10) */
  flashThumbnailConcurrency?: number;
  /** Dashboard widget layout */
  dashboardLayout?: DashboardLayout;
  /** Scan sources (e.g. steam, lutris, heroic) that should be skipped during game scans */
  disabledScanSources?: ScanSourceId[];
  /** How to handle library entries detected as corrupt: warn, hide, or delete */
  corruptedFilesPolicy?: "warn" | "hide" | "delete";
  /** Flash game player settings */
  flashSettings?: FlashSettings;
  /** How often to check for updates */
  updateCheckFrequency?: UpdateCheckFrequency;
  /** Automatically download updates when available */
  updateAutoDownload?: boolean;
  /** Automatically install updates after downloading */
  updateAutoInstall?: boolean;
  /** Pin to a specific version (prevents auto-updates to other versions) */
  updatePinnedVersion?: string;
  /** Automatically create .desktop entries for discovered games */
  autoCreateDesktopEntries?: boolean;
  /** In-game overlay visual style */
  overlayStyle?: OverlayStyle;
  /** Per-game notes persisted in settings */
  gameNotes?: Record<string, string>;
  /** Automatically open the overlay when a game starts */
  overlayAutoShow?: boolean;
}

export type DashboardWidgetType =
  | "recent-games"
  | "favorite-games"
  | "system-info"
  | "clock"
  | "weather"
  | "news"
  | "achievements"
  | "recent-movies"
  | "recent-music"
  | "now-playing"
  | "quick-launch"
  | "webview"
  | "stats";

export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  title?: string;
  config?: Record<string, unknown>;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
  grid: DashboardGridItem[];
}

export interface DashboardGridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type RemoteSourceProtocol =
  | "sftp"
  | "ftp"
  | "smb"
  | "webdav"
  | "http"
  | "googledrive"
  | "dropbox"
  | "onedrive";

export type CredentialMode = "auto-key" | "user-password" | "session-only";

export interface RemoteSource {
  id: string;
  name: string;
  protocol: RemoteSourceProtocol;
  host?: string;
  port?: number;
  remotePath: string;
  mediaTypes: ("movie" | "music" | "rom")[];
  enabled: boolean;
  credentialMode: CredentialMode;
  encryptedCreds?: string;
  servePort?: number;
}

export interface ControllerBrowserSettings {
  enabled?: boolean;
  /** URL patterns to automatically show controller overlay in */
  urlPatterns?: string[];
  snapToElement?: boolean;
  snapDistance?: number;
  snapSelectors?: string[];
  mouseSpeed?: number;
  swapRightStickAxes?: boolean;
  buttonRemapping?: Record<string, string>;
}

export interface StreamingService {
  id: string;
  name: string;
  url: string;
  icon?: string;
  category: "video" | "music" | "game" | "media" | "utility";
  color?: string;
  textColor?: string;
  desktopApp?: string;
  desktopAppArgs?: string[];
  enabled?: boolean;
  isBuiltin?: boolean;
  sortOrder?: number;
  /** Whether the service should open in an embedded webview instead of externally */
  embed?: boolean;
  /** Whether frontpage scraping is enabled for this service */
  frontpageEnabled?: boolean;
  /** Total seconds spent in this service (tracked for sorting) */
  playTime?: number;
  /** Last time this service was opened */
  lastPlayed?: number;
}

export interface StreamingFrontpageItem {
  id: string;
  serviceId: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  description?: string;
  duration?: string;
  type?: "video" | "show" | "movie" | "live" | "playlist" | "channel";
  scrapedAt?: number;
  sortIndex?: number;
}

export interface StreamingExtension {
  id: string;
  name: string;
  sourceUrl: string;
  version: string;
  installedVersion?: string;
  installPath?: string;
  enabled: boolean;
  /** Which service IDs this extension applies to. Empty = all services. */
  serviceIds?: string[];
}

export interface ExtensionInstallResult {
  success: boolean;
  error?: string;
  extension?: StreamingExtension;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export type CollectionItemType = "game" | "movie" | "music" | "tv" | "mixed";
export type CollectionType = "manual" | "smart";
export type SortOrder = string;
export type SortDirection = "asc" | "desc";

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
  createdAt?: number;
  updatedAt?: number;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  itemId: string;
  itemType: "game" | "movie" | "music" | "tv" | "mixed";
  addedAt: number;
  order?: number;
}

export interface AiGroup {
  id: string;
  label: string;
  itemIds: string[];
  centerItemId?: string;
}

export type SmartFilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "notIn";

export type FilterOperator = SmartFilterOperator | "exists";

export interface SmartFilterRule {
  field: string;
  operator: string;
  value?: unknown;
}

export type SmartFilterGroupLogic = "and" | "or";

export interface SmartFilterGroup {
  logic: SmartFilterGroupLogic;
  rules: (SmartFilterRule | SmartFilterGroup)[];
}

export interface VideoDecoderMetadata {
  backend: string;
  width: number;
  height: number;
  durationMs: number;
  frameRate: number;
}

export type PluginType = "theme" | "emulator" | "generic";

export interface PluginManifest {
  id: string;
  name: string;
  displayName?: string;
  version: string;
  description?: string;
  author?: string;
  sourceUrl?: string;
  entryPoint: string;
  assetsPath?: string;
  hooks?: PluginHookName[];
  platforms?: string[];
  type?: PluginType;
}

export interface ThemeConfigOption {
  key: string;
  label: string;
  type: "color" | "number" | "string" | "select";
  default?: string | number;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
}

export interface ThemeRegistration {
  id: string;
  name: string;
  pluginId: string;
  cssUrl: string;
  preview?: string;
  thumbnailUrl?: string;
  configSchema?: ThemeConfigOption[];
  config?: Record<string, string | number>;
}

export type PluginHookName =
  | "onPluginInstall"
  | "onPluginUninstall"
  | "onPluginStart"
  | "onPluginStop"
  | "onPluginUpdate"
  | "onApplicationBoot"
  | "onApplicationShutdown"
  | "onGameStart"
  | "onGameStop"
  | "onGameCrash";

export interface PluginLaunchResult {
  type: "iframe" | "component" | "external";
  url?: string;
  pluginId: string;
}

export interface DiscoveredPlugin {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description?: string;
  author?: string;
  sourceUrl?: string;
  downloadUrl: string;
  installed: boolean;
  installedVersion?: string;
  enabled: boolean;
  devPath?: string;
}

export interface ManagedPackage {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  manager: string;
  version?: string;
  installedVersion?: string;
  isInstalled: boolean;
  isPinned: boolean;
  autoUpdate: boolean;
  category: string;
  platforms?: string[];
  sourceUrl?: string;
}

export type PackageManager = "apt" | "flatpak" | "buildbot" | "appimage" | "winehq" | "proton-ge";

export interface PackageOperationProgress {
  packageId: string;
  operation: "install" | "uninstall" | "update";
  status: "pending" | "running" | "success" | "error";
  message?: string;
  percent?: number;
}

export interface StreamingAdapterConfig {
  clientId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
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

export interface RemoteTestResult {
  success: boolean;
  message: string;
}

export interface DiscoveredDevice {
  name: string;
  ip: string;
  protocol?: "smb" | "sftp" | "ftp" | "webdav" | "http" | "nfs" | "unknown";
  port?: number;
  source: "mdns" | "avahi" | "nmblookup";
}

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error"
  | "rollback";

export interface UpdaterState {
  status: UpdaterStatus;
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  error?: string;
  lastChecked?: number;
  downloadSpeed?: number;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

export interface OAuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  error?: string;
}

