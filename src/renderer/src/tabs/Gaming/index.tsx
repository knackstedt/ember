import React, { useEffect, useRef, useState } from "react";
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
import { Game, GamePlatform } from "../../../../shared/types";
import { useGridFocus } from "../../hooks/useGridFocus";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";
import { useFlashPlayerStore } from "../../store/flashPlayer.store";
import { useToastStore } from "../../store/toast.store";

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
  { id: "flash", label: "Flash" },
  { id: "desktop", label: "Other" },
];

const PROTON_COLORS: Record<string, string> = {
  platinum: "#b5e3ff",
  gold: "#ffd700",
  silver: "#c0c0c0",
  bronze: "#cd7f32",
  borked: "#ff4444",
};

const LazyGameCard: React.FC<{
  game: Game;
  index: number;
  focusedIndex: number;
  onSelect: () => void;
  onFavorite: () => void;
}> = ({ game, index, focusedIndex, onSelect, onFavorite }) => {
  const loadThumbnail = useGamesStore((s) => s.loadThumbnail);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (game.platform === "flash" && !game.coverUrl) {
      setIsPending(true);
      loadThumbnail(game.id).finally(() => setIsPending(false));
    }
  }, [game.id, game.platform, game.coverUrl, loadThumbnail]);

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
      isThumbnailPending={isPending}
      onSelect={onSelect}
      onFavorite={onFavorite}
    />
  );
};

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
  const {
    games,
    loading,
    scanning,
    activeFilter,
    searchQuery,
    load,
    scan,
    setFilter,
    setSearch,
    filtered,
    toggleFavorite,
    setTags,
    hide,
  } = useGamesStore();
  const [selected, setSelected] = useState<Game | null>(null);
  const [columnCount, setColumnCount] = useState(6);
  const gridRef = useRef<VirtualGridHandle>(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handler = () => setSelected(null);
    window.addEventListener("htpc:escape", handler);
    return () => window.removeEventListener("htpc:escape", handler);
  }, []);

  const items = filtered();
  const { focusedIndex } = useGridFocus({
    items,
    columnCount,
    gridRef,
    onConfirm: (game) => setSelected(game),
    enabled: !selected,
  });

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
          id: "folder",
          label: "Open containing folder",
          icon: "📂",
          disabled: !game.execPath && !game.romPath,
        },
      ];
      return opts;
    },
    onAction: (game, optionId) => {
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

  const badge = selected ? gameBadge(selected) : undefined;

  const launch = async (game: Game): Promise<void> => {
    if (game.platform === "flash" && game.romPath) {
      useFlashPlayerStore.getState().launch(game.romPath, game.title);
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
    .filter((g) => g.lastPlayed !== undefined)
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
          if (game) launch(game);
        }}
      />

      <ChipFilters
        filters={PLATFORM_FILTERS}
        active={activeFilter}
        onSelect={setFilter}
        className="flex-shrink-0"
      />

      {loading ? (
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: "var(--color-text-dim)" }}
        >
          Loading games…
        </div>
      ) : scanning && items.length === 0 ? (
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
          <span className="text-sm">Scanning for games…</span>
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
            items={items}
            minItemWidth={200}
            onColumnCountChange={setColumnCount}
            rowHeight={260}
            renderItem={(game, index) => (
              <div className="p-1.5 w-full h-full flex flex-col min-w-0" {...bindItem(game, index)}>
                <LazyGameCard
                  game={game}
                  index={index}
                  focusedIndex={focusedIndex}
                  onSelect={() => setSelected(game)}
                  onFavorite={() => toggleFavorite(game.id)}
                />
              </div>
            )}
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
            <motion.button
              className="px-6 py-2.5 rounded-[var(--radius-card)] font-semibold text-sm"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
              }}
              onClick={() => {
                launch(selected);
                setSelected(null);
              }}
              whileTap={{ scale: 0.96 }}
            >
              ▶ Launch
            </motion.button>
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
          </div>
        )}
      </DetailPanel>
      {menu}
    </div>
  );
};
