import { spawn, spawnSync, ChildProcess } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { BrowserWindow } from "electron";
import { Game, Movie, MusicTrack } from "../../shared/types";
import { createLogger } from "../util/logger";
import { GameRepo } from "../db/repository";
import { buildWineCommand } from "./wine-detection.service";
import { launchItchGame } from "./itch.service";
import { runSessionHooks } from "./session-hooks.service";

const log = createLogger("info");

const activeProcesses = new Map<string, ChildProcess>();
const playTimeTimers = new Map<string, { startTime: number; timer: NodeJS.Timeout }>();

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

function minimizeWindow(): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.minimize();
  }
}

function restoreAndFocusWindow(): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
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

async function waitForSteamGamePid(steamAppId: number): Promise<number | null> {
  const start = Date.now();

  // Phase 1: rapid polling for 2 minutes (covers most native launches)
  const fastDeadline = start + 120_000;
  while (Date.now() < fastDeadline) {
    const pid = findSteamGamePid(steamAppId);
    if (pid !== null) return pid;
    await new Promise((r) => setTimeout(r, 500));
  }

  // Phase 2: slow polling every 15s for the next 10 minutes (covers Proton shader compilation)
  const slowDeadline = start + 720_000; // 12 minutes total
  while (Date.now() < slowDeadline) {
    const pid = findSteamGamePid(steamAppId);
    if (pid !== null) return pid;
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

  // Run blocking pre-start hooks before anything else
  await runSessionHooks(game, "before-start-blocking");
  // Fire non-blocking pre-start hooks (fire-and-forget)
  void runSessionHooks(game, "before-start");

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

      log.info(
        "launcher",
        `Spawning: ${steamCmd} ${steamArgs
          .map((a) => (a.includes(" ") ? `"${a}"` : a))
          .join(" ")}`,
      );

      const steamProc = spawn(steamCmd, steamArgs, {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      });
      steamProc.on("error", (err) => {
        log.error("launcher", `Spawn error for "${game.title}": ${err}`);
      });
      steamProc.unref();

      // Wait for the actual game process to appear in /proc, then track its lifetime
      (async () => {
        log.info("launcher", `Waiting for Steam game ${game.steamAppId} to start…`);
        const gamePid = await waitForSteamGamePid(game.steamAppId);
        if (gamePid === null) {
          log.warn("launcher", `Timed out waiting for Steam game ${game.steamAppId} process; playtime tracking disabled.`);
          void runSessionHooks(game, "after-start");
          GameRepo.setLastPlayed(game.id, Date.now()).catch((err) => {
            log.warn("launcher", `Failed to set lastPlayed for ${game.id}: ${err}`);
          });
          return;
        }

        log.info("launcher", `Detected Steam game PID ${gamePid} for AppID ${game.steamAppId}`);
        startPlayTimeTracking(game.id);
        void runSessionHooks(game, "after-start");
        sendGameStarted(game.id);
        minimizeWindow();

        try {
          await pollProcUntilGone(gamePid, 2000);
          log.info("launcher", `Steam game ${game.steamAppId} (PID ${gamePid}) has exited.`);
        } catch (err) {
          log.error("launcher", `Error polling Steam game ${game.steamAppId}: ${err}`);
        } finally {
          stopPlayTimeTracking(game.id);
          sendGameStopped(game.id);
          restoreAndFocusWindow();

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
      const runner = game.wineRunner ?? "wine";
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
      return Promise.resolve();
    case "itch": {
      const result = await launchItchGame(game);
      if (result.success) {
        startPlayTimeTracking(game.id);
        GameRepo.setLastPlayed(game.id, Date.now()).catch((err) => {
          log.warn("launcher", `Failed to set lastPlayed for ${game.id}: ${err}`);
        });
        return Promise.resolve();
      }
      return Promise.reject(new Error(result.error ?? "Failed to launch itch game"));
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

  const isDolphin =
    game.platform === "dolphin-gc" || game.platform === "dolphin-wii";

  const launchEnv = { ...process.env, ...game.launchEnv };
  const launchCwd = game.launchWorkingDir || undefined;

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      detached: true,
      stdio: isDolphin ? ["ignore", "pipe", "pipe"] : "ignore",
      env: launchEnv,
      cwd: launchCwd,
    });

    let settled = false;
    let spawnOk = false;
    let stderrBuf = "";

    if (isDolphin && proc.stderr) {
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        stderrBuf += chunk;
      });
    }

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      activeProcesses.delete(game.id);
      log.error("launcher", `Spawn error for "${game.title}": ${err}`);
      reject(err);
    });

    proc.on("spawn", () => {
      spawnOk = true;
      startPlayTimeTracking(game.id);
      setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.unref();
        activeProcesses.set(game.id, proc);
        log.info("launcher", `"${game.title}" started successfully`);
        if (isDolphin) fullscreenDolphinWindow();
        void runSessionHooks(game, "after-start", launchEnv);
        resolve();
      }, 1500);
    });

    proc.on("exit", (code, signal) => {
      activeProcesses.delete(game.id);
      stopPlayTimeTracking(game.id);
      const crashed = !signal && code !== 0;
      const closed = !signal && code === 0;
      if (crashed) {
        void runSessionHooks(game, "after-crash", launchEnv);
      } else if (closed) {
        void runSessionHooks(game, "after-close", launchEnv);
      }
      if (!settled && spawnOk) {
        settled = true;
        const stderrTail = stderrBuf.trim().slice(-500);
        const reason = signal
          ? `Process was killed by signal ${signal}. ${stderrTail}`
          : `Process exited immediately with code ${code}. ${stderrTail}`;
        log.error("launcher", `"${game.title}" failed: ${reason}`);
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
