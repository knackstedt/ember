import React from "react";
import { motion } from "framer-motion";
import {
  LayoutGrid,
  Star,
  AudioLines,
  User,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import type { MoviesNavItem } from "../types";

const NAV_ITEMS: { id: MoviesNavItem; label: string; Icon: React.ComponentType<{ size?: number | string | undefined }> }[] = [
  { id: "all", label: "All", Icon: LayoutGrid },
  { id: "favorites", label: "Favorites", Icon: Star },
  { id: "genres", label: "Genres", Icon: AudioLines },
  { id: "directors", label: "Directors", Icon: User },
  { id: "folders", label: "Folders", Icon: FolderOpen },
  { id: "groups", label: "Groups", Icon: Sparkles },
];

interface MoviesNavRailProps {
  activeItem: MoviesNavItem;
  onSelect: (item: MoviesNavItem) => void;
  focusedIndex?: number;
  isFocused?: (index: number) => boolean;
}

export const MoviesNavRail: React.FC<MoviesNavRailProps> = React.memo(({
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
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-default)",
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
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--surface-base)" : focused ? "var(--accent)" : "var(--text-secondary)",
              outline: focused && !active ? "2px solid var(--accent)" : "none",
              outlineOffset: 2,
            }}
            onClick={() => onSelect(item.id)}
            whileTap={{ scale: 0.95 }}
            title={item.label}
          >
            <Icon size={20} />
            <span className="text-[12px] font-medium leading-tight">{item.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
});
