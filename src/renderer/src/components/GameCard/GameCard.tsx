import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { GamePlatform } from "../../../../shared/types";
import { PLATFORM_ICONS } from "./icons";
import { Tooltip } from "../Tooltip/Tooltip";
import { scaledImageUrl } from "../../lib/image-url";
import "./GameCard.css";

export interface GameCardProps {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  platform: GamePlatform;
  badge?: string;
  badgeColor?: string;
  isFavorite?: boolean;
  isFocused?: boolean;
  isThumbnailPending?: boolean;
  corrupt?: boolean;
  missingCoreTooltip?: string;
  onSelect?: () => void;
  onFavorite?: () => void;
  progress?: number;
  playTime?: number;
  lastPlayed?: number;
  missing?: boolean;
  skeleton?: boolean;
}

function formatLastPlayed(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
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

function platformSvg(platform: GamePlatform): string {
  return PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.unknown;
}

export const GameCard: React.FC<GameCardProps> = React.memo(({
  title,
  subtitle,
  coverUrl,
  platform,
  badge,
  badgeColor,
  isFavorite,
  isFocused,
  isThumbnailPending,
  corrupt,
  missingCoreTooltip,
  onSelect,
  onFavorite,
  progress,
  playTime,
  lastPlayed,
  missing,
  skeleton,
}) => {
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [coverUrl]);
  const showPlaceholder = !coverUrl || imgError;

  const platformIconUrl = platformSvg(platform);

  const cardStyle: React.CSSProperties = {
    "--inner-gradient": "linear-gradient(145deg, #60496e8c 0%, #71C4FF44 100%)",
    "--behind-glow-color": badgeColor ? badgeColor : "rgba(125, 190, 255, 0.67)",
    "--behind-glow-size": "50%",
  } as React.CSSProperties;

  if (skeleton) {
    return (
      <div className="gc-card-wrapper" style={{ pointerEvents: "none" }}>
        <div className="gc-card-shell">
          <section className="gc-card">
            <div className="gc-inside">
              <div className="gc-cover-content skeleton-shimmer" style={{ backgroundColor: "var(--surface-1)" }} />
              <div className="gc-details">
                <div className="skeleton-shimmer" style={{ width: "85%", height: 13, borderRadius: 4, backgroundColor: "var(--surface-0)", marginBottom: 6 }} />
                <div className="skeleton-shimmer" style={{ width: "55%", height: 11, borderRadius: 4, backgroundColor: "var(--surface-0)" }} />
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={`gc-card-wrapper ${isFocused ? "focused" : ""} ${missing ? "gc-missing" : ""}`}
      style={cardStyle}
      whileTap={{ scale: 0.96 }}
      onClick={onSelect}
    >
      {/* <div className="gc-behind" /> */}
      <div className="gc-card-shell">
        <section className="gc-card">
          <div className="gc-inside">
            {isThumbnailPending && (
              <div className="gc-loading-overlay">
                <div className="gc-spinner" />
              </div>
            )}

            {/* Cover image area */}
            <div
              className="gc-cover-content"
              style={{
                filter: missing ? "grayscale(80%)" : undefined,
                opacity: missing ? 0.6 : undefined,
              }}
            >
              {showPlaceholder ? (
                <div
                  className="gc-placeholder"
                  style={{ backgroundColor: placeholderColor(title) }}
                >
                  {isThumbnailPending ? (
                    <div className="gc-spinner" />
                  ) : (
                    <span className="gc-placeholder-text">{initials(title)}</span>
                  )}
                </div>
              ) : (
                <img
                  className="gc-cover-img"
                  src={scaledImageUrl(coverUrl, 400, 600)}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  onError={() => setImgError(true)}
                />
              )}

              {/* Gradient overlay for readability */}
              {/* <div className="gc-cover-overlay" /> */}

              {missing && (
                <span
                  className="gc-badge gc-missing-badge"
                  style={{
                    backgroundColor: "#ff2222",
                    color: "#ffffff",
                    boxShadow: "0 0 8px #ff2222",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                  }}
                >
                  MISSING
                </span>
              )}
              {!missing && badge && (
                <span
                  className="gc-badge"
                  style={{
                    backgroundColor: badgeColor ?? "var(--accent)",
                    color: "var(--surface-base)",
                  }}
                >
                  {badge}
                </span>
              )}

              {onFavorite && (
                <button
                  className="gc-favorite-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFavorite();
                  }}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg
                    className="gc-favorite-icon"
                    viewBox="0 0 24 24"
                    fill={isFavorite ? "var(--accent)" : "none"}
                    stroke={isFavorite ? "var(--accent)" : "white"}
                    strokeWidth={2}
                  >
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </button>
              )}

              {progress !== undefined && progress > 0 && (
                <div className="gc-progress-track">
                  <div
                    className="gc-progress-fill"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              )}

              {missingCoreTooltip && (
                <Tooltip content={missingCoreTooltip}>
                  <div className="gc-missing-core">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                </Tooltip>
              )}

              <img className="gc-platform-icon" src={`data:image/svg+xml,${encodeURIComponent(platformIconUrl)}`} alt="" />
            </div>

            {corrupt && (
              <div className="gc-broken-overlay" />
            )}

            {/* Title area */}
            <div className="gc-details">
              <h3 className="gc-title" title={title}>
                {title}
              </h3>
              <p className="gc-subtitle" title={subtitle || ""}>
                {subtitle || "\u00A0"}
              </p>
              {(playTime !== undefined && playTime > 0) || (lastPlayed !== undefined && lastPlayed > 0) ? (
                <p className="gc-meta">
                  {playTime !== undefined && playTime > 0 ? (
                    <span className="gc-playtime">
                      {playTime >= 60
                        ? `${Math.floor(playTime / 60)}h ${playTime % 60}m`
                        : `${playTime}m`}
                    </span>
                  ) : null}
                  {lastPlayed !== undefined && lastPlayed > 0 ? (
                    <span className="gc-last-played">
                      {playTime !== undefined && playTime > 0 ? " · " : ""}
                      {formatLastPlayed(lastPlayed)}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
});

export default GameCard;
