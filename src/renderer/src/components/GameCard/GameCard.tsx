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
  suppressMountAnimation?: boolean;
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
    n64: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><text x="50" y="70" font-family="Arial Black, Impact, Arial, sans-serif" font-size="42" font-weight="900" text-anchor="middle" fill="white">N64</text></svg>`,
    genesis: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="20" y="25" width="60" height="50" rx="6" fill="white"/><rect x="26" y="31" width="20" height="20" fill="black"/><circle cx="68" cy="45" r="5" fill="black"/><circle cx="68" cy="58" r="5" fill="black"/><circle cx="58" cy="51" r="5" fill="black"/><circle cx="78" cy="51" r="5" fill="black"/></svg>`,
    sms: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="22" y="30" width="56" height="40" rx="4" fill="white"/><rect x="30" y="36" width="16" height="10" fill="black"/><circle cx="62" cy="42" r="4" fill="black"/><circle cx="74" cy="42" r="4" fill="black"/><rect x="30" y="56" width="10" height="4" fill="black"/><rect x="45" y="56" width="10" height="4" fill="black"/></svg>`,
    gamegear: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="15" y="22" width="70" height="56" rx="8" fill="white"/><rect x="22" y="28" width="44" height="34" fill="black"/><circle cx="76" cy="38" r="5" fill="black"/><circle cx="76" cy="52" r="5" fill="black"/></svg>`,
    pce: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="25" y="30" width="50" height="40" rx="5" fill="white"/><rect x="32" y="36" width="22" height="16" fill="black"/><circle cx="70" cy="44" r="5" fill="black"/><circle cx="70" cy="58" r="5" fill="black"/><rect x="30" y="62" width="12" height="3" fill="black"/></svg>`,
    psx: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z" fill="white"/></svg>`,
    ps1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z" fill="white"/></svg>`,
    ps2: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7.46 13.779v.292h4.142v-3.85h3.796V9.93h-4.115v3.85zm16.248-3.558v1.62h-7.195v2.23H24v-.292h-7.168v-1.646H24V9.929h-7.487v.292zm-16.513 0v1.62H0v2.23h.292v-1.938H7.46V9.929H0v.292Z" fill="white"/></svg>`,
    ps3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.362 9.433h-3.148c-.97 0-1.446.6-1.446 1.38v2.365c0 .483-.228.83-.71.83H7.304a.035.035 0 00-.035.035v.47c0 .02.01.032.03.032h3.11c.97 0 1.45-.597 1.45-1.377v-2.363c0-.484.224-.832.71-.832h2.781c.02 0 .04-.014.04-.033v-.475c0-.02-.02-.035-.04-.035zm-9.266 0H.038c-.022 0-.038.017-.038.035v.477c0 .02.016.036.038.036h5.694c.48 0 .71.347.71.83s-.228.83-.71.83H1.228c-.7 0-1.227.586-1.227 1.365v1.513c0 .02.02.037.04.037h1.03c.02 0 .04-.016.04-.037v-1.513c0-.48.28-.82.68-.82H6.1c.97 0 1.444-.594 1.444-1.374 0-.778-.473-1.38-1.442-1.38zm17.453 2.498a.04.04 0 010-.056c.3-.25.45-.627.45-1.062 0-.778-.474-1.38-1.446-1.38h-6.057c-.02 0-.036.018-.036.038v.475c0 .02.02.04.04.04h5.7c.48 0 .715.35.715.83s-.23.83-.712.83h-5.7c-.02 0-.036.02-.036.04v.48c0 .02.016.033.037.033h5.7c.63.007.71.62.71.93v.06c0 .485-.23.833-.71.833h-5.7c-.02 0-.036.015-.036.034v.477c0 .02.015.037.036.037h6.05c.973 0 1.446-.645 1.446-1.38v-.057c0-.47-.15-.916-.45-1.19z" fill="white"/></svg>`,
    nds: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="30" y="12" width="40" height="34" rx="4" fill="white"/><rect x="32" y="14" width="36" height="28" fill="black"/><rect x="30" y="54" width="40" height="34" rx="4" fill="white"/><rect x="32" y="56" width="36" height="28" fill="black"/><circle cx="50" cy="50" r="3" fill="white"/></svg>`,
    dreamcast: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><path d="M50 15 C75 15, 85 30, 85 50 C85 70, 75 85, 50 85 C35 85, 25 75, 25 60 C25 48, 35 42, 50 42 C60 42, 68 48, 68 58 C68 68, 60 74, 50 74" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>`,
    xbox: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><text x="50" y="68" font-family="Arial Black, Impact, Arial, sans-serif" font-size="40" font-weight="900" text-anchor="middle" fill="white">X</text></svg>`,
    windows: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="16" y="16" width="32" height="32" fill="white"/><rect x="52" y="16" width="32" height="32" fill="white"/><rect x="16" y="52" width="32" height="32" fill="white"/><rect x="52" y="52" width="32" height="32" fill="white"/></svg>`,
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
  suppressMountAnimation,
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

    if (suppressMountAnimation) {
      tiltEngine.setImmediate(shell.clientWidth / 2, shell.clientHeight / 2);
    } else {
      const initialX = (shell.clientWidth || 0) - ANIMATION_CONFIG.INITIAL_X_OFFSET;
      const initialY = ANIMATION_CONFIG.INITIAL_Y_OFFSET;
      tiltEngine.setImmediate(initialX, initialY);
      tiltEngine.toCenter();
      tiltEngine.beginInitial(ANIMATION_CONFIG.INITIAL_DURATION);
    }

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
