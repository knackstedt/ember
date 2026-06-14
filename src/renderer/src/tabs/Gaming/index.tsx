import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useGamesStore } from "../../store/games.store";
import {
  ChipFilters,
  ChipFilter,
} from "../../components/ChipFilters/ChipFilters";
import {
  VirtualGrid,
  VirtualGridHandle,
} from "../../components/VirtualGrid/VirtualGrid";
import { GameCard } from "../../components/GameCard/GameCard";
import { DetailPanel } from "../../components/DetailPanel/DetailPanel";
import { OskInput } from "../../components/OnScreenKeyboard/OnScreenKeyboard";
import { RecentlyPlayedRow } from "../../components/RecentlyPlayedRow/RecentlyPlayedRow";
import { CoreSelector } from "../../components/CoreSelector/CoreSelector";
import { Dropdown } from "../../components/Dropdown/Dropdown";
import { Game, GamePlatform, GameEmulatorConfig, WineRunner } from "../../../../shared/types";
import { useGridFocus } from "../../hooks/useGridFocus";
import { useDetailController } from "../../hooks/useDetailController";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";
import { useFlashPlayerStore } from "../../store/flashPlayer.store";
import { useJsnesPlayerStore } from "../../store/jsnesPlayer.store";
import { usePluginPlayerStore } from "../../store/pluginPlayer.store";
import { useLibretroPlayerStore } from "../../store/libretroPlayer.store";
import { SHADER_PRESETS } from "../../components/LibretroPlayer/shaders";
import { useToastStore } from "../../store/toast.store";
import { useSettingsStore } from "../../store/settings.store";
import { useCollectionsStore, evaluateSmartFilter, sortByCollection } from "../../store/collections.store";
import { CollectionsBar } from "../../components/CollectionsBar/CollectionsBar";
import { CollectionManager } from "../../components/CollectionManager/CollectionManager";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import {
  Star,
  StarOff,
  EyeOff,
  Tag,
  RotateCw,
  FolderOpen,
  Gamepad2,
  Bug,
  Trash2,
  Folder,
  Loader,
  Sparkles,
  Play,
  X,
  Archive,
  Settings,
  Plus,
  Globe,
} from "lucide-react";
import { AiGroup } from "../../../../shared/types";
import { DynamicFacetFilters, FacetField } from "../../components/DynamicFacetFilters/DynamicFacetFilters";
import type { GameVideo } from "../../../../shared/metadata";

// Extended game type that includes lazy-loaded metadata properties
type GameWithMetadata = Game & Partial<{
  iconUrl: string;
  metacriticScore: number;
  openCriticScore: number;
  playtime: number;
  platforms: string[];
  screenshots: string[];
  videos: GameVideo[];
  achievementCount: number;
  igdbId: number;
}>;

let devToolsOpen = false;
window.htpc.devtools
  ?.isOpen?.()
  .then((open) => { devToolsOpen = open; })
  .catch(() => { /* ignore */ });
window.htpc.devtools?.onChange?.((open) => { devToolsOpen = open; });

const PLATFORM_FILTERS: ChipFilter<
  GamePlatform | "all" | "couch-coop" | "favorites"
>[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: <><Star size={14} /> Favorites</> },
  { id: "couch-coop", label: <><Gamepad2 size={14} /> Couch Co-op</> },
  { id: "steam", label: "Steam" },
  { id: "gog", label: "GOG" },
  { id: "heroic", label: "Heroic/Epic" },
  { id: "lutris", label: "Lutris" },
  { id: "itch", label: "itch.io" },
  { id: "dolphin-gc", label: "GameCube" },
  { id: "dolphin-wii", label: "Wii" },
  { id: "nes", label: "NES" },
  { id: "snes", label: "SNES" },
  { id: "gb", label: "Game Boy" },
  { id: "gba", label: "GBA" },
  { id: "n64", label: "N64" },
  { id: "genesis", label: "Genesis" },
  { id: "sms", label: "SMS" },
  { id: "gamegear", label: "Game Gear" },
  { id: "pce", label: "PC Engine" },
  { id: "psx", label: "PlayStation" },
  { id: "nds", label: "DS" },
  { id: "dreamcast", label: "Dreamcast" },
  { id: "flash", label: "Flash" },
  { id: "dos", label: "DOS/PC" },
  { id: "windows", label: "Windows" },
  { id: "desktop", label: "Other" },
];

const LIBRETRO_PLATFORMS: GamePlatform[] = [
  "nes", "n64", "genesis", "sms", "gamegear", "pce", "psx", "nds", "dreamcast"
];

const PROTON_COLORS: Record<string, string> = {
  platinum: "#b5e3ff",
  gold: "#ffd700",
  silver: "#c0c0c0",
  bronze: "#cd7f32",
  borked: "#ff4444",
};

function getMissingCoreTooltip(game: Game): string | undefined {
  if (!LIBRETRO_PLATFORMS.includes(game.platform)) return undefined;
  if (!game.romPath) return undefined;
  if (window.htpc.libretro.detectCore(game.romPath) !== null) return undefined;
  const platformLabel = PLATFORM_FILTERS.find((f) => f.id === game.platform)?.label ?? game.platform;
  return `No ${platformLabel} emulator cores are installed. Install it in settings.`;
}

const LazyGameCard: React.FC<{
  game: Game;
  index: number;
  focusedIndex: number;
  onSelect: () => void;
  onFavorite: () => void;
}> = React.memo(({ game, index, focusedIndex, onSelect, onFavorite }) => {
  const loadThumbnail = useGamesStore((s) => s.loadThumbnail);
  const isThumbnailPending = useGamesStore(
    (s) => s.pendingThumbnailIds.has(game.id) || s.regeneratingIds.has(game.id)
  );
  const coreVersion = useGamesStore((s) => s.coreVersion);

  useEffect(() => {
    if (game.platform === "flash" && !game.coverUrl) {
      loadThumbnail(game.id);
    }
  }, [game.id, game.platform, game.coverUrl, loadThumbnail]);

  const missingCoreTooltip = useMemo(() => getMissingCoreTooltip(game), [game, coreVersion]);

  const b = gameBadge(game);
  return (
    <GameCard
      key={game.id}
      id={game.id}
      title={game.title}
      subtitle={game.developer}
      coverUrl={game.coverUrl}
      platform={game.platform}
      badge={b?.label}
      badgeColor={b?.color}
      isFavorite={game.isFavorite}
      isFocused={index === focusedIndex}
      isThumbnailPending={isThumbnailPending}
      corrupt={game.corrupt}
      missingCoreTooltip={missingCoreTooltip}
      playTime={game.playTime}
      lastPlayed={game.lastPlayed}
      missing={game.missing}
      onSelect={onSelect}
      onFavorite={onFavorite}
    />
  );
});

function gameBadge(game: Game): { label: string; color: string } | undefined {
  if (game.protonRating && game.protonRating !== "unknown") {
    return {
      label: game.protonRating,
      color: PROTON_COLORS[game.protonRating],
    };
  }
  return undefined;
}

export const GamingTab: React.FC = () => {
  const games = useGamesStore((s) => s.games);
  const loading = useGamesStore((s) => s.loading);
  const scanning = useGamesStore((s) => s.scanning);
  const remoteScanning = useGamesStore((s) => s.remoteScanning);
  const activeFilter = useGamesStore((s) => s.activeFilter);
  const consoleFilter = useGamesStore((s) => s.consoleFilter);
  const searchQuery = useGamesStore((s) => s.searchQuery);
  const load = useGamesStore((s) => s.load);
  const scan = useGamesStore((s) => s.scan);
  const setFilter = useGamesStore((s) => s.setFilter);
  const setConsoleFilter = useGamesStore((s) => s.setConsoleFilter);
  const setSearch = useGamesStore((s) => s.setSearch);
  const filtered = useGamesStore((s) => s.filtered);
  const toggleFavorite = useGamesStore((s) => s.toggleFavorite);
  const setTags = useGamesStore((s) => s.setTags);
  const hide = useGamesStore((s) => s.hide);
  const deleteGame = useGamesStore((s) => s.delete);
  const regenerateThumbnail = useGamesStore((s) => s.regenerateThumbnail);
  const updateLastPlayed = useGamesStore((s) => s.updateLastPlayed);
  useGamesStore((s) => s.coreVersion); // forces re-render when cores change
  const [selected, setSelected] = useState<Game | null>(null);
  const [columnCount, setColumnCount] = useState(6);
  const [selectedEmulatorConfig, setSelectedEmulatorConfig] = useState<GameEmulatorConfig>({});
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [showLaunchSettings, setShowLaunchSettings] = useState(false);
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string>>(new Set());
  const gridRef = useRef<VirtualGridHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  type ViewMode = "all" | "ai-groups";
  const [viewMode, setViewMode] = useState<ViewMode>("ai-groups");
  const [aiGroups, setAiGroups] = useState<AiGroup[]>([]);
  const [aiGroupsLoading, setAiGroupsLoading] = useState(false);
  const [selectedAiGroupId, setSelectedAiGroupId] = useState<string | null>(null);
  const aiGroupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [facetFilters, setFacetFilters] = useState<Record<string, string | null>>({});
  const applyFacetFilter = (field: string, value: string | null) => {
    setFacetFilters((prev) => ({ ...prev, [field]: value }));
  };
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const [topBarFocused, setTopBarFocused] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const collections = useCollectionsStore((s) => s.collections);
  const loadCollections = useCollectionsStore((s) => s.load);
  const addItem = useCollectionsStore((s) => s.addItem);
  const listItems = useCollectionsStore((s) => s.listItems);

  const setEmulatorConfig = useGamesStore((s) => s.setEmulatorConfig);
  const getEmulatorConfig = useGamesStore((s) => s.getEmulatorConfig);
  const setWineRunner = useGamesStore((s) => s.setWineRunner);
  const setWineCustomCommand = useGamesStore((s) => s.setWineCustomCommand);
  const setUmuCustomCommand = useGamesStore((s) => s.setUmuCustomCommand);

  useEffect(() => {
    if (!selected) {
      setSelectedEmulatorConfig({});
      return;
    }
    const emulatorPlatforms: GamePlatform[] = ["nes", "snes", "gb", "gba", "n64", "genesis", "sms", "gamegear", "pce", "psx", "nds", "dreamcast"];
    if (emulatorPlatforms.includes(selected.platform)) {
      getEmulatorConfig(selected.id).then(setSelectedEmulatorConfig).catch(() => setSelectedEmulatorConfig({}));
    } else {
      setSelectedEmulatorConfig({});
    }
  }, [selected, getEmulatorConfig]);

  useEffect(() => {
    load();
    loadCollections();
  }, []);

  useEffect(() => {
    if (!activeCollectionId) {
      setCollectionItemIds(new Set());
      return;
    }
    const collection = collections.find((c) => c.id === activeCollectionId);
    if (!collection) return;

    if (collection.type === "smart" && collection.filter) {
      const result = evaluateSmartFilter(games, collection.filter);
      setCollectionItemIds(new Set(result.map((g) => g.id)));
    } else {
      listItems(activeCollectionId).then((items) => {
        setCollectionItemIds(new Set(items.map((i) => i.itemId)));
      });
    }
  }, [activeCollectionId, collections, games]);

  useEffect(() => {
    const handler = () => setSelected(null);
    window.addEventListener("htpc:escape", handler);
    return () => window.removeEventListener("htpc:escape", handler);
  }, []);

  useEffect(() => {
    if (selected) {
      setTopBarFocused(false);
    }
  }, [selected]);

  /* Dispatch selection changes for command palette context */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("htpc:select-game", { detail: { id: selected?.id ?? null } }),
    );
  }, [selected?.id]);

  /* Listen for view-mode commands from command palette */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      if (["all", "ai-groups"].includes(detail)) {
        setViewMode(detail as ViewMode);
      }
    };
    window.addEventListener("htpc:gaming-view", handler);
    return () => window.removeEventListener("htpc:gaming-view", handler);
  }, []);

  /* Controller navigation for top bar */
  useEffect(() => {
    if (!topBarFocused) return;
    const handler = (e: Event) => {
      if (dropdownOpen) return; // dropdown handles its own nav when open
      const detail = (e as CustomEvent).detail as { action: string };
      if (detail?.action === "down" || detail?.action === "cancel") {
        e.stopImmediatePropagation?.();
        setTopBarFocused(false);
      } else if (detail?.action === "confirm") {
        e.stopImmediatePropagation?.();
        setDropdownOpen(true);
      }
    };
    window.addEventListener("htpc:nav", handler);
    return () => window.removeEventListener("htpc:nav", handler);
  }, [topBarFocused, dropdownOpen]);

  /* Auto-generate AI groups when viewMode switches to ai-groups and games are loaded */
  useEffect(() => {
    if (viewMode !== "ai-groups" || games.length === 0) return;
    if (aiGroups.length > 0) return; // already computed
    setAiGroupsLoading(true);
    if (aiGroupTimeoutRef.current) clearTimeout(aiGroupTimeoutRef.current);

    window.htpc.localAi
      .groupItems(
        games.map((g) => ({
          id: g.id,
          title: g.title,
          genres: g.genres,
          tags: g.tags,
          description: g.description,
          platform: g.platform,
        })),
        Math.min(6, Math.max(2, Math.floor(games.length / 8))),
      )
      .then((groups) => {
        // Add generated IDs to groups since the AI service doesn't provide them
        setAiGroups(groups.map((g, i) => ({ ...g, id: `ai-group-${i}-${Date.now()}` })));
        setAiGroupsLoading(false);
      })
      .catch(() => {
        setAiGroupsLoading(false);
        setViewMode("all");
      });

    // Fallback: if AI takes too long, switch to All view
    aiGroupTimeoutRef.current = setTimeout(() => {
      if (aiGroupsLoading) {
        setAiGroupsLoading(false);
        setViewMode("all");
      }
    }, 15000);

    return () => {
      if (aiGroupTimeoutRef.current) clearTimeout(aiGroupTimeoutRef.current);
    };
  }, [viewMode, games]);

  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId),
    [collections, activeCollectionId],
  );

  const items = useMemo(() => {
    const base = filtered();
    if (!activeCollectionId) return base;
    const result = base.filter((g) => collectionItemIds.has(g.id));
    return sortByCollection<Game>(result, activeCollection);
  }, [filtered, games, activeFilter, consoleFilter, searchQuery, activeCollectionId, collectionItemIds, activeCollection]);

  const displayItems = useMemo(() => {
    if (viewMode !== "ai-groups" || !selectedAiGroupId) return items;
    const group = aiGroups.find((g) => g.id === selectedAiGroupId);
    if (!group) return items;
    const ids = new Set(group.itemIds);
    return items.filter((g) => ids.has(g.id));
  }, [items, viewMode, aiGroups, selectedAiGroupId]);

  const facetSourceItems = displayItems;

  const gridItems = useMemo(() => {
    let r = facetSourceItems;
    for (const [field, value] of Object.entries(facetFilters)) {
      if (!value) continue;
      r = r.filter((game) => {
        const raw = game[field as keyof Game];
        if (raw === undefined || raw === null) return false;
        if (Array.isArray(raw)) return raw.some((v) => String(v).toLowerCase() === value.toLowerCase());
        return String(raw).toLowerCase() === value.toLowerCase();
      });
    }
    return r;
  }, [facetSourceItems, facetFilters]);

  const gameFacetFields: FacetField[] = useMemo(() => [
    { key: "genres", label: "Genre", accessor: (g) => (g as Record<string, unknown>).genres as string[] | undefined, sort: "count", maxValues: 8 },
    { key: "tags", label: "Tag", accessor: (g) => (g as Record<string, unknown>).tags as string[] | undefined, sort: "count", maxValues: 6 },
    { key: "platform", label: "Platform", accessor: (g) => (g as Record<string, unknown>).platform as string | undefined, sort: "count", maxValues: 10 },
    { key: "releaseYear", label: "Year", accessor: (g) => String((g as Record<string, unknown>).releaseYear ?? ""), maxValues: 8 },
    { key: "developer", label: "Developer", accessor: (g) => (g as Record<string, unknown>).developer as string | undefined, maxValues: 6 },
  ], []);

  const handleGridEdge = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (direction === "up") {
        setTopBarFocused(true);
      }
    },
    [],
  );

  const { focusedIndex, setFocusedIndex } = useGridFocus({
    items: gridItems,
    columnCount,
    gridRef,
    onConfirm: (game) => setSelected(game),
    enabled: !selected && !topBarFocused,
    onEdge: handleGridEdge,
  });

  const focusedRow = Math.floor(focusedIndex / Math.max(1, columnCount));

  const gameCollections = useMemo(
    () => collections.filter((c) => c.itemType === "game" || c.itemType === "mixed"),
    [collections],
  );

  const { menu, bindItem } = useContextMenu({
    items,
    focusedIndex,
    getOptions: (game): ContextMenuOption[] => {
      const opts: ContextMenuOption[] = [
        {
          id: "favorite",
          label: game.isFavorite ? "Unfavorite" : "Favorite",
          icon: game.isFavorite ? <Star size={16} /> : <StarOff size={16} />,
        },
        { id: "hide", label: "Hide", icon: <EyeOff size={16} />, destructive: true },
        { id: "tags", label: "Update metadata / tags", icon: <Tag size={16} /> },
        { id: "controls", label: "Customize Input controls", icon: <Gamepad2 size={16} /> },
        {
          id: "regenerate",
          label: "Regenerate thumbnail",
          icon: <RotateCw size={16} />,
        },
        {
          id: "folder",
          label: "Open containing folder",
          icon: <FolderOpen size={16} />,
          disabled: !game.execPath && !game.romPath,
        },
      ];
      if (game.romPath && !game.compressedRomPath) {
        opts.push({
          id: "compress",
          label: "Compress ROM",
          icon: <Archive size={16} />,
        });
      } else if (game.compressedRomPath) {
        opts.push({
          id: "compress",
          label: "Compressed",
          icon: <Archive size={16} />,
          disabled: true,
        });
      }
      if (devToolsOpen) {
        opts.push({ id: "debug", label: "Debug", icon: <Bug size={16} /> });
      }
      if (game.missing) {
        opts.push({
          id: "delete",
          label: "Delete missing entry",
          icon: <Trash2 size={16} />,
          destructive: true,
        });
      }
      opts.push({ id: "remove", label: "Remove from library", icon: <Trash2 size={16} />, destructive: true });
      if (gameCollections.length > 0) {
        opts.push({ id: "__sep__", label: "Collections", disabled: true });
        for (const c of gameCollections) {
          opts.push({
            id: `add-to-coll:${c.id}`,
            label: c.name,
            icon: c.icon || <Folder size={16} />,
          });
        }
      }
      return opts;
    },
    onAction: (game, optionId) => {
      if (optionId.startsWith("add-to-coll:")) {
        const collectionId = optionId.slice("add-to-coll:".length);
        void addItem(collectionId, game.id, "game");
        useToastStore.getState().push({
          type: "success",
          message: `Added to ${gameCollections.find((c) => c.id === collectionId)?.name ?? "collection"}`,
        });
        return;
      }
      switch (optionId) {
        case "favorite":
          toggleFavorite(game.id);
          break;
        case "hide":
          hide(game.id);
          break;
        case "tags":
          setSelected(game);
          break;
        case "controls":
          window.dispatchEvent(
            new CustomEvent("htpc:switch-tab", {
              detail: { tab: "controllers" },
            }),
          );
          break;
        case "regenerate":
          void regenerateThumbnail(game.id);
          break;
        case "folder": {
          let path = game.romPath;
          if (!path && game.execPath) {
            // Strip desktop field codes and extract the actual binary path
            path = game.execPath
              .replace(/%[uUfFdDnNickvm]/g, "")
              .replace(/^"(.+)"$/, "$1")
              .trim()
              .split(/\s+/)[0];
          }
          if (path) {
            void window.htpc.shell.showItemInFolder(path);
          }
          break;
        }
        case "debug": {
          console.log("[Debug] Game entry:", game);
          break;
        }
        case "delete": {
          deleteGame(game.id);
          break;
        }
        case "remove": {
          hide(game.id);
          break;
        }
        case "compress": {
          const toastId = useToastStore.getState().push({
            type: "progress",
            message: `Compressing ${game.title}...`,
            progress: 0,
          });
          window.htpc.games
            .canCompress(game)
            .then((check) => {
              if (!check.ok) {
                useToastStore.getState().update(toastId, {
                  type: "error",
                  message: `Cannot compress ${game.title}: ${check.reason}`,
                });
                return;
              }
              window.htpc.games.compress(game).then((result) => {
                if (result.success) {
                  const saved =
                    result.originalSize && result.compressedSize
                      ? ` (${((1 - result.compressedSize / result.originalSize) * 100).toFixed(1)}% smaller)`
                      : "";
                  useToastStore.getState().update(toastId, {
                    type: "success",
                    message: `Compressed ${game.title}${saved}`,
                  });
                  // Refresh games list to show compressed state
                  void load();
                } else {
                  useToastStore.getState().update(toastId, {
                    type: "error",
                    message: `Failed to compress ${game.title}: ${result.error}`,
                  });
                }
              });
            })
            .catch((err) => {
              useToastStore.getState().update(toastId, {
                type: "error",
                message: `Failed to compress ${game.title}: ${String(err)}`,
              });
            });
          break;
        }
      }
    },
  });

  const renderItem = useCallback(
    (game: Game, index: number) => (
      <div key={game.id} className="p-1.5 w-full h-full flex flex-col min-w-0" {...bindItem(game, index)}>
        <LazyGameCard
          game={game}
          index={index}
          focusedIndex={focusedIndex}
          onSelect={() => { setFocusedIndex(index); setSelected(game); }}
          onFavorite={() => toggleFavorite(game.id)}
        />
      </div>
    ),
    [bindItem, focusedIndex, setFocusedIndex, toggleFavorite],
  );

  const badge = selected ? gameBadge(selected) : undefined;

  // Use selected game data directly (metadata fetching removed)
  const detailGameData = useMemo<GameWithMetadata | null>(() => {
    if (!selected) return null;
    return selected as GameWithMetadata;
  }, [selected]);

  const resolveShader = async (game: Game): Promise<string> => {
    const perGame = await getEmulatorConfig(game.id);
    if (perGame.shader) return perGame.shader;
    const settings = useSettingsStore.getState().settings;
    const platformShader = settings?.emulatorShaders?.[game.platform];
    if (platformShader) return platformShader;
    return settings?.defaultEmulatorShader ?? "";
  };

  /** Prefer compressed ROM if available and valid, otherwise fall back to romPath */
  const resolveRomPath = (game: Game): string | undefined => {
    if (game.compressedRomPath) return game.compressedRomPath;
    return game.romPath;
  };

  const launch = async (game: Game): Promise<void> => {
    updateLastPlayed(game.id);
    const romPath = resolveRomPath(game);
    if (game.platform === "flash" && romPath) {
      useFlashPlayerStore.getState().launch(romPath, game.title, game.id);
      return;
    }
    // Temporarily disabled: routing NES through libretro for testing
    // if (game.platform === "nes" && romPath) {
    //   useJsnesPlayerStore.getState().launch(romPath, game.title, game.id);
    //   return;
    // }
    // Try plugins first for emulator platforms
    if (romPath) {
      try {
        const pluginResult = await window.htpc.plugins.launchGame(game);
        if (pluginResult?.type === "iframe" && pluginResult.url) {
          usePluginPlayerStore.getState().launch(pluginResult.url, game.title, game.id, pluginResult.pluginId);
          return;
        }
      } catch {
        // Plugin launch failed, fall through to other methods
      }
    }
    if (LIBRETRO_PLATFORMS.includes(game.platform) && romPath) {
      const shader = await resolveShader(game);
      await window.htpc.libretro.launch({
        romPath,
        title: game.title,
        gameId: game.id,
        platform: game.platform,
        shader,
      });
      return;
    }
    try {
      await window.htpc.games.launch(game);
    } catch (err: any) {
      const message =
        err?.message ?? "Failed to launch game";
      useToastStore.getState().push({
        type: "error",
        message,
      });
    }
  };

  const recentlyPlayed = [...games]
    .filter((g) => g.lastPlayed && g.lastPlayed > 0)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, 8);

  useDetailController({
    enabled: !!selected,
    onConfirm: () => {
      if (selected && !getMissingCoreTooltip(selected)) {
        void launch(selected);
        setSelected(null);
      }
    },
    onCancel: () => setSelected(null),
  });

  return (
    <div className="flex flex-col h-full">
      <div style={{ padding: 16, paddingBottom: 0 }}>
        {/* Collapsible content — scrolls out of view */}
        <div className="flex flex-col gap-3 mb-3">
          <RecentlyPlayedRow
            items={recentlyPlayed.map((g) => ({
              id: g.id,
              title: g.title,
              coverUrl: g.coverUrl,
              subtitle: g.developer,
            }))}
            onLaunch={(id) => {
              const game = games.find((g) => g.id === id);
              if (game && !getMissingCoreTooltip(game)) launch(game);
            }}
          />

          <CollectionsBar
            itemType="game"
            activeCollectionId={activeCollectionId}
            onSelect={setActiveCollectionId}
            onManage={() => setShowCollectionManager(true)}
            className="flex-shrink-0"
          />

        </div>

        {/* Compact bar — search + active filter summary */}
        <div
          className="flex items-center gap-2 pb-3 flex-wrap"
          style={{ background: "var(--color-bg)" }}
        >
          <OskInput
            value={searchQuery}
            onChange={setSearch}
            placeholder="Search games…"
            className="text-sm"
            style={{ maxWidth: 220 } as React.CSSProperties}
          />
          <motion.button
            className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
            onClick={scan}
            whileTap={{ scale: 0.96 }}
            disabled={scanning}
          >
            {scanning ? <><Loader size={14} className="animate-spin" /> Scanning…</> : <><RotateCw size={14} /> Scan</>}
          </motion.button>
          <motion.button
            className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium flex items-center gap-1"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("htpc:switch-tab", { detail: { tab: "settings" } }));
            }}
            whileTap={{ scale: 0.96 }}
          >
            <Globe size={14} /> Remote
          </motion.button>
          <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
            {items.length} games
          </span>
          {/* Active filter summary chips */}
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg)",
            }}
          >
            {viewMode === "all" ? "All" : <><Sparkles size={12} /> Groups</>}
          </span>
          {viewMode === "ai-groups" && selectedAiGroupId && (() => {
            const group = aiGroups.find((g) => g.id === selectedAiGroupId);
            return group ? (
              <motion.button
                className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
                onClick={() => setSelectedAiGroupId(null)}
                whileTap={{ scale: 0.95 }}
                title="Clear group filter"
              >
                Group: {group.label} <X size={12} />
              </motion.button>
            ) : null;
          })()}
          {consoleFilter !== "all" && (
            <motion.button
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg)",
              }}
              onClick={() => setConsoleFilter("all")}
              whileTap={{ scale: 0.95 }}
              title="Clear platform filter"
            >
              {PLATFORM_FILTERS.find((f) => f.id === consoleFilter)?.label ?? consoleFilter} <X size={12} />
            </motion.button>
          )}
          {Object.entries(facetFilters).map(([key, value]) =>
            value ? (
              <motion.button
                key={key}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
                onClick={() => applyFacetFilter(key, null)}
                whileTap={{ scale: 0.95 }}
                title={`Clear ${key} filter`}
              >
                {gameFacetFields.find((f) => f.key === key)?.label ?? key}: {value} <X size={12} />
              </motion.button>
            ) : null,
          )}
          <motion.button
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
            onClick={() => setFiltersExpanded((v) => !v)}
            whileTap={{ scale: 0.95 }}
          >
            {filtersExpanded ? "▲ Filters" : "▼ Filters"}
          </motion.button>

          {/* Platform selector — top right */}
          <div className="ml-auto">
            <Dropdown
              value={consoleFilter}
              options={[
                { value: "all", label: "All Platforms" },
                ...PLATFORM_FILTERS
                  .filter((f): f is ChipFilter<GamePlatform> =>
                    f.id !== "all" && f.id !== "favorites" && f.id !== "couch-coop"
                  )
                  .map((f) => ({ value: f.id, label: String(f.label) })),
              ]}
              onChange={(value) => {
                setConsoleFilter(value as GamePlatform | "all");
                setActiveCollectionId(null);
              }}
              placeholder="Platform"
              className="w-40"
              open={dropdownOpen}
              onOpenChange={setDropdownOpen}
              focused={topBarFocused}
            />
          </div>
        </div>

        {/* Expanded filters — render below sticky bar so they stay visible */}
        {filtersExpanded && (
          <div className="flex flex-col gap-3 pb-3">
            {/* View-mode sub-tabs */}
            <div className="flex gap-2 flex-shrink-0 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {(["all", "ai-groups"] as ViewMode[]).map((m) => (
                <motion.button
                  key={m}
                  onClick={() => {
                    setViewMode(m);
                    setSelectedAiGroupId(null);
                  }}
                  className="relative flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none"
                  style={{
                    backgroundColor: viewMode === m
                      ? "var(--color-accent)"
                      : "var(--color-surface-raised)",
                    color: viewMode === m ? "var(--color-bg)" : "var(--color-text-dim)",
                    border: `1px solid ${viewMode === m ? "var(--color-accent)" : "var(--color-border)"}`,
                    boxShadow: viewMode === m ? "var(--shadow-glow)" : "none",
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {m === "all" ? "All" : "✨ Groups"}
                </motion.button>
              ))}
            </div>

            {/* AI group chips */}
            {viewMode === "ai-groups" && aiGroups.length > 0 && (
              <div className="flex gap-2 flex-shrink-0 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                <motion.button
                  onClick={() => setSelectedAiGroupId(null)}
                  className="relative flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none"
                  style={{
                    backgroundColor: !selectedAiGroupId
                      ? "var(--color-accent)"
                      : "var(--color-surface-raised)",
                    color: !selectedAiGroupId ? "var(--color-bg)" : "var(--color-text-dim)",
                    border: `1px solid ${!selectedAiGroupId ? "var(--color-accent)" : "var(--color-border)"}`,
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  All Groups
                </motion.button>
                {aiGroups.map((g) => (
                  <motion.button
                    key={g.id}
                    onClick={() => setSelectedAiGroupId(g.id)}
                    className="relative flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none"
                    style={{
                      backgroundColor: selectedAiGroupId === g.id
                        ? "var(--color-accent)"
                        : "var(--color-surface-raised)",
                      color: selectedAiGroupId === g.id ? "var(--color-bg)" : "var(--color-text-dim)",
                      border: `1px solid ${selectedAiGroupId === g.id ? "var(--color-accent)" : "var(--color-border)"}`,
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {g.label} ({g.itemIds.length})
                  </motion.button>
                ))}
              </div>
            )}

            {viewMode === "ai-groups" && aiGroupsLoading && (
              <div className="flex items-center gap-2 flex-shrink-0" style={{ color: "var(--color-text-dim)" }}>
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
                <span className="text-xs">Generating smart groups…</span>
              </div>
            )}

            {/* Dynamic metadata facets based on currently visible items */}
            {gridItems.length > 0 && (
              <DynamicFacetFilters
                items={facetSourceItems}
                fields={gameFacetFields}
                activeFilters={facetFilters}
                onFilter={applyFacetFilter}
                className="flex-shrink-0"
              />
            )}
          </div>
        )}
      </div>
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 gpu-scroll"
        style={{ padding: 16 }}
      >
        {/* Grid content */}
        {loading || scanning || remoteScanning ? (
          <div
            className="flex flex-col items-center justify-center gap-3"
            style={{ color: "var(--color-text-dim)", minHeight: 200 }}
          >
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{
                borderColor: "var(--color-accent)",
                borderTopColor: "transparent",
              }}
            />
            <span className="text-sm">
              {loading ? "Loading games…" : scanning || remoteScanning ? "Scanning for games…" : ""}
            </span>
          </div>
        ) : items.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4"
            style={{ color: "var(--color-text-dim)", minHeight: 200 }}
          >
            <p>No games found.</p>
            <motion.button
              className="px-6 py-2.5 rounded-[var(--radius-card)] font-medium"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
              }}
              onClick={scan}
              whileTap={{ scale: 0.96 }}
            >
              Scan for games
            </motion.button>
          </div>
        ) : (
          <VirtualGrid
            ref={gridRef}
            items={gridItems}
            minItemWidth={200}
            onColumnCountChange={setColumnCount}
            rowHeight={260}
            renderItem={renderItem}
          />
        )}
      </div>

      <DetailPanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={detailGameData?.title ?? selected?.title ?? ""}
        coverUrl={detailGameData?.coverUrl ?? selected?.coverUrl}
        backdropUrl={detailGameData?.bannerUrl}
        description={detailGameData?.description ?? selected?.description}
        metadata={
          detailGameData
            ? ([
                detailGameData.developer
                  ? { label: "Developer", value: detailGameData.developer }
                  : null,
                detailGameData.releaseYear
                  ? { label: "Year", value: String(detailGameData.releaseYear) }
                  : null,
                detailGameData.metacriticScore
                  ? { label: "Metacritic", value: String(detailGameData.metacriticScore) }
                  : null,
                detailGameData.openCriticScore
                  ? { label: "OpenCritic", value: String(detailGameData.openCriticScore) }
                  : null,
                detailGameData.protonRating && detailGameData.protonRating !== "unknown"
                  ? { label: "ProtonDB", value: detailGameData.protonRating }
                  : null,
                detailGameData.playerCount
                  ? {
                      label: "Players",
                      value: `${detailGameData.playerCount.min}–${detailGameData.playerCount.max}`,
                    }
                  : null,
                detailGameData.achievementCount
                  ? { label: "Achievements", value: String(detailGameData.achievementCount) }
                  : null,
                detailGameData.playtime
                  ? { label: "Est. Playtime", value: `${Math.round(detailGameData.playtime)}h` }
                  : null,
                { label: "Platform", value: detailGameData?.platform ?? "" },
              ].filter(Boolean) as { label: string; value: string }[])
            : []
        }
        tags={detailGameData?.tags ?? selected?.tags ?? []}
        onTagsChange={
          selected ? (newTags) => setTags(selected.id, newTags) : undefined
        }
        hideTags={showLaunchSettings}
        actions={
          selected && (
            <>
              <Tooltip content={getMissingCoreTooltip(selected) ?? ""}>
                <motion.button
                  className="px-5 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm flex items-center gap-2 whitespace-nowrap"
                  style={{
                    background: getMissingCoreTooltip(selected) ? "var(--color-surface-raised)" : "var(--color-accent)",
                    color: getMissingCoreTooltip(selected) ? "var(--color-text-dim)" : "var(--color-bg)",
                    cursor: getMissingCoreTooltip(selected) ? "not-allowed" : "pointer",
                  }}
                  onClick={() => {
                    if (getMissingCoreTooltip(selected)) return;
                    launch(selected);
                    setSelected(null);
                  }}
                  whileTap={{ scale: getMissingCoreTooltip(selected) ? 1 : 0.96 }}
                >
                  <Play size={14} /> Launch
                </motion.button>
              </Tooltip>
              {selected.romPath && !selected.compressedRomPath && (
                <Tooltip content="Compress ROM to emulator-compatible format">
                  <motion.button
                    className="px-4 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm flex items-center gap-2"
                    style={{
                      background: "var(--color-surface-raised)",
                      color: "var(--color-text)",
                      border: "1px solid var(--color-border)",
                    }}
                    onClick={() => {
                      const toastId = useToastStore.getState().push({
                        type: "progress",
                        message: `Compressing ${selected.title}...`,
                        progress: 0,
                      });
                      window.htpc.games.canCompress(selected).then((check) => {
                        if (!check.ok) {
                          useToastStore.getState().update(toastId, {
                            type: "error",
                            message: `Cannot compress ${selected.title}: ${check.reason}`,
                          });
                          return;
                        }
                        window.htpc.games.compress(selected).then((result) => {
                          if (result.success) {
                            const saved =
                              result.originalSize && result.compressedSize
                                ? ` (${((1 - result.compressedSize / result.originalSize) * 100).toFixed(1)}% smaller)`
                                : "";
                            useToastStore.getState().update(toastId, {
                              type: "success",
                              message: `Compressed ${selected.title}${saved}`,
                            });
                            void load();
                          } else {
                            useToastStore.getState().update(toastId, {
                              type: "error",
                              message: `Failed to compress ${selected.title}: ${result.error}`,
                            });
                          }
                        });
                      }).catch((err) => {
                        useToastStore.getState().update(toastId, {
                          type: "error",
                          message: `Failed to compress ${selected.title}: ${String(err)}`,
                        });
                      });
                    }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <Archive size={14} /> Compress
                  </motion.button>
                </Tooltip>
              )}
              {selected.compressedRomPath && (
                <span
                  className="px-4 py-2.5 rounded-[var(--radius-card)] text-sm font-medium flex items-center gap-2 whitespace-nowrap"
                  style={{
                    background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
                    color: "var(--color-accent)",
                    border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
                  }}
                >
                  <Archive size={14} /> Compressed ({selected.compressionFormat})
                </span>
              )}
              <Tooltip content="Launch Settings">
                <motion.button
                  className="px-3 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm flex items-center gap-2"
                  style={{
                    background: showLaunchSettings ? "var(--color-accent)" : "var(--color-surface-raised)",
                    color: showLaunchSettings ? "var(--color-bg)" : "var(--color-text)",
                    border: "1px solid var(--color-border)",
                  }}
                  onClick={() => setShowLaunchSettings((v) => !v)}
                  whileTap={{ scale: 0.96 }}
                >
                  <Settings size={14} />
                </motion.button>
              </Tooltip>
            </>
          )
        }
      >
        {selected && (
          <div className="flex flex-col gap-4">
            {showLaunchSettings ? (
              <GameSessionSettings game={selected} />
            ) : (
              <>
                {/* Screenshots from game data */}
                {(detailGameData?.screenshots?.length || detailGameData?.bannerUrl || detailGameData?.coverUrl) && (
                  <div>
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: "var(--color-text-dim)" }}
                    >
                      Screenshots
                    </div>
                    <div
                      className="flex gap-2 overflow-x-auto pb-1"
                      style={{ scrollbarWidth: "thin" }}
                    >
                      {(detailGameData?.screenshots?.length
                        ? detailGameData.screenshots.slice(0, 6)
                        : [detailGameData?.bannerUrl, detailGameData?.coverUrl].filter(Boolean)
                      )
                        .filter((u): u is string => !!u)
                        .map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt=""
                            className="h-28 flex-shrink-0 rounded-[var(--radius-card)] object-cover"
                            style={{ maxWidth: 220 }}
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* Videos from lazy metadata */}
                {detailGameData?.videos && detailGameData.videos.length > 0 && (
                  <div>
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: "var(--color-text-dim)" }}
                    >
                      Videos
                    </div>
                    <div className="flex flex-col gap-2">
                      {detailGameData.videos.slice(0, 3).map((video, i) => (
                        <a
                          key={i}
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded hover:bg-white/5 transition-colors"
                          style={{ background: "var(--color-surface-raised)" }}
                        >
                          <Play size={18} />
                          <span className="text-sm truncate flex-1">{video.name ?? "Video"}</span>
                          <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>{video.type}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {selected.playTime !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: "var(--color-text-dim)" }}>
                      Play Time
                    </span>
                    <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                      {selected.playTime >= 60
                        ? `${Math.floor(selected.playTime / 60)}h ${selected.playTime % 60}m`
                        : `${selected.playTime}m`}
                    </span>
                  </div>
                )}
                {(selected.platform === "nes" || selected.platform === "snes" || selected.platform === "gb" || selected.platform === "gba") && (
                  <div>
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: "var(--color-text-dim)" }}
                    >
                      Emulator Shader
                    </div>
                    <Dropdown
                      value={selectedEmulatorConfig.shader ?? ""}
                      options={[
                        { value: "", label: "Inherit (use emulator/global default)" },
                        { value: "2xSal.glsl", label: "2xSal" },
                        { value: "4xBR.glsl", label: "4xBR" },
                        { value: "6xBRZ.glsl", label: "6xBRZ" },
                        { value: "crt-easymode.glsl", label: "CRT Easymode" },
                        { value: "crt-geom.glsl", label: "CRT Geom" },
                        { value: "dot.glsl", label: "Dot" },
                        { value: "lcd.glsl", label: "LCD" },
                        { value: "ntsc.glsl", label: "NTSC" },
                        { value: "sharp-bilinear.glsl", label: "Sharp Bilinear" },
                        { value: "supereagle.glsl", label: "Super Eagle" },
                        { value: "xbrz.glsl", label: "xBRZ" },
                      ]}
                      onChange={(shader) => {
                        const next = { ...selectedEmulatorConfig, shader: shader || undefined };
                        setSelectedEmulatorConfig(next);
                        void setEmulatorConfig(selected.id, next);
                      }}
                      className="w-full"
                    />
                  </div>
                )}
                {LIBRETRO_PLATFORMS.includes(selected.platform) && (
                  <div>
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: "var(--color-text-dim)" }}
                    >
                      Libretro Core
                    </div>
                    <CoreSelector
                      game={selected}
                      onSelectCore={(corePath) => {
                        useLibretroPlayerStore.getState().setSelectedCore(corePath);
                      }}
                    />
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2 mt-4"
                      style={{ color: "var(--color-text-dim)" }}
                    >
                      Shader
                    </div>
                    <Dropdown
                      value={selectedEmulatorConfig.shader ?? ""}
                      options={[
                        { value: "", label: "None" },
                        ...SHADER_PRESETS.filter((s) => s.id !== "none").map((preset) => ({
                          value: preset.id,
                          label: preset.name,
                        })),
                      ]}
                      onChange={(shader) => {
                        const next = { ...selectedEmulatorConfig, shader: shader || undefined };
                        setSelectedEmulatorConfig(next);
                        void setEmulatorConfig(selected.id, next);
                      }}
                      className="w-full"
                    />
                  </div>
                )}
                {selected.platform === "windows" && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <div
                        className="text-xs font-semibold uppercase tracking-wide mb-2"
                        style={{ color: "var(--color-text-dim)" }}
                      >
                        Compatibility Runner
                      </div>
                      <Dropdown
                        value={selected.wineRunner ?? ""}
                        options={[
                          { value: "", label: "Auto-detect" },
                          { value: "umu-run", label: "umu-run" },
                          { value: "wine", label: "Wine" },
                          { value: "proton-ge", label: "Proton-GE" },
                          { value: "system-proton", label: "System Proton" },
                        ]}
                        onChange={(runner) => {
                          const value = runner as WineRunner || undefined;
                          void setWineRunner(selected.id, value ?? "wine");
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div
                        className="text-xs font-semibold uppercase tracking-wide mb-2"
                        style={{ color: "var(--color-text-dim)" }}
                      >
                        Wine Custom Command
                      </div>
                      <input
                        type="text"
                        value={selected.wineCustomCommand ?? ""}
                        onChange={(e) => void setWineCustomCommand(selected.id, e.target.value || null)}
                        placeholder="wine {exe} --some-flag"
                        className="w-full text-sm px-2 py-1.5 rounded"
                        style={{
                          background: "var(--color-surface-raised)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text)",
                          outline: "none",
                        }}
                      />
                      <p className="text-[10px] mt-1" style={{ color: "var(--color-text-dim)" }}>
                        Use {"{exe}"} as placeholder for the executable path. Leave empty for default.
                      </p>
                    </div>
                    <div>
                      <div
                        className="text-xs font-semibold uppercase tracking-wide mb-2"
                        style={{ color: "var(--color-text-dim)" }}
                      >
                        umu-run Custom Command
                      </div>
                      <input
                        type="text"
                        value={selected.umuCustomCommand ?? ""}
                        onChange={(e) => void setUmuCustomCommand(selected.id, e.target.value || null)}
                        placeholder="umu-run {exe}"
                        className="w-full text-sm px-2 py-1.5 rounded"
                        style={{
                          background: "var(--color-surface-raised)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text)",
                          outline: "none",
                        }}
                      />
                      <p className="text-[10px] mt-1" style={{ color: "var(--color-text-dim)" }}>
                        Use {"{exe}"} as placeholder for the executable path. Leave empty for default.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DetailPanel>
      {menu}
      <CollectionManager
        open={showCollectionManager}
        onClose={() => setShowCollectionManager(false)}
        itemType="game"
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Game Session Settings                                              */
/* ------------------------------------------------------------------ */

const HOOK_TIMING_LABELS: Record<string, string> = {
  "before-start-blocking": "Before Start (blocking)",
  "before-start": "Before Start",
  "after-start": "After Start",
  "after-crash": "After Crash",
  "after-close": "After Close",
};

function parseShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (!inQuotes && (ch === '"' || ch === "'")) {
      inQuotes = true;
      quoteChar = ch;
    } else if (inQuotes && ch === quoteChar) {
      inQuotes = false;
      quoteChar = "";
    } else if (!inQuotes && /\s/.test(ch)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) args.push(current);
  return args;
}

function GameSessionSettings({ game }: { game: Game }) {
  const { setSessionConfig } = useGamesStore();
  const [editingHook, setEditingHook] = useState<string | null>(null);
  const [hookDraft, setHookDraft] = useState<{
    timing: string;
    command: string;
    args: string;
    timeout: string;
    workingDir: string;
    env: string;
  }>({
    timing: "before-start",
    command: "",
    args: "",
    timeout: "30",
    workingDir: "",
    env: "",
  });

  type SessionConfigPayload = Parameters<typeof setSessionConfig>[1];
  const saveSessionField = (payload: SessionConfigPayload) => {
    void setSessionConfig(game.id, payload);
  };

  const addHook = () => {
    const id = crypto.randomUUID();
    const args = hookDraft.args
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const env: Record<string, string> = {};
    for (const line of hookDraft.env.split("\n")) {
      const [k, ...rest] = line.split("=");
      if (k && rest.length > 0) {
        env[k.trim()] = rest.join("=").trim();
      }
    }
    const newHook = {
      id,
      timing: hookDraft.timing as import("../../../../shared/types").SessionHookTiming,
      command: hookDraft.command.trim(),
      args: args.length > 0 ? args : undefined,
      timeout: Number.isNaN(parseInt(hookDraft.timeout, 10)) ? undefined : parseInt(hookDraft.timeout, 10) * 1000,
      workingDir: hookDraft.workingDir.trim() || undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
    };
    const next = [...(game.sessionHooks ?? []), newHook];
    void setSessionConfig(game.id, { sessionHooks: next });
    setEditingHook(null);
    setHookDraft({
      timing: "before-start",
      command: "",
      args: "",
      timeout: "30",
      workingDir: "",
      env: "",
    });
  };

  const removeHook = (id: string) => {
    const next = (game.sessionHooks ?? []).filter((h) => h.id !== id);
    void setSessionConfig(game.id, { sessionHooks: next });
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="flex flex-col gap-4"
    >
          {/* Launch Command Override */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--color-text-dim)" }}
            >
              Launch Command
            </div>
            <input
              type="text"
              value={game.launchCommand ?? ""}
              onChange={(e) => saveSessionField({ launchCommand: e.target.value || null })}
              placeholder="Override command (replaces default)"
              className="w-full text-sm px-2 py-1.5 rounded"
              style={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                outline: "none",
              }}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--color-text-dim)" }}>
              Overrides the default launch command for this game.
            </p>
          </div>

          {/* Launch Args */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--color-text-dim)" }}
            >
              Launch Arguments
            </div>
            <input
              type="text"
              value={game.launchArgs?.join(", ") ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                saveSessionField({ launchArgs: v ? parseShellArgs(v) : null });
              }}
              placeholder='arg1 arg2 "arg with spaces"'
              className="w-full text-sm px-2 py-1.5 rounded"
              style={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                outline: "none",
              }}
            />
          </div>

          {/* Working Directory */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--color-text-dim)" }}
            >
              Working Directory
            </div>
            <input
              type="text"
              value={game.launchWorkingDir ?? ""}
              onChange={(e) => saveSessionField({ launchWorkingDir: e.target.value || null })}
              placeholder="/path/to/working/dir"
              className="w-full text-sm px-2 py-1.5 rounded"
              style={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                outline: "none",
              }}
            />
          </div>

          {/* Environment Variables */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--color-text-dim)" }}
            >
              Environment Variables
            </div>
            <textarea
              value={
                game.launchEnv
                  ? Object.entries(game.launchEnv)
                      .map(([k, v]) => `${k}=${v}`)
                      .join("\n")
                  : ""
              }
              onChange={(e) => {
                const env: Record<string, string> = {};
                for (const line of e.target.value.split("\n")) {
                  const [k, ...rest] = line.split("=");
                  if (k && rest.length > 0) {
                    env[k.trim()] = rest.join("=").trim();
                  }
                }
                saveSessionField({ launchEnv: Object.keys(env).length > 0 ? env : null });
              }}
              placeholder="KEY=value\nOTHER_KEY=value"
              rows={3}
              className="w-full text-sm px-2 py-1.5 rounded resize-none"
              style={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                outline: "none",
              }}
            />
          </div>

          {/* Session Hooks */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: "var(--color-text-dim)" }}
            >
              Session Hooks
            </div>
            <div className="flex flex-col gap-2">
              {(game.sessionHooks ?? []).map((hook) => (
                <div
                  key={hook.id}
                  className="flex items-center gap-2 p-2 rounded text-sm"
                  style={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
                    style={{
                      background: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
                      color: "var(--color-accent)",
                    }}
                  >
                    {HOOK_TIMING_LABELS[hook.timing] ?? hook.timing}
                  </span>
                  <span className="truncate flex-1" style={{ color: "var(--color-text)" }}>
                    {hook.command} {hook.args?.join(" ") ?? ""}
                  </span>
                  <button
                    onClick={() => removeHook(hook.id)}
                    className="p-1 rounded hover:bg-white/10 transition-colors"
                    aria-label="Remove hook"
                  >
                    <X size={14} style={{ color: "var(--color-text-dim)" }} />
                  </button>
                </div>
              ))}
            </div>

            {editingHook === null ? (
              <button
                onClick={() => setEditingHook("new")}
                className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded text-xs font-medium"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <Plus size={14} /> Add Hook
              </button>
            ) : (
              <div className="flex flex-col gap-2 mt-2 p-3 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <Dropdown
                  value={hookDraft.timing}
                  options={[
                    { value: "before-start-blocking", label: "Before Start (blocking)" },
                    { value: "before-start", label: "Before Start" },
                    { value: "after-start", label: "After Start" },
                    { value: "after-crash", label: "After Crash" },
                    { value: "after-close", label: "After Close" },
                  ]}
                  onChange={(v) => setHookDraft((d) => ({ ...d, timing: v }))}
                  className="w-full"
                />
                <input
                  type="text"
                  value={hookDraft.command}
                  onChange={(e) => setHookDraft((d) => ({ ...d, command: e.target.value }))}
                  placeholder="Command (e.g. /usr/bin/obs)"
                  className="w-full text-sm px-2 py-1.5 rounded"
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                />
                <input
                  type="text"
                  value={hookDraft.args}
                  onChange={(e) => setHookDraft((d) => ({ ...d, args: e.target.value }))}
                  placeholder="Arguments (comma-separated)"
                  className="w-full text-sm px-2 py-1.5 rounded"
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                />
                <input
                  type="text"
                  value={hookDraft.workingDir}
                  onChange={(e) => setHookDraft((d) => ({ ...d, workingDir: e.target.value }))}
                  placeholder="Working directory"
                  className="w-full text-sm px-2 py-1.5 rounded"
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={hookDraft.timeout}
                    onChange={(e) => setHookDraft((d) => ({ ...d, timeout: e.target.value }))}
                    placeholder="Timeout (seconds)"
                    className="w-24 text-sm px-2 py-1.5 rounded"
                    style={{
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text)",
                      outline: "none",
                    }}
                  />
                  <span className="text-xs self-center" style={{ color: "var(--color-text-dim)" }}>
                    seconds timeout
                  </span>
                </div>
                <textarea
                  value={hookDraft.env}
                  onChange={(e) => setHookDraft((d) => ({ ...d, env: e.target.value }))}
                  placeholder="Extra env vars (KEY=value per line)"
                  rows={2}
                  className="w-full text-sm px-2 py-1.5 rounded resize-none"
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingHook(null)}
                    className="px-3 py-1 rounded text-xs"
                    style={{
                      background: "var(--color-surface-raised)",
                      color: "var(--color-text-dim)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addHook}
                    disabled={!hookDraft.command.trim()}
                    className="px-3 py-1 rounded text-xs font-medium"
                    style={{
                      background: "var(--color-accent)",
                      color: "var(--color-bg)",
                      opacity: hookDraft.command.trim() ? 1 : 0.5,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      );
    }
