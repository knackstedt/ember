import { useState, useEffect, useCallback, useRef } from "react";
import { ContextMenu, ContextMenuOption } from "../components/ContextMenu/ContextMenu";
import { useContextMenuStore } from "../store/contextMenu.store";

export interface UseContextMenuOptions<T> {
  items: T[];
  focusedIndex: number;
  getOptions: (item: T) => ContextMenuOption[];
  onAction: (item: T, optionId: string) => void;
  enabled?: boolean;
}

export function useContextMenu<T>({
  items,
  focusedIndex,
  getOptions,
  onAction,
  enabled = true,
}: UseContextMenuOptions<T>) {
  const [state, setState] = useState<{
    open: boolean;
    position: { x: number; y: number };
    item: T | null;
    activeOption: number;
  }>({
    open: false,
    position: { x: 0, y: 0 },
    item: null,
    activeOption: 0,
  });

  const setOpen = useContextMenuStore((s) => s.setOpen);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;
  const getOptionsRef = useRef(getOptions);
  getOptionsRef.current = getOptions;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const openMenu = useCallback(
    (item: T, position?: { x: number; y: number }, centered?: boolean) => {
      const opts = getOptionsRef.current(item);
      if (opts.length === 0) return;
      let pos = position ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 };
      if (centered) {
        pos = {
          x: window.innerWidth / 2,
          y: Math.max(8, window.innerHeight / 2 - opts.length * 22),
        };
      }
      setState({
        open: true,
        position: pos,
        item,
        activeOption: 0,
      });
      setOpen(true);
    },
    [setOpen],
  );

  const closeMenu = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    setOpen(false);
  }, [setOpen]);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Shared timer storage so re-renders don’t lose long-press timers
  const timersRef = useRef(new WeakMap<object, number>());

  // Track DOM elements for each item so gamepad/keyboard context menu can
  // position itself at the focused element instead of the viewport center.
  const itemElementsRef = useRef(new WeakMap<object, HTMLElement>());

  // Listen for htpc:contextmenu (gamepad Y / long press Enter/Space)
  useEffect(() => {
    const handler = (e: Event) => {
      if (!enabledRef.current) return;
      const detail = (e as CustomEvent).detail as
        | { source: "gamepad" | "keyboard" }
        | undefined;
      if (!detail) return;
      const item = itemsRef.current[focusedIndexRef.current];
      if (!item) return;
      const el = itemElementsRef.current.get(item as object);
      if (el) {
        const rect = el.getBoundingClientRect();
        openMenu(item, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      } else {
        openMenu(item, undefined, true);
      }
    };
    window.addEventListener("htpc:contextmenu", handler);
    return () => window.removeEventListener("htpc:contextmenu", handler);
  }, [openMenu]);

  // Listen for htpc:menu-nav when menu is open
  useEffect(() => {
    if (!state.open) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string } | undefined;
      if (!detail?.action) return;
      const item = state.item;
      const opts = item ? getOptionsRef.current(item) : [];

      if (detail.action === "up") {
        setState((s) => ({
          ...s,
          activeOption: Math.max(0, s.activeOption - 1),
        }));
      } else if (detail.action === "down") {
        setState((s) => ({
          ...s,
          activeOption: Math.min(opts.length - 1, s.activeOption + 1),
        }));
      } else if (detail.action === "confirm") {
        if (item && opts[state.activeOption] && !opts[state.activeOption].disabled) {
          onActionRef.current(item, opts[state.activeOption].id);
        }
        closeMenu();
      } else if (detail.action === "cancel") {
        closeMenu();
      }
    };
    window.addEventListener("htpc:menu-nav", handler);
    return () => window.removeEventListener("htpc:menu-nav", handler);
  }, [state.open, state.item, state.activeOption, closeMenu]);

  // Long press / right click handler for individual items
  const bindItem = useCallback(
    (item: T, _index: number) => {
      const startLongPress = (e: React.PointerEvent) => {
        if (e.pointerType !== "mouse" && e.pointerType !== "touch") return;
        const timer = window.setTimeout(() => {
          timersRef.current.delete(item as object);
          openMenu(item, { x: e.clientX, y: e.clientY });
        }, 700);
        timersRef.current.set(item as object, timer);
      };

      const cancelLongPress = () => {
        const timer = timersRef.current.get(item as object);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(item as object);
        }
      };

      return {
        ref: (el: HTMLElement | null) => {
          if (el) itemElementsRef.current.set(item as object, el);
          else itemElementsRef.current.delete(item as object);
        },
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          openMenu(item, { x: e.clientX, y: e.clientY });
        },
        onPointerDown: startLongPress,
        onPointerUp: cancelLongPress,
        onPointerLeave: cancelLongPress,
        onPointerCancel: cancelLongPress,
      };
    },
    [openMenu],
  );

  const menu = (
    <ContextMenu
      isOpen={state.open}
      options={state.item ? getOptionsRef.current(state.item) : []}
      activeIndex={state.activeOption}
      position={state.position}
      onSelect={(optionId) => {
        if (state.item) onActionRef.current(state.item, optionId);
        closeMenu();
      }}
      onClose={closeMenu}
    />
  );

  return { menu, bindItem, openMenu, closeMenu, isOpen: state.open };
}
