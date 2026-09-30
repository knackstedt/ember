import { app, ipcMain } from "electron";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import type { Game, GameEmulatorConfig, GameInjectionConfig, ScanSourceId, VulkanShaderConfig, WineRunner } from "../../../shared/types";
import { getDb } from "../../db";
import { BrokenFlashRepo, GameRepo } from "../../db/repository";
import {
    canCompress,
    compressAllRoms,
    compressGame,
    getToolAvailability,
} from "../../services/compression.service";
import {
    createDesktopEntry,
    hasDesktopEntry,
    removeAllDesktopEntries,
    removeDesktopEntry,
} from "../../services/desktop-entry.service";
import { clearInFlight, loadFlashThumbnail } from "../../services/flash-thumbnail.service";
import { performGameScan } from "../../services/game-scan.service";
import { abortLaunch, launchGame, startPlayTimeTracking, stopPlayTimeTracking } from "../../services/launcher.service";
import { isLibretroPlatform, listLocalScreenshots, loadLibretroThumbnail } from "../../services/libretro-thumbnail.service";
import {
    enrichGameMetadata,
    fetchGameMetadata,
    getAvailableProviders,
    getProvidersByType,
    quickMetadataLookup,
    searchGameMetadata,
} from "../../services/metadata";
import { stopActiveGameProcess } from "../../services/overlay.service";
import { getProtonRating } from "../../services/protondb.service";
import { searchGame } from "../../services/rawg.service";
import { scanAllRemoteSources } from "../../services/remote-scan.service";
import { getSettings } from "../../services/settings.service";
import { uninstallGame } from "../../services/uninstall.service";
import { createLogger } from "../../util/logger";
import { destroyWorker, workerCall } from "../index";
import type { IpcContext } from "../types";

const log = createLogger("info");

export function registerGamesHandlers(ctx: IpcContext): void {
  const { window, sendToWindow, sendRemoteProgress, sendScanItem, regenerateLocks } = ctx;

  ipcMain.handle("games:scan", async (_e, extraPaths?: string[]) => {
    await performGameScan(window, extraPaths);
    void scanAllRemoteSources("rom", sendRemoteProgress, sendScanItem);
    sendToWindow("scan:background:complete", { type: "games" });
  });

  ipcMain.handle("games:list", async () => GameRepo.list());

  ipcMain.handle("games:launch", (_e, game: Game) => launchGame(game));

  ipcMain.handle("games:abort", async () => {
    abortLaunch();
    try {
      await stopActiveGameProcess();
    } catch {}
  });

  ipcMain.handle("libretro:launch", (_e, opts: {
    romPath: string; title: string; platform: string; gameId: string; shader?: string; corePath?: string;
  }) => {
    sendToWindow("libretro:open", opts);
    return true;
  });

  ipcMain.handle("libretro:addon", async (_e, method: string, ...args: any[]) => {
    try {
      const result = await workerCall(method, ...args);
      if (!["getFrameBuffer", "getFrame", "setInputState", "setAnalogState"].includes(method)) {
        log.info("libretro", `worker.${method}() -> ${JSON.stringify(result).slice(0, 200)}`);
      }
      if (method === "unloadAll") {
        log.info("libretro", "Destroying worker after unloadAll");
        await destroyWorker();
      }
      return result;
    } catch (err: any) {
      log.error("libretro", `Worker method ${method} failed: ${err}`);
      throw err;
    }
  });

  ipcMain.handle("games:favorite", async (_e, id: string, value: boolean) => GameRepo.setFavorite(id, value));
  ipcMain.handle("games:tag", async (_e, id: string, tags: string[]) => GameRepo.setTags(id, tags));
  ipcMain.handle("games:hide", async (_e, id: string, value: boolean) => GameRepo.setHidden(id, value));
  ipcMain.handle("games:delete", async (_e, id: string) => GameRepo.delete(id));
  ipcMain.handle("games:countBySource", async (_e, source: ScanSourceId) => GameRepo.countBySource(source));
  ipcMain.handle("games:deleteBySource", async (_e, source: ScanSourceId) => GameRepo.deleteBySource(source));
  ipcMain.handle("games:uninstall", async (_e, game: Game) => uninstallGame(game));

  ipcMain.handle("games:emulatorConfig:get", async (_e, id: string) => GameRepo.getEmulatorConfig(id));
  ipcMain.handle("games:emulatorConfig:set", async (_e, id: string, config: GameEmulatorConfig) => GameRepo.setEmulatorConfig(id, config));
  ipcMain.handle("games:sessionConfig:set", async (_e, id: string, config: Parameters<typeof GameRepo.setSessionConfig>[1]) => GameRepo.setSessionConfig(id, config));

  ipcMain.handle("games:wineConfig:set", async (_e, id: string, config: { wineRunner?: WineRunner; wineCustomCommand?: string | null; umuCustomCommand?: string | null }) => {
    const db = getDb();
    const updates: string[] = [];
    if (config.wineRunner !== undefined) updates.push(`wineRunner = ${JSON.stringify(config.wineRunner)}`);
    if (config.wineCustomCommand !== undefined) updates.push(`wineCustomCommand = ${config.wineCustomCommand === null ? "NONE" : JSON.stringify(config.wineCustomCommand)}`);
    if (config.umuCustomCommand !== undefined) updates.push(`umuCustomCommand = ${config.umuCustomCommand === null ? "NONE" : JSON.stringify(config.umuCustomCommand)}`);
    if (updates.length > 0) {
      await db.query(`UPDATE game:⟨${id}⟩ SET ${updates.join(", ")}`);
    }
  });

  // Injection config
  ipcMain.handle("games:injectionConfig:get", async (_e, id: string) => {
    const db = getDb();
    try {
      const rows = await db.query(`SELECT * FROM game_config:⟨${id}⟩`);
      const row = ((rows as any[])[0] ?? [])[0];
      if (row?.injectionConfig) return row.injectionConfig as GameInjectionConfig;
      return null;
    } catch {
      return null;
    }
  });

  ipcMain.handle("games:injectionConfig:set", async (_e, id: string, config: GameInjectionConfig) => {
    const db = getDb();
    try {
      await db.query(`UPSERT game_config:⟨${id}⟩ SET injectionConfig = $config`, { config });
    } catch (err) {
      log.error("ipc", `Failed to set injection config: ${err}`);
    }
  });

  ipcMain.handle("games:injectionConfig:checkUserSettingsPy", async () => {
    const { checkUserSettingsPy } = await import("../../services/shader-injection.service.js");
    return checkUserSettingsPy();
  });

  ipcMain.handle("games:injectionConfig:vulkanPresets", async () => {
    const { VULKAN_SHADER_PRESETS } = await import("../../services/shader-injection.service.js");
    return VULKAN_SHADER_PRESETS;
  });

  ipcMain.handle("games:injectionConfig:shaderParamDefs", async () => {
    const { SHADER_PARAM_DEFS } = await import("../../services/shader-injection.service.js");
    return SHADER_PARAM_DEFS;
  });

  ipcMain.handle("games:injectionConfig:updateRuntimeShader", async (_e, id: string, config: VulkanShaderConfig) => {
    const { updateRuntimeShaderConfig } = await import("../../services/shader-injection.service.js");
    return updateRuntimeShaderConfig(id, config);
  });

  ipcMain.handle("games:findMainExe", async (_e, id: string) => {
    const { findMainExe } = await import("../../services/shader-injection.service.js");
    const db = getDb();
    try {
      const rows = await db.query(`SELECT * FROM game:⟨${id}⟩`);
      const game = ((rows as any[])[0] ?? [])[0];
      if (!game?.installPath) return null;
      return findMainExe(game.installPath, game.title);
    } catch {
      return null;
    }
  });

  // ReShade
  ipcMain.handle("reshade:openFolder", async () => {
    const { openReShadeFolder } = await import("../../services/reshade.service.js");
    await openReShadeFolder();
  });

  ipcMain.handle("reshade:getStatus", async () => {
    const { getReShadeStatus } = await import("../../services/reshade.service.js");
    return getReShadeStatus();
  });

  ipcMain.handle("reshade:reinstall", async () => {
    const { ensureReShadeShaders, ensureReShadeDll, getReShadeShadersDir, getReShadeTexturesDir, getReShadeDllPath, getReShadeStatus } = await import("../../services/reshade.service.js");
    const { rmSync } = await import("fs");
    const sendProgress = (p: { step: string; message: string }) => {
      sendToWindow("reshade:reinstall:progress", p);
    };
    sendProgress({ step: "cleanup", message: "Clearing existing files..." });
    try { rmSync(await getReShadeShadersDir(), { recursive: true, force: true }); } catch {}
    try { rmSync(await getReShadeTexturesDir(), { recursive: true, force: true }); } catch {}
    try { const dllPath = getReShadeDllPath(); if (existsSync(dllPath)) rmSync(dllPath, { force: true }); } catch {}
    await ensureReShadeShaders(sendProgress);
    await ensureReShadeDll(sendProgress);
    sendProgress({ step: "done", message: "Complete" });
    return getReShadeStatus();
  });

  ipcMain.handle("reshade:isCompatible", async (_e, game: Game) => {
    const { isReShadeCompatible } = await import("../../services/reshade.service.js");
    return isReShadeCompatible(game);
  });

  ipcMain.handle("reshade:getRuntimeState", async (_e, game: Game) => {
    const { getReShadeGameDir } = await import("../../services/reshade.service.js");
    const gameDir = getReShadeGameDir(game);
    if (!gameDir) return null;
    const statePath = join(gameDir, "ember-reshade-state.json");
    if (!existsSync(statePath)) return null;
    try {
      const { readFileSync } = await import("fs");
      return JSON.parse(readFileSync(statePath, "utf-8"));
    } catch {
      return null;
    }
  });

  ipcMain.handle("reshade:writeRuntimeControl", async (_e, game: Game, control: Record<string, unknown>) => {
    const { getReShadeGameDir } = await import("../../services/reshade.service.js");
    const { writeFileSync } = await import("fs");
    const gameDir = getReShadeGameDir(game);
    if (!gameDir) return { success: false, error: "Could not determine game directory" };
    try {
      writeFileSync(join(gameDir, "ember-reshade-control.json"), JSON.stringify(control, null, 2), "utf-8");
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("reshade:savePreset", async (_e, game: Game) => {
    const { getReShadeGameDir } = await import("../../services/reshade.service.js");
    const { writeFileSync } = await import("fs");
    const gameDir = getReShadeGameDir(game);
    if (!gameDir) return { success: false, error: "Could not determine game directory" };
    try {
      writeFileSync(join(gameDir, "ember-reshade-control.json"), JSON.stringify({ savePreset: true }), "utf-8");
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("games:playTime:start", async (_e, id: string) => startPlayTimeTracking(id));
  ipcMain.handle("games:playTime:stop", async (_e, id: string) => stopPlayTimeTracking(id));

  ipcMain.handle("games:loadThumbnail", async (_e, game: Game) => {
    if (!game.romPath) return null;
    if (game.platform === "flash") {
      const url = await loadFlashThumbnail(game);
      return url ?? null;
    }
    if (isLibretroPlatform(game.platform)) {
      const url = await loadLibretroThumbnail(game, () => {
        sendToWindow("toast", { type: "warning", message: `No libretro core found for ${game.title}` });
      });
      return url ?? null;
    }
    return null;
  });

  // Metadata handlers
  ipcMain.handle("games:metadata", async (_e, title: string, steamAppId?: number) => {
    const settings = await getSettings();
    const [rawg, proton] = await Promise.all([
      searchGame(title, settings.rawgApiKey),
      steamAppId ? getProtonRating(steamAppId) : Promise.resolve("unknown"),
    ]);
    return { rawg, proton };
  });

  ipcMain.handle("games:metadata:search", async (_e, title: string, platform?: string, steamAppId?: number) => {
    try {
      const metadata = await searchGameMetadata({ title, platform, steamAppId });
      return metadata;
    } catch (err) {
      log.error("ipc:games:metadata:search", String(err));
      return null;
    }
  });

  ipcMain.handle("games:metadata:fetch", async (_e, options: {
    steamAppId?: number; igdbId?: number; rawgSlug?: string; mobyGamesId?: number; theGamesDbId?: number; launchBoxDbId?: string;
  }) => {
    try {
      return await fetchGameMetadata(options);
    } catch (err) {
      log.error("ipc:games:metadata:fetch", String(err));
      return null;
    }
  });

  ipcMain.handle("games:metadata:enrich", async (_e, game: { title: string; platform?: string; steamAppId?: number }) => {
    try {
      return await enrichGameMetadata(game.title, game.platform, game.steamAppId);
    } catch (err) {
      log.error("ipc:games:metadata:enrich", String(err));
      return null;
    }
  });

  ipcMain.handle("games:metadata:quick", async (_e, title: string, platform?: string) => {
    try {
      return await quickMetadataLookup(title, platform);
    } catch (err) {
      log.error("ipc:games:metadata:quick", String(err));
      return null;
    }
  });

  ipcMain.handle("games:metadata:providers", () => ({
    all: getAvailableProviders(),
    primary: getProvidersByType("primary"),
    retro: getProvidersByType("retro"),
    artwork: getProvidersByType("artwork"),
    video: getProvidersByType("video"),
    supplementary: getProvidersByType("supplementary"),
  }));

  ipcMain.handle("games:metadata:lazy", async (_e, options: {
    gameId: string; title: string; platform?: string; steamAppId?: number;
    igdbId?: number; rawgSlug?: string; theGamesDbId?: number; launchBoxDbId?: string;
  }) => {
    try {
      return await searchGameMetadata(
        { title: options.title, platform: options.platform, steamAppId: options.steamAppId },
        ["artwork", "video"],
      );
    } catch (err) {
      log.error("ipc:games:metadata:lazy", String(err));
      return null;
    }
  });

  ipcMain.handle("games:metadata:achievements", async (_e, options: {
    gameId: string; consoleId?: number; steamAppId?: number; retroAchievementsGameId?: number;
  }) => {
    try {
      if (options.consoleId && options.retroAchievementsGameId) {
        return { achievements: [], count: 0 };
      }
      if (options.steamAppId) {
        const settings = await getSettings();
        if (settings.steamApiKey) {
          const { SteamWebAPIProvider } = await import("../../services/metadata/index.js");
          if (!SteamWebAPIProvider.fetch) return { achievements: [], count: 0 };
          const metadata = await SteamWebAPIProvider.fetch({ steamAppId: options.steamAppId }, settings.steamApiKey);
          return { achievements: metadata?.achievements || [], count: metadata?.achievementCount || 0 };
        }
      }
      return { achievements: [], count: 0 };
    } catch (err) {
      log.error("ipc:games:metadata:achievements", String(err));
      return { achievements: [], count: 0 };
    }
  });

  ipcMain.handle("games:metadata:artwork", async (_e, options: {
    gameId: string; steamAppId?: number; theGamesDbId?: number; title?: string;
  }) => {
    try {
      const metadata = await fetchGameMetadata({ steamAppId: options.steamAppId, theGamesDbId: options.theGamesDbId }, ["artwork"]);
      return { coverUrl: metadata?.coverUrl, bannerUrl: metadata?.bannerUrl, iconUrl: metadata?.iconUrl, screenshots: metadata?.screenshots };
    } catch (err) {
      log.error("ipc:games:metadata:artwork", String(err));
      return null;
    }
  });

  ipcMain.handle("games:localScreenshots", async (_e, gameId: string) => {
    try {
      return listLocalScreenshots(gameId);
    } catch (err) {
      log.error("ipc:games:localScreenshots", String(err));
      return [];
    }
  });

  ipcMain.handle("games:metadata:videos", async (_e, options: { gameId: string; title: string }) => {
    try {
      const metadata = await searchGameMetadata({ title: options.title }, ["video"]);
      return metadata?.videos || [];
    } catch (err) {
      log.error("ipc:games:metadata:videos", String(err));
      return [];
    }
  });

  ipcMain.handle("games:metadata:proton", async (_e, steamAppId: number) => {
    try {
      if (!steamAppId) return "unknown";
      return await getProtonRating(steamAppId);
    } catch (err) {
      log.error("ipc:games:metadata:proton", String(err));
      return "unknown";
    }
  });

  ipcMain.handle("games:regenerateThumbnail", async (_e, game: Game) => {
    log.info("ipc:games:regenerateThumbnail", `called for ${game.id} ${game.platform}`);
    if (regenerateLocks.has(game.id)) {
      log.info("ipc:games:regenerateThumbnail", `already regenerating ${game.id}`);
      return null;
    }
    regenerateLocks.add(game.id);
    try {
      if (game.platform === "flash" && game.romPath) {
        const coverRoot = join(app.getPath("userData"), "covers", "flash");
        const screenshotDir = join(coverRoot, "screenshots");
        const generatedDir = join(coverRoot, "generated");
        const id = game.id;
        for (const ext of [".png", ".jpg", ".webp"]) {
          const p = join(screenshotDir, `${id}${ext}`);
          if (existsSync(p)) { try { unlinkSync(p); log.info("ipc:games:regenerateThumbnail", `deleted ${p}`); } catch {} }
        }
        const svg = join(generatedDir, `${id}.svg`);
        if (existsSync(svg)) { try { unlinkSync(svg); log.info("ipc:games:regenerateThumbnail", `deleted ${svg}`); } catch {} }
        const brokenSvg = join(generatedDir, `${id}-broken.svg`);
        if (existsSync(brokenSvg)) { try { unlinkSync(brokenSvg); log.info("ipc:games:regenerateThumbnail", `deleted ${brokenSvg}`); } catch {} }
        try { await BrokenFlashRepo.delete(id); log.info("ipc:games:regenerateThumbnail", `cleared broken record for ${id}`); } catch {}
        try { await GameRepo.setCorrupt(id, false); log.info("ipc:games:regenerateThumbnail", `cleared corrupt for ${id}`); } catch {}
        clearInFlight(id);
        log.info("ipc:games:regenerateThumbnail", `cleared inFlight for ${id}`);
        const url = await loadFlashThumbnail(game);
        log.info("ipc:games:regenerateThumbnail", `loadFlashThumbnail returned ${url}`);
        return url ?? null;
      }
      if (isLibretroPlatform(game.platform) && game.romPath) {
        const coverRoot = join(app.getPath("userData"), "covers", "libretro");
        const screenshotDir = join(coverRoot, "screenshots");
        const generatedDir = join(coverRoot, "generated");
        const id = game.id;
        for (const ext of [".png", ".jpg", ".webp"]) {
          const p = join(screenshotDir, `${id}${ext}`);
          if (existsSync(p)) { try { unlinkSync(p); log.info("ipc:games:regenerateThumbnail", `deleted libretro ${p}`); } catch {} }
        }
        for (let i = 0; i < 20; i++) {
          const p = join(screenshotDir, `${id}_${i}.png`);
          if (existsSync(p)) { try { unlinkSync(p); log.info("ipc:games:regenerateThumbnail", `deleted libretro ${p}`); } catch {} } else break;
        }
        const svg = join(generatedDir, `${id}.svg`);
        if (existsSync(svg)) { try { unlinkSync(svg); log.info("ipc:games:regenerateThumbnail", `deleted libretro ${svg}`); } catch {} }
        const brokenSvg = join(generatedDir, `${id}-broken.svg`);
        if (existsSync(brokenSvg)) { try { unlinkSync(brokenSvg); log.info("ipc:games:regenerateThumbnail", `deleted libretro ${brokenSvg}`); } catch {} }
        try { await GameRepo.setCorrupt(id, false); log.info("ipc:games:regenerateThumbnail", `cleared corrupt for ${id}`); } catch {}
        const url = await loadLibretroThumbnail(game);
        log.info("ipc:games:regenerateThumbnail", `loadLibretroThumbnail returned ${url}`);
        return url ?? null;
      }
      const settings = await getSettings();
      const rawg = await searchGame(game.title, settings.rawgApiKey);
      if (rawg?.background_image) {
        const db = getDb();
        await db.query(`UPDATE game:⟨${game.id}⟩ SET coverUrl = $url`, { url: rawg.background_image });
        return rawg.background_image;
      }
      return null;
    } finally {
      regenerateLocks.delete(game.id);
    }
  });

  ipcMain.handle("games:compress", async (_e, game: Game) => compressGame(game));
  ipcMain.handle("games:compressAll", async () => {
    const result = await compressAllRoms((current, total, title) => {
      sendToWindow("compression:progress", { current, total, title });
    });
    return result;
  });
  ipcMain.handle("games:compression:tools", async () => getToolAvailability());
  ipcMain.handle("games:compression:canCompress", async (_e, game: Game) => canCompress(game));

  ipcMain.handle("games:desktopEntry:create", async (_e, game: Game) => createDesktopEntry(game));
  ipcMain.handle("games:desktopEntry:remove", async (_e, gameId: string) => removeDesktopEntry(gameId));
  ipcMain.handle("games:desktopEntry:has", async (_e, gameId: string) => hasDesktopEntry(gameId));
  ipcMain.handle("games:desktopEntry:removeAll", async () => removeAllDesktopEntries());
}
