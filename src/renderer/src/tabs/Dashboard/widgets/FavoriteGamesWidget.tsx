import React, { useMemo } from "react";
import { useGamesStore } from "../../../store/games.store";
import { Game } from "../../../../shared/types";
import { Star, Gamepad2 } from "lucide-react";

export const FavoriteGamesWidget: React.FC<{ title?: string; maxItems?: number }> = ({
  title,
  maxItems = 5,
}) => {
  const games = useGamesStore((s) => s.games);

  const favorites = useMemo(() => {
    return [...games]
      .filter((g) => g.isFavorite)
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, maxItems);
  }, [games, maxItems]);

  const launch = async (g: Game) => {
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
          <Star size={12} />
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {favorites.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm opacity-40">
            No favorites yet
          </div>
        )}
        {favorites.map((g) => (
          <button
            key={g.id}
            onClick={() => launch(g)}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors hover:opacity-80"
            style={{
              background: "var(--color-surface-raised)",
            }}
          >
            {g.coverUrl ? (
              <img
                src={g.coverUrl}
                alt=""
                className="w-8 h-10 object-cover rounded flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <div
                className="w-8 h-10 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--color-surface)" }}
              >
                <Gamepad2 size={14} className="opacity-40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium text-sm">{g.title}</div>
              <div className="text-xs opacity-40 capitalize">{g.platform}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
