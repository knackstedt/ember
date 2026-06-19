import { spawn, spawnSync } from "child_process";
import { existsSync, rmSync, unlinkSync, statSync } from "fs";
import { shell } from "electron";
import { Game, Movie, MusicTrack } from "../../shared/types";
import { createLogger } from "../util/logger";
import { GameRepo, MovieRepo, MusicRepo } from "../db/repository";

const log = createLogger("info");

export interface UninstallResult {
  success: boolean;
  error?: string;
  method?: string;
}

function findSteamCommand(): { cmd: string; args: string[]; isFlatpak: boolean } | null {
  const steamInPath = spawnSync("sh", ["-c", "command -v steam"], { stdio: "ignore" });
  if (steamInPath.status === 0) {
    return { cmd: "steam", args: [], isFlatpak: false };
  }
  const flatpakInPath = spawnSync("sh", ["-c", "command -v flatpak"], { stdio: "ignore" });
  if (flatpakInPath.status === 0) {
    const flatpakCheck = spawnSync("flatpak", ["info", "com.valvesoftware.Steam"], { stdio: "ignore" });
    if (flatpakCheck.status === 0) {
      return { cmd: "flatpak", args: ["run", "com.valvesoftware.Steam"], isFlatpak: true };
    }
  }
  return null;
}

function findHeroicCommand(): { cmd: string; args: string[]; isFlatpak: boolean } | null {
  const heroicInPath = spawnSync("sh", ["-c", "command -v heroic"], { stdio: "ignore" });
  if (heroicInPath.status === 0) {
    return { cmd: "heroic", args: [], isFlatpak: false };
  }
  const flatpakInPath = spawnSync("sh", ["-c", "command -v flatpak"], { stdio: "ignore" });
  if (flatpakInPath.status === 0) {
    const flatpakCheck = spawnSync("flatpak", ["info", "com.heroicgameslauncher.hgl"], { stdio: "ignore" });
    if (flatpakCheck.status === 0) {
      return { cmd: "flatpak", args: ["run", "com.heroicgameslauncher.hgl"], isFlatpak: true };
    }
  }
  return null;
}

function findLutrisCommand(): { cmd: string; args: string[]; isFlatpak: boolean } | null {
  const lutrisInPath = spawnSync("sh", ["-c", "command -v lutris"], { stdio: "ignore" });
  if (lutrisInPath.status === 0) {
    return { cmd: "lutris", args: [], isFlatpak: false };
  }
  const flatpakInPath = spawnSync("sh", ["-c", "command -v flatpak"], { stdio: "ignore" });
  if (flatpakInPath.status === 0) {
    const flatpakCheck = spawnSync("flatpak", ["info", "net.lutris.Lutris"], { stdio: "ignore" });
    if (flatpakCheck.status === 0) {
      return { cmd: "flatpak", args: ["run", "net.lutris.Lutris"], isFlatpak: true };
    }
  }
  return null;
}

function findItchCommand(): { cmd: string; args: string[]; isFlatpak: boolean } | null {
  const itchInPath = spawnSync("sh", ["-c", "command -v itch"], { stdio: "ignore" });
  if (itchInPath.status === 0) {
    return { cmd: "itch", args: [], isFlatpak: false };
  }
  const flatpakInPath = spawnSync("sh", ["-c", "command -v flatpak"], { stdio: "ignore" });
  if (flatpakInPath.status === 0) {
    const flatpakCheck = spawnSync("flatpak", ["info", "io.itch.itch"], { stdio: "ignore" });
    if (flatpakCheck.status === 0) {
      return { cmd: "flatpak", args: ["run", "io.itch.itch"], isFlatpak: true };
    }
  }
  return null;
}

function runLauncher(cmd: string, args: string[]): void {
  const proc = spawn(cmd, args, { detached: true, stdio: "ignore" });
  proc.on("error", (err) => {
    log.warn("uninstall", `Failed to spawn ${cmd}: ${err.message}`);
  });
  proc.unref();
}

function resolveLocalPath(game: Game): string | undefined {
  if (game.compressedRomPath && existsSync(game.compressedRomPath)) {
    return game.compressedRomPath;
  }
  if (game.romPath) return game.romPath;
  if (!game.execPath) return undefined;
  if (/^\w+:\/\//.test(game.execPath)) return undefined;
  const cleaned = game.execPath.replace(/%[uUfFdDnNickvm]/g, "").trim();
  const quoted = cleaned.match(/^"(.+)"$/);
  if (quoted) return quoted[1];
  return cleaned.split(/\s+/)[0];
}

async function trashPath(path: string): Promise<void> {
  try {
    await shell.trashItem(path);
    log.info("uninstall", `Moved to trash: ${path}`);
    return;
  } catch (err: any) {
    log.warn("uninstall", `shell.trashItem failed for ${path}: ${err.message}; falling back to delete`);
  }

  try {
    const st = statSync(path);
    if (st.isDirectory()) {
      rmSync(path, { recursive: true, force: true });
    } else {
      unlinkSync(path);
    }
    log.info("uninstall", `Deleted: ${path}`);
  } catch (err: any) {
    throw new Error(`Failed to delete ${path}: ${err.message}`);
  }
}

async function deleteGameFiles(game: Game): Promise<void> {
  const target = resolveLocalPath(game);
  if (!target) {
    throw new Error("No local install path found for this game");
  }
  if (!existsSync(target)) {
    throw new Error(`Install path not found: ${target}`);
  }
  await trashPath(target);
}

function uninstallSteamGame(game: Game): UninstallResult {
  if (!game.steamAppId) {
    return { success: false, error: "Steam AppID missing" };
  }
  const steam = findSteamCommand();
  if (!steam) {
    return { success: false, error: "Steam not found" };
  }
  const url = `steam://uninstall/${game.steamAppId}`;
  runLauncher(steam.cmd, [...steam.args, url]);
  log.info("uninstall", `Triggered Steam uninstall for ${game.title} (${game.steamAppId})`);
  return { success: true, method: "steam" };
}

function uninstallHeroicGame(game: Game): UninstallResult {
  const match = game.id.match(/^heroic_(.+)$/);
  if (!match) {
    return { success: false, error: "Not a Heroic game ID" };
  }
  const appName = match[1];
  const runner = game.platform === "gog" ? "gog" : "legendary";
  const heroic = findHeroicCommand();
  if (!heroic) {
    return { success: false, error: "Heroic not found" };
  }
  const url = `heroic://uninstall/${runner}/${appName}`;
  runLauncher(heroic.cmd, [...heroic.args, url]);
  log.info("uninstall", `Triggered Heroic uninstall for ${game.title} (${runner}/${appName})`);
  return { success: true, method: "heroic" };
}

function uninstallLutrisGame(game: Game): UninstallResult {
  const match = game.id.match(/^lutris_(.+)$/);
  if (!match) {
    return { success: false, error: "Not a Lutris game ID" };
  }
  const slug = match[1];
  const lutris = findLutrisCommand();
  if (!lutris) {
    return { success: false, error: "Lutris not found" };
  }
  runLauncher(lutris.cmd, [...lutris.args, "--uninstall", slug]);
  log.info("uninstall", `Triggered Lutris uninstall for ${game.title} (${slug})`);
  return { success: true, method: "lutris" };
}

function uninstallItchGame(game: Game): UninstallResult {
  const match = game.id.match(/^itch_(.+)$/);
  if (!match) {
    return { success: false, error: "Not an itch.io game ID" };
  }
  const itchId = match[1];
  const itch = findItchCommand();
  if (itch) {
    runLauncher(itch.cmd, [...itch.args, "uninstall", itchId]);
    log.info("uninstall", `Triggered itch.io uninstall for ${game.title} (${itchId})`);
    return { success: true, method: "itch" };
  }
  log.info("uninstall", `itch.io launcher not found; deleting install dir for ${game.title}`);
  return { success: true, method: "files" };
}

export async function uninstallGame(game: Game): Promise<UninstallResult> {
  try {
    let result: UninstallResult;
    if (game.id.startsWith("steam_")) {
      result = uninstallSteamGame(game);
    } else if (game.id.startsWith("heroic_")) {
      result = uninstallHeroicGame(game);
    } else if (game.id.startsWith("lutris_")) {
      result = uninstallLutrisGame(game);
    } else if (game.id.startsWith("itch_")) {
      result = uninstallItchGame(game);
      if (result.method === "files" && result.success) {
        await deleteGameFiles(game);
      }
    } else {
      await deleteGameFiles(game);
      result = { success: true, method: "files" };
    }

    if (result.success) {
      await GameRepo.delete(game.id);
    }
    return result;
  } catch (err: any) {
    log.error("uninstall", `Failed to uninstall ${game.title}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function uninstallMovie(movie: Movie): Promise<UninstallResult> {
  try {
    if (!movie.filePath) {
      return { success: false, error: "No file path" };
    }
    if (!existsSync(movie.filePath)) {
      return { success: false, error: `File not found: ${movie.filePath}` };
    }
    await trashPath(movie.filePath);
    await MovieRepo.delete(movie.id);
    return { success: true, method: "files" };
  } catch (err: any) {
    log.error("uninstall", `Failed to uninstall movie ${movie.title}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function uninstallMusic(track: MusicTrack): Promise<UninstallResult> {
  try {
    if (!track.filePath) {
      return { success: false, error: "No file path" };
    }
    if (!existsSync(track.filePath)) {
      return { success: false, error: `File not found: ${track.filePath}` };
    }
    await trashPath(track.filePath);
    await MusicRepo.delete(track.id);
    return { success: true, method: "files" };
  } catch (err: any) {
    log.error("uninstall", `Failed to uninstall track ${track.title}: ${err.message}`);
    return { success: false, error: err.message };
  }
}
