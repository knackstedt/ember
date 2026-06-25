import React from "react";
import { Newspaper, ExternalLink, TrendingUp } from "lucide-react";

const MOCK_NEWS = [
  {
    id: "1",
    headline: "Steam Next Fest kicks off with 100+ demos",
    source: "PC Gamer",
    time: "2h ago",
    tag: "Event",
  },
  {
    id: "2",
    headline: "New firmware update brings VRR support to handhelds",
    source: "The Verge",
    time: "4h ago",
    tag: "Hardware",
  },
  {
    id: "3",
    headline: "Indie hit sells 2M copies in first month",
    source: "Eurogamer",
    time: "6h ago",
    tag: "Industry",
  },
  {
    id: "4",
    headline: "Major engine update promises 40% faster load times",
    source: "TechRadar",
    time: "8h ago",
    tag: "Tech",
  },
];

const TAG_COLORS: Record<string, string> = {
  Event: "#7dd3fc",
  Hardware: "#86efac",
  Industry: "#fca5a5",
  Tech: "#c4b5fd",
};

export const NewsWidget: React.FC<{ title?: string }> = ({ title }) => {
  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1 text-[12px] font-medium opacity-50 uppercase tracking-wider">
          <Newspaper size={10} />
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
        {MOCK_NEWS.map((item) => (
          <div
            key={item.id}
            className="group flex items-start gap-1.5 px-1.5 py-1 rounded-xl text-left transition-all duration-200 hover:scale-[1.01]"
            style={{ background: "var(--surface-1)" }}
          >
            <div className="flex flex-col gap-0 flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[12px] px-1 py-0.5 rounded font-medium uppercase flex-shrink-0" style={{ background: TAG_COLORS[item.tag] ?? "var(--surface-0)", color: "#000", opacity: 0.8 }}>
                  {item.tag}
                </span>
                <span className="text-[12px] opacity-30 flex-shrink-0">{item.source}</span>
              </div>
              <span className="text-[12px] font-medium truncate leading-snug">{item.headline}</span>
              <span className="text-[12px] opacity-30">{item.time}</span>
            </div>
            <ExternalLink size={9} className="opacity-0 group-hover:opacity-30 transition-opacity flex-shrink-0 mt-0.5" />
          </div>
        ))}
      </div>
    </div>
  );
};
