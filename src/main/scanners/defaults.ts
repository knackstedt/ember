import { existsSync, readdirSync } from "fs";
import { promises as fsPromises } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getXdgDesktopDirs } from "./xdg";

export interface DefaultScanSources {
  roms: string[];
  steam: string[];
  heroic: string[];
  lutris: string[];
  desktop: string[];
}

function resolveCaseInsensitive(
  basePath: string,
  ...segments: string[]
): string | null {
  let current = basePath;
  for (const segment of segments) {
    if (!existsSync(current)) return null;
    const entries = readdirSync(current);
    const match = entries.find((e: string) => e.toLowerCase() === segment.toLowerCase());
    if (!match) return null;
    current = join(current, match);
  }
  return current;
}

async function resolveCaseInsensitiveAsync(
  basePath: string,
  ...segments: string[]
): Promise<string | null> {
  let current = basePath;
  for (const segment of segments) {
    try {
      await fsPromises.access(current);
    } catch {
      return null;
    }
    const entries = await fsPromises.readdir(current);
    const match = entries.find((e: string) => e.toLowerCase() === segment.toLowerCase());
    if (!match) return null;
    current = join(current, match);
  }
  return current;
}

export function getDefaultScanSources(): DefaultScanSources {
  const home = homedir();
  
  const sources: DefaultScanSources = {
    roms: [
      join(home, "Roms"),
      join(home, "Games"),
    ],
    steam: [
      join(home, ".steam", "steam"),
      join(home, ".local", "share", "Steam"),
      "/usr/share/steam",
    ],
    heroic: [
      join(home, ".config", "heroic"),
      join(home, ".var", "app", "com.heroicgameslauncher.hgl", "config", "heroic"),
    ],
    lutris: [join(home, ".local", "share", "lutris", "games")],
    desktop: getXdgDesktopDirs(),
  };

  // Add Dolphin-specific ROM paths
  const dolphinRomDirs: (string | null)[] = [
    resolveCaseInsensitive(home, "Games", "GameCube"),
    resolveCaseInsensitive(home, "Games", "Wii"),
    resolveCaseInsensitive(home, "Roms", "GameCube"),
    resolveCaseInsensitive(home, "Roms", "Wii"),
    "/mnt/games/GameCube",
    "/mnt/games/Wii",
  ];
  sources.roms.push(...dolphinRomDirs.filter((d): d is string => d !== null));

  // Remove duplicates from roms (case-insensitive)
  const seen = new Set<string>();
  sources.roms = sources.roms.filter(path => {
    const lower = path.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  return sources;
}

export async function getDefaultScanSourcesAsync(): Promise<DefaultScanSources> {
  const home = homedir();
  
  const sources: DefaultScanSources = {
    roms: [
      join(home, "Roms"),
      join(home, "Games"),
    ],
    steam: [
      join(home, ".steam", "steam"),
      join(home, ".local", "share", "Steam"),
      "/usr/share/steam",
    ],
    heroic: [
      join(home, ".config", "heroic"),
      join(home, ".var", "app", "com.heroicgameslauncher.hgl", "config", "heroic"),
    ],
    lutris: [join(home, ".local", "share", "lutris", "games")],
    desktop: getXdgDesktopDirs(),
  };

  // Add Dolphin-specific ROM paths asynchronously
  const dolphinRomDirs: (string | null)[] = [
    await resolveCaseInsensitiveAsync(home, "Games", "GameCube"),
    await resolveCaseInsensitiveAsync(home, "Games", "Wii"),
    await resolveCaseInsensitiveAsync(home, "Roms", "GameCube"),
    await resolveCaseInsensitiveAsync(home, "Roms", "Wii"),
    "/mnt/games/GameCube",
    "/mnt/games/Wii",
  ];
  sources.roms.push(...dolphinRomDirs.filter((d): d is string => d !== null));

  // Remove duplicates from roms (case-insensitive)
  const seen = new Set<string>();
  sources.roms = sources.roms.filter(path => {
    const lower = path.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  return sources;
}
