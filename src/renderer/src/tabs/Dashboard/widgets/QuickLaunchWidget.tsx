import React, { useMemo } from "react";
import { useGamesStore } from "../../../store/games.store";
import { Game, GamePlatform } from "@shared/types";
import { Play, Gamepad2 } from "lucide-react";
import { scaledImageUrl } from "../../../lib/image-url";

const PLATFORM_COLORS: Record<GamePlatform, string> = {
  steam: "#1b2838", gog: "#86328a", lutris: "#ff9900", heroic: "#e0e0e0",
  "dolphin-gc": "#5c2d91", "dolphin-wii": "#5c2d91", nes: "#c0392b", snes: "#8e44ad",
  gb: "#27ae60", gba: "#2980b9", n64: "#f39c12", genesis: "#34495e",
  sms: "#16a085", gamegear: "#2c3e50", pce: "#e67e22", psx: "#2c3e50",
  ps2: "#3498db", ps3: "#9b59b6", psp: "#1abc9c", xbox360: "#27ae60",
  nds: "#c0392b", dreamcast: "#e74c3c", flash: "#f1c40f", dos: "#95a5a6",
  windows: "#3498db", desktop: "#7f8c8d", itch: "#fa5c5c", unknown: "#7f8c8d",
  gbc: "#2ecc71", atari2600: "#34495e", atari5200: "#34495e", atari7800: "#34495e",
  lynx: "#e74c3c", ngp: "#3498db", movie: "#9b59b6", tv: "#9b59b6", video: "#9b59b6",
};

export const QuickLaunchWidget: React.FC<{ title?: string; maxItems?: number }> = ({
  title,
  maxItems = 6,
}) => {
  const games = useGamesStore((s) => s.games);

  const quickList = useMemo(() => {
    const favs = games.filter((g) => g.isFavorite).slice(0, maxItems);
    if (favs.length >= maxItems) return favs;
    const recent = games
      .filter((g) => !g.isFavorite && g.lastPlayed && g.lastPlayed > 0)
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
      .slice(0, maxItems - favs.length);
    return [...favs, ...recent];
  }, [games, maxItems]);

  const launch = async (id: string) => {
    const g = games.find((x) => x.id === id);
    if (!g) return;
    try {
      await window.htpc.games.launch(g);
    } catch (err: any) {
      console.error("[dashboard] failed to launch game:", err);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1 text-[12px] font-medium opacity-50 uppercase tracking-wider">
          <Play size={10} />
          {title}
        </div>
      )}
      <div className="flex-1 grid grid-cols-3 gap-1.5 overflow-y-auto min-h-0">
        {quickList.length === 0 && (
          <div className="col-span-3 flex items-center justify-center text-sm opacity-40">
            No games available
          </div>
        )}
        {quickList.map((g) => (
          <button
            key={g.id}
            onClick={() => launch(g.id)}
            className="group flex flex-col items-center gap-0.5 p-1 rounded-xl transition-all duration-200 hover:scale-[1.05]"
            style={{ background: "var(--surface-1)" }}
          >
            <div className="relative w-full aspect-[3/4] max-h-16">
              {g.coverUrl ? (
                <img src={scaledImageUrl(g.coverUrl, 48, 64)} alt="" className="w-full h-full object-cover rounded-lg" loading="lazy" />
              ) : (
                <div className="w-full h-full rounded-lg flex items-center justify-center" style={{ background: "var(--surface-0)" }}>
                  <Gamepad2 size={14} className="opacity-40" />
                </div>
              )}
              <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
                <Play size={14} style={{ color: "#fff" }} />
              </div>
            </div>
            <span className="text-[12px] truncate w-full text-center opacity-80">{g.title}</span>
            <span className="text-[12px] px-1 py-0.5 rounded font-medium uppercase" style={{ background: PLATFORM_COLORS[g.platform] ?? "#7f8c8d", color: "#fff" }}>
              {g.platform}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
