import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Game, GamePlatform } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const HEROIC_FLATPAK_ID = "com.heroicgameslauncher.hgl";

interface HeroicPaths {
  libraryGog: string;
  libraryEpic: string;
  imagesDir: string;
}

function getHeroicPaths(): HeroicPaths[] {
  const paths: HeroicPaths[] = [];

  // Native install
  const nativeConfig = join(homedir(), ".config", "heroic");
  paths.push({
    libraryGog: join(nativeConfig, "gog_store", "library.json"),
    libraryEpic: join(nativeConfig, "store", "library.json"),
    imagesDir: join(homedir(), ".cache", "heroic", "images"),
  });

  // Flatpak install
  const flatpakConfig = join(
    homedir(),
    ".var",
    "app",
    HEROIC_FLATPAK_ID,
    "config",
    "heroic",
  );
  paths.push({
    libraryGog: join(flatpakConfig, "gog_store", "library.json"),
    libraryEpic: join(flatpakConfig, "store", "library.json"),
    imagesDir: join(
      homedir(),
      ".var",
      "app",
      HEROIC_FLATPAK_ID,
      "cache",
      "heroic",
      "images",
    ),
  });

  return paths;
}

interface HeroicGame {
  app_name: string;
  title: string;
  install?: { executable?: string; platform?: string };
  art_cover?: string;
  art_square?: string;
  art_background?: string;
  developer?: string;
  extra?: { about?: { longDescription?: string } };
  store?: string;
}

function coverFor(game: HeroicGame, imagesDir: string): string | undefined {
  const paths = [
    game.art_square,
    game.art_cover,
    join(imagesDir, `${game.app_name}.jpg`),
    join(imagesDir, `${game.app_name}.png`),
  ].filter((p): p is string => !!p && existsSync(p));
  return paths[0] ? `ember://media/${paths[0]}` : undefined;
}

function parseLibrary(
  path: string,
  platform: GamePlatform,
  imagesDir: string,
): Game[] {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    const library: HeroicGame[] = data.games ?? data.library ?? [];
    return library
      .filter((g) => {
        const exe = g.install?.executable;
        if (!exe) return false;
        return existsSync(exe);
      })
      .map((g) => ({
        id: `heroic_${g.app_name}`,
        title: g.title,
        platform,
        execPath: g.install?.executable,
        coverUrl: coverFor(g, imagesDir),
        developer: g.developer,
        description: g.extra?.about?.longDescription,
        tags: [],
      }));
  } catch {
    log.error("parseLibrary", `Failed to parse Heroic library: ${path}`);
    return [];
  }
}

export function scanHeroicGames(): Game[] {
  const seen = new Set<string>();
  const games: Game[] = [];

  for (const paths of getHeroicPaths()) {
    for (const game of parseLibrary(paths.libraryGog, "gog", paths.imagesDir)) {
      if (!seen.has(game.id)) {
        seen.add(game.id);
        games.push(game);
      }
    }
    for (const game of parseLibrary(
      paths.libraryEpic,
      "desktop",
      paths.imagesDir,
    )) {
      if (!seen.has(game.id)) {
        seen.add(game.id);
        games.push(game);
      }
    }
  }

  return games;
}

const LUTRIS_GAMES_DIR = join(homedir(), ".local", "share", "lutris", "games");

export function scanLutrisGames(): Game[] {
  if (!existsSync(LUTRIS_GAMES_DIR)) return [];
  const games: Game[] = [];
  let entries: string[];
  try {
    entries = readdirSync(LUTRIS_GAMES_DIR);
  } catch {
    log.error("scanLutrisGames", "Failed to read Lutris games directory");
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const data = JSON.parse(
        readFileSync(join(LUTRIS_GAMES_DIR, entry), "utf-8"),
      );
      if (!data.name) continue;
      if (!data.exe || !existsSync(data.exe)) continue;
      games.push({
        id: `lutris_${data.slug ?? entry}`,
        title: data.name,
        platform: "desktop",
        execPath: data.exe,
        coverUrl: data.banner
          ? `ember://media/${join(homedir(), ".cache", "lutris", "coverart", `${data.slug}.jpg`)}`
          : undefined,
        tags: [],
      });
    } catch {
      log.error("scanLutrisGames", `Failed to parse Lutris game: ${entry}`);
      continue;
    }
  }

  return games;
}
