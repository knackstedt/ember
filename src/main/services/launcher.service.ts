import { spawn, spawnSync, ChildProcess, execFile } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { promisify } from "util";
import { BrowserWindow } from "electron";
import { Game, Movie, MusicTrack, type TaintEntry } from "../../shared/types";
import { createLogger } from "../util/logger";
import { GameRepo } from "../db/repository";
import { buildWineCommand } from "./wine-detection.service";
import { launchItchGame } from "./itch.service";
import { runSessionHooks } from "./session-hooks.service";
import { getDescendantPids, getSiblingPids } from "../util/process-tree";
import {
  setOverlayGame,
  setOverlayGameProcess,
  overlayGameStarted,
  clearOverlayGame,
} from "./overlay.service";
import {
  resolveInjectionConfig,
  buildVulkanLayerEnv,
  buildDllOverrideEnv,
  copyDllsToPrefix,
  writeUserSettingsPy,
  cleanupUserSettingsPy,
  checkUserSettingsPy,
  findSteamPrefixPath,
  findUmuPrefixPath,
  hasActiveInjection,
  isSteamGameProton,
  setSteamLaunchOptions,
  restoreSteamLaunchOptions,
  buildLaunchOptionsString,
  buildGLHookEnv,
  writeTaintManifest,
  cleanupGameTaints,
  writeRuntimeShaderConfig,
  cleanupRuntimeShaderConfig,
} from "./shader-injection.service";

const log = createLogger("info");

const activeProcesses = new Map<string, ChildProcess>();
const playTimeTimers = new Map<string, { startTime: number; timer: NodeJS.Timeout }>();
const execFileAsync = promisify(execFile);

async function findWindowsForPid(pid: number, title?: string): Promise<number[]> {
  if (process.platform !== "linux") return [];
  const pids = new Set([pid, ...getDescendantPids(pid), ...getSiblingPids(pid)]);
  try {
    for (const candidate of pids) {
      const { stdout } = await execFileAsync("xdotool", ["search", "--pid", String(candidate)]);
      const ids = stdout
        .split("\n")
        .map((line) => parseInt(line.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      if (ids.length > 0) {
        log.info("launcher", `found window(s) for PID ${candidate} (related to ${pid})`);
        return ids;
      }
    }
  } catch {
    // xdotool missing or no match; fall back to xprop enumeration
  }

  let clientList: string[] = [];
  try {
    const { stdout: rootStdout } = await execFileAsync("xprop", ["-root", "_NET_CLIENT_LIST"]);
    const match = rootStdout.match(/window id # (0x[0-9a-fA-F]+(?:,\s*0x[0-9a-fA-F]+)*)/);
    if (match) clientList = match[1].split(", ");
  } catch {
    return [];
  }

  // Match by PID
  const found: number[] = [];
  for (const id of clientList) {
    try {
      const { stdout } = await execFileAsync("xprop", ["-id", id, "_NET_WM_PID"]);
      const pidMatch = stdout.match(/_NET_WM_PID\(CARDINAL\) = (\d+)/);
      if (pidMatch && pids.has(Number(pidMatch[1]))) {
        found.push(parseInt(id, 16));
      }
    } catch {
      // ignore individual window failures
    }
  }
  if (found.length > 0) {
    log.info("launcher", `found window(s) via xprop for PID ${pid} tree`);
    return found;
  }

  // Match by title/class
  if (title && clientList.length > 0) {
    const titleLower = title.toLowerCase();
    for (const id of clientList) {
      try {
        const { stdout } = await execFileAsync("xprop", ["-id", id, "_NET_WM_NAME", "WM_NAME", "WM_CLASS"]);
        const haystack = stdout.toLowerCase();
        if (haystack.includes(titleLower)) {
          found.push(parseInt(id, 16));
        }
      } catch {
        // ignore individual window failures
      }
    }
    if (found.length > 0) {
      log.info("launcher", `found window(s) via title/class match for "${title}"`);
      return found;
    }
  }

  return [];
}

async function waitForGameWindow(pid: number | undefined, timeoutMs = 10000, title?: string): Promise<boolean> {
  if (!pid) return false;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const windows = await findWindowsForPid(pid, title);
    if (windows.length > 0) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Steam launch tracking — remembers whether steam was running before we started */
const steamLaunchState = new Map<string, { wasRunning: boolean; isFlatpak: boolean }>();

function getMainWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows();
  return wins.find((w) => !w.isDestroyed()) ?? null;
}

function sendGameStarted(gameId: string): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send("game:started", gameId);
  }
}

function sendGameStopped(gameId: string): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send("game:stopped", gameId);
  }
}

function sendGameLaunching(gameId: string, title: string): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send("game:launching", { gameId, title });
  }
}

function sendGameLaunchProgress(gameId: string, step: string, detail?: string): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send("game:launch-progress", { gameId, step, detail });
  }
}

function sendGameLaunchFailed(gameId: string, reason: string): void {
  clearOverlayGame(gameId);
  const win = getMainWindow();
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send("game:launch-failed", { gameId, reason });
  }
  restoreAndFocusWindow();
}

function minimizeWindow(): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    // Save whether we were maximized so restoreAndFocusWindow can restore it
    (win as any)._wasMaximized = win.isMaximized();
    win.minimize();
  }
}

function restoreAndFocusWindow(): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    // Restore maximized state if it was maximized before minimize
    if ((win as any)._wasMaximized && !win.isMaximized()) {
      win.maximize();
    }
    delete (win as any)._wasMaximized;
    win.focus();
  }
}

function isSteamRunning(): boolean {
  try {
    const result = spawnSync("sh", ["-c", "pgrep -x steam || pidof steam"], { stdio: "pipe" });
    if (result.status === 0) {
      const pids = result.stdout.toString().trim().split(/\s+/).filter(Boolean);
      return pids.length > 0;
    }
  } catch {
    // ignore
  }
  return false;
}

function findSteamGamePid(steamAppId: number): number | null {
  try {
    const entries = readdirSync("/proc");
    for (const entry of entries) {
      const pid = parseInt(entry, 10);
      if (isNaN(pid)) continue;
      try {
        const environ = readFileSync(`/proc/${pid}/environ`, "utf8");
        if (
          environ.includes(`SteamAppId=${steamAppId}`) ||
          environ.includes(`SteamGameId=${steamAppId}`)
        ) {
          return pid;
        }
      } catch {
        // ignore unreadable /proc entries (kernel threads, exited processes, etc.)
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function waitForSteamGamePid(
  steamAppId: number,
  gameId?: string,
  isProton?: boolean,
): Promise<number | null> {
  const start = Date.now();

  // Phase 1: rapid polling for 2 minutes (covers most native launches)
  const fastDeadline = start + 120_000;
  while (Date.now() < fastDeadline) {
    const pid = findSteamGamePid(steamAppId);
    if (pid !== null) return pid;
    await new Promise((r) => setTimeout(r, 500));
  }

  // Phase 2: slow polling every 15s for the next 10 minutes (covers Proton shader compilation)
  if (gameId) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    sendGameLaunchProgress(
      gameId,
      "Compiling shaders",
      isProton
        ? `Proton is compiling shaders — this can take several minutes… (${elapsed}s)`
        : `Still waiting for game process… (${elapsed}s)`,
    );
  }
  const slowDeadline = start + 720_000; // 12 minutes total
  let lastProgressAt = Date.now();
  while (Date.now() < slowDeadline) {
    const pid = findSteamGamePid(steamAppId);
    if (pid !== null) return pid;
    // Send a progress update every 30 seconds during slow polling
    if (gameId && Date.now() - lastProgressAt > 30_000) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      sendGameLaunchProgress(
        gameId,
        "Compiling shaders",
        isProton
          ? `Proton is compiling shaders — this can take several minutes… (${elapsed}s)`
          : `Still waiting for game process… (${elapsed}s)`,
      );
      lastProgressAt = Date.now();
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }

  return null;
}

async function pollProcUntilGone(pid: number, intervalMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      try {
        process.kill(pid, 0);
        // process still alive
        setTimeout(check, intervalMs);
      } catch {
        resolve();
      }
    };
    check();
  });
}

function shutdownSteam(isFlatpak: boolean): void {
  if (isFlatpak) {
    const proc = spawn("flatpak", ["run", "com.valvesoftware.Steam", "-shutdown"], {
      detached: true,
      stdio: "ignore",
    });
    proc.unref();
    log.info("launcher", "Sent shutdown to Flatpak Steam");
  } else {
    const proc = spawn("steam", ["-shutdown"], {
      detached: true,
      stdio: "ignore",
    });
    proc.unref();
    log.info("launcher", "Sent shutdown to Steam");
  }
}

/** Prefer compressed ROM if available and valid, otherwise fall back to romPath */
function resolveRomPath(game: Game): string | undefined {
  if (game.compressedRomPath && existsSync(game.compressedRomPath)) {
    return game.compressedRomPath;
  }
  return game.romPath;
}

function parseCommand(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  let justClosedQuote = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (!inQuotes && (ch === '"' || ch === "'")) {
      inQuotes = true;
      quoteChar = ch;
      justClosedQuote = false;
    } else if (inQuotes && ch === quoteChar) {
      inQuotes = false;
      quoteChar = "";
      justClosedQuote = true;
    } else if (!inQuotes && /\s/.test(ch)) {
      if (current.length > 0 || justClosedQuote) {
        args.push(current);
        current = "";
        justClosedQuote = false;
      }
    } else {
      current += ch;
      justClosedQuote = false;
    }
  }
  if (current.length > 0 || justClosedQuote) args.push(current);
  return args;
}

function isFlatpakDolphinInstalled(): boolean {
  try {
    const result = spawnSync(
      "flatpak",
      ["info", "org.DolphinEmu.dolphin-emu"],
      { stdio: "ignore" },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function isSystemDolphinInstalled(): boolean {
  const result = spawnSync("sh", ["-c", "command -v dolphin-emu"], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function findSteamCommand(): { cmd: string; args: string[]; isFlatpak: boolean } | null {
  // Prefer native Steam binary in PATH
  const steamInPath = spawnSync("sh", ["-c", "command -v steam"], {
    stdio: "ignore",
  });
  if (steamInPath.status === 0) {
    return { cmd: "steam", args: ["-silent"], isFlatpak: false };
  }

  // Fall back to Flatpak Steam
  const flatpakInPath = spawnSync("sh", ["-c", "command -v flatpak"], {
    stdio: "ignore",
  });
  if (flatpakInPath.status === 0) {
    try {
      const flatpakCheck = spawnSync(
        "flatpak",
        ["info", "com.valvesoftware.Steam"],
        { stdio: "ignore" },
      );
      if (flatpakCheck.status === 0) {
        return {
          cmd: "flatpak",
          args: ["run", "com.valvesoftware.Steam", "-silent"],
          isFlatpak: true,
        };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function fullscreenDolphinWindow(): void {
  try {
    const xdotoolCheck = spawnSync("xdotool", ["--version"], {
      stdio: "ignore",
    });
    if (xdotoolCheck.status !== 0) {
      log.warn(
        "launcher",
        "xdotool not found; cannot auto-fullscreen Dolphin. Install xdotool for best experience.",
      );
      return;
    }

    // Background script: poll for Dolphin window up to 5s, then send Alt+Return
    const script = `
      sleep 2
      for i in 1 2 3 4 5 6 7 8 9 10; do
        WID=$(xdotool search --class dolphin-emu 2>/dev/null | head -1)
        if [ -n "$WID" ]; then
          xdotool key --window "$WID" Alt+Return 2>/dev/null || true
          echo "[launcher] Dolphin window fullscreened via xdotool"
          exit 0
        fi
        sleep 0.5
      done
      echo "[launcher] Dolphin window not detected; skipping auto-fullscreen"
    `;

    const watcher = spawn("sh", ["-c", script], {
      detached: true,
      stdio: "pipe",
    });
    watcher.unref();

    watcher.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) log.info("launcher", msg);
    });
    watcher.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) log.error("launcher", `fullscreen watcher stderr: ${msg}`);
    });
  } catch (err) {
    log.warn("launcher", `Failed to start Dolphin fullscreen watcher: ${err}`);
  }
}

export async function launchGame(game: Game): Promise<void> {
  if (!game.execPath && !game.romPath && !game.launchCommand) {
    return Promise.reject(
      new Error(`No executable or ROM path for game: ${game.title}`),
    );
  }

  // Track the game so the overlay can be shown while it is running
  setOverlayGame(game);

  // Run blocking pre-start hooks before anything else
  await runSessionHooks(game, "before-start-blocking");
  // Fire non-blocking pre-start hooks (fire-and-forget)
  void runSessionHooks(game, "before-start");

  // Resolve injection config (Vulkan layer + DLL override)
  let injectionEnv: Record<string, string> = {};
  let needsUserSettingsPy = false;
  let needsLaunchOptions = false;
  let steamCompatAppId: number | undefined;
  let prefixPath: string | null = null;
  let launchOptionsState: { original: string | null; configPath: string } | null = null;
  const collectedTaints: TaintEntry[] = [];
  try {
    if (game.platform === "steam") {
      sendGameLaunchProgress(game.id, "Preparing shader injection", "Resolving injection config…");
    }
    const gameInjectionConfig = await GameRepo.getInjectionConfig(game.id);
    const injectionConfig = await resolveInjectionConfig(game, gameInjectionConfig);
    if (hasActiveInjection(injectionConfig)) {
      log.info("launcher", `Injection active for "${game.title}": ${JSON.stringify(injectionConfig)}`);
      if (injectionConfig.vulkanShader) {
        injectionEnv = { ...injectionEnv, ...buildVulkanLayerEnv(injectionConfig.vulkanShader) };
        // Write the runtime config file so the Vulkan layer can pick up
        // shader changes during gameplay via stat() polling.
        const runtimeEnv = writeRuntimeShaderConfig(game.id, injectionConfig.vulkanShader);
        injectionEnv = { ...injectionEnv, ...runtimeEnv };
      }
      if (injectionConfig.dllInjection) {
        const dllOverride = buildDllOverrideEnv(injectionConfig.dllInjection);
        if (dllOverride) injectionEnv["WINEDLLOVERRIDES"] = dllOverride;
        if (game.platform === "steam" && game.steamAppId) {
          prefixPath = findSteamPrefixPath(game.steamAppId);
        } else if (game.platform === "windows") {
          prefixPath = findUmuPrefixPath(game);
        }
        if (prefixPath && injectionConfig.dllInjection.customDlls.length > 0) {
          const result = copyDllsToPrefix(prefixPath, injectionConfig.dllInjection.customDlls);
          if (result.errors.length > 0) {
            log.warn("launcher", `DLL copy errors: ${result.errors.join("; ")}`);
          }
          if (result.taints) collectedTaints.push(...result.taints);
        }
      }
      if (game.platform === "steam" && game.steamAppId) {
        steamCompatAppId = game.steamAppId;
        if (Object.keys(injectionEnv).length > 0) {
          // Check if the game uses Proton or is native Linux
          if (isSteamGameProton(game.steamAppId)) {
            needsUserSettingsPy = true;
          } else {
            // Native Linux Steam game — use Steam launch options.
            // Add GL hook env vars for OpenGL games (LD_PRELOAD based).
            // Also keep Vulkan layer env vars for games that might use Vulkan.
            // The GL hook only activates on glXSwapBuffers, the Vulkan layer
            // only activates on vkCreateInstance, so both can coexist safely.
            const glHookEnv = buildGLHookEnv(injectionConfig.vulkanShader!);
            injectionEnv = { ...injectionEnv, ...glHookEnv };
            needsLaunchOptions = true;
          }
        }
      }
    }
  } catch (err) {
    log.warn("launcher", `Failed to resolve injection config: ${err}`);
  }

  if (needsUserSettingsPy && steamCompatAppId) {
    sendGameLaunchProgress(game.id, "Writing Proton shader config", "Configuring user_settings.py…");
    const existing = checkUserSettingsPy(steamCompatAppId);
    if (existing === "external") {
      const win = getMainWindow();
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        const choice = await win.webContents.executeJavaScript(
          `confirm('A non-Ember user_settings.py exists for this Steam game. Override it? (The original will be backed up.)')`,
          true,
        );
        if (!choice) {
          log.info("launcher", "User declined to override user_settings.py; skipping injection");
          injectionEnv = {};
          needsUserSettingsPy = false;
        }
      }
    }
    if (needsUserSettingsPy) {
      const result = writeUserSettingsPy(steamCompatAppId, injectionEnv, true);
      if (!result.success) {
        log.warn("launcher", `Failed to write user_settings.py: ${result.error}`);
        injectionEnv = {};
      }
      if (result.taints) collectedTaints.push(...result.taints);
    }
  }

  if (needsLaunchOptions && steamCompatAppId) {
    sendGameLaunchProgress(game.id, "Configuring Steam launch options", "Setting up native game injection…");
    const launchOpts = buildLaunchOptionsString(injectionEnv);
    const result = setSteamLaunchOptions(steamCompatAppId, launchOpts);
    if (result) {
      launchOptionsState = result;
      log.info("launcher", `Set Steam launch options for native Linux game: ${launchOpts}`);
      collectedTaints.push({
        type: "launch_options",
        path: result.configPath,
        version: 1,
        createdAt: Date.now(),
      });
      // If Steam is already running, it needs to re-read localconfig.vdf.
      // Shut it down so it picks up the launch options on restart.
      if (isSteamRunning()) {
        log.info("launcher", "Restarting Steam to apply launch options…");
        sendGameLaunchProgress(game.id, "Restarting Steam", "Applying launch options…");
        shutdownSteam(false);
        // Wait for Steam to fully exit
        await new Promise((r) => setTimeout(r, 3000));
      }
    } else {
      log.warn("launcher", `Failed to set Steam launch options; injection may not work`);
    }
  }

  // Write taint manifest so we can clean up even if Ember crashes
  if (collectedTaints.length > 0) {
    writeTaintManifest(game.id, steamCompatAppId, prefixPath, collectedTaints);
  }

  if (typeof (global as any).gc === "function") {
    (global as any).gc();
  }

  let cmd: string;
  let args: string[];

  // Allow launchCommand override for all platforms
  if (game.launchCommand) {
    const parsed = parseCommand(game.launchCommand);
    cmd = parsed[0];
    args = game.launchArgs ?? parsed.slice(1);
  } else {
    switch (game.platform) {
    case "steam": {
      if (!game.steamAppId) {
        return Promise.reject(
          new Error(`Steam AppID missing for game: ${game.title}`),
        );
      }
      const steam = findSteamCommand();
      if (!steam) {
        return Promise.reject(
          new Error(`Steam not found. Install native Steam or Flatpak Steam (com.valvesoftware.Steam).`),
        );
      }

      const wasRunning = isSteamRunning();
      steamLaunchState.set(game.id, { wasRunning, isFlatpak: steam.isFlatpak });

      const steamCmd = steam.cmd;
      const steamArgs = [...steam.args, "-applaunch", String(game.steamAppId)];

      sendGameLaunching(game.id, game.title);

      const isProton = needsUserSettingsPy;
      sendGameLaunchProgress(
        game.id,
        "Starting Steam",
        isProton ? "Launching via Proton…" : "Launching native Steam game…",
      );

      log.info(
        "launcher",
        `Spawning: ${steamCmd} ${steamArgs
          .map((a) => (a.includes(" ") ? `"${a}"` : a))
          .join(" ")}`,
      );

      const steamProc = spawn(steamCmd, steamArgs, {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, ...game.launchEnv, ...injectionEnv },
      });
      steamProc.on("error", (err) => {
        log.error("launcher", `Spawn error for "${game.title}": ${err}`);
        sendGameLaunchFailed(game.id, err.message);
      });
      steamProc.unref();

      // Wait for the actual game process to appear in /proc, then track its lifetime
      (async () => {
        log.info("launcher", `Waiting for Steam game ${game.steamAppId} to start…`);
        sendGameLaunchProgress(
          game.id,
          "Waiting for game process",
          isProton ? "Proton is preparing the game…" : "Waiting for game to start…",
        );
        const gamePid = await waitForSteamGamePid(game.steamAppId!, game.id, isProton);
        if (gamePid === null) {
          const reason = `Timed out waiting for Steam game ${game.steamAppId} process; it may not have started.`;
          log.warn("launcher", reason);
          clearOverlayGame(game.id);
          sendGameLaunchFailed(game.id, reason);
          if (needsUserSettingsPy && steamCompatAppId) {
            cleanupUserSettingsPy(steamCompatAppId);
          }
          if (needsLaunchOptions && steamCompatAppId && launchOptionsState) {
            restoreSteamLaunchOptions(steamCompatAppId, launchOptionsState.original, launchOptionsState.configPath);
          }
          // Clean up all remaining taints (DLLs, manifest file, etc.)
          cleanupGameTaints(game.id, steamCompatAppId, prefixPath);
          cleanupRuntimeShaderConfig(game.id);
          void runSessionHooks(game, "after-start");
          GameRepo.setLastPlayed(game.id, Date.now()).catch((err) => {
            log.warn("launcher", `Failed to set lastPlayed for ${game.id}: ${err}`);
          });
          return;
        }

        log.info("launcher", `Detected Steam game PID ${gamePid} for AppID ${game.steamAppId}`);
        sendGameLaunchProgress(game.id, "Game process detected", "Waiting for game window…");
        setOverlayGameProcess(game.id, gamePid);
        startPlayTimeTracking(game.id);
        void runSessionHooks(game, "after-start");
        const foundWindow = await waitForGameWindow(gamePid, 30000, game.title);
        sendGameStarted(game.id);
        minimizeWindow();
        if (foundWindow) {
          void overlayGameStarted(game.id);
        } else {
          log.warn(
            "launcher",
            `Window for Steam game ${game.steamAppId} not detected; overlay will follow Ember's display`,
          );
        }

        try {
          await pollProcUntilGone(gamePid, 2000);
          log.info("launcher", `Steam game ${game.steamAppId} (PID ${gamePid}) has exited.`);
        } catch (err) {
          log.error("launcher", `Error polling Steam game ${game.steamAppId}: ${err}`);
        } finally {
          stopPlayTimeTracking(game.id);
          sendGameStopped(game.id);
          clearOverlayGame(game.id);
          restoreAndFocusWindow();

          // Clean up Ember-generated user_settings.py
          if (needsUserSettingsPy && steamCompatAppId) {
            cleanupUserSettingsPy(steamCompatAppId);
          }
          // Restore original Steam launch options
          if (needsLaunchOptions && steamCompatAppId && launchOptionsState) {
            restoreSteamLaunchOptions(steamCompatAppId, launchOptionsState.original, launchOptionsState.configPath);
          }
          // Clean up all remaining taints (DLLs, manifest file, etc.)
          cleanupGameTaints(game.id, steamCompatAppId, prefixPath);
          cleanupRuntimeShaderConfig(game.id);

          const launchState = steamLaunchState.get(game.id);
          steamLaunchState.delete(game.id);
          if (launchState && !launchState.wasRunning) {
            log.info("launcher", "Steam was not running before launch; shutting it down.");
            shutdownSteam(launchState.isFlatpak);
          }

          void runSessionHooks(game, "after-close");
          GameRepo.setLastPlayed(game.id, Date.now()).catch((err) => {
            log.warn("launcher", `Failed to set lastPlayed for ${game.id}: ${err}`);
          });
        }
      })();

      // Return immediately so the UI isn't blocked
      return Promise.resolve();
    }
    case "dolphin-gc":
    case "dolphin-wii": {
      const romPath = resolveRomPath(game);
      if (isFlatpakDolphinInstalled()) {
        cmd = "flatpak";
        args = ["run", "org.DolphinEmu.dolphin-emu", "-e", romPath!, "-b"];
      } else if (isSystemDolphinInstalled()) {
        cmd = "dolphin-emu";
        args = ["-e", romPath!, "-b"];
      } else {
        return Promise.reject(
          new Error(
            "Dolphin is not installed. Install it via Flatpak (org.DolphinEmu.dolphin-emu) or your system package manager.",
          ),
        );
      }
      break;
    }
    case "windows": {
      const exePath = game.romPath!;
      // Default to umu-run for non-store Windows games (it handles Proton prefix management)
      const runner = game.wineRunner ?? "umu-run";
      const customCommand = runner === "umu-run"
        ? game.umuCustomCommand
        : game.wineCustomCommand;

      if (customCommand) {
        // Parse the custom command and substitute {exe} placeholder
        const parsed = parseCommand(customCommand.replace(/\{exe\}/g, exePath));
        cmd = parsed[0];
        args = parsed.slice(1);
        log.info("launcher", `Launching Windows game "${game.title}" with custom ${runner} command: ${cmd}`);
      } else {
        const wineCmd = await buildWineCommand(exePath, runner);
        if (!wineCmd) {
          return Promise.reject(
            new Error(
              `No Windows compatibility layer found. Install Wine (via WineHQ), umu-run, or Proton-GE in Settings → Packages.`,
            ),
          );
        }
        cmd = wineCmd.cmd;
        args = wineCmd.args;
        log.info("launcher", `Launching Windows game "${game.title}" with runner: ${cmd}`);
      }
      break;
    }
    case "flash":
    case "nes":
    case "snes":
    case "gb":
    case "gba":
    case "dos":
    case "n64":
    case "genesis":
    case "sms":
    case "gamegear":
    case "pce":
    case "psx":
    case "nds":
    case "dreamcast":
      // Handled via in-renderer emulator components
      clearOverlayGame(game.id);
      return Promise.resolve();
    case "itch": {
      sendGameLaunching(game.id, game.title);
      const result = await launchItchGame(game);
      if (result.success) {
        startPlayTimeTracking(game.id);
        sendGameStarted(game.id);
        void overlayGameStarted(game.id);
        GameRepo.setLastPlayed(game.id, Date.now()).catch((err) => {
          log.warn("launcher", `Failed to set lastPlayed for ${game.id}: ${err}`);
        });
        return Promise.resolve();
      }
      clearOverlayGame(game.id);
      const reason = result.error ?? "Failed to launch itch game";
      return Promise.reject(new Error(reason));
    }
    default:
      if (game.execPath) {
        // Use a minimal shell-quote parser to respect quoted arguments
        const parsed = parseCommand(game.execPath);
        cmd = parsed[0];
        args = parsed.slice(1);
      } else {
        return Promise.reject(
          new Error(`Cannot launch game: ${game.title}`),
        );
      }
    }
  }

  log.info("launcher", `Spawning: ${cmd} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
  if (Object.keys(injectionEnv).length > 0) {
    log.info("launcher", `Injection env vars: ${JSON.stringify(injectionEnv)}`);
  }

  const isDolphin =
    game.platform === "dolphin-gc" || game.platform === "dolphin-wii";

  const launchEnv = { ...process.env, ...game.launchEnv, ...injectionEnv };
  const launchCwd = game.launchWorkingDir || undefined;

  sendGameLaunching(game.id, game.title);

  return new Promise<void>((resolve, reject) => {
    const hasInjection = Object.keys(injectionEnv).length > 0;
    const proc = spawn(cmd, args, {
      detached: true,
      stdio: isDolphin || hasInjection ? ["ignore", "pipe", "pipe"] : "ignore",
      env: launchEnv,
      cwd: launchCwd,
    });

    let settled = false;
    let spawnOk = false;
    let hasStarted = false;
    let stderrBuf = "";

    if ((isDolphin || hasInjection) && proc.stderr) {
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        stderrBuf += chunk;
        // Log Vulkan layer messages in real time
        for (const line of chunk.split("\n")) {
          if (line.includes("[Ember Vulkan Layer]")) {
            log.info("vulkan-layer", line.trim());
          }
        }
      });
    }

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      activeProcesses.delete(game.id);
      clearOverlayGame(game.id);
      log.error("launcher", `Spawn error for "${game.title}": ${err}`);
      restoreAndFocusWindow();
      reject(err);
    });

    proc.on("spawn", () => {
      spawnOk = true;
      startPlayTimeTracking(game.id);
      if (proc.pid) setOverlayGameProcess(game.id, proc.pid);
      const windowPromise = waitForGameWindow(proc.pid, 10000, game.title);
      setTimeout(() => {
        if (settled) return;
        settled = true;
        hasStarted = true;
        proc.unref();
        activeProcesses.set(game.id, proc);
        log.info("launcher", `"${game.title}" started successfully`);
        if (isDolphin) fullscreenDolphinWindow();
        void runSessionHooks(game, "after-start", launchEnv);
        resolve();
        sendGameStarted(game.id);
        minimizeWindow();
        void windowPromise.then((found) => {
          if (!found) {
            log.warn("launcher", `Window for "${game.title}" not detected; overlay will follow Ember's display`);
          } else {
            void overlayGameStarted(game.id);
          }
        });
      }, 1500);
    });

    proc.on("exit", (code, signal) => {
      activeProcesses.delete(game.id);
      stopPlayTimeTracking(game.id);
      clearOverlayGame(game.id);
      const crashed = !signal && code !== 0;
      const closed = !signal && code === 0;
      if (crashed) {
        void runSessionHooks(game, "after-crash", launchEnv);
      } else if (closed) {
        void runSessionHooks(game, "after-close", launchEnv);
      }
      if (hasStarted) {
        log.info("launcher", `"${game.title}" exited (code=${code}, signal=${signal})`);
        sendGameStopped(game.id);
        restoreAndFocusWindow();
        // Clean up injection taints (DLLs, user_settings.py, manifest)
        if (collectedTaints.length > 0) {
          cleanupGameTaints(game.id, steamCompatAppId, prefixPath);
        }
        cleanupRuntimeShaderConfig(game.id);
        return;
      }
      if (!settled && spawnOk) {
        settled = true;
        const stderrTail = stderrBuf.trim().slice(-500);
        const reason = signal
          ? `Process was killed by signal ${signal}. ${stderrTail}`
          : `Process exited immediately with code ${code}. ${stderrTail}`;
        log.error("launcher", `"${game.title}" failed: ${reason}`);
        restoreAndFocusWindow();
        // Clean up injection taints on early exit too
        if (collectedTaints.length > 0) {
          cleanupGameTaints(game.id, steamCompatAppId, prefixPath);
        }
        cleanupRuntimeShaderConfig(game.id);
        reject(new Error(reason));
      }
    });
  });
}

export function startPlayTimeTracking(gameId: string): void {
  stopPlayTimeTracking(gameId);
  const startTime = Date.now();
  let lastReported = 0;
  // Immediately update lastPlayed so the recently-played list reflects the launch
  GameRepo.setLastPlayed(gameId, startTime).catch((err) => {
    log.warn("launcher", `Failed to set lastPlayed for ${gameId}: ${err}`);
  });
  const timer = setInterval(async () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const delta = elapsed - lastReported;
    if (delta > 0) {
      lastReported = elapsed;
      try {
        await GameRepo.addPlayTime(gameId, delta);
        await GameRepo.setLastPlayed(gameId, Date.now());
      } catch (err) {
        log.warn("launcher", `Failed to update playtime for ${gameId}: ${err}`);
      }
    }
  }, 30000); // Update every 30 seconds to avoid spamming DB
  playTimeTimers.set(gameId, { startTime, timer });
}

export function stopPlayTimeTracking(gameId: string): void {
  const entry = playTimeTimers.get(gameId);
  if (entry) {
    clearInterval(entry.timer);
    playTimeTimers.delete(gameId);
  }
}

export function launchMovie(movie: Movie): void {
  const proc = spawn("xdg-open", [movie.filePath], {
    detached: true,
    stdio: "ignore",
  });
  proc.on("error", (err) => {
    log.error(
      "launcher",
      `Failed to open movie "${movie.title}": ${err}`,
    );
  });
  proc.unref();
}

export function launchTrack(track: MusicTrack): void {
  const proc = spawn("xdg-open", [track.filePath], {
    detached: true,
    stdio: "ignore",
  });
  proc.on("error", (err) => {
    log.error(
      "launcher",
      `Failed to open track "${track.title}": ${err}`,
    );
  });
  proc.unref();
}
