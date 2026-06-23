import { app } from "electron";
import { join, resolve } from "path";
import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { createLogger } from "../util/logger";

const log = createLogger("info");

let rcloneBinaryPath: string | null | undefined = undefined;
let rcdProcess: ChildProcess | null = null;
let rcdPort = 5572;

function isPackaged(): boolean {
  return app.isPackaged;
}

function getBundledBinaryPath(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  // In packaged builds, resources/ is relative to the executable
  const resourcesDir = isPackaged()
    ? join(process.resourcesPath, "rclone")
    : resolve("resources/rclone");
  return join(resourcesDir, `rclone-${arch}`);
}

export function resolveRcloneBinary(): string | null {
  if (rcloneBinaryPath !== undefined) return rcloneBinaryPath;

  // 1. Try bundled binary
  const bundled = getBundledBinaryPath();
  if (existsSync(bundled)) {
    rcloneBinaryPath = bundled;
    log.info("rclone:binary", `using bundled binary: ${bundled}`);
    return rcloneBinaryPath;
  }

  // 2. Try system PATH
  try {
    const { spawnSync } = require("child_process");
    const result = spawnSync("sh", ["-c", "command -v rclone"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status === 0 && result.stdout.trim()) {
      rcloneBinaryPath = result.stdout.trim();
      log.info("rclone:binary", `using system binary: ${rcloneBinaryPath}`);
      return rcloneBinaryPath;
    }
  } catch {
    // ignore
  }

  rcloneBinaryPath = null;
  log.error("rclone:binary", "rclone binary not found (bundled or in PATH)");
  return null;
}

export function isRcloneAvailable(): boolean {
  return resolveRcloneBinary() !== null;
}

export async function startRcdDaemon(): Promise<number | null> {
  if (rcdProcess) {
    return rcdPort;
  }

  const binary = resolveRcloneBinary();
  if (!binary) return null;

  return new Promise((resolve) => {
    rcdProcess = spawn(binary, [
      "rcd",
      "--rc-addr", `localhost:${rcdPort}`,
      "--rc-no-auth",
      "--rc-serve",
    ], {
      detached: false,
      stdio: ["ignore", "ignore", "pipe"],
    });

    rcdProcess.on("error", (err) => {
      log.error("rclone:rcd", `failed to start: ${err.message}`);
      rcdProcess = null;
      resolve(null);
    });

    rcdProcess.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line.includes("Failed")) {
        log.error("rclone:rcd", line);
      } else {
        log.debug("rclone:rcd", line);
      }
    });

    // Give it a moment to start, then verify via health check
    setTimeout(async () => {
      const healthy = await healthCheck(rcdPort);
      if (healthy) {
        log.info("rclone:rcd", `daemon started on port ${rcdPort}`);
        resolve(rcdPort);
      } else {
        log.error("rclone:rcd", "health check failed after start");
        stopRcdDaemon();
        resolve(null);
      }
    }, 1500);
  });
}

export function stopRcdDaemon(): void {
  if (rcdProcess) {
    rcdProcess.kill("SIGTERM");
    rcdProcess = null;
    log.info("rclone:rcd", "daemon stopped");
  }
}

export async function healthCheck(port: number): Promise<boolean> {
  try {
    // rclone /rc/noop requires POST on older versions (e.g. v1.74)
    const res = await fetch(`http://localhost:${port}/rc/noop`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function rcloneApiCall<T = unknown>(
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<T | null> {
  if (!rcdProcess) {
    await startRcdDaemon();
  }
  try {
    const res = await fetch(`http://localhost:${rcdPort}${endpoint}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      log.error("rclone:api", `${endpoint} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    log.error("rclone:api", `${endpoint} error: ${err}`);
    return null;
  }
}

export function getRcdPort(): number {
  return rcdPort;
}
