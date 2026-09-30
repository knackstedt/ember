import { useMemo } from "react";
import { Collection, Game } from "../../../../shared/types";
import { sortByCollection } from "../../store/collections.store";
import { useGamesStore } from "../../store/games.store";

export interface UseGridItemsOptions {
  activeCollectionId: string | null;
  collectionItemIds: Set<string>;
  activeCollection: Collection | undefined;
  facetFilters: Record<string, string | null>;
}

/**
 * The games-grid data pipeline: store filters → `items` → facet filters → `gridItems`.
 *
 * Subscribes to the store itself so this can be tested in isolation, and so the
 * memo chain is defined in exactly one place. Re-renders the caller only when
 * `games` or a filter value actually changes — per-game cover/thumbnail updates
 * deliberately live outside `games` (see `coverOverrides`) so they never reach
 * this memo chain.
 */
export function useGridItems({
  activeCollectionId,
  collectionItemIds,
  activeCollection,
  facetFilters,
}: UseGridItemsOptions): { items: Game[]; gridItems: Game[] } {
  const games = useGamesStore((s) => s.games);
  const filtered = useGamesStore((s) => s.filtered);
  const activeNav = useGamesStore((s) => s.activeNav);
  const searchQuery = useGamesStore((s) => s.searchQuery);
  const libraryFilter = useGamesStore((s) => s.libraryFilter);
  const playerCountFilter = useGamesStore((s) => s.playerCountFilter);
  const multiplayerTypeFilter = useGamesStore((s) => s.multiplayerTypeFilter);
  const playStatusFilter = useGamesStore((s) => s.playStatusFilter);
  const completionFilter = useGamesStore((s) => s.completionFilter);

  const items = useMemo(() => {
    const base = filtered();
    if (!activeCollectionId) return base;
    const result = base.filter((g) => collectionItemIds.has(g.id));
    return sortByCollection<Game>(result, activeCollection);
  }, [filtered, games, activeNav, searchQuery, libraryFilter, playerCountFilter, multiplayerTypeFilter, playStatusFilter, completionFilter, activeCollectionId, collectionItemIds, activeCollection]);

  const gridItems = useMemo(() => {
    let r = items;
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
  }, [items, facetFilters]);

  return { items, gridItems };
}
