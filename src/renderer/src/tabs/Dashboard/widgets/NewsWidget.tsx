import React from "react";
import { Newspaper } from "lucide-react";

export const NewsWidget: React.FC<{ title?: string }> = ({ title }) => {
  return (
    <div className="flex flex-col h-full gap-2 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-60 uppercase tracking-wider">
          <Newspaper size={12} />
          {title}
        </div>
      )}
      <div className="flex-1 flex items-center justify-center text-sm opacity-40">
        News feed coming soon
      </div>
    </div>
  );
};
