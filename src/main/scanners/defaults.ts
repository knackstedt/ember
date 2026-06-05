import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { promises as fsPromises } from "fs";
import { join } from "path";
import { homedir, userInfo } from "os";
import { getXdgDesktopDirs } from "./xdg";

export interface DefaultScanSources {
  roms: string[];
  steam: string[];
  heroic: string[];
  lutris: string[];
  desktop: string[];
  retroarch: string[];
  bottles: string[];
  itch: string[];
  kodi: string[];
  jellyfin: string[];
  plex: string[];
  mounts: string[];
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

function parseRetroarchContentDir(): string | null {
  const cfgPath = join(homedir(), ".config", "retroarch", "retroarch.cfg");
  if (!existsSync(cfgPath)) return null;
  try {
    const content = readFileSync(cfgPath, "utf-8");
    const match = content.match(/content_directory\s*=\s*"([^"]+)"/);
    if (match && match[1]) {
      const dir = match[1].trim();
      if (existsSync(dir)) return dir;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function parseRetroarchContentDirAsync(): Promise<string | null> {
  const cfgPath = join(homedir(), ".config", "retroarch", "retroarch.cfg");
  try {
    await fsPromises.access(cfgPath);
    const content = await fsPromises.readFile(cfgPath, "utf-8");
    const match = content.match(/content_directory\s*=\s*"([^"]+)"/);
    if (match && match[1]) {
      const dir = match[1].trim();
      try {
        await fsPromises.access(dir);
        return dir;
      } catch {
        return null;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parseKodiSources(): string[] {
  const sourcesPath = join(homedir(), ".kodi", "userdata", "sources.xml");
  if (!existsSync(sourcesPath)) return [];
  try {
    const content = readFileSync(sourcesPath, "utf-8");
    const paths: string[] = [];
    const regex = /<path[^>]*>(?:<!\[CDATA\[)?([^\]]+?)(?:\]\]>)?<\/path>/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const p = m[1].trim();
      if (p && existsSync(p) && !paths.includes(p)) {
        paths.push(p);
      }
    }
    return paths;
  } catch {
    return [];
  }
}

async function parseKodiSourcesAsync(): Promise<string[]> {
  const sourcesPath = join(homedir(), ".kodi", "userdata", "sources.xml");
  try {
    await fsPromises.access(sourcesPath);
    const content = await fsPromises.readFile(sourcesPath, "utf-8");
    const paths: string[] = [];
    const regex = /<path[^>]*>(?:<!\[CDATA\[)?([^\]]+?)(?:\]\]>)?<\/path>/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const p = m[1].trim();
      try {
        await fsPromises.access(p);
        if (!paths.includes(p)) paths.push(p);
      } catch {
        /* skip */
      }
    }
    return paths;
  } catch {
    return [];
  }
}

function scanMountsOneLevelDeep(): string[] {
  const username = userInfo().username;
  const roots = [
    "/mnt",
    `/media/${username}`,
    `/run/media/${username}`,
  ];

  const results: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    try {
      const entries = readdirSync(root);
      for (const entry of entries) {
        const fullPath = join(root, entry);
        try {
          if (statSync(fullPath).isDirectory()) {
            results.push(fullPath);
          }
        } catch {
          /* ignore permission errors */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return results;
}

async function scanMountsOneLevelDeepAsync(): Promise<string[]> {
  const username = userInfo().username;
  const roots = [
    "/mnt",
    `/media/${username}`,
    `/run/media/${username}`,
  ];

  const results: string[] = [];
  for (const root of roots) {
    try {
      await fsPromises.access(root);
      const entries = await fsPromises.readdir(root);
      for (const entry of entries) {
        const fullPath = join(root, entry);
        try {
          const stat = await fsPromises.stat(fullPath);
          if (stat.isDirectory()) {
            results.push(fullPath);
          }
        } catch {
          /* ignore permission errors */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return results;
}

function buildBaseSources(home: string): DefaultScanSources {
  return {
    roms: [
      join(home, "Roms"),
      join(home, "Games"),
      join(home, "Emulation", "roms"),
      join(home, "retropie", "roms"),
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
    retroarch: [],
    bottles: [join(home, ".local", "share", "bottles")],
    itch: [join(home, ".config", "itch")],
    kodi: [],
    jellyfin: [
      join(home, ".config", "jellyfin"),
      "/var/lib/jellyfin",
    ],
    plex: [join(home, ".local", "share", "Plex Media Server")],
    mounts: [],
  };
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const lower = path.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

export function getDefaultScanSources(): DefaultScanSources {
  const home = homedir();

  const sources = buildBaseSources(home);

  // RetroArch content_directory from config
  const retroarchDir = parseRetroarchContentDir();
  if (retroarchDir) sources.retroarch.push(retroarchDir);

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

  // Parse Kodi sources.xml
  sources.kodi.push(...parseKodiSources());

  // Scan mount points one level deep
  sources.mounts.push(...scanMountsOneLevelDeep());

  // Filter to existing paths
  sources.roms = sources.roms.filter(existsSync);
  sources.steam = sources.steam.filter(existsSync);
  sources.heroic = sources.heroic.filter(existsSync);
  sources.lutris = sources.lutris.filter(existsSync);
  sources.desktop = sources.desktop.filter(existsSync);
  sources.retroarch = sources.retroarch.filter(existsSync);
  sources.bottles = sources.bottles.filter(existsSync);
  sources.itch = sources.itch.filter(existsSync);
  sources.jellyfin = sources.jellyfin.filter(existsSync);
  sources.plex = sources.plex.filter(existsSync);

  // Remove duplicates from roms (case-insensitive)
  sources.roms = dedupePaths(sources.roms);

  return sources;
}

export async function getDefaultScanSourcesAsync(): Promise<DefaultScanSources> {
  const home = homedir();

  const sources = buildBaseSources(home);

  // RetroArch content_directory from config
  const retroarchDir = await parseRetroarchContentDirAsync();
  if (retroarchDir) sources.retroarch.push(retroarchDir);

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

  // Parse Kodi sources.xml
  sources.kodi.push(...(await parseKodiSourcesAsync()));

  // Scan mount points one level deep
  sources.mounts.push(...(await scanMountsOneLevelDeepAsync()));

  // Filter to existing paths asynchronously
  const filterExists = async (paths: string[]) => {
    const results = await Promise.all(
      paths.map(async (p) => {
        try {
          await fsPromises.access(p);
          return p;
        } catch {
          return null;
        }
      })
    );
    return results.filter((p): p is string => p !== null);
  };

  sources.roms = dedupePaths(await filterExists(sources.roms));
  sources.steam = await filterExists(sources.steam);
  sources.heroic = await filterExists(sources.heroic);
  sources.lutris = await filterExists(sources.lutris);
  sources.desktop = await filterExists(sources.desktop);
  sources.retroarch = await filterExists(sources.retroarch);
  sources.bottles = await filterExists(sources.bottles);
  sources.itch = await filterExists(sources.itch);
  sources.jellyfin = await filterExists(sources.jellyfin);
  sources.plex = await filterExists(sources.plex);

  return sources;
}
