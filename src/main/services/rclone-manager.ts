import { RemoteSource, RemoteSourceProtocol } from "../../shared/types";
import { RemoteSourceRepo } from "../db/repository";
import {
  storeCredentials,
  retrieveCredentials,
  deleteCredentials,
  needsMasterPassword,
  needsSessionReauth,
} from "./credential-store.service";
import {
  buildRcloneConfig,
  cleanupRcloneConfig,
  cleanupAllRcloneConfigs,
} from "./rclone-config.service";
import {
  resolveRcloneBinary,
} from "./rclone.service";
import { createLogger } from "../util/logger";
import { spawn, ChildProcess, spawnSync } from "child_process";
import { lookup } from "dns";
import { promisify } from "util";

const log = createLogger("info");
const dnsLookup = promisify(lookup);

interface LsJsonEntry {
  Path: string;
  Name: string;
  Size: number;
  ModTime: string;
  IsDir: boolean;
}

function runRcloneLsjson(
  binary: string,
  configPath: string,
  remoteName: string,
  path: string,
): LsJsonEntry[] {
  const result = spawnSync(binary, [
    "--config", configPath,
    "lsjson",
    `${remoteName}:${path || "/"}`,
    "--max-depth", "1",
  ], {
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const err = result.stderr?.trim() || "unknown error";
    throw new Error(`rclone lsjson failed: ${err}`);
  }

  if (!result.stdout?.trim()) {
    return [];
  }

  try {
    return JSON.parse(result.stdout) as LsJsonEntry[];
  } catch {
    return [];
  }
}

const serveProcesses = new Map<string, ChildProcess>();
const servePorts = new Map<string, number>();
const serveConfigs = new Map<string, string>();
let nextPort = 20000;

function allocatePort(): number {
  return nextPort++;
}

async function waitForServe(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        method: "HEAD",
        signal: AbortSignal.timeout(500),
      });
      if (res.status === 200 || res.status === 404) {
        return true;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export async function initRcloneManager(): Promise<void> {
  const binary = resolveRcloneBinary();
  if (!binary) {
    log.error("rclone:manager", "rclone binary not available");
    return;
  }

  // Auto-start serve for all enabled remotes
  try {
    const sources = await RemoteSourceRepo.list();
    for (const source of sources) {
      if (source.enabled) {
        log.info("rclone:manager", `auto-starting serve for ${source.id}`);
        void startServe(source).catch((err) => {
          log.warn("rclone:manager", `auto-start failed for ${source.id}: ${err}`);
        });
      }
    }
  } catch (err) {
    log.warn("rclone:manager", `failed to auto-start remotes: ${err}`);
  }
}

export async function shutdownRcloneManager(): Promise<void> {
  for (const [id, proc] of serveProcesses) {
    proc.kill("SIGTERM");
    serveProcesses.delete(id);
    servePorts.delete(id);
    const configPath = serveConfigs.get(id);
    if (configPath) cleanupRcloneConfig(configPath);
    serveConfigs.delete(id);
  }
  cleanupAllRcloneConfigs();
}

export async function listRemotes(): Promise<RemoteSource[]> {
  return RemoteSourceRepo.list();
}

export async function addRemote(
  source: Omit<RemoteSource, "id">,
  creds: Record<string, string | undefined>,
): Promise<RemoteSource> {
  const id = `remote_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const full: RemoteSource = { ...source, id };

  await storeCredentials(full, creds);
  await RemoteSourceRepo.upsert(full);

  log.info("rclone:manager", `added remote ${id}`);

  // Auto-start serve if enabled
  if (full.enabled) {
    void startServe(full).catch((err) => {
      log.warn("rclone:manager", `auto-start failed for new remote ${id}: ${err}`);
    });
  }

  return full;
}

export async function updateRemote(
  source: RemoteSource,
  creds?: Record<string, string | undefined>,
): Promise<void> {
  if (creds) {
    await storeCredentials(source, creds);
  }
  await RemoteSourceRepo.upsert(source);
}

export async function removeRemote(id: string): Promise<void> {
  stopServe(id);
  const sources = await RemoteSourceRepo.list();
  const source = sources.find((s) => s.id === id);
  if (source) {
    await deleteCredentials(source);
  }
  await RemoteSourceRepo.delete(id);
  log.info("rclone:manager", `removed remote ${id}`);
}

export async function getRemoteFileList(
  source: RemoteSource,
  path: string,
): Promise<{ name: string; isDir: boolean; size?: number; modTime?: string }[]> {
  const binary = resolveRcloneBinary();
  if (!binary) throw new Error("rclone binary not available");

  const creds = await retrieveCredentials(source);
  if (!creds) {
    throw new Error(`No credentials available for remote ${source.id}`);
  }

  const { remoteName, configPath } = await buildRcloneConfig(source, creds);

  try {
    const list = runRcloneLsjson(binary, configPath, remoteName, path);
    return list.map((item) => ({
      name: item.Name,
      isDir: item.IsDir,
      size: item.Size,
      modTime: item.ModTime,
    }));
  } finally {
    cleanupRcloneConfig(configPath);
  }
}

export async function startServe(source: RemoteSource): Promise<number | null> {
  if (servePorts.has(source.id)) {
    return servePorts.get(source.id)!;
  }

  const binary = resolveRcloneBinary();
  if (!binary) return null;

  const creds = await retrieveCredentials(source);
  if (!creds) {
    log.warn("rclone:manager", `no credentials for ${source.id}, cannot start serve`);
    return null;
  }

  const { remoteName, configPath } = await buildRcloneConfig(source, creds);
  const port = allocatePort();

  const proc = spawn(binary, [
    "serve", "http",
    "--config", configPath,
    "--addr", `localhost:${port}`,
    "--read-only",
    `${remoteName}:${source.remotePath || "/"}`,
  ], {
    detached: false,
    stdio: ["ignore", "ignore", "pipe"],
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line.includes("ERROR")) {
      log.error("rclone:serve", line);
    } else {
      log.debug("rclone:serve", line);
    }
  });

  proc.on("error", (err) => {
    log.error("rclone:serve", `failed for ${source.id}: ${err.message}`);
    serveProcesses.delete(source.id);
    servePorts.delete(source.id);
    serveConfigs.delete(source.id);
  });

  proc.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      log.error("rclone:serve", `${source.id} exited with code ${code}`);
    }
    serveProcesses.delete(source.id);
    servePorts.delete(source.id);
    const exitedConfig = serveConfigs.get(source.id);
    if (exitedConfig) cleanupRcloneConfig(exitedConfig);
    serveConfigs.delete(source.id);
  });

  serveProcesses.set(source.id, proc);
  servePorts.set(source.id, port);
  serveConfigs.set(source.id, configPath);

  // Wait and verify the server is actually accepting connections
  const healthy = await waitForServe(port, 8000);
  if (!healthy) {
    log.error("rclone:serve", `serve for ${source.id} on port ${port} failed health check`);
    proc.kill("SIGTERM");
    serveProcesses.delete(source.id);
    servePorts.delete(source.id);
    return null;
  }

  log.info("rclone:manager", `started serve for ${source.id} on port ${port}`);
  return port;
}

export function stopServe(sourceId: string): void {
  const proc = serveProcesses.get(sourceId);
  if (proc) {
    proc.kill("SIGTERM");
    serveProcesses.delete(sourceId);
    servePorts.delete(sourceId);
    const configPath = serveConfigs.get(sourceId);
    if (configPath) cleanupRcloneConfig(configPath);
    serveConfigs.delete(sourceId);
    log.info("rclone:manager", `stopped serve for ${sourceId}`);
  }
}

export async function getServePort(sourceId: string): Promise<number | undefined> {
  const port = servePorts.get(sourceId);
  if (!port) return undefined;

  const proc = serveProcesses.get(sourceId);
  if (!proc || proc.killed || proc.exitCode !== null) {
    // Process died, clean up stale entries
    serveProcesses.delete(sourceId);
    servePorts.delete(sourceId);
    const configPath = serveConfigs.get(sourceId);
    if (configPath) cleanupRcloneConfig(configPath);
    serveConfigs.delete(sourceId);
    log.warn("rclone:manager", `serve for ${sourceId} has died, cleaned up stale port ${port}`);
    return undefined;
  }

  // Verify the HTTP server is actually responding
  try {
    await fetch(`http://localhost:${port}/`, {
      method: "HEAD",
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    log.warn("rclone:manager", `serve for ${sourceId} on port ${port} not responding, cleaning up`);
    proc.kill("SIGTERM");
    serveProcesses.delete(sourceId);
    servePorts.delete(sourceId);
    const configPath = serveConfigs.get(sourceId);
    if (configPath) cleanupRcloneConfig(configPath);
    serveConfigs.delete(sourceId);
    return undefined;
  }

  return port;
}

export async function restartServe(source: RemoteSource): Promise<number | null> {
  stopServe(source.id);
  return startServe(source);
}

export async function getAllServePorts(): Promise<Map<string, number>> {
  return new Map(servePorts);
}

export async function checkRemoteNeedsAuth(source: RemoteSource): Promise<boolean> {
  if (source.credentialMode === "session-only") {
    const creds = await retrieveCredentials(source);
    return !creds;
  }
  if (source.credentialMode === "user-password") {
    const creds = await retrieveCredentials(source);
    return !creds;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Test helpers                                                        */
/* ------------------------------------------------------------------ */

export interface RemoteTestResult {
  success: boolean;
  message: string;
}

export async function testRemoteConnection(source: RemoteSource): Promise<RemoteTestResult> {
  try {
    if (!source.host) {
      return { success: true, message: "No host specified; cloud provider assumed reachable." };
    }
    await dnsLookup(source.host);
    return { success: true, message: `Host ${source.host} resolved successfully.` };
  } catch (err) {
    return { success: false, message: `Failed to resolve ${source.host}: ${err}` };
  }
}

export async function testRemoteCredentials(source: RemoteSource): Promise<RemoteTestResult> {
  try {
    const binary = resolveRcloneBinary();
    if (!binary) return { success: false, message: "rclone binary not available." };

    const creds = await retrieveCredentials(source);
    if (!creds) {
      return { success: false, message: "No credentials available for this source." };
    }

    const { remoteName, configPath } = await buildRcloneConfig(source, creds);
    try {
      const list = runRcloneLsjson(binary, configPath, remoteName, "/");
      return { success: true, message: `Authenticated. Root contains ${list.length} items.` };
    } catch (err) {
      return { success: false, message: `Credential test failed: ${err}` };
    } finally {
      cleanupRcloneConfig(configPath);
    }
  } catch (err) {
    return { success: false, message: `Credential test failed: ${err}` };
  }
}

export async function testRemotePath(source: RemoteSource): Promise<RemoteTestResult> {
  try {
    const binary = resolveRcloneBinary();
    if (!binary) return { success: false, message: "rclone binary not available." };

    const creds = await retrieveCredentials(source);
    if (!creds) {
      return { success: false, message: "No credentials available for this source." };
    }

    const { remoteName, configPath } = await buildRcloneConfig(source, creds);
    const path = source.remotePath || "/";
    try {
      const list = runRcloneLsjson(binary, configPath, remoteName, path);
      return { success: true, message: `Path accessible. Contains ${list.length} items.` };
    } catch (err) {
      return { success: false, message: `Path ${path} not accessible: ${err}` };
    } finally {
      cleanupRcloneConfig(configPath);
    }
  } catch (err) {
    return { success: false, message: `Path test failed: ${err}` };
  }
}

export async function remoteFileExists(
  source: RemoteSource,
  remotePath: string,
): Promise<boolean> {
  const binary = resolveRcloneBinary();
  if (!binary) return false;

  const creds = await retrieveCredentials(source);
  if (!creds) return false;

  const { remoteName, configPath } = await buildRcloneConfig(source, creds);

  try {
    const { stdout, stderr } = await new Promise<{
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(binary, [
        "--config", configPath,
        "lsjson",
        `${remoteName}:${remotePath || "/"}`,
        "--max-depth", "0",
      ], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let out = "";
      let err = "";
      child.stdout?.on("data", (data: Buffer) => { out += data.toString(); });
      child.stderr?.on("data", (data: Buffer) => { err += data.toString(); });

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("timeout"));
      }, 30000);

      child.on("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout: out, stderr: err });
        } else {
          reject(new Error(err || `exit ${code}`));
        }
      });
    });

    if (!stdout?.trim()) return false;

    try {
      const entries = JSON.parse(stdout) as LsJsonEntry[];
      return entries.length > 0 && !entries[0].IsDir;
    } catch {
      return false;
    }
  } catch {
    return false;
  } finally {
    cleanupRcloneConfig(configPath);
  }
}
