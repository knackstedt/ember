import { spawnSync } from "child_process";
import { StreamingService } from "../../shared/types";
import { StreamingServiceRepo } from "../db/repository";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const BUILTIN_SERVICES: StreamingService[] = [
  // Music
  {
    id: "spotify",
    name: "Spotify",
    category: "music",
    url: "https://open.spotify.com",
    color: "#1DB954",
    textColor: "#0d1117",
    icon: "🎵",
    desktopApp: "spotify",
    desktopAppArgs: [],
    enabled: true,
    isBuiltin: true,
    sortOrder: 0,
  },
  {
    id: "applemusic",
    name: "Apple Music",
    category: "music",
    url: "https://music.apple.com",
    color: "#FC3C44",
    textColor: "#ffffff",
    icon: "🎶",
    enabled: true,
    isBuiltin: true,
    sortOrder: 1,
  },
  {
    id: "ytmusic",
    name: "YouTube Music",
    category: "music",
    url: "https://music.youtube.com",
    color: "#FF0000",
    textColor: "#ffffff",
    icon: "▶",
    enabled: true,
    isBuiltin: true,
    sortOrder: 2,
  },
  {
    id: "pandora",
    name: "Pandora",
    category: "music",
    url: "https://pandora.com",
    color: "#3668FF",
    textColor: "#ffffff",
    icon: "📻",
    enabled: true,
    isBuiltin: true,
    sortOrder: 3,
  },
  {
    id: "tidal",
    name: "Tidal",
    category: "music",
    url: "https://tidal.com",
    color: "#0c0c0c",
    textColor: "#ffffff",
    icon: "〰️",
    enabled: true,
    isBuiltin: true,
    sortOrder: 4,
  },
  {
    id: "deezer",
    name: "Deezer",
    category: "music",
    url: "https://deezer.com",
    color: "#EF5466",
    textColor: "#ffffff",
    icon: "🎧",
    enabled: true,
    isBuiltin: true,
    sortOrder: 5,
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    category: "music",
    url: "https://soundcloud.com",
    color: "#FF5500",
    textColor: "#ffffff",
    icon: "☁",
    enabled: true,
    isBuiltin: true,
    sortOrder: 6,
  },
  {
    id: "bandcamp",
    name: "Bandcamp",
    category: "music",
    url: "https://bandcamp.com",
    color: "#1DA0C3",
    textColor: "#ffffff",
    icon: "🎸",
    enabled: true,
    isBuiltin: true,
    sortOrder: 7,
  },
  {
    id: "amazonmusic",
    name: "Amazon Music",
    category: "music",
    url: "https://music.amazon.com",
    color: "#00A8E1",
    textColor: "#ffffff",
    icon: "🎼",
    enabled: true,
    isBuiltin: true,
    sortOrder: 8,
  },
  // Video
  {
    id: "netflix",
    name: "Netflix",
    category: "video",
    url: "https://netflix.com",
    color: "#E50914",
    textColor: "#ffffff",
    icon: "🎬",
    enabled: true,
    isBuiltin: true,
    sortOrder: 0,
    embed: true,
  },
  {
    id: "prime",
    name: "Prime Video",
    category: "video",
    url: "https://primevideo.com",
    color: "#00A8E1",
    textColor: "#ffffff",
    icon: "📦",
    enabled: true,
    isBuiltin: true,
    sortOrder: 1,
    embed: true,
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "video",
    url: "https://youtube.com",
    color: "#FF0000",
    textColor: "#ffffff",
    icon: "▶",
    enabled: true,
    isBuiltin: true,
    sortOrder: 2,
    embed: true,
  },
  {
    id: "disney",
    name: "Disney+",
    category: "video",
    url: "https://disneyplus.com",
    color: "#113CCF",
    textColor: "#ffffff",
    icon: "✨",
    enabled: true,
    isBuiltin: true,
    sortOrder: 3,
    embed: true,
  },
  {
    id: "hbomax",
    name: "HBO Max",
    category: "video",
    url: "https://max.com",
    color: "#8B5CF6",
    textColor: "#ffffff",
    icon: "👑",
    enabled: true,
    isBuiltin: true,
    sortOrder: 4,
    embed: true,
  },
  {
    id: "appletv",
    name: "Apple TV+",
    category: "video",
    url: "https://tv.apple.com",
    color: "#1C1C1E",
    textColor: "#f5f5f7",
    icon: "🍎",
    enabled: true,
    isBuiltin: true,
    sortOrder: 5,
    embed: true,
  },
  {
    id: "hulu",
    name: "Hulu",
    category: "video",
    url: "https://hulu.com",
    color: "#1CE783",
    textColor: "#0d1117",
    icon: "📺",
    enabled: true,
    isBuiltin: true,
    sortOrder: 6,
    embed: true,
  },
  {
    id: "paramount",
    name: "Paramount+",
    category: "video",
    url: "https://paramountplus.com",
    color: "#0064FF",
    textColor: "#ffffff",
    icon: "⭐",
    enabled: true,
    isBuiltin: true,
    sortOrder: 7,
    embed: true,
  },
  {
    id: "peacock",
    name: "Peacock",
    category: "video",
    url: "https://peacocktv.com",
    color: "#1FCE46",
    textColor: "#0d1117",
    icon: "🦚",
    enabled: true,
    isBuiltin: true,
    sortOrder: 8,
    embed: true,
  },
  {
    id: "crunchyroll",
    name: "Crunchyroll",
    category: "video",
    url: "https://crunchyroll.com",
    color: "#F47521",
    textColor: "#ffffff",
    icon: "🍊",
    enabled: true,
    isBuiltin: true,
    sortOrder: 9,
    embed: true,
  },
  {
    id: "plex",
    name: "Plex",
    category: "video",
    url: "https://app.plex.tv",
    color: "#E5A00D",
    textColor: "#1a1a1a",
    icon: "🎞️",
    enabled: true,
    isBuiltin: true,
    sortOrder: 10,
    embed: true,
  },
  {
    id: "twitch",
    name: "Twitch",
    category: "video",
    url: "https://twitch.tv",
    color: "#9146FF",
    textColor: "#ffffff",
    icon: "📡",
    enabled: true,
    isBuiltin: true,
    sortOrder: 11,
    embed: true,
  },
];

let seeded = false;

export async function seedBuiltinServices(): Promise<void> {
  if (seeded) return;
  seeded = true;

  const existing = await StreamingServiceRepo.list();
  const existingIds = new Set(existing.map((s) => s.id));

  for (const svc of BUILTIN_SERVICES) {
    if (!existingIds.has(svc.id)) {
      try {
        await StreamingServiceRepo.upsert(svc);
        log.info("streaming:seed", `added builtin ${svc.id}`);
      } catch (err) {
        log.error("streaming:seed", `failed to add ${svc.id}: ${err}`);
      }
    }
  }
}

export function detectDesktopApp(command: string): boolean {
  try {
    const result = spawnSync("sh", ["-c", `command -v ${command}`], {
      stdio: "ignore",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export async function getStreamingServices(
  category: string,
): Promise<StreamingService[]> {
  await seedBuiltinServices();
  const services = await StreamingServiceRepo.listByCategory(category);

  // Mark desktop app availability
  return services.map((s) => ({
    ...s,
    desktopAvailable: s.desktopApp ? detectDesktopApp(s.desktopApp) : false,
  })) as StreamingService[] & { desktopAvailable?: boolean }[];
}

export async function getAllStreamingServices(): Promise<StreamingService[]> {
  await seedBuiltinServices();
  return StreamingServiceRepo.list();
}

export async function addCustomService(
  service: Omit<StreamingService, "isBuiltin" | "sortOrder">,
): Promise<StreamingService> {
  const full: StreamingService = {
    ...service,
    isBuiltin: false,
    sortOrder: 100,
  };
  await StreamingServiceRepo.upsert(full);
  return full;
}

export async function updateService(
  service: StreamingService,
): Promise<void> {
  await StreamingServiceRepo.upsert(service);
}

export async function deleteService(id: string): Promise<void> {
  await StreamingServiceRepo.delete(id);
}

export async function setServiceEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  await StreamingServiceRepo.setEnabled(id, enabled);
}
