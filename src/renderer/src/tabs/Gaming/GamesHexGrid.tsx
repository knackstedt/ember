import React, { RefObject, useCallback } from "react";
import { Game } from "../../../../shared/types";
import { HexCellData, HexGridView } from "../../components/GalleryView/HexGridView";
import { VirtualGridHandle } from "../../components/VirtualGrid/VirtualGrid";
import { NavAction } from "../../hooks/useGridFocus";
import { useGamesStore } from "../../store/games.store";
import { gameBadge, LIBRETRO_THUMB_PLATFORMS, WEB_THUMB_PLATFORMS } from "./game-utils";

export interface GamesHexGridProps {
  items: Game[];
  bindItem: (game: Game, index: number) => Record<string, unknown>;
  onSelectGame: (game: Game, index: number) => void;
  onColumnCountChange: (count: number) => void;
  scrollRef?: RefObject<HTMLElement>;
}

/**
 * Hex-grid view of the game library. Subscribes to thumbnail state internally
 * (pending loads, regenerations, cover overrides) so those high-frequency
 * updates never reach the parent tab — and per-cell `hexDataEqual` memoization
 * in HexGridView shields every unaffected cell from re-rendering.
 */
export const GamesHexGrid = React.forwardRef<
  VirtualGridHandle,
  GamesHexGridProps
>(function GamesHexGrid(
  { items, bindItem, onSelectGame, onColumnCountChange, scrollRef },
  forwardedRef,
) {
  const pendingThumbnailIds = useGamesStore((s) => s.pendingThumbnailIds);
  const regeneratingIds = useGamesStore((s) => s.regeneratingIds);
  const coverOverrides = useGamesStore((s) => s.coverOverrides);
  const toggleFavorite = useGamesStore((s) => s.toggleFavorite);
  const loadThumbnail = useGamesStore((s) => s.loadThumbnail);

  const renderHex = useCallback(
    (game: Game, index: number): HexCellData => {
      const b = gameBadge(game);
      return {
        coverUrl: coverOverrides[game.id]?.coverUrl ?? game.coverUrl,
        title: game.title,
        subtitle: game.developer,
        badge: b?.label,
        badgeColor: b?.color,
        isFavorite: game.isFavorite,
        isLoading: pendingThumbnailIds.has(game.id) || regeneratingIds.has(game.id),
        missing: game.missing,
        platform: game.platform,
        pendingMetadata: game.pendingMetadata,
        onClick: () => onSelectGame(game, index),
        onFavorite: () => { void toggleFavorite(game.id); },
        onVisible: () => {
          const isLibretro = LIBRETRO_THUMB_PLATFORMS.has(game.platform);
          const coverUrl = coverOverrides[game.id]?.coverUrl ?? game.coverUrl;
          if ((WEB_THUMB_PLATFORMS.has(game.platform) || isLibretro) && !coverUrl) {
            void loadThumbnail(game.id);
          }
        },
      };
    },
    [coverOverrides, pendingThumbnailIds, regeneratingIds, onSelectGame, toggleFavorite, loadThumbnail],
  );

  return (
    <HexGridView
      // The runtime handle also implements getNextIndex (used via a dynamic
      // cast in useGridFocus) — the public ref type stays VirtualGridHandle.
      ref={forwardedRef as React.Ref<{ scrollToItem(index: number): void; getNextIndex(currentIndex: number, action: NavAction): number | null }>}
      items={items}
      minItemWidth={200}
      onColumnCountChange={onColumnCountChange}
      renderHex={renderHex}
      bindItem={bindItem}
      scrollRef={scrollRef}
    />
  );
});
