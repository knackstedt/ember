import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

export interface MediaCardProps {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  badge?: string;
  badgeColor?: string;
  isFavorite?: boolean;
  isFocused?: boolean;
  onSelect?: () => void;
  onFavorite?: () => void;
  aspectRatio?: "2/3" | "16/9" | "1/1";
  progress?: number;
  isLoading?: boolean;
  missing?: boolean;
  skeleton?: boolean;
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

export const MediaCard: React.FC<MediaCardProps> = React.memo(({
  id,
  title,
  subtitle,
  coverUrl,
  badge,
  badgeColor,
  isFavorite,
  isFocused,
  onSelect,
  onFavorite,
  aspectRatio = "2/3",
  progress,
  isLoading,
  missing,
  skeleton,
}) => {
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [coverUrl]);
  const showPlaceholder = !coverUrl || imgError;

  if (skeleton) {
    return (
      <div
        className="relative flex flex-col select-none rounded-card overflow-hidden flex-1 ring-1 ring-border"
        style={{ backgroundColor: "var(--color-surface)", pointerEvents: "none" }}
      >
        <div className="relative w-full flex-1 min-h-0 overflow-hidden skeleton-shimmer" style={{ backgroundColor: "var(--color-surface-raised)" }} />
        <div className="p-2 flex flex-col gap-1.5 flex-shrink-0 min-w-0">
          <div className="skeleton-shimmer rounded" style={{ width: "85%", height: 14, backgroundColor: "var(--color-surface-raised)" }} />
          <div className="skeleton-shimmer rounded" style={{ width: "55%", height: 12, backgroundColor: "var(--color-surface-raised)" }} />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={`
        relative flex flex-col cursor-pointer select-none rounded-card
        overflow-hidden flex-1
        ${
          isFocused
            ? "ring-2 ring-accent shadow-glow"
            : "ring-1 ring-border"
        }
        hover:ring-2 hover:ring-accent hover:shadow-glow
      `}
      style={{
        backgroundColor: "var(--color-surface)",
        willChange: "transform",
      }}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
    >
      <div className="relative w-full flex-1 min-h-0 overflow-hidden">
        <div
          className="w-full h-full"
          style={{
            filter: missing ? "grayscale(80%)" : undefined,
            opacity: missing ? 0.6 : undefined,
          }}
        >
          {showPlaceholder ? (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: placeholderColor(title) }}
            >
              <span className="text-2xl font-bold text-white/40">
                {initials(title)}
              </span>
            </div>
          ) : (
            <img
              src={coverUrl}
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
            />
          )}
        </div>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="w-7 h-7 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
          </div>
        )}

        {missing && (
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: "#ff4444",
              color: "#ffffff",
            }}
          >
            Missing
          </span>
        )}
        {!missing && badge && (
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: badgeColor ?? "var(--color-accent)",
              color: "var(--color-bg)",
            }}
          >
            {badge}
          </span>
        )}

        {progress !== undefined && progress > 0 && (
          <>
            <div
              className="absolute bottom-0 left-0 right-0 h-1"
              style={{ background: "rgba(0,0,0,0.4)" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${progress * 100}%`,
                  background: "var(--color-accent)",
                }}
              />
            </div>
            {progress < 0.95 && (
              <span
                className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
              >
                Resume
              </span>
            )}
          </>
        )}

        {onFavorite && (
          <button
            className="absolute top-2 right-2 p-1 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onFavorite();
            }}
            aria-label={
              isFavorite ? "Remove from favorites" : "Add to favorites"
            }
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill={isFavorite ? "var(--color-accent)" : "none"}
              stroke={isFavorite ? "var(--color-accent)" : "white"}
              strokeWidth={2}
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-2 flex flex-col gap-0.5 flex-shrink-0 min-w-0">
        <span
          className="text-sm font-medium truncate"
          style={{ color: "var(--color-text)" }}
          title={title}
        >
          {title}
        </span>
        <span
          className={`text-xs truncate ${subtitle ? "" : "invisible"}`}
          style={{ color: "var(--color-text-dim)" }}
        >
          {subtitle || "\u00A0"}
        </span>
      </div>
    </motion.div>
  );
});
