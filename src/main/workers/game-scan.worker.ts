import { parentPort } from "worker_threads";
import { scanSteamGames } from "../scanners/steam.scanner";
import { scanDolphinGames } from "../scanners/dolphin.scanner";
import { scanDesktopGames } from "../scanners/desktop.scanner";
import { scanHeroicGames, scanLutrisGames } from "../scanners/heroic.scanner";
import { scanFlashGames } from "../scanners/flash.scanner";
import { scanRomGames } from "../scanners/rom.scanner";
import { scanV86Games } from "../scanners/v86.scanner";
import { scanWindowsGames } from "../scanners/windows.scanner";
import { listInstalledItchGames as scanItchGames } from "../services/itch.service";

parentPort?.once("message", ({
  extraPaths,
  romPaths,
  gamePaths,
  disabledScanSources,
}: {
  extraPaths?: string[];
  romPaths?: string[];
  gamePaths?: string[];
  disabledScanSources?: string[];
} = {}) => {
  try {
    const dolphinExtra = [...(gamePaths ?? []), ...(romPaths ?? [])];
    const disabled = new Set(disabledScanSources ?? []);
    const isEnabled = (source: string) => !disabled.has(source);

    const scanAndReport = (scanner: string, fn: () => any[]): any[] => {
      parentPort?.postMessage({
        type: "progress",
        scanner,
        current: 0,
        total: 0,
        status: "scanning",
      });
      const result = fn();
      parentPort?.postMessage({
        type: "progress",
        scanner,
        current: result.length,
        total: result.length,
        status: "done",
      });
      return result;
    };

    const steam = isEnabled("steam") ? scanAndReport("steam", scanSteamGames) : [];
    const dolphin = isEnabled("dolphin")
      ? scanAndReport("dolphin", () => scanDolphinGames(dolphinExtra))
      : [];
    const heroic = isEnabled("heroic") ? scanHeroicGames() : [];
    const lutris = isEnabled("lutris") ? scanLutrisGames() : [];
    const desktop = isEnabled("desktop") ? scanDesktopGames() : [];
    const flash = isEnabled("flash") ? scanFlashGames() : [];
    const roms = isEnabled("rom") ? scanRomGames(romPaths) : [];
    const v86 = isEnabled("v86") ? scanV86Games(romPaths, gamePaths) : [];
    const windows = isEnabled("windows") ? scanWindowsGames(gamePaths, romPaths) : [];
    const itch = isEnabled("itch") ? scanItchGames() : [];

    parentPort?.postMessage({
      type: "result",
      games: [...steam, ...dolphin, ...heroic, ...lutris, ...desktop, ...flash, ...roms, ...v86, ...windows, ...itch],
    });
  } catch (err) {
    parentPort?.postMessage({ type: "error", error: (err as Error).message });
  }
});
