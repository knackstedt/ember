import React, { useEffect, useState } from "react";
import { Game } from "../../../../shared/types";
import { useIsFocused } from "../../lib/grid-focus-store";
import { useGamesStore } from "../../store/games.store";
import {
  getMissingCoreTooltip,
  gameBadge,
  LIBRETRO_THUMB_PLATFORMS,
  WEB_THUMB_PLATFORMS,
} from "../../tabs/Gaming/game-utils";
import { GameCard } from "./GameCard";

/**
 * Returns the effective cover URL for a game: the session-level override
 * (set when a thumbnail is generated/regenerated/customized) wins over the
 * DB-loaded `game.coverUrl`. Subscribing per-game keeps cover updates scoped
 * to a single card — the `games` array and the grid never re-render.
 */
export function useCoverUrl(game: Game): string | undefined {
  return useGamesStore((s) => s.coverOverrides[game.id]?.coverUrl) ?? game.coverUrl;
}

export function useCoverCorrupt(game: Game): boolean | undefined {
  return useGamesStore((s) => s.coverOverrides[game.id]?.corrupt) ?? game.corrupt;
}

/** Render-prop wrapper that resolves a game's live cover URL via a scoped
 *  store subscription. Use inside grid cell renderers so a thumbnail update
 *  re-renders only this tiny subtree instead of the whole card/row. */
export function GameCover({
  game,
  children,
}: {
  game: Game;
  children: (coverUrl: string | undefined) => React.ReactNode;
}) {
  const coverUrl = useCoverUrl(game);
  return <>{children(coverUrl)}</>;
}

/** Render-prop wrapper that subscribes to focus — only the old + new focused cells re-render. */
export function FocusAware({ index, children }: { index: number; children: (isFocused: boolean) => React.ReactNode }) {
  const isFocused = useIsFocused(index);
  return <>{children(isFocused)}</>;
}

export const LazyGameCard: React.FC<{
  game: Game;
  index: number;
  /** Stable callback invoked with the card's game + index on click. */
  onSelect: (game: Game, index: number) => void;
  /** Stable callback invoked with the game id on favorite toggle. */
  onFavorite: (gameId: string) => void;
}> = React.memo(({ game, index, onSelect, onFavorite }) => {
  const loadThumbnail = useGamesStore((s) => s.loadThumbnail);
  const isThumbnailPending = useGamesStore(
    (s) => s.pendingThumbnailIds.has(game.id) || s.regeneratingIds.has(game.id)
  );
  const coverUrl = useCoverUrl(game);
  const corrupt = useCoverCorrupt(game);
  const coreVersion = useGamesStore((s) => s.coreVersion);
  const [missingCoreTooltip, setMissingCoreTooltip] = useState<string | undefined>(undefined);
  const isFocused = useIsFocused(index);

  useEffect(() => {
    const isLibretro = LIBRETRO_THUMB_PLATFORMS.has(game.platform);
    if ((WEB_THUMB_PLATFORMS.has(game.platform) || isLibretro) && !coverUrl) {
      loadThumbnail(game.id);
    }
  }, [game.id, game.platform, coverUrl, loadThumbnail]);

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
      coverUrl={coverUrl}
      platform={game.platform}
      badge={b?.label}
      badgeColor={b?.color}
      isFavorite={game.isFavorite}
      isFocused={isFocused}
      isThumbnailPending={isThumbnailPending}
      corrupt={corrupt}
      missingCoreTooltip={missingCoreTooltip}
      playTime={game.playTime}
      lastPlayed={game.lastPlayed}
      missing={game.missing}
      pendingMetadata={game.pendingMetadata}
      onSelect={() => onSelect(game, index)}
      onFavorite={() => onFavorite(game.id)}
    />
  );
});

export const LazyGameThumbnail: React.FC<{ game: Game }> = React.memo(({ game }) => {
  const loadThumbnail = useGamesStore((s) => s.loadThumbnail);
  const coverUrl = useCoverUrl(game);
  useEffect(() => {
    const isLibretro = LIBRETRO_THUMB_PLATFORMS.has(game.platform);
    if ((WEB_THUMB_PLATFORMS.has(game.platform) || isLibretro) && !coverUrl) {
      loadThumbnail(game.id);
    }
  }, [game.id, game.platform, coverUrl, loadThumbnail]);
  return null;
});
