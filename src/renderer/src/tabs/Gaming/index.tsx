import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useGamesStore } from "../../store/games.store";
import {
  VirtualGrid,
  VirtualGridHandle,
} from "../../components/VirtualGrid/VirtualGrid";
import {
  ListView,
  HexGridView,
  BookshelfView,
  BookshelfSpine,
  SpreadDeckView,
  NeonGridView,
  GalleryImage,
  useGalleryView,
  useIsNeonGrid,
} from "../../components/GalleryView";
import { GameCard } from "../../components/GameCard/GameCard";
import { scaledImageUrl } from "../../lib/image-url";
import { DetailPanel } from "../../components/DetailPanel/DetailPanel";
import { ImageLightbox } from "../../components/ImageLightbox/ImageLightbox";
import { CoreSelector } from "../../components/CoreSelector/CoreSelector";
import { Game, GamePlatform, GameEmulatorConfig, GameInjectionConfig, VulkanShaderConfig, DllInjectionConfig, ReShadeConfig, WineRunner } from "@shared/types";
import { useGridFocus, NavAction } from "../../hooks/useGridFocus";
import { useDetailController } from "../../hooks/useDetailController";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Dropdown } from "../../components/Dropdown/Dropdown";
import { ChipFilter } from "../../components/ChipFilters/ChipFilters";
import { useFlashPlayerStore } from "../../store/flashPlayer.store";
import { useJsnesPlayerStore } from "../../store/jsnesPlayer.store";
import { usePluginPlayerStore } from "../../store/pluginPlayer.store";
import { useLibretroPlayerStore } from "../../store/libretroPlayer.store";
import { SHADER_PRESETS } from "../../components/LibretroPlayer/shaders";
import { useToastStore } from "../../store/toast.store";
import { useGameLaunchStore } from "../../store/gameLaunch.store";
import { useSettingsStore } from "../../store/settings.store";
import { useCollectionsStore, evaluateSmartFilter, sortByCollection } from "../../store/collections.store";
import { CollectionsBar } from "../../components/CollectionsBar/CollectionsBar";
import { CollectionManager } from "../../components/CollectionManager/CollectionManager";
import { HexCellData } from "../../components/GalleryView/HexGridView";
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
  Play,
  X,
  Archive,
  Settings,
  Plus,
  Globe,
  Monitor,
  Columns,
  FlaskConical,
  Cpu,
  Box,
  Terminal,
  Wrench,
} from "lucide-react";
import { DynamicFacetFilters, FacetField } from "../../components/DynamicFacetFilters/DynamicFacetFilters";
import type { GameVideo } from "../../../../shared/metadata";
import { GamingNavRail } from "./components/GamingNavRail";
import { GamingToolbar } from "./components/GamingToolbar";
import type { GamingNavItem } from "./types";
import { useSplitscreenStore } from "../../store/splitscreen.store";
import { SplitscreenConfigModal } from "../../components/Splitscreen/SplitscreenConfigModal";

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
  { id: "html5", label: "HTML5" },
  { id: "unity", label: "Unity" },
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

async function getMissingCoreTooltip(game: Game): Promise<string | undefined> {
  if (!LIBRETRO_PLATFORMS.includes(game.platform)) return undefined;
  if (!game.romPath) return undefined;
  const detected = await window.htpc.libretro.detectCore(game.romPath);
  if (detected !== null) return undefined;
  const platformLabel = PLATFORM_FILTERS.find((f) => f.id === game.platform)?.label ?? game.platform;
  return `No ${platformLabel} emulator cores are installed. Install it in settings.`;
}

const LIBRETRO_THUMB_PLATFORMS = new Set<string>([
  "nes", "snes", "gb", "gba", "n64", "genesis", "sms",
  "gamegear", "pce", "psx", "dreamcast", "nds", "dos",
]);

const WEB_THUMB_PLATFORMS = new Set<string>(["flash", "html5", "unity"]);

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
  const [missingCoreTooltip, setMissingCoreTooltip] = useState<string | undefined>(undefined);

  useEffect(() => {
    const isLibretro = LIBRETRO_THUMB_PLATFORMS.has(game.platform);
    if ((WEB_THUMB_PLATFORMS.has(game.platform) || isLibretro) && !game.coverUrl) {
      loadThumbnail(game.id);
    }
  }, [game.id, game.platform, game.coverUrl, loadThumbnail]);

  useEffect(() => {
    let cancelled = false;
    getMissingCoreTooltip(game)
      .then((tooltip) => {
        if (!cancelled) setMissingCoreTooltip(tooltip);
      })
      .catch(() => {
        if (!cancelled) setMissingCoreTooltip(undefined);
      });
    return () => { cancelled = true; };
  }, [game, coreVersion]);

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

const LazyGameThumbnail: React.FC<{ game: Game }> = React.memo(({ game }) => {
  const loadThumbnail = useGamesStore((s) => s.loadThumbnail);
  useEffect(() => {
    const isLibretro = LIBRETRO_THUMB_PLATFORMS.has(game.platform);
    if ((WEB_THUMB_PLATFORMS.has(game.platform) || isLibretro) && !game.coverUrl) {
      loadThumbnail(game.id);
    }
  }, [game.id, game.platform, game.coverUrl, loadThumbnail]);
  return null;
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

function uninstallLabelForGame(game: Game): string {
  if (game.id.startsWith("steam_")) return "Uninstall";
  if (game.id.startsWith("heroic_")) return "Uninstall";
  if (game.id.startsWith("lutris_")) return "Uninstall";
  if (game.id.startsWith("itch_")) return "Uninstall";
  return "Delete file";
}

function canUninstallGame(game: Game): boolean {
  return !game.sourceLocation || game.sourceLocation === "local";
}

function uninstallMessageForGame(game: Game): string {
  if (game.id.startsWith("steam_")) return `Uninstall ${game.title} via Steam?`;
  if (game.id.startsWith("heroic_")) return `Uninstall ${game.title} via Heroic?`;
  if (game.id.startsWith("lutris_")) return `Uninstall ${game.title} via Lutris?`;
  if (game.id.startsWith("itch_")) return `Uninstall ${game.title} via itch.io?`;
  return `Delete ${game.title}? This will move the install files to trash.`;
}

function IniOverrideEditor({ onAdd }: { onAdd: (section: string, key: string, value: string) => void }) {
  const [section, setSection] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <input
          type="text"
          placeholder="Section (e.g. GENERAL)"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="flex-1 text-xs px-2 py-1.5 rounded"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
        />
        <input
          type="text"
          placeholder="Key (e.g. DepthCopyBeforeClears)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="flex-1 text-xs px-2 py-1.5 rounded"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
        />
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          placeholder="Value (e.g. 1)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 text-xs px-2 py-1.5 rounded"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)", outline: "none" }}
        />
        <button
          onClick={() => {
            if (section.trim() && key.trim()) {
              onAdd(section.trim(), key.trim(), value.trim());
              setSection(""); setKey(""); setValue("");
            }
          }}
          disabled={!section.trim() || !key.trim()}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{
            background: section.trim() && key.trim() ? "var(--accent)" : "var(--surface-2)",
            color: section.trim() && key.trim() ? "var(--surface-base)" : "var(--text-secondary)",
          }}
        >
          Add Override
        </button>
      </div>
    </div>
  );
}

export const GamingTab: React.FC = () => {
  const games = useGamesStore((s) => s.games);
  const loading = useGamesStore((s) => s.loading);
  const scanning = useGamesStore((s) => s.scanning);
  const remoteScanning = useGamesStore((s) => s.remoteScanning);
  const activeNav = useGamesStore((s) => s.activeNav);
  const setActiveNav = useGamesStore((s) => s.setActiveNav);
  const searchQuery = useGamesStore((s) => s.searchQuery);
  const load = useGamesStore((s) => s.load);
  const scan = useGamesStore((s) => s.scan);
  const setSearch = useGamesStore((s) => s.setSearch);
  const filtered = useGamesStore((s) => s.filtered);
  const libraryFilter = useGamesStore((s) => s.libraryFilter);
  const setLibraryFilter = useGamesStore((s) => s.setLibraryFilter);
  const playerCountFilter = useGamesStore((s) => s.playerCountFilter);
  const setPlayerCountFilter = useGamesStore((s) => s.setPlayerCountFilter);
  const multiplayerTypeFilter = useGamesStore((s) => s.multiplayerTypeFilter);
  const setMultiplayerTypeFilter = useGamesStore((s) => s.setMultiplayerTypeFilter);
  const playStatusFilter = useGamesStore((s) => s.playStatusFilter);
  const setPlayStatusFilter = useGamesStore((s) => s.setPlayStatusFilter);
  const completionFilter = useGamesStore((s) => s.completionFilter);
  const setCompletionFilter = useGamesStore((s) => s.setCompletionFilter);
  const toggleFavorite = useGamesStore((s) => s.toggleFavorite);
  const setTags = useGamesStore((s) => s.setTags);
  const hide = useGamesStore((s) => s.hide);
  const deleteGame = useGamesStore((s) => s.delete);
  const uninstallGame = useGamesStore((s) => s.uninstall);
  const regenerateThumbnail = useGamesStore((s) => s.regenerateThumbnail);
  const updateLastPlayed = useGamesStore((s) => s.updateLastPlayed);
  const loadThumbnail = useGamesStore((s) => s.loadThumbnail);
  const pendingThumbnailIds = useGamesStore((s) => s.pendingThumbnailIds);
  const regeneratingIds = useGamesStore((s) => s.regeneratingIds);
  useGamesStore((s) => s.coreVersion); // forces re-render when cores change
  const [selected, setSelected] = useState<Game | null>(null);
  const [selectedMissingCoreTooltip, setSelectedMissingCoreTooltip] = useState<string | undefined>(undefined);
  const [columnCount, setColumnCount] = useState(6);
  const [viewColumnCount, setViewColumnCount] = useState(6);
  const [selectedEmulatorConfig, setSelectedEmulatorConfig] = useState<GameEmulatorConfig>({});
  const [selectedInjectionConfig, setSelectedInjectionConfig] = useState<GameInjectionConfig | null>(null);
  const [vulkanPresets, setVulkanPresets] = useState<{ id: string; name: string }[]>([]);
  const [shaderParamDefs, setShaderParamDefs] = useState<Record<string, { label: string; min: number; max: number; step: number; default: number }[]>>({});
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [showLaunchSettings, setShowLaunchSettings] = useState(false);
  const [showSplitscreenModal, setShowSplitscreenModal] = useState(false);
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string>>(new Set());
  const [localScreenshots, setLocalScreenshots] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reshadeReinstall, setReshadeReinstall] = useState<{ status: "idle" | "in-progress" | "done" | "error"; message: string }>({ status: "idle", message: "" });
  const gridRef = useRef<VirtualGridHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const galleryView = useGalleryView();
  const isNeonGrid = useIsNeonGrid();

  useEffect(() => {
    const unsub = window.htpc.games.reshade.onReinstallProgress((p) => {
      if (p.step === "done") {
        setReshadeReinstall({ status: "done", message: p.message });
      } else if (p.step === "error") {
        setReshadeReinstall({ status: "error", message: p.message });
      } else {
        setReshadeReinstall({ status: "in-progress", message: p.message });
      }
    });
    return unsub;
  }, []);

  const [facetFilters, setFacetFilters] = useState<Record<string, string | null>>({});

  // Handle desktop-entry launch requests (--launch-game CLI arg)
  useEffect(() => {
    void (async () => {
      try {
        const game = await window.htpc.games.getPendingLaunch();
        console.log("[gaming] getPendingLaunch result:", game);
        if (game) {
          console.log("[gaming] Launching pending game:", game.title);
          await window.htpc.games.clearPendingLaunch();
          await launch(game);
        }
      } catch (err) {
        console.error("[gaming] Failed to get pending launch:", err);
      }
    })();
  }, []);
  const applyFacetFilter = (field: string, value: string | null) => {
    setFacetFilters((prev) => ({ ...prev, [field]: value }));
  };
  const [confirmUninstall, setConfirmUninstall] = useState<{ open: boolean; game: Game | null }>({
    open: false,
    game: null,
  });

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
      setSelectedMissingCoreTooltip(undefined);
      return;
    }
    const emulatorPlatforms: GamePlatform[] = ["nes", "snes", "gb", "gba", "n64", "genesis", "sms", "gamegear", "pce", "psx", "nds", "dreamcast"];
    if (emulatorPlatforms.includes(selected.platform)) {
      getEmulatorConfig(selected.id).then(setSelectedEmulatorConfig).catch(() => setSelectedEmulatorConfig({}));
    } else {
      setSelectedEmulatorConfig({});
    }
    let cancelled = false;
    getMissingCoreTooltip(selected)
      .then((tooltip) => {
        if (!cancelled) setSelectedMissingCoreTooltip(tooltip);
      })
      .catch(() => {
        if (!cancelled) setSelectedMissingCoreTooltip(undefined);
      });
    return () => { cancelled = true; };
  }, [selected, getEmulatorConfig]);

  // Load injection config for Windows/Steam games
  useEffect(() => {
    if (!selected) {
      setSelectedInjectionConfig(null);
      return;
    }
    const isInjectable = selected.platform === "windows" || selected.platform === "steam";
    if (isInjectable) {
      window.htpc.games.injectionConfig.get(selected.id).then(setSelectedInjectionConfig).catch(() => setSelectedInjectionConfig(null));
    } else {
      setSelectedInjectionConfig(null);
    }
  }, [selected]);

  // Load Vulkan shader presets and param defs once
  useEffect(() => {
    window.htpc.games.injectionConfig.vulkanPresets().then(setVulkanPresets).catch(() => {});
    window.htpc.games.injectionConfig.shaderParamDefs().then(setShaderParamDefs).catch(() => {});
  }, []);

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

  /* Clear selected when escape is pressed */
  useEffect(() => {
    const handler = () => setSelected(null);
    window.addEventListener("htpc:escape", handler);
    return () => window.removeEventListener("htpc:escape", handler);
  }, []);

  /* Fetch locally-captured screenshots when a game is selected */
  useEffect(() => {
    if (!selected) {
      setLocalScreenshots([]);
      return;
    }
    const libretroPlatforms = new Set<string>([
      "nes", "snes", "gb", "gba", "n64", "genesis", "sms",
      "gamegear", "pce", "psx", "dreamcast", "nds", "dos",
    ]);
    if (!libretroPlatforms.has(selected.platform)) {
      setLocalScreenshots([]);
      return;
    }
    window.htpc.games.getLocalScreenshots(selected.id).then((urls) => {
      setLocalScreenshots(urls);
    }).catch(() => {
      setLocalScreenshots([]);
    });
  }, [selected?.id, selected?.platform]);

  /* Dispatch selection changes for command palette context */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("htpc:select-game", { detail: { id: selected?.id ?? null } }),
    );
  }, [selected?.id]);

  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId),
    [collections, activeCollectionId],
  );

  const items = useMemo(() => {
    const base = filtered();
    if (!activeCollectionId) return base;
    const result = base.filter((g) => collectionItemIds.has(g.id));
    return sortByCollection<Game>(result, activeCollection);
  }, [filtered, games, activeNav, searchQuery, libraryFilter, playerCountFilter, multiplayerTypeFilter, playStatusFilter, completionFilter, activeCollectionId, collectionItemIds, activeCollection]);

  const facetSourceItems = items;

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
    { key: "releaseYear", label: "Year", accessor: (g) => String((g as Record<string, unknown>).releaseYear ?? ""), maxValues: 8 },
    { key: "developer", label: "Developer", accessor: (g) => (g as Record<string, unknown>).developer as string | undefined, maxValues: 6 },
  ], []);

  const isRowBasedView = galleryView === "bookshelf" || galleryView === "spread-deck";
  const { focusedIndex, setFocusedIndex } = useGridFocus({
    items: gridItems,
    columnCount: isRowBasedView ? viewColumnCount : columnCount,
    gridRef,
    onConfirm: (game) => setSelected(game),
    enabled: !selected,
    getNextIndex: galleryView === "hex-grid"
      ? (current, action) => {
          const handle = gridRef.current as unknown as { getNextIndex?(i: number, a: NavAction): number | null } | null;
          return handle?.getNextIndex?.(current, action) ?? null;
        }
      : undefined,
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
        {
          id: "desktopEntry",
          label: "Create .desktop entry",
          icon: <Monitor size={16} />,
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
      opts.push({
        id: "uninstall",
        label: uninstallLabelForGame(game),
        icon: <Trash2 size={16} />,
        destructive: true,
        disabled: !canUninstallGame(game),
      });
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
          void window.htpc.games.desktopEntry.remove(game.id);
          deleteGame(game.id);
          break;
        }
        case "uninstall": {
          if (canUninstallGame(game)) {
            setConfirmUninstall({ open: true, game });
          }
          break;
        }
        case "remove": {
          void window.htpc.games.desktopEntry.remove(game.id);
          hide(game.id);
          break;
        }
        case "desktopEntry": {
          const toastId = useToastStore.getState().push({
            type: "progress",
            message: `Creating .desktop entry for ${game.title}...`,
            progress: 0,
          });
          window.htpc.games.desktopEntry
            .has(game.id)
            .then((has) => {
              if (has) {
                return window.htpc.games.desktopEntry.remove(game.id).then(() => {
                  useToastStore.getState().update(toastId, {
                    type: "success",
                    message: `Removed .desktop entry for ${game.title}`,
                  });
                });
              }
              return window.htpc.games.desktopEntry.create(game).then(() => {
                useToastStore.getState().update(toastId, {
                  type: "success",
                  message: `Created .desktop entry for ${game.title}`,
                });
              });
            })
            .catch((err) => {
              useToastStore.getState().update(toastId, {
                type: "error",
                message: `Failed to update .desktop entry for ${game.title}: ${String(err)}`,
              });
            });
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

  const renderSkeletonItem = useCallback(
    (_: unknown, index: number) => (
      <div key={`sk-${index}`} className="p-1.5 w-full h-full flex flex-col min-w-0">
        <GameCard id={`sk-${index}`} title="" platform="unknown" skeleton />
      </div>
    ),
    [],
  );

  const renderSkeletonHex = useCallback(
    (_: unknown, _index: number) => ({ title: "", skeleton: true } as HexCellData),
    [],
  );

  const renderSkeletonListItem = useCallback(
    (_: unknown, _index: number) => (
      <div className="flex items-center gap-3 w-full h-full px-3">
        <div className="w-12 h-[72px] flex-shrink-0 rounded overflow-hidden skeleton-shimmer" style={{ backgroundColor: "var(--surface-1)" }} />
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          <div className="skeleton-shimmer rounded" style={{ width: "60%", height: 14, backgroundColor: "var(--surface-1)" }} />
          <div className="skeleton-shimmer rounded" style={{ width: "35%", height: 12, backgroundColor: "var(--surface-1)" }} />
        </div>
      </div>
    ),
    [],
  );

  const renderSkeletonSpine = useCallback(
    (_: unknown, _index: number, { isHovered }: { isHovered: boolean; isFocused: boolean }) => (
      <div className="w-full h-full relative skeleton-shimmer" style={{ backgroundColor: "var(--surface-1)" }} />
    ),
    [],
  );

  const renderSkeletonDeckCard = useCallback(
    (_: unknown, _index: number) => (
      <div className="w-full h-full relative skeleton-shimmer" style={{ backgroundColor: "var(--surface-1)", borderRadius: 7 }} />
    ),
    [],
  );

  const renderSkeletonNeonCard = useCallback(
    (_: unknown, index: number) => (
      <div key={`sk-${index}`} className="p-1 w-full h-full flex flex-col min-w-0">
        <GameCard id={`sk-${index}`} title="" platform="unknown" skeleton />
      </div>
    ),
    [],
  );

  const renderHex = useCallback(
    (game: Game, index: number) => {
      const b = gameBadge(game);
      return {
        coverUrl: game.coverUrl,
        title: game.title,
        subtitle: game.developer,
        badge: b?.label,
        badgeColor: b?.color,
        isFavorite: game.isFavorite,
        isLoading: pendingThumbnailIds.has(game.id) || regeneratingIds.has(game.id),
        missing: game.missing,
        platform: game.platform,
        onClick: () => { setFocusedIndex(index); setSelected(game); },
        onFavorite: () => toggleFavorite(game.id),
        onVisible: () => {
          const isLibretro = LIBRETRO_THUMB_PLATFORMS.has(game.platform);
          if ((WEB_THUMB_PLATFORMS.has(game.platform) || isLibretro) && !game.coverUrl) {
            loadThumbnail(game.id);
          }
        },
      };
    },
    [pendingThumbnailIds, regeneratingIds, toggleFavorite, loadThumbnail],
  );

  const renderListItem = useCallback(
    (game: Game, index: number) => (
      <div className="flex items-center gap-3 w-full h-full px-3" {...bindItem(game, index)}>
        <LazyGameThumbnail game={game} />
        <div
          className="w-12 h-[72px] flex-shrink-0 rounded overflow-hidden bg-cover bg-center"
          style={{
            backgroundImage: game.coverUrl ? `url(${scaledImageUrl(game.coverUrl, 48, 72)})` : undefined,
            backgroundColor: !game.coverUrl ? "#1a1a2e" : undefined,
            filter: game.missing ? "grayscale(80%)" : undefined,
            opacity: game.missing ? 0.6 : undefined,
          }}
        />
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="font-medium truncate text-sm"
              style={{ color: index === focusedIndex ? "var(--accent)" : "var(--text-primary)" }}
            >
              {game.title}
            </div>
                      </div>
          <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
            {game.platform}
            {game.releaseYear ? ` · ${game.releaseYear}` : ""}
            {game.playTime ? ` · ${Math.round(game.playTime / 3600)}h` : ""}
          </div>
        </div>
        {game.isFavorite && <Star size={14} style={{ color: "var(--accent)" }} />}
      </div>
    ),
    [bindItem, focusedIndex],
  );

  const renderSpine = useCallback(
    (game: Game, _index: number, { isHovered, isFocused }: { isHovered: boolean; isFocused: boolean }) => {
      return (
        <BookshelfSpine
          coverUrl={game.coverUrl}
          title={game.title}
          subtitle={game.platform}
          isHovered={isHovered}
          isFocused={isFocused}
        />
      );
    },
    [],
  );

  const renderDeckCard = useCallback(
    (game: Game, _index: number, { isHovered, isFocused }: { isHovered: boolean; isFocused: boolean }) => {
      return (
        <div className="w-full h-full relative">
          <LazyGameThumbnail game={game} />
          <GalleryImage
            src={game.coverUrl}
            alt={game.title}
            style={{ width: "100%", height: "100%" }}
          />
          {!isHovered && <div className="absolute inset-0 bg-black/30 pointer-events-none" />}
          {isHovered && (
            <div
              className="absolute bottom-0 left-0 right-0 p-2"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)" }}
            >
              <div className="text-xs font-bold text-white truncate">{game.title}</div>
            </div>
          )}
          {isFocused && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: "inset 0 0 0 2px var(--accent)",
                zIndex: 10,
              }}
            />
          )}
                  </div>
      );
    },
    [],
  );

  const renderNeonCard = useCallback(
    (game: Game, index: number) => {
      const b = gameBadge(game);
      return (
        <div className="p-1 w-full h-full flex flex-col min-w-0" {...bindItem(game, index)}>
          <LazyGameThumbnail game={game} />
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, rgba(14,20,40,0.8), rgba(6,10,24,0.95))`,
              borderBottom: "1px solid rgba(24,30,46,0.8)",
            }}
          >
            {game.coverUrl ? (
              <img
                src={scaledImageUrl(game.coverUrl, 600, 400)}
                alt={game.title}
                className="w-full h-full object-cover opacity-80"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-white/20 text-2xl font-bold">
                  {game.title.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px)",
              }}
            />
          </div>
          <div className="px-1.5 py-1">
            <div
              className="text-[12px] font-bold truncate"
              style={{ color: index === focusedIndex ? "var(--accent)" : "var(--text-primary)" }}
            >
              {game.title}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[12px]" style={{ color: "var(--accent)" }}>
                {game.platform}
              </span>
                            {b && (
                <span className="text-[12px] px-1 rounded" style={{ background: b.color, color: "#fff" }}>
                  {b.label}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    },
    [bindItem, focusedIndex],
  );

  useEffect(() => {
    switch (galleryView) {
      case "list": setColumnCount(1); setViewColumnCount(1); break;
      case "bookshelf": setColumnCount(12); setViewColumnCount(12); break;
      case "spread-deck": setColumnCount(16); setViewColumnCount(16); break;
      default: setColumnCount(6); setViewColumnCount(6); break;
    }
  }, [galleryView]);

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
    useGameLaunchStore.getState().setLaunching(game.id, game.title);
    try {
      await window.htpc.games.launch(game);
    } catch (err: any) {
      const message = err?.message ?? "Failed to launch game";
      useGameLaunchStore.getState().setFailed(game.id, message);
    }
  };

  useDetailController({
    enabled: !!selected,
    onConfirm: () => {
      if (selected && !selectedMissingCoreTooltip) {
        void launch(selected);
        setSelected(null);
      }
    },
    onCancel: () => setSelected(null),
  });

  const screenshotUrls = useMemo(() => {
    const urls = localScreenshots.length
      ? localScreenshots.slice(0, 6)
      : detailGameData?.screenshots?.length
        ? detailGameData.screenshots.slice(0, 6)
        : [detailGameData?.bannerUrl, detailGameData?.coverUrl].filter(Boolean);
    return urls.filter((u): u is string => !!u);
  }, [localScreenshots, detailGameData]);

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <GamingNavRail
          activeItem={activeNav}
          onSelect={(item) => {
            setActiveNav(item);
            setActiveCollectionId(null);
          }}
        />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <GamingToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearch}
            onClearSearch={() => setSearch("")}
            activeNav={activeNav}
            libraryFilter={libraryFilter}
            onLibraryFilterChange={setLibraryFilter}
            playerCountFilter={playerCountFilter}
            onPlayerCountFilterChange={setPlayerCountFilter}
            multiplayerTypeFilter={multiplayerTypeFilter}
            onMultiplayerTypeFilterChange={setMultiplayerTypeFilter}
            playStatusFilter={playStatusFilter}
            onPlayStatusFilterChange={setPlayStatusFilter}
            completionFilter={completionFilter}
            onCompletionFilterChange={setCompletionFilter}
            gameCount={gridItems.length}
            scanning={scanning}
            onScan={scan}
          />
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-auto relative"
            style={{ padding: 16 }}
          >
            {/* Collections */}
            <div className="mb-3">
              <CollectionsBar
                itemType="game"
                activeCollectionId={activeCollectionId}
                onSelect={setActiveCollectionId}
                onManage={() => setShowCollectionManager(true)}
                className="flex-shrink-0"
              />
            </div>

            {/* Dynamic metadata facets */}
            {gridItems.length > 0 && (
              <div className="mb-3">
                <DynamicFacetFilters
                  items={facetSourceItems}
                  fields={gameFacetFields}
                  activeFilters={facetFilters}
                  onFilter={applyFacetFilter}
                  className="flex-shrink-0"
                />
              </div>
            )}

            {/* Grid content */}
            {loading || (items.length === 0 && (scanning || remoteScanning)) ? (
              (() => {
                switch (galleryView) {
                  case "list":
                    return (
                      <ListView
                        items={Array.from({ length: 6 })}
                        renderItem={renderSkeletonListItem}
                        rowHeight={80}
                      />
                    );
                  case "hex-grid":
                    return (
                      <HexGridView
                        ref={gridRef}
                        items={Array.from({ length: columnCount * 2 - 1 })}
                        minItemWidth={200}
                        onColumnCountChange={setColumnCount}
                        renderHex={renderSkeletonHex}
                      />
                    );
                  case "bookshelf":
                    return (
                      <BookshelfView
                        ref={gridRef}
                        items={Array.from({ length: viewColumnCount * 2 })}
                        renderSpine={renderSkeletonSpine}
                        onItemsPerRowChange={(count) => setViewColumnCount(count)}
                      />
                    );
                  case "spread-deck":
                    return (
                      <SpreadDeckView
                        ref={gridRef}
                        items={Array.from({ length: viewColumnCount * 2 })}
                        renderCard={renderSkeletonDeckCard}
                        onItemsPerRowChange={(count) => setViewColumnCount(count)}
                      />
                    );
                  default:
                    if (isNeonGrid) {
                      return (
                        <NeonGridView
                          ref={gridRef}
                          items={Array.from({ length: columnCount * 2 })}
                          minItemWidth={200}
                          onColumnCountChange={setColumnCount}
                          rowHeight={260}
                          renderItem={renderSkeletonNeonCard}
                        />
                      );
                    }
                    return (
                      <VirtualGrid
                        ref={gridRef}
                        items={Array.from({ length: columnCount * 2 })}
                        minItemWidth={200}
                        onColumnCountChange={setColumnCount}
                        rowHeight={260}
                        renderItem={renderSkeletonItem}
                      />
                    );
                }
              })()
            ) : items.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-4"
                style={{ color: "var(--text-secondary)", minHeight: 200 }}
              >
                <p>No games found.</p>
                <motion.button
                  className="px-6 py-2.5 rounded-[var(--radius-card)] font-medium"
                  style={{
                    background: "var(--accent)",
                    color: "var(--surface-base)",
                  }}
                  onClick={scan}
                  whileTap={{ scale: 0.96 }}
                >
                  Scan for games
                </motion.button>
              </div>
            ) : (
              (() => {
                switch (galleryView) {
                  case "list":
                    return (
                      <ListView
                        ref={gridRef}
                        items={gridItems}
                        renderItem={renderListItem}
                        rowHeight={80}
                      />
                    );
                  case "hex-grid":
                    return (
                      <HexGridView
                        ref={gridRef}
                        items={gridItems}
                        minItemWidth={200}
                        onColumnCountChange={setColumnCount}
                        renderHex={renderHex}
                        focusedIndex={focusedIndex}
                        bindItem={bindItem}
                      />
                    );
                  case "bookshelf":
                    return (
                      <BookshelfView
                        ref={gridRef}
                        items={gridItems}
                        renderSpine={renderSpine}
                        focusedIndex={focusedIndex}
                        onItemsPerRowChange={(count) => setViewColumnCount(count)}
                        onItemClick={(game, index) => { setFocusedIndex(index); setSelected(game); }}
                        bindItem={bindItem}
                      />
                    );
                  case "spread-deck":
                    return (
                      <SpreadDeckView
                        ref={gridRef}
                        items={gridItems}
                        renderCard={renderDeckCard}
                        focusedIndex={focusedIndex}
                        onItemsPerRowChange={(count) => setViewColumnCount(count)}
                        onItemClick={(game, index) => { setFocusedIndex(index); setSelected(game); }}
                        bindItem={bindItem}
                      />
                    );
                  default:
                    if (isNeonGrid) {
                      return (
                        <NeonGridView
                          ref={gridRef}
                          items={gridItems}
                          minItemWidth={200}
                          onColumnCountChange={setColumnCount}
                          rowHeight={260}
                          renderItem={renderNeonCard}
                        />
                      );
                    }
                    return (
                      <VirtualGrid
                        ref={gridRef}
                        items={gridItems}
                        minItemWidth={200}
                        onColumnCountChange={setColumnCount}
                        rowHeight={260}
                        renderItem={renderItem}
                      />
                    );
                }
              })()
            )}
          </div>
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
                detailGameData?.osPlatform
                  ? { label: "OS", value: detailGameData.osPlatform === "windows" ? "Windows" : "Linux" }
                  : null,
                detailGameData?.engine && detailGameData.engine !== "unknown"
                  ? { label: "Engine", value: detailGameData.engine.charAt(0).toUpperCase() + detailGameData.engine.slice(1) }
                  : null,
                detailGameData?.engineVersion
                  ? { label: "Engine Version", value: detailGameData.engineVersion }
                  : null,
                detailGameData?.graphicsApi && detailGameData.graphicsApi !== "unknown"
                  ? { label: "Graphics", value: detailGameData.graphicsApi.replace(/directx/, "DirectX ").replace(/opengl/, "OpenGL").replace(/vulkan/, "Vulkan").replace(/metal/, "Metal").replace(/software/, "Software") }
                  : null,
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
              <Tooltip content={selectedMissingCoreTooltip ?? ""}>
                <motion.button
                  className="px-5 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm flex items-center gap-2 whitespace-nowrap"
                  style={{
                    background: selectedMissingCoreTooltip ? "var(--surface-1)" : "var(--accent)",
                    color: selectedMissingCoreTooltip ? "var(--text-secondary)" : "var(--surface-base)",
                    cursor: selectedMissingCoreTooltip ? "not-allowed" : "pointer",
                  }}
                  onClick={() => {
                    if (selectedMissingCoreTooltip) return;
                    launch(selected);
                    setSelected(null);
                  }}
                  whileTap={{ scale: selectedMissingCoreTooltip ? 1 : 0.96 }}
                >
                  <Play size={14} /> Launch
                </motion.button>
              </Tooltip>
              <motion.button
                className="px-4 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm flex items-center gap-2 whitespace-nowrap"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
                onClick={() => setShowSplitscreenModal(true)}
                whileTap={{ scale: 0.96 }}
              >
                <Columns size={14} /> Splitscreen <FlaskConical size={12} style={{ opacity: 0.6 }} />
              </motion.button>
              {selected.romPath && !selected.compressedRomPath && (
                <Tooltip content="Compress ROM to emulator-compatible format">
                  <motion.button
                    className="px-4 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm flex items-center gap-2"
                    style={{
                      background: "var(--surface-1)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-default)",
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
                    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    color: "var(--accent)",
                    border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                  }}
                >
                  <Archive size={14} /> Compressed ({selected.compressionFormat})
                </span>
              )}
              <Tooltip content="Launch Settings">
                <motion.button
                  className="px-3 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm flex items-center gap-2"
                  style={{
                    background: showLaunchSettings ? "var(--accent)" : "var(--surface-1)",
                    color: showLaunchSettings ? "var(--surface-base)" : "var(--text-primary)",
                    border: "1px solid var(--border-default)",
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
                {/* Associated entrypoints (level editor, mod tools, etc.) */}
                {selected.entrypoints && selected.entrypoints.length > 0 && (
                  <div>
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Associated Tools
                    </div>
                    <div className="flex flex-col gap-2">
                      {selected.entrypoints.map((ep, i) => {
                        const icon = ep.type === "editor"
                          ? <Box size={14} />
                          : ep.type === "mod-tool"
                            ? <Wrench size={14} />
                            : ep.type === "server"
                              ? <Terminal size={14} />
                              : <Cpu size={14} />;
                        return (
                          <button
                            key={i}
                            className="flex items-center gap-2 p-2 rounded hover:bg-white/5 transition-colors text-left"
                            style={{ background: "var(--surface-1)" }}
                            onClick={() => {
                              void window.htpc.games.launch({
                                ...selected,
                                execPath: ep.path,
                                romPath: undefined,
                              });
                            }}
                          >
                            <span style={{ color: "var(--accent)" }}>{icon}</span>
                            <span className="text-sm truncate flex-1">{ep.label}</span>
                            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                              {ep.type}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Screenshots from game data + locally captured */}
                {screenshotUrls.length > 0 && (
                  <div>
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Screenshots
                    </div>
                    <div
                      className="flex gap-2 overflow-x-auto pb-1"
                    >
                      {screenshotUrls.map((url, i) => (
                        <img
                          key={i}
                          src={scaledImageUrl(url, 220, 112)}
                          alt=""
                          className="h-28 flex-shrink-0 rounded-[var(--radius-card)] object-cover cursor-pointer hover:brightness-110 transition-[filter]"
                          style={{ maxWidth: 220 }}
                          onClick={() => setLightboxIndex(i)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Thumbnailing status */}
                {(pendingThumbnailIds.has(selected.id) || regeneratingIds.has(selected.id)) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Loader size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
                    <span style={{ color: "var(--text-secondary)" }}>Generating thumbnail...</span>
                  </div>
                )}

                {/* Videos from lazy metadata */}
                {detailGameData?.videos && detailGameData.videos.length > 0 && (
                  <div>
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: "var(--text-secondary)" }}
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
                          style={{ background: "var(--surface-1)" }}
                        >
                          <Play size={18} />
                          <span className="text-sm truncate flex-1">{video.name ?? "Video"}</span>
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{video.type}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {selected.playTime !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>
                      Play Time
                    </span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      {selected.playTime >= 3600
                        ? `${Math.floor(selected.playTime / 3600)}h ${Math.floor((selected.playTime % 3600) / 60)}m`
                        : `${Math.floor(selected.playTime / 60)}m`}
                    </span>
                  </div>
                )}
                {(selected.platform === "nes" || selected.platform === "snes" || selected.platform === "gb" || selected.platform === "gba") && (
                  <div>
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: "var(--text-secondary)" }}
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
                      style={{ color: "var(--text-secondary)" }}
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
                      style={{ color: "var(--text-secondary)" }}
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
                        style={{ color: "var(--text-secondary)" }}
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
                        style={{ color: "var(--text-secondary)" }}
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
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                      <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                        Use {"{exe}"} as placeholder for the executable path. Leave empty for default.
                      </p>
                    </div>
                    <div>
                      <div
                        className="text-xs font-semibold uppercase tracking-wide mb-2"
                        style={{ color: "var(--text-secondary)" }}
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
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                      <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                        Use {"{exe}"} as placeholder for the executable path. Leave empty for default.
                      </p>
                    </div>
                  </div>
                )}
                {/* Shader Injection section — shown for Windows and Steam games */}
                {(selected.platform === "windows" || selected.platform === "steam") && (
                  <div className="flex flex-col gap-4">
                    <div
                      className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Shader &amp; DLL Injection
                    </div>
                    {/* Vulkan Layer Shader Injection */}
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                        <input
                          type="checkbox"
                          checked={selectedInjectionConfig?.vulkanShader?.enabled ?? false}
                          onChange={(e) => {
                            const next: GameInjectionConfig = {
                              ...selectedInjectionConfig,
                              vulkanShader: {
                                enabled: e.target.checked,
                                preset: selectedInjectionConfig?.vulkanShader?.preset ?? "crt",
                                intensity: selectedInjectionConfig?.vulkanShader?.intensity ?? 1.0,
                              },
                            };
                            setSelectedInjectionConfig(next);
                            void window.htpc.games.injectionConfig.set(selected.id, next);
                            if (next.vulkanShader) {
                              void window.htpc.games.injectionConfig.updateRuntimeShader(selected.id, next.vulkanShader);
                            }
                          }}
                        />
                        Vulkan Layer Shader (Experimental)
                      </label>
                      {selectedInjectionConfig?.vulkanShader?.enabled && (
                        <div className="flex flex-col gap-2 pl-6">
                          <div>
                            <label className="text-[12px] block mb-1" style={{ color: "var(--text-secondary)" }}>
                              Preset
                            </label>
                            <select
                              value={selectedInjectionConfig.vulkanShader.preset}
                              onChange={(e) => {
                                const newPreset = e.target.value;
                                const defs = shaderParamDefs[newPreset] ?? [];
                                const defaultParams = defs.map((d) => d.default);
                                const next: GameInjectionConfig = {
                                  ...selectedInjectionConfig,
                                  vulkanShader: { ...selectedInjectionConfig.vulkanShader!, preset: newPreset, params: defaultParams.length > 0 ? defaultParams : undefined },
                                };
                                setSelectedInjectionConfig(next);
                                void window.htpc.games.injectionConfig.set(selected.id, next);
                                void window.htpc.games.injectionConfig.updateRuntimeShader(selected.id, next.vulkanShader!);
                              }}
                              className="w-full text-sm px-2 py-1.5 rounded"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                                outline: "none",
                              }}
                            >
                              {vulkanPresets.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[12px] block mb-1" style={{ color: "var(--text-secondary)" }}>
                              Intensity: {(selectedInjectionConfig.vulkanShader.intensity ?? 1.0).toFixed(2)}
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={selectedInjectionConfig.vulkanShader.intensity ?? 1.0}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                const next: GameInjectionConfig = {
                                  ...selectedInjectionConfig,
                                  vulkanShader: { ...selectedInjectionConfig.vulkanShader!, intensity: val },
                                };
                                setSelectedInjectionConfig(next);
                                void window.htpc.games.injectionConfig.set(selected.id, next);
                                void window.htpc.games.injectionConfig.updateRuntimeShader(selected.id, next.vulkanShader!);
                              }}
                              className="w-full"
                            />
                          </div>
                          {selectedInjectionConfig.vulkanShader && (shaderParamDefs[selectedInjectionConfig.vulkanShader.preset] ?? []).map((def, idx) => (
                            <div key={idx}>
                              <label className="text-[12px] block mb-1" style={{ color: "var(--text-secondary)" }}>
                                {def.label}: {(selectedInjectionConfig.vulkanShader!.params?.[idx] ?? def.default).toFixed(def.step < 0.01 ? 4 : def.step < 1 ? 3 : 0)}
                              </label>
                              <input
                                type="range"
                                min={def.min}
                                max={def.max}
                                step={def.step}
                                value={selectedInjectionConfig.vulkanShader!.params?.[idx] ?? def.default}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  const vulkanShader = selectedInjectionConfig.vulkanShader!;
                                  const currentParams = vulkanShader.params ?? shaderParamDefs[vulkanShader.preset]?.map((d) => d.default) ?? [];
                                  const newParams = [...currentParams];
                                  newParams[idx] = val;
                                  const next: GameInjectionConfig = {
                                    ...selectedInjectionConfig,
                                    vulkanShader: { ...vulkanShader, params: newParams },
                                  };
                                  setSelectedInjectionConfig(next);
                                  void window.htpc.games.injectionConfig.set(selected.id, next);
                                  void window.htpc.games.injectionConfig.updateRuntimeShader(selected.id, next.vulkanShader!);
                                }}
                                className="w-full"
                              />
                            </div>
                          ))}
                          {selected.platform === "steam" && (
                            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                              Uses Proton's <code>user_settings.py</code> to inject env vars. The file is cleaned up when the game closes.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    {/* DLL Override / Custom DLL Injection */}
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                        <input
                          type="checkbox"
                          checked={selectedInjectionConfig?.dllInjection?.enabled ?? false}
                          onChange={(e) => {
                            const next: GameInjectionConfig = {
                              ...selectedInjectionConfig,
                              dllInjection: {
                                enabled: e.target.checked,
                                overrideDlls: selectedInjectionConfig?.dllInjection?.overrideDlls ?? ["dxgi.dll", "d3d11.dll"],
                                customDlls: selectedInjectionConfig?.dllInjection?.customDlls ?? [],
                              },
                            };
                            setSelectedInjectionConfig(next);
                            void window.htpc.games.injectionConfig.set(selected.id, next);
                          }}
                        />
                        DLL Override (ReShade / Mods)
                      </label>
                      {selectedInjectionConfig?.dllInjection?.enabled && (
                        <div className="flex flex-col gap-2 pl-6">
                          <div>
                            <label className="text-[12px] block mb-1" style={{ color: "var(--text-secondary)" }}>
                              DLL Override List (comma-separated)
                            </label>
                            <input
                              type="text"
                              value={selectedInjectionConfig.dllInjection.overrideDlls.join(", ")}
                              onChange={(e) => {
                                const dlls = e.target.value.split(",").map((d) => d.trim()).filter(Boolean);
                                const next: GameInjectionConfig = {
                                  ...selectedInjectionConfig,
                                  dllInjection: { ...selectedInjectionConfig.dllInjection!, overrideDlls: dlls },
                                };
                                setSelectedInjectionConfig(next);
                                void window.htpc.games.injectionConfig.set(selected.id, next);
                              }}
                              placeholder="dxgi.dll, d3d11.dll"
                              className="w-full text-sm px-2 py-1.5 rounded"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                                outline: "none",
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-[12px] block mb-1" style={{ color: "var(--text-secondary)" }}>
                              Custom DLL Paths (one per line)
                            </label>
                            <textarea
                              value={selectedInjectionConfig.dllInjection.customDlls.join("\n")}
                              onChange={(e) => {
                                const dlls = e.target.value.split("\n").map((d) => d.trim()).filter(Boolean);
                                const next: GameInjectionConfig = {
                                  ...selectedInjectionConfig,
                                  dllInjection: { ...selectedInjectionConfig.dllInjection!, customDlls: dlls },
                                };
                                setSelectedInjectionConfig(next);
                                void window.htpc.games.injectionConfig.set(selected.id, next);
                              }}
                              placeholder="/path/to/ReShade.dll"
                              rows={3}
                              className="w-full text-sm px-2 py-1.5 rounded"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                                outline: "none",
                                resize: "vertical",
                              }}
                            />
                            <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                              DLLs are copied to the Wine prefix's <code>system32</code> directory before launch.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* ReShade Post-Processing */}
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                        <input
                          type="checkbox"
                          checked={selectedInjectionConfig?.reshade?.enabled ?? false}
                          onChange={(e) => {
                            const next: GameInjectionConfig = {
                              ...selectedInjectionConfig,
                              reshade: {
                                enabled: e.target.checked,
                                api: selectedInjectionConfig?.reshade?.api ?? "auto",
                              },
                            };
                            setSelectedInjectionConfig(next);
                            void window.htpc.games.injectionConfig.set(selected.id, next);
                          }}
                        />
                        ReShade Post-Processing (Experimental)
                      </label>
                      {selectedInjectionConfig?.reshade?.enabled && (
                        <div className="flex flex-col gap-2 pl-6">
                          <div>
                            <label className="text-[12px] block mb-1" style={{ color: "var(--text-secondary)" }}>
                              Graphics API
                            </label>
                            <select
                              value={selectedInjectionConfig.reshade.api ?? "auto"}
                              onChange={(e) => {
                                const next: GameInjectionConfig = {
                                  ...selectedInjectionConfig,
                                  reshade: { ...selectedInjectionConfig.reshade!, api: e.target.value as ReShadeConfig["api"] },
                                };
                                setSelectedInjectionConfig(next);
                                void window.htpc.games.injectionConfig.set(selected.id, next);
                              }}
                              className="w-full text-sm px-2 py-1.5 rounded"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                                outline: "none",
                              }}
                            >
                              <option value="auto">Auto-detect</option>
                              <option value="dxgi">DirectX 10/11/12 (dxgi.dll)</option>
                              <option value="d3d11">DirectX 11 (d3d11.dll)</option>
                              <option value="d3d9">DirectX 9 (d3d9.dll)</option>
                              <option value="opengl32">OpenGL (opengl32.dll)</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => void window.htpc.games.reshade.openFolder()}
                              className="text-sm px-3 py-1.5 rounded"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                              }}
                            >
                              Open ReShade Folder
                            </button>
                            <button
                              onClick={() => {
                                setReshadeReinstall({ status: "in-progress", message: "Starting..." });
                                void window.htpc.games.reshade.reinstall().then(() => {
                                  void window.htpc.games.reshade.getStatus().then((status) => {
                    if (status.shadersInstalled && status.dllInstalled) {
                      useToastStore.getState().push({ type: "success", message: "ReShade reinstalled successfully" });
                      setReshadeReinstall({ status: "done", message: "Complete" });
                    } else {
                      useToastStore.getState().push({ type: "error", message: "ReShade reinstall incomplete — check logs" });
                      setReshadeReinstall({ status: "error", message: "Incomplete" });
                    }
                  });
                }).catch(() => {
                  useToastStore.getState().push({ type: "error", message: "ReShade reinstall failed" });
                  setReshadeReinstall({ status: "error", message: "Failed" });
                });
                              }}
                              disabled={reshadeReinstall.status === "in-progress"}
                              className="text-sm px-3 py-1.5 rounded flex items-center gap-2"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                                opacity: reshadeReinstall.status === "in-progress" ? 0.6 : 1,
                              }}
                            >
                              {reshadeReinstall.status === "in-progress" && (
                                <span
                                  className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                                  style={{ animation: "spin 0.8s linear infinite" }}
                                />
                              )}
                              {reshadeReinstall.status === "done" && (
                                <span style={{ color: "var(--accent-success, #4caf50)" }}>
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
                                    <path d="M3 8.5l3.5 3.5L13 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                              )}
                              {reshadeReinstall.status === "error" && (
                                <span style={{ color: "var(--accent-danger, #f44336)" }}>
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
                                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                  </svg>
                                </span>
                              )}
                              {reshadeReinstall.status === "in-progress" ? reshadeReinstall.message : "Re-download Shaders"}
                            </button>
                          </div>
                          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                            ReShade DLL and ReShade.ini are placed next to the game executable. Shaders are loaded from Ember's central shaders folder. Cleaned up automatically when the game closes.
                          </p>
                          {/* Custom INI Overrides */}
                          <div className="flex flex-col gap-2 mt-2">
                            <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                              Custom INI Overrides
                            </label>
                            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                              Apply arbitrary settings to ReShade.ini when the game launches. Format: section, key, value.
                            </p>
                            {(selectedInjectionConfig.reshade?.iniOverrides ?? []).map((ov, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: "var(--surface-1)" }}>
                                  [{ov.section}] {ov.key}={ov.value}
                                </span>
                                <button
                                  onClick={() => {
                                    const next: GameInjectionConfig = {
                                      ...selectedInjectionConfig,
                                      reshade: {
                                        ...selectedInjectionConfig.reshade!,
                                        iniOverrides: (selectedInjectionConfig.reshade?.iniOverrides ?? []).filter((_, i) => i !== idx),
                                      },
                                    };
                                    setSelectedInjectionConfig(next);
                                    void window.htpc.games.injectionConfig.set(selected.id, next);
                                  }}
                                  className="text-xs px-2 py-1 rounded"
                                  style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            <IniOverrideEditor
                              onAdd={(section, key, value) => {
                                const next: GameInjectionConfig = {
                                  ...selectedInjectionConfig,
                                  reshade: {
                                    ...selectedInjectionConfig.reshade!,
                                    iniOverrides: [
                                      ...(selectedInjectionConfig.reshade?.iniOverrides ?? []),
                                      { section, key, value },
                                    ],
                                  },
                                };
                                setSelectedInjectionConfig(next);
                                void window.htpc.games.injectionConfig.set(selected.id, next);
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DetailPanel>
      <ImageLightbox
        open={lightboxIndex !== null}
        images={screenshotUrls}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
      {menu}
      <ConfirmDialog
        isOpen={confirmUninstall.open}
        title={confirmUninstall.game ? uninstallLabelForGame(confirmUninstall.game) : "Uninstall"}
        message={confirmUninstall.game ? uninstallMessageForGame(confirmUninstall.game) : ""}
        confirmLabel={confirmUninstall.game ? uninstallLabelForGame(confirmUninstall.game) : "Confirm"}
        destructive
        onConfirm={() => {
          const game = confirmUninstall.game;
          if (!game) return;
          setConfirmUninstall({ open: false, game: null });
          uninstallGame(game).then((result) => {
            const isDelete = uninstallLabelForGame(game) === "Delete file";
            if (result.success) {
              useToastStore.getState().push({
                type: "success",
                message: `${game.title} ${isDelete ? "deleted" : "uninstalled"}`,
              });
            } else {
              useToastStore.getState().push({
                type: "error",
                message: `Failed to ${isDelete ? "delete" : "uninstall"} ${game.title}: ${result.error ?? "Unknown error"}`,
              });
            }
          });
        }}
        onCancel={() => setConfirmUninstall({ open: false, game: null })}
      />
      <CollectionManager
        open={showCollectionManager}
        onClose={() => setShowCollectionManager(false)}
        itemType="game"
      />
      {showSplitscreenModal && selected && (
        <SplitscreenConfigModal
          game={selected}
          onClose={() => setShowSplitscreenModal(false)}
        />
      )}
      </div>
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
              style={{ color: "var(--text-secondary)" }}
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
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
            <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
              Overrides the default launch command for this game.
            </p>
          </div>

          {/* Launch Args */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--text-secondary)" }}
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
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          {/* Working Directory */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--text-secondary)" }}
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
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          {/* Environment Variables */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--text-secondary)" }}
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
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          {/* Session Hooks */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Session Hooks
            </div>
            <div className="flex flex-col gap-2">
              {(game.sessionHooks ?? []).map((hook) => (
                <div
                  key={hook.id}
                  className="flex items-center gap-2 p-2 rounded text-sm"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <span
                    className="px-1.5 py-0.5 rounded text-[12px] font-medium uppercase"
                    style={{
                      background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                      color: "var(--accent)",
                    }}
                  >
                    {HOOK_TIMING_LABELS[hook.timing] ?? hook.timing}
                  </span>
                  <span className="truncate flex-1" style={{ color: "var(--text-primary)" }}>
                    {hook.command} {hook.args?.join(" ") ?? ""}
                  </span>
                  <button
                    onClick={() => removeHook(hook.id)}
                    className="p-1 rounded hover:bg-white/10 transition-colors"
                    aria-label="Remove hook"
                  >
                    <X size={14} style={{ color: "var(--text-secondary)" }} />
                  </button>
                </div>
              ))}
            </div>

            {editingHook === null ? (
              <button
                onClick={() => setEditingHook("new")}
                className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded text-xs font-medium"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              >
                <Plus size={14} /> Add Hook
              </button>
            ) : (
              <div className="flex flex-col gap-2 mt-2 p-3 rounded"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
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
                    background: "var(--surface-base)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
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
                    background: "var(--surface-base)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
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
                    background: "var(--surface-base)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
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
                      background: "var(--surface-base)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <span className="text-xs self-center" style={{ color: "var(--text-secondary)" }}>
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
                    background: "var(--surface-base)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingHook(null)}
                    className="px-3 py-1 rounded text-xs"
                    style={{
                      background: "var(--surface-1)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addHook}
                    disabled={!hookDraft.command.trim()}
                    className="px-3 py-1 rounded text-xs font-medium"
                    style={{
                      background: "var(--accent)",
                      color: "var(--surface-base)",
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
