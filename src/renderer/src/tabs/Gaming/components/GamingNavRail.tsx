import React from "react";
import { motion } from "framer-motion";
import {
  LayoutGrid,
  Star,
  Users,
  Folder,
} from "lucide-react";
import type { GamingNavItem } from "../types";
import {
  SteamLogo,
  EpicLogo,
  GogLogo,
  LutrisLogo,
  ItchLogo,
  NintendoLogo,
  PlayStationLogo,
  RetroLogo,
  WindowsLogo,
} from "./PlatformLogos";

const NAV_ITEMS: { id: GamingNavItem; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "all", label: "All", Icon: LayoutGrid },
  { id: "favorites", label: "Favorites", Icon: Star },
  { id: "couch-coop", label: "Co-op", Icon: Users },
  { id: "steam", label: "Steam", Icon: SteamLogo },
  { id: "epic", label: "Epic", Icon: EpicLogo },
  { id: "gog", label: "GOG", Icon: GogLogo },
  { id: "lutris", label: "Lutris", Icon: LutrisLogo },
  { id: "itch", label: "itch.io", Icon: ItchLogo },
  { id: "nintendo", label: "Nintendo", Icon: NintendoLogo },
  { id: "playstation", label: "PlayStation", Icon: PlayStationLogo },
  { id: "retro", label: "Retro", Icon: RetroLogo },
  { id: "windows", label: "Windows", Icon: WindowsLogo },
  { id: "other", label: "Other", Icon: Folder },
];

interface GamingNavRailProps {
  activeItem: GamingNavItem;
  onSelect: (item: GamingNavItem) => void;
  focusedIndex?: number;
  isFocused?: (index: number) => boolean;
}

export const GamingNavRail: React.FC<GamingNavRailProps> = React.memo(({
  activeItem,
  onSelect,
  focusedIndex = -1,
  isFocused = () => false,
}) => {
  return (
    <div
      className="flex flex-col gap-1 p-2 flex-shrink-0 overflow-y-auto"
      style={{
        width: 72,
        background: "var(--color-surface-raised)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {NAV_ITEMS.map((item, index) => {
        const active = activeItem === item.id;
        const focused = isFocused(index);
        const Icon = item.Icon;
        return (
          <motion.button
            key={item.id}
            className={`
              flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-[var(--radius-card)]
              transition-colors select-none
              ${focused ? "ring-2 ring-accent" : ""}
            `}
            style={{
              background: active ? "var(--color-accent)" : "transparent",
              color: active ? "var(--color-bg)" : focused ? "var(--color-accent)" : "var(--color-text-dim)",
              outline: focused && !active ? "2px solid var(--color-accent)" : "none",
              outlineOffset: 2,
            }}
            onClick={() => onSelect(item.id)}
            whileTap={{ scale: 0.95 }}
            title={item.label}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
});
