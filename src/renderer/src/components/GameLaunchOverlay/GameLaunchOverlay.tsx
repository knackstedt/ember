import React from "react";
import { useGameLaunchStore } from "../../store/gameLaunch.store";

const DEBUG_SHOW_OVERLAY = false;

const STEP_ICONS: Record<string, string> = {
  "Preparing shader injection": "shield",
  "Writing Proton shader config": "file-text",
  "Configuring Steam launch options": "settings",
  "Restarting Steam": "refresh",
  "Starting Steam": "steam",
  "Waiting for game process": "hourglass",
  "Compiling shaders": "zap",
  "Game process detected": "check-circle",
};

function StepIcon({ name, completed }: { name: string; completed: boolean }) {
  const icon = STEP_ICONS[name] ?? "circle";
  if (completed) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)", flexShrink: 0 }}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <div
      className="rounded-full border-[2.5px] border-white/20 border-t-[var(--launching-spinner,var(--accent))]"
      style={{ width: 18, height: 18, flexShrink: 0, animation: "spin 0.8s linear infinite" }}
    />
  );
}

export const GameLaunchOverlay: React.FC = React.memo(() => {
  const launchingMap = useGameLaunchStore((s) => s.launchingMap);
  const progressMap = useGameLaunchStore((s) => s.progressMap);
  const games = Object.entries(launchingMap);
  const titles = games.length > 0
    ? games.map(([, title]) => title)
    : DEBUG_SHOW_OVERLAY
      ? ["Test Game"]
      : [];
  if (titles.length === 0) return null;

  const label = titles.length === 1 ? titles[0] : `${titles.length} games launching`;
  const firstGameId = games[0]?.[0];
  const steps = firstGameId ? (progressMap[firstGameId] ?? []) : [];

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
          background: "var(--launching-overlay, rgba(0, 0, 0, 0.82))",
          boxShadow: "0 16px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)",
          minWidth: 360,
          maxWidth: 480,
        }}
      >
        <div
          className="w-16 h-16 rounded-full border-[4px] border-white/20 border-t-[var(--launching-spinner,var(--accent))] animate-spin"
        />
        <div className="text-center">
          <div
            className="text-xl font-bold uppercase tracking-widest"
            style={{
              color: "var(--launching-text, var(--accent))",
            }}
          >
            Starting
          </div>
          <div
            className="text-sm font-medium mt-2 opacity-90"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </div>
        </div>

        {steps.length > 0 && (
          <div className="w-full flex flex-col gap-2.5 mt-1">
            {steps.map((s, i) => {
              const isLast = i === steps.length - 1;
              return (
                <div
                  key={i}
                  className="flex items-start gap-3"
                  style={{ opacity: isLast ? 1 : 0.55 }}
                >
                  <StepIcon name={s.step} completed={!isLast} />
                  <div className="flex flex-col" style={{ minWidth: 0 }}>
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {s.step}
                    </span>
                    {s.detail && (
                      <span
                        className="text-xs opacity-70 mt-0.5"
                        style={{ color: "var(--text-secondary, var(--text-primary))" }}
                      >
                        {s.detail}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

GameLaunchOverlay.displayName = "GameLaunchOverlay";
