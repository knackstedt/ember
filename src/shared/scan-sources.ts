export type ScanSourceId =
  | "steam"
  | "heroic"
  | "lutris"
  | "desktop"
  | "dolphin"
  | "rom"
  | "flash"
  | "v86"
  | "windows"
  | "itch";

export const SCAN_SOURCE_LABELS: Record<ScanSourceId, string> = {
  steam: "Steam",
  heroic: "Heroic Games Launcher",
  lutris: "Lutris",
  desktop: "Desktop Entries",
  dolphin: "Dolphin ROMs",
  rom: "ROMs",
  flash: "Flash Games",
  v86: "DOS / v86",
  windows: "Windows Games",
  itch: "itch.io",
};

/** Map scan source IDs to the game ID prefixes they produce. */
export const SCAN_SOURCE_ID_PREFIXES: Record<ScanSourceId, string[]> = {
  steam: ["steam_"],
  heroic: ["heroic_"],
  lutris: ["lutris_"],
  desktop: ["desktop_"],
  dolphin: ["dolphin_"],
  rom: [
    "nes_",
    "snes_",
    "gb_",
    "gba_",
    "n64_",
    "genesis_",
    "sms_",
    "gamegear_",
    "pce_",
    "psx_",
    "nds_",
    "dreamcast_",
    "psp_",
    "ps2_",
    "ps3_",
    "xbox360_",
  ],
  flash: ["flash_"],
  v86: ["v86_"],
  windows: ["win_"],
  itch: ["itch_"],
};
