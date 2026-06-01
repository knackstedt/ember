import { spawn, spawnSync, ChildProcess } from "child_process";
import { Game, Movie, MusicTrack } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const activeProcesses = new Map<string, ChildProcess>();

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

export function launchGame(game: Game): Promise<void> {
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
    case "dolphin-wii":
      if (isFlatpakDolphinInstalled()) {
        cmd = "flatpak";
        args = ["run", "org.DolphinEmu.dolphin-emu", "-e", game.romPath!, "-b"];
      } else if (isSystemDolphinInstalled()) {
        cmd = "dolphin-emu";
        args = ["-e", game.romPath!, "-b"];
      } else {
        return Promise.reject(
          new Error(
            "Dolphin is not installed. Install it via Flatpak (org.DolphinEmu.dolphin-emu) or your system package manager.",
          ),
        );
      }
      break;
    case "flash":
      // Handled via webview in renderer
      return Promise.resolve();
    default:
      if (game.execPath) {
        const parts = game.execPath.split(" ");
        cmd = parts[0];
        args = parts.slice(1);
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
  });
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
