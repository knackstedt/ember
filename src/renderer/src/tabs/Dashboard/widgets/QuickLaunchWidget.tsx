import React, { useMemo } from "react";
import { useGamesStore } from "../../../store/games.store";
import { Gamepad2 } from "lucide-react";

export const QuickLaunchWidget: React.FC<{ title?: string; maxItems?: number }> = ({
  title,
  maxItems = 6,
}) => {
  const games = useGamesStore((s) => s.games);

  const quickList = useMemo(() => {
    // Mix favorites and recently played for quick access
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
    <div className="flex flex-col h-full gap-2 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-60 uppercase tracking-wider">
          <Gamepad2 size={12} />
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {quickList.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm opacity-40">
            No games available
          </div>
        )}
        {quickList.map((g) => (
          <button
            key={g.id}
            onClick={() => launch(g.id)}
            className="flex items-center gap-2 px-2 py-1 rounded text-left text-sm transition-colors hover:opacity-80"
            style={{ background: "var(--color-surface-raised)" }}
          >
            <Gamepad2 size={12} className="opacity-50 flex-shrink-0" />
            <span className="truncate">{g.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
