/**
 * Render-cascade regression test for the games grid.
 *
 * Historical bug: every thumbnail load produced 3 store updates that each
 * re-rendered the entire GamingTab — `pendingThumbnailIds` (Set added),
 * `games` (array rebuilt via .map() to set coverUrl), `pendingThumbnailIds`
 * again (Set removed). Each tab re-render rebuilt `items`/`gridItems`, which
 * re-rendered VirtualGrid, and inline `onSelect`/`onFavorite` closures defeated
 * the card memo — so every visible card re-rendered on every thumbnail.
 *
 * This test mounts two probes against the REAL store + REAL useGridItems
 * pipeline + REAL LazyGameCard:
 *
 *   LegacyProbe  — replicates the old wiring (tab-level Set subscriptions,
 *                  inline callbacks, cover writes into the games array).
 *   CurrentProbe — replicates the fixed wiring (no tab-level thumbnail subs,
 *                  stable callbacks, cover updates via coverOverrides).
 *
 * The legacy probe must show the pathology (asserted HIGH counts — proves the
 * harness reproduces the bug), and the current probe must stay flat.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act, useCallback } from "react";
import { createRoot, Root } from "react-dom/client";
import type { Game } from "../../../../../shared/types";
import { LazyGameCard } from "../../../components/GameCard/LazyGameCard";
import { FocusContext, FocusStore } from "../../../lib/grid-focus-store";
import { useGamesStore } from "../../../store/games.store";
import { useGridItems, UseGridItemsOptions } from "../useGridItems";

const GAME_COUNT = 60;
const THUMB_COUNT = 40;

function makeGame(i: number, coverUrl?: string): Game {
  return {
    id: `game-${i}`,
    title: `Game ${i}`,
    platform: "flash",
    isFavorite: false,
    hidden: false,
    coverUrl,
  } as Game;
}

function seedGames(withCovers: boolean): Game[] {
  const games = Array.from({ length: GAME_COUNT }, (_, i) =>
    makeGame(i, withCovers ? `ember://covers/${i}.png` : undefined)
  );
  useGamesStore.setState({
    games,
    pendingThumbnailIds: new Set(),
    regeneratingIds: new Set(),
    coverOverrides: {},
    activeNav: "all",
    activeFilter: "all",
    consoleFilter: "all",
    searchQuery: "",
    libraryFilter: "all",
    playerCountFilter: "all",
    multiplayerTypeFilter: "all",
    playStatusFilter: "all",
    completionFilter: "all",
  });
  return useGamesStore.getState().games;
}

// ---------------- instrumentation ----------------

let probeRenders = 0;
/** Parent-driven render count per card id (i.e. memo-bailout effectiveness). */
const cardRenders = new Map<string, number>();
const bumpCard = (id: string) =>
  cardRenders.set(id, (cardRenders.get(id) ?? 0) + 1);

/**
 * Memo wrapper with the same prop surface as LazyGameCard. If the wrapper
 * bails, the card inside cannot render — counting the wrapper therefore equals
 * counting parent-driven card renders.
 */
const CountingCard = React.memo(function CountingCard({
  game,
  index,
  onSelect,
  onFavorite,
}: {
  game: Game;
  index: number;
  onSelect: (game: Game, index: number) => void;
  onFavorite: (gameId: string) => void;
}) {
  bumpCard(game.id);
  return (
    <LazyGameCard
      game={game}
      index={index}
      onSelect={onSelect}
      onFavorite={onFavorite}
    />
  );
});

const EMPTY_OPTS: UseGridItemsOptions = {
  activeCollectionId: null,
  collectionItemIds: new Set<string>(),
  activeCollection: undefined,
  facetFilters: {},
};

const focusStore = new FocusStore();

/**
 * Replicates the pre-fix GamingTab wiring: subscribes to the thumbnail Sets at
 * the top level and creates fresh inline callbacks for every cell on every
 * render.
 */
function LegacyProbe() {
  probeRenders++;
  useGamesStore((s) => s.pendingThumbnailIds); // tab-level Set subscription —
  useGamesStore((s) => s.regeneratingIds); //     exactly what the old code did
  const { gridItems } = useGridItems(EMPTY_OPTS);
  return (
    <FocusContext.Provider value={focusStore}>
      <div>
        {gridItems.map((game, index) => (
          <CountingCard
            key={game.id}
            game={game}
            index={index}
            onSelect={() => undefined} // inline closures — new ref each render
            onFavorite={() => undefined}
          />
        ))}
      </div>
    </FocusContext.Provider>
  );
}

const STABLE_SELECT = (_g: Game, _i: number) => undefined;
const STABLE_FAVORITE = (_id: string) => undefined;

/** Mirrors the fixed GamingTab wiring: no thumbnail Set subscriptions,
 *  stable callbacks, covers delivered via coverOverrides. */
function CurrentProbe() {
  probeRenders++;
  const { gridItems } = useGridItems(EMPTY_OPTS);
  const renderItem = useCallback(
    (game: Game, index: number) => (
      <div key={game.id}>
        <CountingCard
          game={game}
          index={index}
          onSelect={STABLE_SELECT}
          onFavorite={STABLE_FAVORITE}
        />
      </div>
    ),
    [],
  );
  return (
    <FocusContext.Provider value={focusStore}>
      <div>{gridItems.map(renderItem)}</div>
    </FocusContext.Provider>
  );
}

// ---------------- helpers ----------------

let container: HTMLDivElement | undefined;
let root: Root | undefined;

async function mount(element: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container as HTMLDivElement);
    root.render(element);
  });
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

/** Replicates exactly what the OLD store did per thumbnail:
 *  pending add → games.map(coverUrl) → pending remove. */
async function simulateLegacyThumbnail(id: string, url: string) {
  await act(async () => {
    useGamesStore.setState((s) => {
      const next = new Set(s.pendingThumbnailIds);
      next.add(id);
      return { pendingThumbnailIds: next };
    });
  });
  await act(async () => {
    useGamesStore.setState((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, coverUrl: url } : g)),
    }));
  });
  await act(async () => {
    useGamesStore.setState((s) => {
      const next = new Set(s.pendingThumbnailIds);
      next.delete(id);
      return { pendingThumbnailIds: next };
    });
  });
}

// ---------------- tests ----------------

beforeEach(() => {
  probeRenders = 0;
  cardRenders.clear();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = undefined;
  }
  container?.remove();
  container = undefined;
});

describe("games grid render cascade", () => {
  test("legacy wiring reproduces the cascade (tab + every card re-render per thumbnail)", async () => {
    seedGames(true); // covers present → no auto-load noise
    await mount(<LegacyProbe />);
    await flush();
    const baselineProbe = probeRenders;
    const baselineCard = cardRenders.get("game-5") ?? 0;

    for (let i = 0; i < THUMB_COUNT; i++) {
      await simulateLegacyThumbnail(`game-${i}`, `ember://covers/${i}.png?v=2`);
    }

    console.log(
      `[legacy] ${THUMB_COUNT} thumbnails → probe +${probeRenders - baselineProbe} renders, card-5 +${(cardRenders.get("game-5") ?? 0) - baselineCard} renders`
    );

    // Each simulated thumbnail = 3 store updates → 3 probe re-renders, and
    // inline callbacks defeat memoization → every mounted card re-renders too.
    expect(probeRenders).toBeGreaterThanOrEqual(baselineProbe + THUMB_COUNT * 3);
    expect(cardRenders.get("game-5") ?? 0).toBeGreaterThanOrEqual(
      baselineCard + THUMB_COUNT * 3
    );
  });

  test("store: loadThumbnail does not touch the games array", async () => {
    const gamesBefore = seedGames(false);
    const htpc = (window as unknown as {
      htpc: { games: { loadThumbnail: (g: Game) => Promise<string> } };
    }).htpc;
    htpc.games.loadThumbnail = async (g: Game) => `ember://covers/${g.id}.png`;

    await act(async () => {
      await useGamesStore.getState().loadThumbnail("game-0");
    });

    // The array reference must be identical — that is the invariant that keeps
    // the grid's memo chain stable.
    expect(useGamesStore.getState().games).toBe(gamesBefore);
    expect(useGamesStore.getState().coverOverrides["game-0"]?.coverUrl).toBe(
      "ember://covers/game-0.png"
    );
  });

  test("current wiring: thumbnail loads never re-render the grid", async () => {
    seedGames(false); // no covers → mounting the cards auto-triggers loads
    const htpc = (window as unknown as {
      htpc: { games: { loadThumbnail: (g: Game) => Promise<string> } };
    }).htpc;
    htpc.games.loadThumbnail = async (g: Game) => `ember://covers/${g.id}.png`;

    const gamesBefore = useGamesStore.getState().games;
    await mount(<CurrentProbe />);
    await flush(); // first load cycle: all 60 cards fetch thumbnails

    // The whole first load cycle completed through the real code path.
    expect(
      Object.keys(useGamesStore.getState().coverOverrides).length
    ).toBe(GAME_COUNT);
    expect(useGamesStore.getState().games).toBe(gamesBefore);

    const baselineProbe = probeRenders;
    const cardBaseline = new Map(cardRenders);

    // Second cycle: clearing overrides re-fires every card's lazy loader.
    await act(async () => {
      useGamesStore.setState({ coverOverrides: {} });
    });
    await flush();

    expect(
      Object.keys(useGamesStore.getState().coverOverrides).length
    ).toBe(GAME_COUNT);
    expect(useGamesStore.getState().games).toBe(gamesBefore);

    const extraCardRenders = [...cardRenders.entries()].reduce(
      (n, [id, c]) => n + (c - (cardBaseline.get(id) ?? 0)),
      0
    );
    console.log(
      `[fixed] 2×${GAME_COUNT} thumbnail cycles → probe +${probeRenders - baselineProbe} renders, parent-driven card renders +${extraCardRenders}`
    );

    // Zero additional probe renders across 120+ thumbnail store updates.
    expect(probeRenders).toBe(baselineProbe);

    // Zero parent-driven card re-renders.
    for (const [id, count] of cardRenders) {
      expect(count, `card ${id} re-rendered from above`).toBe(
        cardBaseline.get(id) ?? 0
      );
    }
  });

  test("current wiring: favorite toggle re-renders only the affected card", async () => {
    seedGames(true);
    const htpc = (window as unknown as {
      htpc: { games: { favorite: (id: string, fav: boolean) => Promise<void> } };
    }).htpc;
    htpc.games.favorite = async () => {};

    await mount(<CurrentProbe />);
    await flush();
    const baselineProbe = probeRenders;
    const cardBaseline = new Map(cardRenders);

    await act(async () => {
      await useGamesStore.getState().toggleFavorite("game-7");
    });
    await flush();

    // One probe re-render is correct — the games array legitimately changed.
    expect(probeRenders).toBe(baselineProbe + 1);
    // Only the toggled card's memo fails (its game object got a new ref).
    expect(cardRenders.get("game-7")).toBe(
      (cardBaseline.get("game-7") ?? 0) + 1
    );
    for (const [id, count] of cardRenders) {
      if (id === "game-7") continue;
      expect(count, `unrelated card ${id} re-rendered`).toBe(
        cardBaseline.get(id) ?? 0
      );
    }
  });

  test("regression guard: GamingTab has no tab-level thumbnail Set subscriptions", async () => {
    const src = await Bun.file(new URL("../index.tsx", import.meta.url)).text();
    // The exact subscription patterns that caused the cascade must not return.
    expect(src).not.toContain("useGamesStore((s) => s.pendingThumbnailIds)");
    expect(src).not.toContain("useGamesStore((s) => s.regeneratingIds)");
  });

  test("regression guard: store never writes coverUrl into the games array", async () => {
    const src = await Bun.file(
      new URL("../../../store/games.store.ts", import.meta.url)
    ).text();
    expect(src).not.toMatch(/games:\s*s\.games\.map[^}]*coverUrl/s);
    expect(src).toContain("coverOverrides");
  });
});
