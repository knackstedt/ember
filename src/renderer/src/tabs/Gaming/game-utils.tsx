import { Game, GamePlatform } from "@shared/types";
import { Gamepad2, Star } from "lucide-react";
import React from "react";
import { ChipFilter } from "../../components/ChipFilters/ChipFilters";

export const PLATFORM_FILTERS: ChipFilter<
  GamePlatform | "all" | "couch-coop" | "favorites"
>[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: <><Star size={14} /> Favorites</> },
  { id: "couch-coop", label: <><Gamepad2 size={14} /> Couch Co-op</> },
  { id: "steam", label: "Steam" },
  { id: "gog", label: "GOG" },
  { id: "heroic", label: "Heroic/Epic" },
  { id: "lutris", label: "Lutris" },
  { id: "itch", label: "itch.io" },
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
  { id: "html5", label: "HTML5" },
  { id: "unity", label: "Unity" },
  { id: "dos", label: "DOS/PC" },
  { id: "windows", label: "Windows" },
  { id: "desktop", label: "Other" },
];

export const LIBRETRO_PLATFORMS: GamePlatform[] = [
  "nes", "n64", "genesis", "sms", "gamegear", "pce", "psx", "nds", "dreamcast"
];

export const PROTON_COLORS: Record<string, string> = {
  platinum: "#b5e3ff",
  gold: "#ffd700",
  silver: "#c0c0c0",
  bronze: "#cd7f32",
  borked: "#ff4444",
};

export const LIBRETRO_THUMB_PLATFORMS = new Set<string>([
  "nes", "snes", "gb", "gba", "n64", "genesis", "sms",
  "gamegear", "pce", "psx", "dreamcast", "nds", "dos",
]);

export const WEB_THUMB_PLATFORMS = new Set<string>(["flash", "html5", "unity"]);

export async function getMissingCoreTooltip(game: Game): Promise<string | undefined> {
  if (!LIBRETRO_PLATFORMS.includes(game.platform)) return undefined;
  if (!game.romPath) return undefined;
  const detected = await window.htpc.libretro.detectCore(game.romPath);
  if (detected !== null) return undefined;
  const platformLabel = PLATFORM_FILTERS.find((f) => f.id === game.platform)?.label ?? game.platform;
  return `No ${platformLabel} emulator cores are installed. Install it in settings.`;
}

export function gameBadge(game: Game): { label: string; color: string } | undefined {
  if (game.protonRating && game.protonRating !== "unknown") {
    return {
      label: game.protonRating,
      color: PROTON_COLORS[game.protonRating],
    };
  }
  return undefined;
}
