import React from "react";
import { useGameLaunchStore } from "../../store/gameLaunch.store";

const DEBUG_SHOW_OVERLAY = false;

export const GameLaunchOverlay: React.FC = React.memo(() => {
  const launchingMap = useGameLaunchStore((s) => s.launchingMap);
  const games = Object.entries(launchingMap);
  const titles = games.length > 0
    ? games.map(([, title]) => title)
    : DEBUG_SHOW_OVERLAY
      ? ["Test Game"]
      : [];
  if (titles.length === 0) return null;

  const label = titles.length === 1 ? titles[0] : `${titles.length} games launching`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        className="flex flex-col items-center gap-5 px-8 py-7 rounded-2xl"
        style={{
          background: "var(--color-launching-overlay, rgba(0, 0, 0, 0.82))",
          boxShadow: "0 16px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="w-16 h-16 rounded-full border-[4px] border-white/20 border-t-[var(--color-launching-spinner,var(--color-accent))] animate-spin"
        />
        <div className="text-center">
          <div
            className="text-xl font-bold uppercase tracking-widest"
            style={{
              color: "var(--color-launching-text, var(--color-accent))",
            }}
          >
            Starting
          </div>
          <div
            className="text-sm font-medium mt-2 opacity-90"
            style={{ color: "var(--color-text)" }}
          >
            {label}
          </div>
        </div>
      </div>
    </div>
  );
});

GameLaunchOverlay.displayName = "GameLaunchOverlay";
