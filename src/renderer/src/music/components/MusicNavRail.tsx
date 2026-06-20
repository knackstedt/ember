import React from "react";
import { motion } from "framer-motion";
import {
  Music,
  AudioLines,
  Mic2,
  Disc3,
  FolderOpen,
  ListMusic,
  Radio,
} from "lucide-react";
import type { MusicNavItem } from "../types";

const NAV_ITEMS: { id: MusicNavItem; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "all", label: "All", Icon: Music },
  { id: "genre", label: "Genres", Icon: AudioLines },
  { id: "artists", label: "Artists", Icon: Mic2 },
  { id: "albums", label: "Albums", Icon: Disc3 },
  { id: "folders", label: "Folders", Icon: FolderOpen },
  { id: "playlists", label: "Playlists", Icon: ListMusic },
  { id: "streaming", label: "Streaming", Icon: Radio },
];

interface MusicNavRailProps {
  activeItem: MusicNavItem;
  onSelect: (item: MusicNavItem) => void;
  focusedIndex: number;
  isFocused: (index: number) => boolean;
}

export const MusicNavRail: React.FC<MusicNavRailProps> = React.memo(({
  activeItem,
  onSelect,
  focusedIndex,
  isFocused,
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
