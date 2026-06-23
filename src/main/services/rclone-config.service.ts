import { app } from "electron";
import { join } from "path";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { lookup } from "dns";
import { promisify } from "util";
import { spawnSync } from "child_process";
import { RemoteSource, RemoteSourceProtocol } from "../../shared/types";
import { createLogger } from "../util/logger";
import { resolveRcloneBinary } from "./rclone.service";

const log = createLogger("info");

const PROTOCOL_TO_RCLONE: Record<RemoteSourceProtocol, string> = {
  sftp: "sftp",
  ftp: "ftp",
  smb: "smb",
  webdav: "webdav",
  http: "http",
  googledrive: "drive",
  dropbox: "dropbox",
  onedrive: "onedrive",
};

function getTempConfigDir(): string {
  const dir = join(app.getPath("temp"), "ember-rclone-configs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeRemoteName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

const dnsLookup = promisify(lookup);

function obscurePassword(password: string): string {
  const binary = resolveRcloneBinary();
  if (!binary) throw new Error("rclone binary not available");

  const result = spawnSync(binary, ["obscure", password], {
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0 || result.error) {
    throw new Error(`rclone obscure failed: ${result.stderr?.trim() || result.error?.message || "unknown error"}`);
  }

  const obscured = result.stdout?.trim();
  if (!obscured) throw new Error("rclone obscure returned empty output");
  return obscured;
}

/* ------------------------------------------------------------------ */
/*  Hostname resolution — Node.js resolves so Go/rclone never has to   */
/* ------------------------------------------------------------------ */

async function resolveMdnsHostname(hostname: string): Promise<string | null> {
  try {
    // @ts-ignore multicast-dns has no type declarations
    const mdns = await import("multicast-dns");
    return new Promise((resolve) => {
      const m = mdns.default();
      const timeout = setTimeout(() => {
        m.destroy();
        resolve(null);
      }, 3000);

      m.on("response", (response: any) => {
        for (const answer of response.answers ?? []) {
          if ((answer.type === "A" || answer.type === "AAAA") && answer.name === hostname) {
            clearTimeout(timeout);
            m.destroy();
            resolve(answer.data as string);
            return;
          }
        }
      });

      m.query(hostname, "A");
      m.query(hostname, "AAAA");
    });
  } catch (err) {
    log.warn("rclone:config", `mDNS resolution failed for ${hostname}: ${err}`);
    return null;
  }
}

async function resolveHost(source: RemoteSource): Promise<string | undefined> {
  if (!source.host) return undefined;

  // 1. Try Node.js system resolver first (handles regular DNS, VPN, /etc/hosts, etc.)
  try {
    const result = await dnsLookup(source.host, { family: 4 });
    if (result.address) {
      log.debug("rclone:config", `resolved ${source.host} -> ${result.address} (system DNS)`);
      return result.address;
    }
  } catch {
    // System resolver failed; fall through
  }

  // 2. For .local domains, try mDNS directly
  if (source.host.endsWith(".local")) {
    const resolved = await resolveMdnsHostname(source.host);
    if (resolved) {
      log.info("rclone:config", `resolved ${source.host} -> ${resolved} (mDNS)`);
      return resolved;
    }
  }

  // 3. Fall back to raw hostname and let rclone try (will likely fail for .local)
  log.warn("rclone:config", `failed to resolve ${source.host}, falling back to raw hostname`);
  return source.host;
}

export interface RcloneConfigEntry {
  remoteName: string;
  configPath: string;
}

export async function buildRcloneConfig(
  source: RemoteSource,
  creds: Record<string, string | undefined>,
): Promise<RcloneConfigEntry> {
  const remoteName = sanitizeRemoteName(source.name || source.id);
  const type = PROTOCOL_TO_RCLONE[source.protocol];
  const resolvedHost = await resolveHost(source);

  const lines: string[] = [`[${remoteName}]`, `type = ${type}`];

  // Protocol-specific fields
  switch (source.protocol) {
    case "sftp":
    case "ftp":
    case "webdav":
    case "http": {
      if (resolvedHost) lines.push(`host = ${resolvedHost}`);
      if (source.port) lines.push(`port = ${source.port}`);
      break;
    }
    case "smb": {
      if (resolvedHost) lines.push(`host = ${resolvedHost}`);
      break;
    }
    case "googledrive":
    case "dropbox":
    case "onedrive": {
      // Cloud providers use token/client_id/client_secret
      break;
    }
  }

  // Credentials
  if (creds.user) lines.push(`user = ${creds.user}`);
  if (creds.password) lines.push(`pass = ${obscurePassword(creds.password)}`);
  if (creds.token) lines.push(`token = ${creds.token}`);
  if (creds.clientId) lines.push(`client_id = ${creds.clientId}`);
  if (creds.clientSecret) lines.push(`client_secret = ${creds.clientSecret}`);

  // Protocol-specific extras
  if (source.protocol === "smb" && creds.user) {
    lines.push(`domain = WORKGROUP`);
  }
  if (source.protocol === "webdav") {
    lines.push(`vendor = other`);
  }

  const configContent = lines.join("\n") + "\n";
  // Unique path per call so concurrent callers don't overwrite each other's config
  const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const configPath = join(getTempConfigDir(), `${source.id}_${uniqueSuffix}.conf`);
  writeFileSync(configPath, configContent, { mode: 0o600 });

  log.debug("rclone:config", `wrote temp config for ${source.id} at ${configPath}`);
  return { remoteName, configPath };
}

export function cleanupRcloneConfig(configPath: string): void {
  if (existsSync(configPath)) {
    rmSync(configPath);
    log.debug("rclone:config", `cleaned up temp config ${configPath}`);
  }
}

export function cleanupAllRcloneConfigs(): void {
  const dir = getTempConfigDir();
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    log.info("rclone:config", "cleaned up all temp configs");
  }
}
