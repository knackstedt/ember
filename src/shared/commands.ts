export type CommandCategory =
  | "global"
  | "navigation"
  | "gaming"
  | "movies"
  | "music"
  | "tv"
  | "player"
  | "visual"
  | "settings";

export interface CommandDefinition {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  /** Default keyboard shortcut (e.g. "Ctrl+Shift+P", "F5") */
  defaultShortcut?: string;
  /** Whether the command requires a specific context to be available */
  requiresContext?:
    | "game-selected"
    | "movie-selected"
    | "music-selected"
    | "tv-selected"
    | "player-open"
    | "emulator-open"
    | "music-playing"
    | "video-playing"
    | "flash-playing"
    | "gaming-tab"
    | "movies-tab"
    | "music-tab"
    | "tv-tab"
    | "music-album-available"
    | "music-artist-available";
}

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  /* ─── Global ─── */
  { id: "palette.open", label: "Open Command Palette", description: "Search and run any command", category: "global", defaultShortcut: "Ctrl+P" },
  { id: "app.fullscreen", label: "Toggle Fullscreen", category: "global", defaultShortcut: "F11" },
  { id: "app.quit", label: "Quit Application", category: "global" },
  { id: "app.reload", label: "Reload Window", description: "Reload the application window", category: "global", defaultShortcut: "F5" },

  /* ─── Library Operations ─── */
  { id: "library.rescan.all", label: "Rescan All Libraries", description: "Rescan games, movies, music and TV", category: "global", defaultShortcut: "F1" },
  { id: "library.rescan.games", label: "Rescan Games", category: "global" },
  { id: "library.rescan.movies", label: "Rescan Movies", category: "global" },
  { id: "library.rescan.music", label: "Rescan Music", category: "global" },
  { id: "library.rescan.tv", label: "Rescan TV Shows", category: "global" },
  { id: "library.rescan.current", label: "Rescan Current Library", description: "Rescan the library for the active tab", category: "global", defaultShortcut: "F6" },
  { id: "library.wipe.data", label: "Wipe Library Data", description: "Clear all library data and restart", category: "global", defaultShortcut: "F2" },
  { id: "library.wipe.thumbnails", label: "Wipe Thumbnail Cache", description: "Clear all thumbnail caches", category: "global", defaultShortcut: "F3" },

  /* ─── Navigation ─── */
  { id: "nav.tab.gaming", label: "Switch to Gaming", category: "navigation" },
  { id: "nav.tab.movies", label: "Switch to Movies", category: "navigation" },
  { id: "nav.tab.music", label: "Switch to Music", category: "navigation" },
  { id: "nav.tab.tv", label: "Switch to TV Shows", category: "navigation" },
  { id: "nav.tab.store", label: "Switch to Store", category: "navigation" },
  { id: "nav.tab.settings", label: "Switch to Settings", category: "navigation" },
  { id: "nav.tab.controllers", label: "Switch to Controllers", category: "navigation" },
  { id: "nav.tab.next", label: "Next Tab", category: "navigation", defaultShortcut: "Tab" },
  { id: "nav.tab.prev", label: "Previous Tab", category: "navigation", defaultShortcut: "Shift+Tab" },

  /* ─── Gaming ─── */
  { id: "gaming.search", label: "Search Games", category: "gaming", requiresContext: "gaming-tab", defaultShortcut: "Ctrl+F" },
  { id: "gaming.toggle-favorite", label: "Toggle Favorite (Selected Game)", category: "gaming", requiresContext: "game-selected" },
  { id: "gaming.hide", label: "Hide Selected Game", category: "gaming", requiresContext: "game-selected" },
  { id: "gaming.show-hidden", label: "Show Hidden Games", category: "gaming", requiresContext: "gaming-tab" },
  { id: "gaming.view.all", label: "View: All Games", category: "gaming", requiresContext: "gaming-tab" },
  { id: "gaming.view.ai-groups", label: "View: AI Groups", category: "gaming", requiresContext: "gaming-tab" },
  { id: "gaming.view.by-platform", label: "View: By Platform", category: "gaming", requiresContext: "gaming-tab" },
  { id: "gaming.filter.favorites", label: "Filter: Favorites", category: "gaming", requiresContext: "gaming-tab" },
  { id: "gaming.filter.steam", label: "Filter: Steam", category: "gaming", requiresContext: "gaming-tab" },
  { id: "gaming.filter.retro", label: "Filter: Retro", category: "gaming", requiresContext: "gaming-tab" },
  { id: "gaming.emulator.stop", label: "Stop Emulator", category: "gaming", requiresContext: "emulator-open" },
  { id: "gaming.shader.clear", label: "Disable Shader", description: "Remove shader override from the selected game", category: "visual", requiresContext: "game-selected" },
  { id: "gaming.filter.clear", label: "Clear Platform Filter", category: "gaming", requiresContext: "gaming-tab" },

  /* ─── Movies ─── */
  { id: "movies.toggle-favorite", label: "Toggle Favorite (Selected Movie)", category: "movies", requiresContext: "movie-selected" },
  { id: "movies.hide", label: "Hide Selected Movie", category: "movies", requiresContext: "movie-selected" },
  { id: "movies.view.all", label: "View: All Movies", category: "movies", requiresContext: "movies-tab" },
  { id: "movies.view.ai-groups", label: "View: AI Groups", category: "movies", requiresContext: "movies-tab" },
  { id: "movies.view.local", label: "View: Local", category: "movies", requiresContext: "movies-tab" },
  { id: "movies.view.streaming", label: "View: Streaming", category: "movies", requiresContext: "movies-tab" },

  /* ─── Music ─── */
  { id: "music.toggle-favorite", label: "Toggle Favorite (Selected Track)", category: "music", requiresContext: "music-selected" },
  { id: "music.hide", label: "Hide Selected Track", category: "music", requiresContext: "music-selected" },
  { id: "music.view.tracks", label: "View: Tracks", category: "music", requiresContext: "music-tab" },
  { id: "music.view.ai-groups", label: "View: AI Groups", category: "music", requiresContext: "music-tab" },
  { id: "music.queue-track", label: "Queue Track", description: "Add selected track to end of queue", category: "music", requiresContext: "music-selected" },
  { id: "music.queue-track-next", label: "Queue Track Next", description: "Play selected track next", category: "music", requiresContext: "music-selected" },
  { id: "music.queue-album", label: "Queue Album", description: "Add selected album to end of queue", category: "music", requiresContext: "music-album-available" },
  { id: "music.queue-album-next", label: "Queue Album Next", description: "Play selected album next", category: "music", requiresContext: "music-album-available" },
  { id: "music.queue-artist", label: "Queue Artist", description: "Add selected artist to end of queue", category: "music", requiresContext: "music-artist-available" },
  { id: "music.queue-artist-next", label: "Queue Artist Next", description: "Play selected artist next", category: "music", requiresContext: "music-artist-available" },

  /* ─── TV Shows ─── */
  { id: "tv.toggle-favorite", label: "Toggle Favorite (Selected Show)", category: "tv", requiresContext: "tv-selected" },
  { id: "tv.hide", label: "Hide Selected Show", category: "tv", requiresContext: "tv-selected" },
  { id: "tv.view.all", label: "View: All Shows", category: "tv", requiresContext: "tv-tab" },
  { id: "tv.view.ai-groups", label: "View: AI Groups", category: "tv", requiresContext: "tv-tab" },

  /* ─── Player ─── */
  { id: "player.play-pause", label: "Play / Pause", category: "player", requiresContext: "music-playing" },
  { id: "player.next", label: "Next Track", category: "player", requiresContext: "music-playing" },
  { id: "player.prev", label: "Previous Track", category: "player", requiresContext: "music-playing" },
  { id: "player.stop", label: "Stop Playback", category: "player", requiresContext: "player-open" },
  { id: "player.volume-up", label: "Volume Up", category: "player" },
  { id: "player.volume-down", label: "Volume Down", category: "player" },
  { id: "player.toggle-shuffle", label: "Toggle Shuffle", category: "player", requiresContext: "music-playing" },
  { id: "player.toggle-repeat", label: "Toggle Repeat", category: "player", requiresContext: "music-playing" },
  { id: "player.close", label: "Close Player", category: "player", requiresContext: "player-open" },
  { id: "player.toggle-queue", label: "Toggle Queue Blade", description: "Show or hide the music queue", category: "player", requiresContext: "player-open" },
  { id: "player.focus-queue", label: "Focus Queue", description: "Move controller focus to the queue blade", category: "player", requiresContext: "player-open" },
  { id: "player.focus-player", label: "Focus Music Player", description: "Move controller focus to the music player controls", category: "player", requiresContext: "player-open" },

  /* ─── Visual Effects ─── */
  { id: "visual.shader.disable", label: "Disable Shader / Filter", description: "Turn off any active shader or visual effect", category: "visual", requiresContext: "emulator-open" },
  { id: "visual.filter.clear", label: "Clear Visual Filter", description: "Disable flash filter / post-processing effect", category: "visual", requiresContext: "flash-playing" },
  { id: "visual.upscale.none", label: "Upscale: None", category: "visual", requiresContext: "emulator-open" },
  { id: "visual.upscale.gaussian", label: "Upscale: Gaussian", category: "visual", requiresContext: "emulator-open" },
  { id: "visual.upscale.pixelate", label: "Upscale: Pixelate", category: "visual", requiresContext: "emulator-open" },

  /* ─── Settings ─── */
  { id: "settings.open", label: "Open Settings", category: "settings" },
  { id: "settings.theme.next", label: "Next Theme", category: "settings" },
  { id: "settings.plugins.reload", label: "Reload Plugins", category: "settings" },
];

export function getCommandById(id: string): CommandDefinition | undefined {
  return COMMAND_DEFINITIONS.find((c) => c.id === id);
}
