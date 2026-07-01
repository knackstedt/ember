import { existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { getXdgDesktopDirs } from "./xdg";
import { Game } from "../../shared/types";
import { resolveSourceLocation } from "../../shared/path-utils";
import { detectGameInfo } from "../services/game-detection.service";

interface DesktopEntry {
  Name?: string;
  Exec?: string;
  Icon?: string;
  Categories?: string;
  Comment?: string;
  NoDisplay?: string;
  Hidden?: string;
}

function parseDesktopFile(content: string): DesktopEntry {
  const entry: DesktopEntry = {};
  for (const line of content.split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim() as keyof DesktopEntry;
    const value = line.slice(eq + 1).trim();
    entry[key] = value;
  }
  return entry;
}

function resolveExec(exec: string): string {
  return exec
    .replace(/%[uUfFdDnNickvm]/g, "")
    .replace(/^"(.+)"$/, "$1")
    .trim()
    .split(" ")[0];
}

function isGameCategory(categories?: string): boolean {
  if (!categories) return false;
  const cats = categories.split(";").map((c) => c.toLowerCase());
  return cats.some((c) => c === "game" || c === "games");
}

function isSteamTool(name: string): boolean {
  if (/^Proton(?:\s+|-)(?:\d+(?:\.\d+)?|Experimental|Hotfix|EasyAntiCheat|GE)/i.test(name)) return true;
  if (/Steam Linux Runtime/i.test(name)) return true;
  if (/Steamworks/i.test(name)) return true;
  if (/^Steam\s+Runtime/i.test(name)) return true;
  if (/^Friends$/i.test(name)) return true;
  if (/^Steam$/i.test(name)) return true;
  return false;
}

function isSteamUiAction(exec?: string): boolean {
  if (!exec) return false;
  const bin = exec.split(/\s+/)[0]?.toLowerCase();
  if (!bin) return false;
  const isSteamBin = /steam$/.test(bin) || bin.includes("steam");
  return isSteamBin && /steam:\/\//.test(exec);
}

export function scanDesktopGames(): Game[] {
  const dirs = getXdgDesktopDirs();
  const games: Game[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".desktop")) continue;
      const fullPath = join(dir, entry);
      if (seen.has(fullPath)) continue;
      seen.add(fullPath);

      try {
        const content = readFileSync(fullPath, "utf-8");
        const data = parseDesktopFile(content);

        if (data.NoDisplay === "true" || data.Hidden === "true") continue;
        if (!isGameCategory(data.Categories)) continue;
        if (!data.Name || !data.Exec) continue;
        if (isSteamTool(data.Name)) continue;
        if (isSteamUiAction(data.Exec)) continue;

        const execBin = resolveExec(data.Exec);
        if (!execBin || !existsSync(execBin)) continue;

        const installDir = dirname(execBin);
        const detection = detectGameInfo(installDir, execBin);

        let coverUrl: string | undefined;
        if (data.Icon) {
          const iconPaths = [
            data.Icon,
            `/usr/share/pixmaps/${data.Icon}.png`,
            `/usr/share/icons/hicolor/256x256/apps/${data.Icon}.png`,
            `/usr/share/icons/hicolor/128x128/apps/${data.Icon}.png`,
          ];
          coverUrl = iconPaths.find(existsSync);
          if (coverUrl) coverUrl = `ember://media/${coverUrl}`;
        }

        games.push({
          id: `desktop_${Buffer.from(fullPath).toString("base64").slice(0, 16)}`,
          title: data.Name,
          platform: "desktop",
          execPath: data.Exec,
          coverUrl,
          description: data.Comment,
          tags: [],
          sourceLocation: resolveSourceLocation(data.Exec),
          source: "desktop",
          osPlatform: detection.osPlatform,
          engine: detection.engine,
          engineVersion: detection.engineVersion,
          graphicsApi: detection.graphicsApi,
          entrypoints: detection.entrypoints.length > 0 ? detection.entrypoints : undefined,
        });
      } catch {
        continue;
      }
    }
  }

  return games;
}
