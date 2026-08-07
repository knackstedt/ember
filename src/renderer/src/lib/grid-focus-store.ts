import { useSyncExternalStore, createContext, useContext } from "react";

/**
 * External store for grid focus index.
 *
 * Decouples focus changes from the React render path of grid cells.
 * The parent grid tab calls {@link useGridFocus} which creates a FocusStore
 * instance and returns a stable `setFocusedIndex`. Individual card components
 * subscribe via {@link useIsFocused} / {@link useFocusedIndex} so that only
 * the previously-focused and newly-focused cards re-render on navigation —
 * not every visible card.
 */
export class FocusStore {
  private index = 0;
  private listeners = new Set<() => void>();

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): number => this.index;

  setIndex = (index: number): void => {
    if (this.index === index) return;
    this.index = index;
    this.listeners.forEach((l) => l());
  };

  updateIndex = (updater: (prev: number) => number): void => {
    this.setIndex(updater(this.index));
  };
}

export const FocusContext = createContext<FocusStore | null>(null);

const noopSubscribe = (): (() => void) => () => {};
const noopSnapshot = (): number => -1;

/**
 * Returns `true` if the given index matches the current focus.
 * Only re-renders when the result for *this* index changes.
 */
export function useIsFocused(index: number): boolean {
  const store = useContext(FocusContext);
  const focusedIndex = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : noopSnapshot,
  );
  return focusedIndex === index;
}

/**
 * Returns the current focused index. Subscribes to the store — re-renders
 * on every focus change. Use sparingly (only in components that genuinely
 * need the value, not in list/grid cells).
 */
export function useFocusedIndex(): number {
  const store = useContext(FocusContext);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : noopSnapshot,
  );
}
