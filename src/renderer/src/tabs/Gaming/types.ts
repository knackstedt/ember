export type GamingNavItem =
  | "all"
  | "favorites"
  | "couch-coop"
  | "steam"
  | "epic"
  | "gog"
  | "lutris"
  | "itch"
  | "nintendo"
  | "playstation"
  | "retro"
  | "windows"
  | "other";

export type GamingLibraryFilter = "all" | "installed" | "uninstalled";

export type GamingPlayerCountFilter = "all" | "1" | "2" | "4" | "4+";

export type GamingMultiplayerTypeFilter = "all" | "single" | "local";

export type GamingPlayStatusFilter = "all" | "played" | "unplayed";

export type GamingCompletionFilter = "all" | "completed" | "incomplete";

import type { GamePlatform } from "../../../shared/types";

/** Platforms that belong to each grouped nav category */
export const NAV_PLATFORM_GROUPS: Record<GamingNavItem, GamePlatform[]> = {
  all: [],
  favorites: [],
  "couch-coop": [],
  steam: ["steam"],
  epic: ["heroic"],
  gog: ["gog"],
  lutris: ["lutris"],
  itch: ["itch"],
  nintendo: ["dolphin-gc", "dolphin-wii", "nes", "snes", "gb", "gba", "n64", "nds"],
  playstation: ["psx"],
  retro: ["genesis", "sms", "gamegear", "dreamcast", "pce", "dos", "flash"],
  windows: ["windows"],
  other: ["desktop"],
};

/** Online platforms that support owned vs installed filtering */
export const ONLINE_PLATFORMS: GamePlatform[] = ["steam", "heroic", "lutris", "itch"];
