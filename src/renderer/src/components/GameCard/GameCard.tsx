import React, { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GamePlatform } from "../../../../shared/types";
import { steamIcon, gogIcon, flashIcon, gamecubeIcon, wiiIcon } from "./icons";
import { Tooltip } from "../Tooltip/Tooltip";
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

function svgDataUri(content: string): string {
  return `data:image/svg+xml,${encodeURIComponent(content)}`;
}

function platformSvg(platform: GamePlatform): string {
  const icons: Record<string, string> = {
    steam: steamIcon,
    gog: gogIcon,
    flash: flashIcon,
    "dolphin-gc": gamecubeIcon,
    "dolphin-wii": wiiIcon,
    heroic: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="10" y="10" width="80" height="80" rx="16" fill="white"/><text x="50" y="72" font-size="60" font-weight="bold" text-anchor="middle" fill="black">H</text></svg>`,
    lutris: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><polygon points="50,5 95,95 5,95" fill="white"/><polygon points="50,25 75,80 25,80" fill="black"/></svg>`,
    nes: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="10" y="20" width="80" height="60" rx="4" fill="white"/><rect x="18" y="28" width="64" height="20" fill="black"/><rect x="22" y="56" width="8" height="8" fill="black"/><rect x="36" y="56" width="8" height="8" fill="black"/></svg>`,
    snes: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="10" y="15" width="80" height="70" rx="12" fill="white"/><rect x="18" y="23" width="64" height="24" fill="black"/><circle cx="30" cy="62" r="6" fill="black"/><circle cx="50" cy="62" r="6" fill="black"/><circle cx="70" cy="62" r="6" fill="black"/></svg>`,
    gb: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="25" y="5" width="50" height="90" rx="8" fill="white"/><rect x="32" y="18" width="36" height="28" fill="black"/><rect x="32" y="54" width="10" height="10" fill="black"/><rect x="48" y="54" width="10" height="10" fill="black"/></svg>`,
    gba: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="5" y="25" width="90" height="50" rx="8" fill="white"/><rect x="15" y="32" width="50" height="28" fill="black"/><circle cx="78" cy="55" r="8" fill="black"/></svg>`,
    dos: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="10" y="10" width="80" height="70" rx="4" fill="white"/><text x="50" y="55" font-size="30" font-weight="bold" text-anchor="middle" fill="black">C:\\</text><rect x="10" y="82" width="80" height="8" rx="2" fill="white"/></svg>`,
    desktop: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="10" y="15" width="80" height="55" rx="4" fill="white"/><rect x="35" y="75" width="30" height="8" fill="white"/><rect x="20" y="20" width="60" height="40" fill="black"/></svg>`,
    unknown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><circle cx="50" cy="50" r="45" fill="white"/><text x="50" y="70" font-size="55" font-weight="bold" text-anchor="middle" fill="black">?</text></svg>`,
  };
  return icons[platform] ?? icons.unknown;
}

const TILE_CACHE = new Map<string, string>();

function generateWatermarkTile(svgString: string): Promise<string> {
  const cached = TILE_CACHE.get(svgString);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Black background = transparent in luminance mask
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, size, size);

    const img = new Image();
    img.onload = () => {
      const iconSize = size * 0.125;
      // Pseudo-diagonal staggered watermark layout
      const positions = [
        [40, 48], [240, 48], [440, 48],
        [160, 152], [360, 152],
        [80, 256], [280, 256],
        [200, 360], [400, 360],
        [120, 464], [320, 464],
      ];
      positions.forEach(([x, y]) => {
        ctx.globalAlpha = 0.7;
        ctx.drawImage(img, x - iconSize / 2, y - iconSize / 2, iconSize, iconSize);
      });
      ctx.globalAlpha = 1;

      const pngUrl = canvas.toDataURL("image/png");
      TILE_CACHE.set(svgString, pngUrl);
      resolve(pngUrl);
    };
    img.onerror = () => resolve("");
    img.src = svgDataUri(svgString);
  });
}

const ANIMATION_CONFIG = {
  INITIAL_DURATION: 1200,
  INITIAL_X_OFFSET: 70,
  INITIAL_Y_OFFSET: 60,
  DEVICE_BETA_OFFSET: 20,
  ENTER_TRANSITION_MS: 180,
};

const clamp = (v: number, min = 0, max = 100) => Math.min(Math.max(v, min), max);
const round = (v: number, precision = 3) => parseFloat(v.toFixed(precision));
const adjust = (v: number, fMin: number, fMax: number, tMin: number, tMax: number) =>
  round(tMin + ((tMax - tMin) * (v - fMin)) / (fMax - fMin));

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
}) => {
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [coverUrl]);
  const [maskUrl, setMaskUrl] = useState<string>("");
  const showPlaceholder = !coverUrl || imgError;

  const wrapRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const enterTimerRef = useRef<number | null>(null);
  const leaveRafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const svg = platformSvg(platform);
    generateWatermarkTile(svg).then((url) => {
      if (!cancelled) setMaskUrl(url);
    });
    return () => { cancelled = true; };
  }, [platform]);

  const tiltEngine = useMemo(() => {
    let rafId: number | null = null;
    let running = false;
    let lastTs = 0;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;
    let initialUntil = 0;

    const DEFAULT_TAU = 0.14;
    const INITIAL_TAU = 0.6;

    const setVarsFromXY = (x: number, y: number) => {
      const shell = shellRef.current;
      const wrap = wrapRef.current;
      if (!shell || !wrap) return;
      const width = shell.clientWidth || 1;
      const height = shell.clientHeight || 1;
      const percentX = clamp((100 / width) * x);
      const percentY = clamp((100 / height) * y);
      const centerX = percentX - 50;
      const centerY = percentY - 50;

      const properties: Record<string, string> = {
        "--pointer-x": `${percentX}%`,
        "--pointer-y": `${percentY}%`,
        "--background-x": `${adjust(percentX, 0, 100, 35, 65)}%`,
        "--background-y": `${adjust(percentY, 0, 100, 35, 65)}%`,
        "--pointer-from-center": `${clamp(Math.hypot(percentY - 50, percentX - 50) / 50, 0, 1)}`,
        "--pointer-from-top": `${percentY / 100}`,
        "--pointer-from-left": `${percentX / 100}`,
        "--rotate-x": `${round(-(centerX / 5))}deg`,
        "--rotate-y": `${round(centerY / 4)}deg`,
      };

      for (const [k, v] of Object.entries(properties)) {
        wrap.style.setProperty(k, v);
      }
    };

    const step = (ts: number) => {
      if (!running) return;
      if (lastTs === 0) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      const tau = ts < initialUntil ? INITIAL_TAU : DEFAULT_TAU;
      const k = 1 - Math.exp(-dt / tau);
      currentX += (targetX - currentX) * k;
      currentY += (targetY - currentY) * k;
      setVarsFromXY(currentX, currentY);
      const stillFar = Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05;
      if (stillFar || document.hasFocus()) {
        rafId = requestAnimationFrame(step);
      } else {
        running = false;
        lastTs = 0;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTs = 0;
      rafId = requestAnimationFrame(step);
    };

    return {
      setImmediate(x: number, y: number) {
        currentX = x;
        currentY = y;
        setVarsFromXY(currentX, currentY);
      },
      setTarget(x: number, y: number) {
        targetX = x;
        targetY = y;
        start();
      },
      toCenter() {
        const shell = shellRef.current;
        if (!shell) return;
        this.setTarget(shell.clientWidth / 2, shell.clientHeight / 2);
      },
      beginInitial(durationMs: number) {
        initialUntil = performance.now() + durationMs;
        start();
      },
      getCurrent() {
        return { x: currentX, y: currentY, tx: targetX, ty: targetY };
      },
      cancel() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        running = false;
        lastTs = 0;
      },
    };
  }, []);

  const getOffsets = (evt: PointerEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;
      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    },
    [tiltEngine]
  );

  const handlePointerEnter = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;
      shell.classList.add("active");
      shell.classList.add("entering");
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = window.setTimeout(() => {
        shell.classList.remove("entering");
      }, ANIMATION_CONFIG.ENTER_TRANSITION_MS);
      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    },
    [tiltEngine]
  );

  const handlePointerLeave = useCallback(() => {
    const shell = shellRef.current;
    if (!shell || !tiltEngine) return;
    tiltEngine.toCenter();
    const checkSettle = () => {
      const { x, y, tx, ty } = tiltEngine.getCurrent();
      const settled = Math.hypot(tx - x, ty - y) < 0.6;
      if (settled) {
        shell.classList.remove("active");
        if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
        leaveRafRef.current = null;
      } else {
        leaveRafRef.current = requestAnimationFrame(checkSettle);
      }
    };
    if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
    leaveRafRef.current = requestAnimationFrame(checkSettle);
  }, [tiltEngine]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !tiltEngine) return;
    shell.addEventListener("pointerenter", handlePointerEnter);
    shell.addEventListener("pointermove", handlePointerMove);
    shell.addEventListener("pointerleave", handlePointerLeave);

    const initialX = (shell.clientWidth || 0) - ANIMATION_CONFIG.INITIAL_X_OFFSET;
    const initialY = ANIMATION_CONFIG.INITIAL_Y_OFFSET;
    tiltEngine.setImmediate(initialX, initialY);
    tiltEngine.toCenter();
    tiltEngine.beginInitial(ANIMATION_CONFIG.INITIAL_DURATION);

    return () => {
      shell.removeEventListener("pointerenter", handlePointerEnter);
      shell.removeEventListener("pointermove", handlePointerMove);
      shell.removeEventListener("pointerleave", handlePointerLeave);
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
      tiltEngine.cancel();
      shell.classList.remove("entering");
    };
  }, [tiltEngine, handlePointerMove, handlePointerEnter, handlePointerLeave]);

  // Focus-driven active state for gamepad nav
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (isFocused) {
      shell.classList.add("active");
      tiltEngine?.toCenter();
    } else {
      shell.classList.remove("active");
    }
  }, [isFocused, tiltEngine]);

  const cardStyle: React.CSSProperties = {
    "--icon": maskUrl ? `url(${maskUrl})` : "none",
    "--inner-gradient": "linear-gradient(145deg, #60496e8c 0%, #71C4FF44 100%)",
    "--behind-glow-color": badgeColor ? badgeColor : "rgba(125, 190, 255, 0.67)",
    "--behind-glow-size": "50%",
  } as React.CSSProperties;

  return (
    <motion.div
      className={`gc-card-wrapper ${isFocused ? "focused" : ""}`}
      style={cardStyle}
      whileTap={{ scale: 0.96 }}
      onClick={onSelect}
    >
      <div className="gc-behind" />
      <div ref={shellRef} className="gc-card-shell">
        <section className="gc-card">
          <div className="gc-inside">
            <div className="gc-shine" />

            {isThumbnailPending && (
              <div className="gc-loading-overlay">
                <div className="gc-spinner" />
              </div>
            )}

            {/* Cover image area */}
            <div className="gc-cover-content">
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
                  src={coverUrl}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  onError={() => setImgError(true)}
                />
              )}

              {/* Gradient overlay for readability */}
              <div className="gc-cover-overlay" />

              {badge && (
                <span
                  className="gc-badge"
                  style={{
                    backgroundColor: badgeColor ?? "var(--color-accent)",
                    color: "var(--color-bg)",
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
                    fill={isFavorite ? "var(--color-accent)" : "none"}
                    stroke={isFavorite ? "var(--color-accent)" : "white"}
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
