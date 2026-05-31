import React from "react";
import { motion } from "framer-motion";

export interface StreamingService {
  id: string;
  name: string;
  url: string;
  color: string; // brand background
  textColor: string;
  icon: string; // emoji or inline SVG
}

export const MOVIE_STREAMING_SERVICES: StreamingService[] = [
  {
    id: "netflix",
    name: "Netflix",
    url: "https://netflix.com",
    color: "#E50914",
    textColor: "#ffffff",
    icon: "🎬",
  },
  {
    id: "prime",
    name: "Prime Video",
    url: "https://primevideo.com",
    color: "#00A8E1",
    textColor: "#ffffff",
    icon: "📦",
  },
  {
    id: "disney",
    name: "Disney+",
    url: "https://disneyplus.com",
    color: "#113CCF",
    textColor: "#ffffff",
    icon: "✨",
  },
  {
    id: "hbomax",
    name: "HBO Max",
    url: "https://max.com",
    color: "#8B5CF6",
    textColor: "#ffffff",
    icon: "👑",
  },
  {
    id: "appletv",
    name: "Apple TV+",
    url: "https://tv.apple.com",
    color: "#1C1C1E",
    textColor: "#f5f5f7",
    icon: "🍎",
  },
  {
    id: "hulu",
    name: "Hulu",
    url: "https://hulu.com",
    color: "#1CE783",
    textColor: "#0d1117",
    icon: "📺",
  },
  {
    id: "crunchyroll",
    name: "Crunchyroll",
    url: "https://crunchyroll.com",
    color: "#F47521",
    textColor: "#ffffff",
    icon: "🍊",
  },
  {
    id: "plex",
    name: "Plex",
    url: "https://app.plex.tv",
    color: "#E5A00D",
    textColor: "#1a1a1a",
    icon: "🎞️",
  },
];

export const MUSIC_STREAMING_SERVICES: StreamingService[] = [
  {
    id: "spotify",
    name: "Spotify",
    url: "https://open.spotify.com",
    color: "#1DB954",
    textColor: "#0d1117",
    icon: "🎵",
  },
  {
    id: "applemusic",
    name: "Apple Music",
    url: "https://music.apple.com",
    color: "#FC3C44",
    textColor: "#ffffff",
    icon: "🎶",
  },
  {
    id: "ytmusic",
    name: "YouTube Music",
    url: "https://music.youtube.com",
    color: "#FF0000",
    textColor: "#ffffff",
    icon: "▶",
  },
  {
    id: "tidal",
    name: "Tidal",
    url: "https://tidal.com",
    color: "#0c0c0c",
    textColor: "#ffffff",
    icon: "〰️",
  },
  {
    id: "deezer",
    name: "Deezer",
    url: "https://deezer.com",
    color: "#EF5466",
    textColor: "#ffffff",
    icon: "🎧",
  },
  {
    id: "bandcamp",
    name: "Bandcamp",
    url: "https://bandcamp.com",
    color: "#1DA0C3",
    textColor: "#ffffff",
    icon: "🎸",
  },
];

interface Props {
  services: StreamingService[];
}

export const StreamingTile: React.FC<Props> = ({ services }) => {
  return (
    <div className="flex flex-col gap-2 flex-shrink-0">
      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--color-border) transparent",
        }}
      >
        {services.map((svc) => (
          <motion.button
            key={svc.id}
            className="flex-shrink-0 relative flex flex-col justify-between rounded-[var(--radius-card)] overflow-hidden"
            style={{
              width: 160,
              aspectRatio: "16/9",
              background: svc.color,
              boxShadow: "var(--shadow-card)",
            }}
            whileHover={{ scale: 1.05, y: -3 }}
            whileTap={{ scale: 0.97 }}
            title={`Open ${svc.name} in default browser`}
            onClick={() => window.open(svc.url, "_blank")}
          >
            <span
              className="text-3xl px-3 pt-2.5 leading-none select-none"
              aria-hidden
            >
              {svc.icon}
            </span>
            <span
              className="text-sm font-bold px-3 pb-2.5 text-left leading-tight"
              style={{ color: svc.textColor }}
            >
              {svc.name}
            </span>
          </motion.button>
        ))}
      </div>
      <p
        className="text-xs select-none"
        style={{ color: "var(--color-text-dim)" }}
      >
        Opens in your default browser
      </p>
    </div>
  );
};
