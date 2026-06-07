import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { Game } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

/** Where itch app stores its data */
const ITCH_CONFIG_DIR = join(homedir(), ".config", "itch");
const ITCH_DB_PATH = join(ITCH_CONFIG_DIR, "db.json");

let butlerPathCache: string | null | undefined = undefined;

function findButler(): string | null {
  if (butlerPathCache !== undefined) return butlerPathCache;

  // Check PATH
  const inPath = spawnSync("sh", ["-c", "command -v butler"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (inPath.status === 0 && inPath.stdout.trim()) {
    butlerPathCache = inPath.stdout.trim();
    return butlerPathCache;
  }

  // Check itch app bundled butler
  const bundledPaths = [
    join(homedir(), ".config", "itch", "apps", "butler", "butler"),
    join(homedir(), ".local", "share", "itch", "apps", "butler", "butler"),
    "/opt/itch/resources/app/node_modules/butler/butler",
    join(homedir(), "Applications", "itch.app", "Contents", "Resources", "app", "node_modules", "butler", "butler"),
  ];
  for (const p of bundledPaths) {
    if (existsSync(p)) {
      butlerPathCache = p;
      return butlerPathCache;
    }
  }

  butlerPathCache = null;
  return null;
}

function butlerExec(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const butler = findButler();
  if (!butler) {
    return Promise.reject(new Error("butler not found. Install the itch app or butler CLI."));
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(butler, args, { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

export interface ItchAuthStatus {
  authenticated: boolean;
  username?: string;
  error?: string;
}

export interface ItchLibraryGame {
  id: string;
  title: string;
  coverUrl?: string;
  developer?: string;
  installed?: boolean;
  installPath?: string;
  execPath?: string;
  version?: string;
}

export interface ItchInstallOptions {
  gameId: string;
  title: string;
}

/** Check if butler is available */
export function isButlerAvailable(): boolean {
  return findButler() !== null;
}

/** Get itch auth status via butler */
export async function getItchAuthStatus(): Promise<ItchAuthStatus> {
  try {
    const { stdout, stderr, code } = await butlerExec(["status", "--json"]);
    if (code !== 0) {
      // Try parsing anyway; butler may still print JSON on stderr
      const data = parseJsonOut(stdout) || parseJsonOut(stderr);
      if (data?.user) {
        return { authenticated: true, username: data.user.username };
      }
      return { authenticated: false, error: stderr || `butler exited ${code}` };
    }
    const data = parseJsonOut(stdout);
    if (data?.user) {
      return { authenticated: true, username: data.user.username };
    }
    return { authenticated: false };
  } catch (err: any) {
    return { authenticated: false, error: err.message };
  }
}

/** Trigger butler login (opens browser OAuth) */
export async function itchLogin(): Promise<{ success: boolean; error?: string }> {
  try {
    const { stdout, stderr, code } = await butlerExec(["login"]);
    if (code !== 0) {
      return { success: false, error: stderr || `butler exited ${code}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Logout from itch */
export async function itchLogout(): Promise<{ success: boolean; error?: string }> {
  try {
    const { stdout, stderr, code } = await butlerExec(["logout"]);
    if (code !== 0) {
      return { success: false, error: stderr || `butler exited ${code}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** List installed itch games from itch app DB */
export function listInstalledItchGames(): Game[] {
  const games: Game[] = [];

  if (!existsSync(ITCH_DB_PATH)) {
    return games;
  }

  try {
    const db = JSON.parse(readFileSync(ITCH_DB_PATH, "utf-8"));
    const caves: Record<string, any> = db.caves ?? {};
    for (const caveId of Object.keys(caves)) {
      const cave = caves[caveId];
      const upload = cave.upload ?? {};
      const game = cave.game ?? {};
      const installInfo = cave.installInfo ?? {};
      const path = installInfo?.installedToUrn
        ? installInfo.installedToUrn.replace("disk+", "").replace(/\+/g, "/")
        : installInfo?.installPath;
      if (!path || !existsSync(path)) continue;

      const exe = findExecutableInInstall(path);
      if (!exe) continue;

      games.push({
        id: `itch_${game.id ?? caveId}`,
        title: game.title ?? "Unknown",
        platform: "itch",
        execPath: exe,
        coverUrl: game.coverUrl,
        developer: game.user?.displayName ?? game.user?.username,
        tags: [],
      });
    }
  } catch (err: any) {
    log.error("itch", `Failed to read itch DB: ${err.message}`);
  }

  return games;
}

/** List owned games from butler */
export async function listItchLibrary(): Promise<ItchLibraryGame[]> {
  try {
    // butler doesn't have a direct "library" command, but we can use the API via butler
    // or read from itch app's profile data. For now, return installed games as library.
    const installed = listInstalledItchGames();
    return installed.map((g) => ({
      id: g.id,
      title: g.title,
      coverUrl: g.coverUrl,
      developer: g.developer,
      installed: true,
      installPath: dirname(g.execPath!),
      execPath: g.execPath,
    }));
  } catch (err: any) {
    log.error("itch", `listLibrary error: ${err.message}`);
    return [];
  }
}

/** Install a game by itch game ID / URL */
export async function installItchGame(gameId: string, _title: string): Promise<{ success: boolean; error?: string; installPath?: string }> {
  try {
    // Try to use butler install if available; otherwise guide user to itch app
    const { stdout, stderr, code } = await butlerExec(["install", gameId]);
    if (code !== 0) {
      return { success: false, error: stderr || `butler install exited ${code}` };
    }
    // Parse install path from stdout if possible
    const pathMatch = stdout.match(/installed to (.+)/i);
    return { success: true, installPath: pathMatch ? pathMatch[1].trim() : undefined };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Uninstall an itch game */
export async function uninstallItchGame(gameId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { stdout, stderr, code } = await butlerExec(["uninstall", gameId]);
    if (code !== 0) {
      return { success: false, error: stderr || `butler uninstall exited ${code}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Launch an itch game via butler or direct exec */
export async function launchItchGame(game: Game): Promise<{ success: boolean; error?: string }> {
  if (!game.execPath) {
    return { success: false, error: "No executable path for itch game" };
  }

  // Prefer butler launch if available
  try {
    const rawId = game.id.replace("itch_", "");
    const { stderr, code } = await butlerExec(["launch", rawId]);
    if (code === 0) {
      return { success: true };
    }
    // Fall back to direct exec if butler launch fails
    log.warn("itch", `butler launch failed (${code}), falling back to direct exec: ${stderr}`);
  } catch {
    // butler launch not available, fall back
  }

  // Direct exec fallback
  try {
    const proc = spawn(game.execPath, [], {
      detached: true,
      stdio: "ignore",
      cwd: dirname(game.execPath),
    });
    proc.on("error", (err) => {
      log.error("itch", `Failed to launch ${game.title}: ${err.message}`);
    });
    proc.unref();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Check for updates for an itch game */
export async function checkItchUpdate(gameId: string): Promise<{ updateAvailable: boolean; latestVersion?: string; error?: string }> {
  try {
    const rawId = gameId.replace("itch_", "");
    const { stdout, stderr, code } = await butlerExec(["upgrade", rawId, "--dry-run"]);
    if (code !== 0) {
      return { updateAvailable: false, error: stderr || `butler upgrade exited ${code}` };
    }
    const data = parseJsonOut(stdout);
    if (data?.updates && data.updates.length > 0) {
      return { updateAvailable: true, latestVersion: data.updates[0].version };
    }
    return { updateAvailable: false };
  } catch (err: any) {
    return { updateAvailable: false, error: err.message };
  }
}

/** Update an itch game */
export async function updateItchGame(gameId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const rawId = gameId.replace("itch_", "");
    const { stdout, stderr, code } = await butlerExec(["upgrade", rawId]);
    if (code !== 0) {
      return { success: false, error: stderr || `butler upgrade exited ${code}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Download a build directly via butler fetch */
export async function downloadItchBuild(downloadUrl: string, destPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { stdout, stderr, code } = await butlerExec(["fetch", downloadUrl, destPath]);
    if (code !== 0) {
      return { success: false, error: stderr || `butler fetch exited ${code}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseJsonOut(text: string): any | null {
  try {
    // butler may emit JSON lines; try to find the last valid JSON object
    const lines = text.trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        return JSON.parse(line);
      } catch {
        continue;
      }
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findExecutableInInstall(dirPath: string): string | null {
  if (!existsSync(dirPath)) return null;
  try {
    const entries = require("fs").readdirSync(dirPath);
    // Look for common executable patterns
    const candidates = entries.filter((e: string) => {
      const lower = e.toLowerCase();
      return lower.endsWith(".exe") || lower.endsWith(".sh") || lower.endsWith(".bin") || (!lower.includes(".") && lower !== "readme" && lower !== "license");
    });
    if (candidates.length > 0) {
      return join(dirPath, candidates[0]);
    }
    // Recurse one level into subdirectories (common for extracted archives)
    for (const entry of entries) {
      const subPath = join(dirPath, entry);
      try {
        const stat = require("fs").statSync(subPath);
        if (stat.isDirectory()) {
          const subExe = findExecutableInInstall(subPath);
          if (subExe) return subExe;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  return null;
}
