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
import { Game, GamePlatform, GameEmulatorConfig } from "../../../../shared/types";
import { useGridFocus } from "../../hooks/useGridFocus";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";
import { useFlashPlayerStore } from "../../store/flashPlayer.store";
import { useJsnesPlayerStore } from "../../store/jsnesPlayer.store";
import { useEmulatorjsPlayerStore } from "../../store/emulatorjsPlayer.store";
import { useV86PlayerStore } from "../../store/v86Player.store";
import { useLibretroPlayerStore } from "../../store/libretroPlayer.store";
import { SHADER_PRESETS } from "../../components/LibretroPlayer/shaders";
import { useToastStore } from "../../store/toast.store";
import { useSettingsStore } from "../../store/settings.store";
import { useCollectionsStore, evaluateSmartFilter, sortByCollection } from "../../store/collections.store";
import { CollectionsBar } from "../../components/CollectionsBar/CollectionsBar";
import { CollectionManager } from "../../components/CollectionManager/CollectionManager";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { AiGroup } from "../../../../shared/types";
import { DynamicFacetFilters, FacetField } from "../../components/DynamicFacetFilters/DynamicFacetFilters";

const PLATFORM_FILTERS: ChipFilter<
  GamePlatform | "all" | "couch-coop" | "favorites"
>[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: "★ Favorites" },
  { id: "couch-coop", label: "🎮 Couch Co-op" },
  { id: "steam", label: "Steam" },
  { id: "gog", label: "GOG" },
  { id: "heroic", label: "Heroic/Epic" },
  { id: "lutris", label: "Lutris" },
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
  { id: "desktop", label: "Other" },
];

const LIBRETRO_PLATFORMS: GamePlatform[] = [
  "n64", "genesis", "sms", "gamegear", "pce", "psx", "nds", "dreamcast"
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
  const regeneratingIds = useGamesStore((s) => s.regeneratingIds);
  const pendingThumbnailIds = useGamesStore((s) => s.pendingThumbnailIds);

  useEffect(() => {
    if (game.platform === "flash" && !game.coverUrl) {
      loadThumbnail(game.id);
    }
  }, [game.id, game.platform, game.coverUrl, loadThumbnail]);

  const missingCoreTooltip = useMemo(() => getMissingCoreTooltip(game), [game]);

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
      isThumbnailPending={pendingThumbnailIds.has(game.id) || regeneratingIds.has(game.id)}
      corrupt={game.corrupt}
      missingCoreTooltip={missingCoreTooltip}
      playTime={game.playTime}
      lastPlayed={game.lastPlayed}
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
  const activeFilter = useGamesStore((s) => s.activeFilter);
  const searchQuery = useGamesStore((s) => s.searchQuery);
  const load = useGamesStore((s) => s.load);
  const scan = useGamesStore((s) => s.scan);
  const setFilter = useGamesStore((s) => s.setFilter);
  const setSearch = useGamesStore((s) => s.setSearch);
  const filtered = useGamesStore((s) => s.filtered);
  const toggleFavorite = useGamesStore((s) => s.toggleFavorite);
  const setTags = useGamesStore((s) => s.setTags);
  const hide = useGamesStore((s) => s.hide);
  const regenerateThumbnail = useGamesStore((s) => s.regenerateThumbnail);
  const updateLastPlayed = useGamesStore((s) => s.updateLastPlayed);
  const [selected, setSelected] = useState<Game | null>(null);
  const [columnCount, setColumnCount] = useState(6);
  const [selectedEmulatorConfig, setSelectedEmulatorConfig] = useState<GameEmulatorConfig>({});
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string>>(new Set());
  const gridRef = useRef<VirtualGridHandle>(null);

  type ViewMode = "all" | "ai-groups" | "by-platform";
  const [viewMode, setViewMode] = useState<ViewMode>("ai-groups");
  const [aiGroups, setAiGroups] = useState<AiGroup[]>([]);
  const [aiGroupsLoading, setAiGroupsLoading] = useState(false);
  const [selectedAiGroup, setSelectedAiGroup] = useState<string | null>(null);
  const aiGroupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [facetFilters, setFacetFilters] = useState<Record<string, string | null>>({});
  const applyFacetFilter = (field: string, value: string | null) => {
    setFacetFilters((prev) => ({ ...prev, [field]: value }));
  };

  const collections = useCollectionsStore((s) => s.collections);
  const loadCollections = useCollectionsStore((s) => s.load);
  const addItem = useCollectionsStore((s) => s.addItem);
  const listItems = useCollectionsStore((s) => s.listItems);

  const setEmulatorConfig = useGamesStore((s) => s.setEmulatorConfig);
  const getEmulatorConfig = useGamesStore((s) => s.getEmulatorConfig);

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
        setAiGroups(groups);
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
  }, [filtered, games, activeFilter, searchQuery, activeCollectionId, collectionItemIds, activeCollection]);

  const displayItems = useMemo(() => {
    if (viewMode !== "ai-groups" || !selectedAiGroup) return items;
    const group = aiGroups.find((g) => g.label === selectedAiGroup);
    if (!group) return items;
    const ids = new Set(group.itemIds);
    return items.filter((g) => ids.has(g.id));
  }, [items, viewMode, aiGroups, selectedAiGroup]);

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

  const { focusedIndex } = useGridFocus({
    items: gridItems,
    columnCount,
    gridRef,
    onConfirm: (game) => setSelected(game),
    enabled: !selected,
  });

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
          icon: game.isFavorite ? "★" : "☆",
        },
        { id: "hide", label: "Hide", icon: "🙈", destructive: true },
        { id: "tags", label: "Update metadata / tags", icon: "🏷" },
        { id: "controls", label: "Customize Input controls", icon: "🎮" },
        {
          id: "regenerate",
          label: "Regenerate thumbnail",
          icon: "🔄",
        },
        {
          id: "folder",
          label: "Open containing folder",
          icon: "�",
          disabled: !game.execPath && !game.romPath,
        },
      ];
      if (gameCollections.length > 0) {
        opts.push({ id: "__sep__", label: "Collections", icon: "", disabled: true });
        for (const c of gameCollections) {
          opts.push({
            id: `add-to-coll:${c.id}`,
            label: c.name,
            icon: c.icon || "📁",
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
          const path = game.romPath || game.execPath;
          if (path) {
            void window.htpc.shell.showItemInFolder(path);
          }
          break;
        }
      }
    },
  });

  const renderItem = useCallback(
    (game: Game, index: number) => (
      <div className="p-1.5 w-full h-full flex flex-col min-w-0" {...bindItem(game, index)}>
        <LazyGameCard
          game={game}
          index={index}
          focusedIndex={focusedIndex}
          onSelect={() => setSelected(game)}
          onFavorite={() => toggleFavorite(game.id)}
        />
      </div>
    ),
    [bindItem, focusedIndex, toggleFavorite],
  );

  const badge = selected ? gameBadge(selected) : undefined;

  const resolveShader = async (game: Game): Promise<string> => {
    const perGame = await getEmulatorConfig(game.id);
    if (perGame.shader) return perGame.shader;
    const settings = useSettingsStore.getState().settings;
    const platformShader = settings?.emulatorShaders?.[game.platform];
    if (platformShader) return platformShader;
    return settings?.defaultEmulatorShader ?? "";
  };

  const launch = async (game: Game): Promise<void> => {
    updateLastPlayed(game.id);
    if (game.platform === "flash" && game.romPath) {
      useFlashPlayerStore.getState().launch(game.romPath, game.title, game.id);
      return;
    }
    if (game.platform === "nes" && game.romPath) {
      useJsnesPlayerStore.getState().launch(game.romPath, game.title, game.id);
      return;
    }
    if ((game.platform === "snes" || game.platform === "gb" || game.platform === "gba") && game.romPath) {
      const shader = await resolveShader(game);
      useEmulatorjsPlayerStore.getState().launch(game.romPath, game.title, game.platform, game.id, shader);
      return;
    }
    if (game.platform === "dos" && game.romPath) {
      useV86PlayerStore.getState().launch(game.romPath, game.title, game.id);
      return;
    }
    if (LIBRETRO_PLATFORMS.includes(game.platform) && game.romPath) {
      const shader = await resolveShader(game);
      await useLibretroPlayerStore.getState().launch({
        romPath: game.romPath,
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

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div className="flex items-center gap-3 flex-shrink-0">
        <OskInput
          value={searchQuery}
          onChange={setSearch}
          placeholder="Search games…"
          className="text-sm"
          style={{ maxWidth: 280 } as React.CSSProperties}
        />
        <motion.button
          className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={scan}
          whileTap={{ scale: 0.96 }}
          disabled={scanning}
        >
          {scanning ? "⟳ Scanning…" : "↺ Scan"}
        </motion.button>
        <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          {items.length} games
        </span>
      </div>

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

      {/* View-mode sub-tabs */}
      <div className="flex gap-2 flex-shrink-0 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {(["all", "ai-groups", "by-platform"] as ViewMode[]).map((m) => (
          <motion.button
            key={m}
            onClick={() => {
              setViewMode(m);
              setSelectedAiGroup(null);
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
            {m === "all" ? "All" : m === "ai-groups" ? "✨ Groups" : "By Platform"}
          </motion.button>
        ))}
      </div>

      {/* AI group chips */}
      {viewMode === "ai-groups" && aiGroups.length > 0 && (
        <div className="flex gap-2 flex-shrink-0 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <motion.button
            onClick={() => setSelectedAiGroup(null)}
            className="relative flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none"
            style={{
              backgroundColor: !selectedAiGroup
                ? "var(--color-accent)"
                : "var(--color-surface-raised)",
              color: !selectedAiGroup ? "var(--color-bg)" : "var(--color-text-dim)",
              border: `1px solid ${!selectedAiGroup ? "var(--color-accent)" : "var(--color-border)"}`,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            All Groups
          </motion.button>
          {aiGroups.map((g, i) => (
            <motion.button
              key={`${g.label}-${i}`}
              onClick={() => setSelectedAiGroup(g.label)}
              className="relative flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none"
              style={{
                backgroundColor: selectedAiGroup === g.label
                  ? "var(--color-accent)"
                  : "var(--color-surface-raised)",
                color: selectedAiGroup === g.label ? "var(--color-bg)" : "var(--color-text-dim)",
                border: `1px solid ${selectedAiGroup === g.label ? "var(--color-accent)" : "var(--color-border)"}`,
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

      {/* Traditional platform filters when not in AI-groups mode */}
      {viewMode === "by-platform" && (
        <ChipFilters
          filters={PLATFORM_FILTERS}
          active={activeFilter}
          onSelect={(f) => {
            setActiveCollectionId(null);
            setFilter(f);
          }}
          className="flex-shrink-0"
        />
      )}

      {/* Dynamic metadata facets based on currently visible items */}
      {gridItems.length > 0 && (
        <DynamicFacetFilters
          items={facetSourceItems as Record<string, unknown>[]}
          fields={gameFacetFields}
          activeFilters={facetFilters}
          onFilter={applyFacetFilter}
          className="flex-shrink-0"
        />
      )}

      {loading || scanning ? (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-3"
          style={{ color: "var(--color-text-dim)" }}
        >
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{
              borderColor: "var(--color-accent)",
              borderTopColor: "transparent",
            }}
          />
          <span className="text-sm">
            {loading ? "Loading games…" : "Scanning for games…"}
          </span>
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-4"
          style={{ color: "var(--color-text-dim)" }}
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
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <VirtualGrid
            ref={gridRef}
            items={gridItems}
            minItemWidth={200}
            onColumnCountChange={setColumnCount}
            rowHeight={260}
            renderItem={renderItem}
          />
        </div>
      )}

      <DetailPanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        coverUrl={selected?.coverUrl}
        description={selected?.description}
        metadata={
          selected
            ? ([
                selected.developer
                  ? { label: "Developer", value: selected.developer }
                  : null,
                selected.releaseYear
                  ? { label: "Year", value: String(selected.releaseYear) }
                  : null,
                selected.protonRating && selected.protonRating !== "unknown"
                  ? { label: "ProtonDB", value: selected.protonRating }
                  : null,
                selected.playerCount
                  ? {
                      label: "Players",
                      value: `${selected.playerCount.min}–${selected.playerCount.max}`,
                    }
                  : null,
                { label: "Platform", value: selected.platform },
              ].filter(Boolean) as { label: string; value: string }[])
            : []
        }
        tags={selected?.tags ?? []}
        onTagsChange={
          selected ? (newTags) => setTags(selected.id, newTags) : undefined
        }
        actions={
          selected && (
            <Tooltip content={getMissingCoreTooltip(selected) ?? ""}>
              <motion.button
                className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
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
                ▶ Launch
              </motion.button>
            </Tooltip>
          )
        }
      >
        {selected && (
          <div className="flex flex-col gap-4">
            {(selected.bannerUrl || selected.coverUrl) && (
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
                  {[selected.bannerUrl, selected.coverUrl]
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
                <select
                  value={selectedEmulatorConfig.shader ?? ""}
                  onChange={(e) => {
                    const shader = e.target.value;
                    const next = { ...selectedEmulatorConfig, shader: shader || undefined };
                    setSelectedEmulatorConfig(next);
                    void setEmulatorConfig(selected.id, next);
                  }}
                  className="w-full text-sm px-2 py-1.5 rounded"
                  style={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                >
                  <option value="">Inherit (use emulator/global default)</option>
                  <option value="2xSal.glsl">2xSal</option>
                  <option value="4xBR.glsl">4xBR</option>
                  <option value="6xBRZ.glsl">6xBRZ</option>
                  <option value="crt-easymode.glsl">CRT Easymode</option>
                  <option value="crt-geom.glsl">CRT Geom</option>
                  <option value="dot.glsl">Dot</option>
                  <option value="lcd.glsl">LCD</option>
                  <option value="ntsc.glsl">NTSC</option>
                  <option value="sharp-bilinear.glsl">Sharp Bilinear</option>
                  <option value="supereagle.glsl">Super Eagle</option>
                  <option value="xbrz.glsl">xBRZ</option>
                </select>
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
                <select
                  value={selectedEmulatorConfig.shader ?? ""}
                  onChange={(e) => {
                    const shader = e.target.value;
                    const next = { ...selectedEmulatorConfig, shader: shader || undefined };
                    setSelectedEmulatorConfig(next);
                    void setEmulatorConfig(selected.id, next);
                  }}
                  className="w-full text-sm px-2 py-1.5 rounded"
                  style={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                >
                  <option value="">None</option>
                  {SHADER_PRESETS.filter((s) => s.id !== "none").map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>
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
