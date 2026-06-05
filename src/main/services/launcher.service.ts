import { spawn, spawnSync, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { Game, Movie, MusicTrack } from "../../shared/types";
import { createLogger } from "../util/logger";
import { GameRepo } from "../db/repository";
import { buildWineCommand } from "./package-manager.service";

const log = createLogger("info");

const activeProcesses = new Map<string, ChildProcess>();
const playTimeTimers = new Map<string, { startTime: number; timer: NodeJS.Timeout }>();

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

function fullscreenDolphinWindow(): void {
  try {
    const xdotoolCheck = spawnSync("xdotool", ["--version"], {
      stdio: "ignore",
    });
    if (xdotoolCheck.status !== 0) {
      log.warn(
        "launcher",
        "xdotool not found; cannot auto-fullscreen Dolphin. Install xdotool for best HTPC experience.",
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
  if (!game.execPath && !game.romPath) {
    return Promise.reject(
      new Error(`No executable or ROM path for game: ${game.title}`),
    );
  }

  let cmd: string;
  let args: string[];

  switch (game.platform) {
    case "steam":
      cmd = "xdg-open";
      args = [`steam://rungameid/${game.steamAppId}`];
      break;
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

  log.info("launcher", `Spawning: ${cmd} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);

  const isDolphin =
    game.platform === "dolphin-gc" || game.platform === "dolphin-wii";

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      detached: true,
      stdio: isDolphin ? ["ignore", "pipe", "pipe"] : "ignore",
      env: { ...process.env },
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
      setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.unref();
        activeProcesses.set(game.id, proc);
        log.info("launcher", `"${game.title}" started successfully`);
        if (isDolphin) fullscreenDolphinWindow();
        resolve();
      }, 1500);
    });

    proc.on("exit", (code, signal) => {
      activeProcesses.delete(game.id);
      stopPlayTimeTracking(game.id);
      if (!settled && spawnOk) {
        settled = true;
        const stderrTail = stderrBuf.trim().slice(-500);
        const reason = signal
          ? `Emulator was killed by signal ${signal}. ${stderrTail}`
          : `Emulator exited immediately with code ${code}. ${stderrTail}`;
        log.error("launcher", `"${game.title}" failed: ${reason}`);
        reject(new Error(reason));
      }
    });

    // Start playtime tracking once the process spawns successfully
    proc.on("spawn", () => {
      startPlayTimeTracking(game.id);
    });
  });
}

export function startPlayTimeTracking(gameId: string): void {
  stopPlayTimeTracking(gameId);
  const startTime = Date.now();
  // Immediately update lastPlayed so the recently-played list reflects the launch
  GameRepo.setLastPlayed(gameId, startTime).catch((err) => {
    log.warn("launcher", `Failed to set lastPlayed for ${gameId}: ${err}`);
  });
  const timer = setInterval(async () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed > 0) {
      try {
        await GameRepo.addPlayTime(gameId, elapsed);
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
