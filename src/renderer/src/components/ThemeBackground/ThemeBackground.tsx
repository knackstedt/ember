import React, { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../store/settings.store";
import { DailyBackgroundSource } from "../../../../shared/types";

const CACHE_DATE_KEY = "htpc-daily-bg-date";
const CACHE_URL_KEY = "htpc-daily-bg-url";
const CACHE_SOURCE_KEY = "htpc-daily-bg-source";

async function fetchBingImageUrl(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US",
    );
    const data = await res.json();
    const path = data?.images?.[0]?.url;
    return path ? `https://www.bing.com${path}` : null;
  } catch {
    return null;
  }
}

async function fetchUnsplashUrl(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://source.unsplash.com/random/1920x1080/?nature,landscape",
      { redirect: "follow" },
    );
    return res.url ?? null;
  } catch {
    return null;
  }
}

async function fetchPicsumUrl(): Promise<string | null> {
  try {
    const res = await fetch("https://picsum.photos/1920/1080", {
      redirect: "follow",
    });
    return res.url ?? null;
  } catch {
    return null;
  }
}

async function fetchDailyImageUrl(
  source: DailyBackgroundSource,
  customUrl?: string,
): Promise<string | null> {
  switch (source) {
    case "bing":
      return fetchBingImageUrl();
    case "unsplash":
      return fetchUnsplashUrl();
    case "picsum":
      return fetchPicsumUrl();
    case "custom":
      return customUrl || null;
    default:
      return null;
  }
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const ThemeBackground: React.FC = () => {
  const theme = useSettingsStore((s) => s.settings?.theme ?? "dark-oled");
  const dailyBg = useSettingsStore((s) => s.settings?.dailyBackground);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [bgUrl, setBgUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    cancelAnimationFrame(animRef.current);
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    if (theme === "dark-oled") {
      const drawStars = (): void => {
        ctx.clearRect(0, 0, w, h);
        const count = Math.floor((w * h) / 3000);
        for (let i = 0; i < count; i++) {
          ctx.beginPath();
          ctx.arc(
            Math.random() * w,
            Math.random() * h,
            Math.random() * 1.2,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = `rgba(255,255,255,${(0.05 + Math.random() * 0.2).toFixed(2)})`;
          ctx.fill();
        }
      };
      const onResize = (): void => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
        drawStars();
      };
      drawStars();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const onResize = (): void => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    if (theme === "glassmorphism") {
      const hues = [200, 220, 240, 260, 280, 300];
      const orbs = Array.from({ length: 6 }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 200 + Math.random() * 200,
        hue: hues[i],
      }));

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h);
        for (const orb of orbs) {
          orb.x += orb.vx;
          orb.y += orb.vy;
          if (orb.x < -orb.r) orb.x = w + orb.r;
          if (orb.x > w + orb.r) orb.x = -orb.r;
          if (orb.y < -orb.r) orb.y = h + orb.r;
          if (orb.y > h + orb.r) orb.y = -orb.r;

          const grd = ctx.createRadialGradient(
            orb.x,
            orb.y,
            0,
            orb.x,
            orb.y,
            orb.r,
          );
          grd.addColorStop(0, `hsla(${orb.hue},80%,60%,0.12)`);
          grd.addColorStop(1, "transparent");
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
          ctx.fill();
        }
        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    } else if (theme === "neon-cyberpunk") {
      let scanY = 0;
      const CYCLE_FRAMES = 480; // ~8s at 60fps

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h);
        scanY = (scanY + h / CYCLE_FRAMES) % h;

        const halo = ctx.createLinearGradient(0, scanY - 10, 0, scanY + 10);
        halo.addColorStop(0, "transparent");
        halo.addColorStop(0.5, "rgba(255,45,120,0.07)");
        halo.addColorStop(1, "transparent");
        ctx.fillStyle = halo;
        ctx.fillRect(0, scanY - 10, w, 20);

        ctx.strokeStyle = "rgba(255,45,120,0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(scanY));
        ctx.lineTo(w, Math.round(scanY));
        ctx.stroke();

        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    } else if (theme === "terminal-tui") {
      const FONT_SIZE = 14;
      const cols = Math.floor(w / FONT_SIZE);
      const chars = "01アイウエオカキクケコサシスセソABCDEFGHIJKLMNOP".split(
        "",
      );
      const drops = Array.from(
        { length: cols },
        () => Math.random() * -(h / FONT_SIZE),
      );

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      const draw = (): void => {
        ctx.fillStyle = "rgba(0,0,0,0.05)";
        ctx.fillRect(0, 0, w, h);
        ctx.font = `${FONT_SIZE}px monospace`;

        for (let i = 0; i < drops.length; i++) {
          const ch = chars[Math.floor(Math.random() * chars.length)];
          const x = i * FONT_SIZE;
          const y = drops[i] * FONT_SIZE;

          ctx.fillStyle = "rgba(180,255,180,0.95)";
          ctx.fillText(ch, x, y);

          if (y > h && Math.random() > 0.975) drops[i] = 0;
          drops[i] += 0.5;
        }

        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [theme]);

  useEffect(() => {
    if (!dailyBg?.enabled) {
      setBgUrl(null);
      return;
    }

    const today = getTodayStr();
    const cachedDate = localStorage.getItem(CACHE_DATE_KEY);
    const cachedUrl = localStorage.getItem(CACHE_URL_KEY);
    const cachedSource = localStorage.getItem(CACHE_SOURCE_KEY);

    if (
      cachedDate === today &&
      cachedUrl &&
      cachedSource === dailyBg.source &&
      (dailyBg.source !== "custom" || cachedUrl === dailyBg.customUrl)
    ) {
      setBgUrl(cachedUrl);
      return;
    }

    let cancelled = false;
    fetchDailyImageUrl(dailyBg.source, dailyBg.customUrl).then((url) => {
      if (cancelled || !url) return;
      localStorage.setItem(CACHE_DATE_KEY, today);
      localStorage.setItem(CACHE_URL_KEY, url);
      localStorage.setItem(CACHE_SOURCE_KEY, dailyBg.source);
      setBgUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [dailyBg?.enabled, dailyBg?.source, dailyBg?.customUrl]);

  return (
    <>
      {bgUrl && (
        <img
          src={bgUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
            zIndex: 0,
            opacity: 0.35,
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          mixBlendMode: bgUrl ? "overlay" : "normal",
        }}
      />
    </>
  );
};
