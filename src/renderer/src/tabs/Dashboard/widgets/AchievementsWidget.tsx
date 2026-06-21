import React, { useMemo } from "react";
import { Trophy, Medal, Target, Flame } from "lucide-react";

const MOCK_ACHIEVEMENTS = [
  { id: "1", name: "First Launch", desc: "Launch your first game", icon: Target, progress: 100, total: 1, unlocked: true },
  { id: "2", name: "Marathon Runner", desc: "Play for 100 hours total", icon: Flame, progress: 67, total: 100, unlocked: false },
  { id: "3", name: "Collector", desc: "Own 50 games", icon: Trophy, progress: 32, total: 50, unlocked: false },
  { id: "4", name: "Movie Buff", desc: "Watch 20 movies", icon: Medal, progress: 12, total: 20, unlocked: false },
];

function AchievementRing({ pct, color }: { pct: number; color: string }) {
  const circumference = 2 * Math.PI * 10;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative w-7 h-7 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-surface-raised)" strokeWidth="3" />
        <circle
          cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[8px] font-bold tabular-nums">{Math.round(pct)}</span>
      </div>
    </div>
  );
}

export const AchievementsWidget: React.FC<{ title?: string }> = ({ title }) => {
  const achievements = MOCK_ACHIEVEMENTS;
  const unlocked = useMemo(() => achievements.filter((a) => a.unlocked).length, [achievements]);
  const total = achievements.length;

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
      {title && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[10px] font-medium opacity-50 uppercase tracking-wider">
            <Trophy size={10} />
            {title}
          </div>
          <span className="text-[10px] opacity-40">{unlocked}/{total} unlocked</span>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
        {achievements.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-1.5 px-1.5 py-1 rounded-xl"
            style={{
              background: a.unlocked ? "var(--color-surface-raised)" : "transparent",
              opacity: a.unlocked ? 1 : 0.6,
            }}
          >
            <AchievementRing pct={(a.progress / a.total) * 100} color={a.unlocked ? "var(--color-accent)" : "var(--color-text)"} />
            <div className="flex-1 min-w-0 flex flex-col gap-0">
              <div className="text-[11px] font-medium truncate">{a.name}</div>
              <div className="text-[9px] opacity-40 truncate">{a.desc}</div>
            </div>
            {a.unlocked && <Trophy size={10} style={{ color: "var(--color-accent)" }} />}
          </div>
        ))}
      </div>
    </div>
  );
};
