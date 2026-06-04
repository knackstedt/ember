import { useCallback, useMemo } from "react";
import {
  CommandDefinition,
  COMMAND_DEFINITIONS,
} from "../../../shared/commands";
import { TabId, ThemeName } from "../../../shared/types";
import { useCommandsStore } from "../store/commands.store";
import { useGamesStore } from "../store/games.store";
import {
  useMoviesStore,
  useMusicStore,
  useTvStore,
} from "../store/media.store";
import { useSettingsStore } from "../store/settings.store";
import { useMusicPlayerStore } from "../store/musicPlayer.store";
import { useVideoPlayerStore } from "../store/videoPlayer.store";
import { useFlashPlayerStore } from "../store/flashPlayer.store";
import { useJsnesPlayerStore } from "../store/jsnesPlayer.store";
import { useEmulatorjsPlayerStore } from "../store/emulatorjsPlayer.store";
import { useV86PlayerStore } from "../store/v86Player.store";
import { useLibretroPlayerStore } from "../store/libretroPlayer.store";

const THEME_CYCLE: ThemeName[] = [
  "dark-oled",
  "glassmorphism",
  "neon-cyberpunk",
  "terminal-tui",
  "custom",
];

export interface CommandContext {
  activeTab: TabId;
  visibleTabs: TabId[];
  selectedGameId: string | null;
  selectedMovieId: string | null;
  selectedMusicId: string | null;
  selectedTvId: string | null;
}

export function useCommands(
  context: CommandContext,
  setActiveTab: (tab: TabId) => void,
) {
  const closePalette = useCommandsStore((s) => s.close);

  /* ── store actions ── */
  const scanGames = useGamesStore((s) => s.scan);
  const scanMovies = useMoviesStore((s) => s.scan);
  const scanMusic = useMusicStore((s) => s.scan);
  const scanTv = useTvStore((s) => s.scan);
  const loadGames = useGamesStore((s) => s.load);
  const loadMovies = useMoviesStore((s) => s.load);
  const loadMusic = useMusicStore((s) => s.load);
  const loadTv = useTvStore((s) => s.load);
  const games = useGamesStore((s) => s.games);
  const movies = useMoviesStore((s) => s.movies);
  const music = useMusicStore((s) => s.tracks);
  const tvShows = useTvStore((s) => s.shows);

  const toggleFavoriteGame = useGamesStore((s) => s.toggleFavorite);
  const hideGame = useGamesStore((s) => s.hide);
  const setGameFilter = useGamesStore((s) => s.setFilter);

  const toggleFavoriteMovie = useMoviesStore((s) => s.toggleFavorite);
  const hideMovie = useMoviesStore((s) => s.hide);

  const toggleFavoriteMusic = useMusicStore((s) => s.toggleFavorite);
  const hideMusic = useMusicStore((s) => s.hide);

  const toggleFavoriteTv = useTvStore((s) => s.toggleFavorite);
  const hideTv = useTvStore((s) => s.hide);

  const playerNext = useMusicPlayerStore((s) => s.next);
  const playerPrev = useMusicPlayerStore((s) => s.prev);
  const playerPause = useMusicPlayerStore((s) => s.pause);
  const playerResume = useMusicPlayerStore((s) => s.resume);
  const playerShuffle = useMusicPlayerStore((s) => s.toggleShuffle);
  const playerRepeat = useMusicPlayerStore((s) => s.toggleRepeat);
  const closeVideoPlayer = useVideoPlayerStore((s) => s.close);

  const closeFlash = useFlashPlayerStore((s) => s.close);
  const closeJsnes = useJsnesPlayerStore((s) => s.close);
  const closeEmulatorjs = useEmulatorjsPlayerStore((s) => s.close);
  const closeV86 = useV86PlayerStore((s) => s.close);
  const closeLibretro = useLibretroPlayerStore((s) => s.close);

  const settings = useSettingsStore((s) => s.settings);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const updateSettings = useSettingsStore((s) => s.update);

  /* ── context flags ── */
  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);
  const playing = useMusicPlayerStore((s) => s.playing);
  const videoOpen = useVideoPlayerStore((s) => !!s.src);
  const flashOpen = useFlashPlayerStore((s) => s.open);
  const jsnesOpen = useJsnesPlayerStore((s) => s.open);
  const emulatorjsOpen = useEmulatorjsPlayerStore((s) => s.open);
  const v86Open = useV86PlayerStore((s) => s.open);
  const libretroOpen = useLibretroPlayerStore((s) => s.open);
  const anyEmulatorOpen = flashOpen || jsnesOpen || emulatorjsOpen || v86Open || libretroOpen;
  const anyPlayerOpen = hasPlayer || videoOpen || anyEmulatorOpen;

  /* ── execute ── */
  const executeCommand = useCallback(
    (cmd: CommandDefinition) => {
      closePalette();

      switch (cmd.id) {
        /* Global */
        case "palette.open":
          useCommandsStore.getState().open();
          break;
        case "app.fullscreen":
          window.htpc.app.setFullscreen(
            !(document.fullscreenElement ?? false),
          );
          break;
        case "app.quit":
          window.htpc.app.quit();
          break;
        case "app.reload":
          window.htpc.app.restart();
          break;

        /* Library */
        case "library.rescan.all":
          scanGames();
          scanMovies();
          scanMusic();
          scanTv();
          break;
        case "library.rescan.games":
          scanGames();
          break;
        case "library.rescan.movies":
          scanMovies();
          break;
        case "library.rescan.music":
          scanMusic();
          break;
        case "library.rescan.tv":
          scanTv();
          break;
        case "library.rescan.current": {
          const scanMap: Partial<Record<TabId, () => void>> = {
            gaming: scanGames,
            movies: scanMovies,
            music: scanMusic,
            "tv-shows": scanTv,
          };
          scanMap[context.activeTab]?.();
          break;
        }
        case "library.wipe.data":
          window.htpc.db
            .clear()
            .then(() => window.htpc.app.restart())
            .catch((err) => console.error("[command] wipe data failed:", err));
          break;
        case "library.wipe.thumbnails":
          window.htpc.db
            .wipeThumbnails()
            .then(() => {
              loadGames();
              loadMovies();
              loadMusic();
              loadTv();
            })
            .catch((err) =>
              console.error("[command] wipe thumbnails failed:", err),
            );
          break;

        /* Navigation */
        case "nav.tab.gaming":
          setActiveTab("gaming");
          break;
        case "nav.tab.movies":
          setActiveTab("movies");
          break;
        case "nav.tab.music":
          setActiveTab("music");
          break;
        case "nav.tab.tv":
          setActiveTab("tv-shows");
          break;
        case "nav.tab.settings":
          setActiveTab("settings");
          break;
        case "nav.tab.controllers":
          setActiveTab("controllers");
          break;
        case "nav.tab.next": {
          const tabs = context.visibleTabs;
          const idx = tabs.indexOf(context.activeTab);
          setActiveTab(tabs[(idx + 1) % tabs.length]);
          break;
        }
        case "nav.tab.prev": {
          const tabs = context.visibleTabs;
          const idx = tabs.indexOf(context.activeTab);
          setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
          break;
        }

        /* Gaming */
        case "gaming.search": {
          const input = document.querySelector<HTMLInputElement>(
            'input[placeholder^="Search"]',
          );
          input?.focus();
          break;
        }
        case "gaming.toggle-favorite": {
          if (context.selectedGameId) toggleFavoriteGame(context.selectedGameId);
          break;
        }
        case "gaming.hide": {
          if (context.selectedGameId) hideGame(context.selectedGameId);
          break;
        }
        case "gaming.show-hidden":
          setGameFilter("all");
          break;
        case "gaming.view.all":
          window.dispatchEvent(new CustomEvent("htpc:gaming-view", { detail: "all" }));
          break;
        case "gaming.view.ai-groups":
          window.dispatchEvent(new CustomEvent("htpc:gaming-view", { detail: "ai-groups" }));
          break;
        case "gaming.view.by-platform":
          window.dispatchEvent(new CustomEvent("htpc:gaming-view", { detail: "by-platform" }));
          break;
        case "gaming.filter.favorites":
          setGameFilter("favorites");
          break;
        case "gaming.filter.steam":
          setGameFilter("steam");
          break;
        case "gaming.filter.retro":
          setGameFilter("nes");
          break;
        case "gaming.filter.clear":
          setGameFilter("all");
          break;
        case "gaming.emulator.stop":
          closeFlash();
          closeJsnes();
          closeEmulatorjs();
          closeV86();
          closeLibretro();
          break;
        case "gaming.shader.clear": {
          if (context.selectedGameId) {
            const setEmulatorConfig = useGamesStore.getState().setEmulatorConfig;
            setEmulatorConfig(context.selectedGameId, { shader: "" });
          }
          break;
        }

        /* Movies */
        case "movies.toggle-favorite": {
          if (context.selectedMovieId) toggleFavoriteMovie(context.selectedMovieId);
          break;
        }
        case "movies.hide": {
          if (context.selectedMovieId) hideMovie(context.selectedMovieId);
          break;
        }
        case "movies.view.all":
          window.dispatchEvent(new CustomEvent("htpc:movies-view", { detail: "all" }));
          break;
        case "movies.view.ai-groups":
          window.dispatchEvent(new CustomEvent("htpc:movies-view", { detail: "ai-groups" }));
          break;
        case "movies.view.local":
          window.dispatchEvent(new CustomEvent("htpc:movies-view", { detail: "local" }));
          break;
        case "movies.view.streaming":
          window.dispatchEvent(new CustomEvent("htpc:movies-view", { detail: "streaming" }));
          break;

        /* Music */
        case "music.toggle-favorite": {
          if (context.selectedMusicId) toggleFavoriteMusic(context.selectedMusicId);
          break;
        }
        case "music.hide": {
          if (context.selectedMusicId) hideMusic(context.selectedMusicId);
          break;
        }
        case "music.view.tracks":
          window.dispatchEvent(new CustomEvent("htpc:music-view", { detail: "tracks" }));
          break;
        case "music.view.ai-groups":
          window.dispatchEvent(new CustomEvent("htpc:music-view", { detail: "ai-groups" }));
          break;

        /* TV */
        case "tv.toggle-favorite": {
          if (context.selectedTvId) toggleFavoriteTv(context.selectedTvId);
          break;
        }
        case "tv.hide": {
          if (context.selectedTvId) hideTv(context.selectedTvId);
          break;
        }
        case "tv.view.all":
          window.dispatchEvent(new CustomEvent("htpc:tv-view", { detail: "all" }));
          break;
        case "tv.view.ai-groups":
          window.dispatchEvent(new CustomEvent("htpc:tv-view", { detail: "ai-groups" }));
          break;

        /* Player */
        case "player.play-pause": {
          const p = useMusicPlayerStore.getState().playing;
          if (p) playerPause(); else playerResume();
          break;
        }
        case "player.next":
          playerNext();
          break;
        case "player.prev":
          playerPrev();
          break;
        case "player.stop":
          playerPause();
          closeVideoPlayer();
          closeFlash();
          closeJsnes();
          closeEmulatorjs();
          closeV86();
          closeLibretro();
          break;
        case "player.volume-up": {
          const videoEl = document.querySelector("video");
          if (videoEl) videoEl.volume = Math.min(1, videoEl.volume + 0.1);
          break;
        }
        case "player.volume-down": {
          const videoEl = document.querySelector("video");
          if (videoEl) videoEl.volume = Math.max(0, videoEl.volume - 0.1);
          break;
        }
        case "player.toggle-shuffle":
          playerShuffle();
          break;
        case "player.toggle-repeat":
          playerRepeat();
          break;
        case "player.close":
          closeVideoPlayer();
          closeFlash();
          closeJsnes();
          closeEmulatorjs();
          closeV86();
          closeLibretro();
          break;

        /* Visual */
        case "visual.shader.disable":
          /* Stops any active emulator to clear shader state */
          closeFlash();
          closeJsnes();
          closeEmulatorjs();
          closeV86();
          closeLibretro();
          break;
        case "visual.filter.clear": {
          const fs = settings?.flashSettings;
          if (fs) {
            updateSettings({
              flashSettings: { ...fs, filter: "none" },
            });
          }
          break;
        }
        case "visual.upscale.none":
        case "visual.upscale.gaussian":
        case "visual.upscale.pixelate": {
          const style = cmd.id === "visual.upscale.gaussian"
            ? "gaussian"
            : cmd.id === "visual.upscale.pixelate"
              ? "pixelate"
              : "none";
          const fs = settings?.flashSettings;
          if (fs) {
            updateSettings({
              flashSettings: { ...fs, upscaleStyle: style as any },
            });
          }
          break;
        }

        /* Settings */
        case "settings.open":
          setActiveTab("settings");
          break;
        case "settings.theme.next": {
          const current = settings?.theme ?? "dark-oled";
          const idx = THEME_CYCLE.indexOf(current as ThemeName);
          const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
          setTheme(next);
          break;
        }
        case "settings.plugins.reload":
          window.htpc.plugins.reload();
          break;

        default:
          console.warn("[CommandPalette] unhandled command:", cmd.id);
      }
    },
    [
      closePalette,
      context,
      setActiveTab,
      scanGames,
      scanMovies,
      scanMusic,
      scanTv,
      loadGames,
      loadMovies,
      loadMusic,
      loadTv,
      games,
      movies,
      music,
      tvShows,
      toggleFavoriteGame,
      hideGame,
      setGameFilter,
      toggleFavoriteMovie,
      hideMovie,
      toggleFavoriteMusic,
      hideMusic,
      toggleFavoriteTv,
      hideTv,
      playerNext,
      playerPrev,
      playerPause,
      playerResume,
      playerShuffle,
      playerRepeat,
      closeVideoPlayer,
      closeFlash,
      closeJsnes,
      closeEmulatorjs,
      closeV86,
      closeLibretro,
      settings,
      setTheme,
      updateSettings,
    ],
  );

  /* ── filter visible commands by context ── */
  const availableCommands = useMemo(() => {
    return COMMAND_DEFINITIONS.filter((cmd) => {
      if (!cmd.requiresContext) return true;
      switch (cmd.requiresContext) {
        case "game-selected":
          return context.activeTab === "gaming" && !!context.selectedGameId;
        case "movie-selected":
          return context.activeTab === "movies" && !!context.selectedMovieId;
        case "music-selected":
          return context.activeTab === "music" && !!context.selectedMusicId;
        case "tv-selected":
          return context.activeTab === "tv-shows" && !!context.selectedTvId;
        case "gaming-tab":
          return context.activeTab === "gaming";
        case "movies-tab":
          return context.activeTab === "movies";
        case "music-tab":
          return context.activeTab === "music";
        case "tv-tab":
          return context.activeTab === "tv-shows";
        case "player-open":
          return anyPlayerOpen;
        case "emulator-open":
          return anyEmulatorOpen;
        case "music-playing":
          return hasPlayer || playing;
        case "video-playing":
          return videoOpen;
        case "flash-playing":
          return flashOpen;
        default:
          return true;
      }
    });
  }, [
    context,
    anyPlayerOpen,
    anyEmulatorOpen,
    hasPlayer,
    playing,
    videoOpen,
    flashOpen,
  ]);

  return { executeCommand, availableCommands };
}
