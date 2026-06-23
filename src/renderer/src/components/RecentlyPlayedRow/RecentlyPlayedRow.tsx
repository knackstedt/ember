import React, { useState } from "react";
import { motion } from "framer-motion";

export interface RecentlyPlayedItem {
  id: string;
  title: string;
  coverUrl?: string;
  subtitle?: string;
}

interface RecentlyPlayedRowProps {
  items: RecentlyPlayedItem[];
  onLaunch: (id: string) => void;
}

const PLACEHOLDER_COLORS = [
  "#1a1a2e",
  "#16213e",
  "#0f3460",
  "#1b1b2f",
  "#2d132c",
  "#1c1c1c",
];

function placeholderColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++)
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

function initials(title: string): string {
  return title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const RecentCard: React.FC<{
  item: RecentlyPlayedItem;
  onLaunch: (id: string) => void;
}> = ({ item, onLaunch }) => {
  const [imgError, setImgError] = useState(false);
  const showPlaceholder = !item.coverUrl || imgError;

  return (
    <motion.div
      className="w-32 flex-shrink-0 flex flex-col cursor-pointer rounded-[var(--radius-card)] overflow-hidden ring-1 ring-[var(--border-default)] hover:ring-2 hover:ring-[var(--accent)] hover:shadow-[var(--shadow-glow)] transition-all duration-150"
      style={{ backgroundColor: "var(--surface-0)" }}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onLaunch(item.id)}
    >
      <div className="relative w-full aspect-[2/3] overflow-hidden">
        {showPlaceholder ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: placeholderColor(item.title) }}
          >
            <span className="text-xl font-bold text-white/40">
              {initials(item.title)}
            </span>
          </div>
        ) : (
          <img
            src={item.coverUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-1 left-1.5 right-1.5">
          <span className="text-[12px] font-semibold leading-tight text-white line-clamp-2 block">
            {item.title}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export const RecentlyPlayedRow: React.FC<RecentlyPlayedRowProps> = ({
  items,
  onLaunch,
}) => {
  if (items.length === 0) return null;

  return (
    <div className="flex-shrink-0">
      <div
        className="text-xs font-semibold uppercase tracking-widest mb-2"
        style={{ color: "var(--text-secondary)" }}
      >
        Recently Played
      </div>
      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((item) => (
          <RecentCard key={item.id} item={item} onLaunch={onLaunch} />
        ))}
      </div>
    </div>
  );
};
