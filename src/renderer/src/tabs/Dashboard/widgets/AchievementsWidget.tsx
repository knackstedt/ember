import React from "react";
import { Trophy } from "lucide-react";

export const AchievementsWidget: React.FC<{ title?: string }> = ({ title }) => {
  return (
    <div className="flex flex-col h-full gap-2 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-60 uppercase tracking-wider">
          <Trophy size={12} />
          {title}
        </div>
      )}
      <div className="flex-1 flex items-center justify-center text-sm opacity-40">
        Achievements coming soon
      </div>
    </div>
  );
};
