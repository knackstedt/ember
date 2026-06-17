import { parentPort } from "worker_threads";
import { scanSteamGames } from "../scanners/steam.scanner";
import { scanDolphinGames } from "../scanners/dolphin.scanner";
import { scanDesktopGames } from "../scanners/desktop.scanner";
import { scanHeroicGames, scanLutrisGames } from "../scanners/heroic.scanner";
import { scanFlashGames } from "../scanners/flash.scanner";
import { scanRomGames } from "../scanners/rom.scanner";
import { scanV86Games } from "../scanners/v86.scanner";
import { scanWindowsGames } from "../scanners/windows.scanner";

parentPort?.once("message", ({ extraPaths, romPaths, gamePaths }: { extraPaths?: string[]; romPaths?: string[]; gamePaths?: string[] } = {}) => {
  try {
    const dolphinExtra = [...(gamePaths ?? []), ...(romPaths ?? [])];

    parentPort?.postMessage({
      type: "progress",
      scanner: "steam",
      current: 0,
      total: 0,
      status: "scanning",
    });
    const steam = scanSteamGames();
    parentPort?.postMessage({
      type: "progress",
      scanner: "steam",
      current: steam.length,
      total: steam.length,
      status: "done",
    });

    parentPort?.postMessage({
      type: "progress",
      scanner: "dolphin",
      current: 0,
      total: 0,
      status: "scanning",
    });
    const dolphin = scanDolphinGames(dolphinExtra);
    parentPort?.postMessage({
      type: "progress",
      scanner: "dolphin",
      current: dolphin.length,
      total: dolphin.length,
      status: "done",
    });

    const heroic = scanHeroicGames();
    const lutris = scanLutrisGames();
    const desktop = scanDesktopGames();
    const flash = scanFlashGames();
    const roms = scanRomGames(romPaths);
    const v86 = scanV86Games();
    const windows = scanWindowsGames();

    parentPort?.postMessage({
      type: "result",
      games: [...steam, ...dolphin, ...heroic, ...lutris, ...desktop, ...flash, ...roms, ...v86, ...windows],
    });
  } catch (err) {
    parentPort?.postMessage({ type: "error", error: (err as Error).message });
  }
});
