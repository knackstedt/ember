import { useState, useEffect, useRef, useCallback } from "react";
import type { MusicFocusZone } from "../types";

export type NavAction = "up" | "down" | "left" | "right" | "confirm" | "cancel";

export interface UseMusicFocusOptions {
  enabled: boolean;
  navItemCount: number;
  toolbarItemCount: number;
  contentColumnCount: number;
  contentItemCount: number;
  onNavSelect: (index: number) => void;
  onToolbarSelect: (index: number) => void;
  onContentConfirm: (index: number) => void;
  onPlayerExpand?: () => void;
}

export interface MusicFocusState {
  zone: MusicFocusZone;
  navIndex: number;
  toolbarIndex: number;
  contentIndex: number;
}

/**
 * Manages directional focus within the MusicTab across three zones:
 * - nav: left rail (All, Genre, Artists, Albums, Folders, Playlists)
 * - toolbar: search, sort, view toggle above content
 * - content: virtual grid or list of music items
 *
 * Zone transitions:
 *   nav → right       → content
 *   toolbar → down    → content
 *   toolbar → left@0  → nav
 *   content → left@0  → nav
 *   content → up@0    → toolbar
 *   content → down@last → optional player expand
 */
export function useMusicFocus({
  enabled,
  navItemCount,
  toolbarItemCount,
  contentColumnCount,
  contentItemCount,
  onNavSelect,
  onToolbarSelect,
  onContentConfirm,
  onPlayerExpand,
}: UseMusicFocusOptions): MusicFocusState & {
  setZone: (zone: MusicFocusZone) => void;
  setNavIndex: (i: number) => void;
  setToolbarIndex: (i: number) => void;
  setContentIndex: (i: number) => void;
  isNavFocused: (i: number) => boolean;
  isToolbarFocused: (i: number) => boolean;
  isContentFocused: (i: number) => boolean;
} {
  const [zone, setZone] = useState<MusicFocusZone>("nav");
  const [navIndex, setNavIndex] = useState(0);
  const [toolbarIndex, setToolbarIndex] = useState(0);
  const [contentIndex, setContentIndex] = useState(0);

  const stateRef = useRef({ zone, navIndex, toolbarIndex, contentIndex });
  stateRef.current = { zone, navIndex, toolbarIndex, contentIndex };

  const optsRef = useRef({
    enabled,
    navItemCount,
    toolbarItemCount,
    contentColumnCount,
    contentItemCount,
    onNavSelect,
    onToolbarSelect,
    onContentConfirm,
    onPlayerExpand,
  });
  optsRef.current = {
    enabled,
    navItemCount,
    toolbarItemCount,
    contentColumnCount,
    contentItemCount,
    onNavSelect,
    onToolbarSelect,
    onContentConfirm,
    onPlayerExpand,
  };

  const handleNav = useCallback((action: NavAction) => {
    const opts = optsRef.current;
    if (!opts.enabled) return;

    const { zone: z, navIndex: ni, toolbarIndex: ti, contentIndex: ci } = stateRef.current;

    if (action === "confirm") {
      if (z === "nav") opts.onNavSelect(ni);
      else if (z === "toolbar") opts.onToolbarSelect(ti);
      else if (z === "content") opts.onContentConfirm(ci);
      return;
    }

    if (action === "cancel") {
      // Cancel always returns focus to nav (top-level reset)
      setZone("nav");
      return;
    }

    switch (z) {
      case "nav": {
        if (action === "up") {
          setNavIndex((prev) => Math.max(0, prev - 1));
        } else if (action === "down") {
          setNavIndex((prev) => Math.min(opts.navItemCount - 1, prev + 1));
        } else if (action === "right") {
          if (opts.toolbarItemCount > 0) {
            setZone("toolbar");
          } else if (opts.contentItemCount > 0) {
            setZone("content");
          }
        }
        break;
      }

      case "toolbar": {
        if (action === "left") {
          if (ti === 0) {
            setZone("nav");
          } else {
            setToolbarIndex((prev) => Math.max(0, prev - 1));
          }
        } else if (action === "right") {
          setToolbarIndex((prev) => Math.min(opts.toolbarItemCount - 1, prev + 1));
        } else if (action === "down") {
          if (opts.contentItemCount > 0) {
            setZone("content");
          }
        } else if (action === "up") {
          setZone("nav");
        }
        break;
      }

      case "content": {
        if (opts.contentItemCount <= 0) {
          // Empty content: directional nav bounces back to nav/toolbar
          if (action === "left" || action === "up") {
            if (opts.toolbarItemCount > 0) {
              setZone("toolbar");
            } else {
              setZone("nav");
            }
          } else if (action === "right" || action === "down") {
            if (opts.onPlayerExpand) {
              opts.onPlayerExpand();
            }
          }
          break;
        }

        const row = Math.floor(ci / opts.contentColumnCount);
        const col = ci % opts.contentColumnCount;
        const maxRow = Math.ceil(opts.contentItemCount / opts.contentColumnCount) - 1;

        if (action === "left") {
          if (col === 0) {
            setZone("nav");
            return;
          }
          setContentIndex((prev) => Math.max(0, prev - 1));
        } else if (action === "right") {
          setContentIndex((prev) => Math.min(opts.contentItemCount - 1, prev + 1));
        } else if (action === "up") {
          if (row === 0) {
            if (opts.toolbarItemCount > 0) {
              setZone("toolbar");
            } else {
              setZone("nav");
            }
            return;
          }
          setContentIndex((prev) => Math.max(0, prev - opts.contentColumnCount));
        } else if (action === "down") {
          if (row === maxRow) {
            if (opts.onPlayerExpand) {
              opts.onPlayerExpand();
            }
            return;
          }
          const next = ci + opts.contentColumnCount;
          setContentIndex((prev) => Math.min(opts.contentItemCount - 1, next));
        }
        break;
      }
    }
  }, []);

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: NavAction };
      if (detail?.action) handleNav(detail.action);
    };
    window.addEventListener("htpc:nav", listener);
    return () => window.removeEventListener("htpc:nav", listener);
  }, [handleNav]);

  return {
    zone,
    navIndex,
    toolbarIndex,
    contentIndex,
    setZone,
    setNavIndex,
    setToolbarIndex,
    setContentIndex,
    isNavFocused: (i: number) => zone === "nav" && navIndex === i,
    isToolbarFocused: (i: number) => zone === "toolbar" && toolbarIndex === i,
    isContentFocused: (i: number) => zone === "content" && contentIndex === i,
  };
}
