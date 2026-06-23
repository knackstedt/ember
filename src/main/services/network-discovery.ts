import { spawn } from "child_process";
import { createLogger } from "../util/logger";

const log = createLogger("info");

export interface DiscoveredDevice {
  name: string;
  ip: string;
  protocol?: "smb" | "sftp" | "ftp" | "webdav" | "http" | "nfs" | "unknown";
  port?: number;
  source: "mdns" | "avahi" | "nmblookup";
}

/* ------------------------------------------------------------------ */
/*  mDNS via multicast-dns (npm)                                      */
/* ------------------------------------------------------------------ */

async function discoverMdns(): Promise<DiscoveredDevice[]> {
  try {
    // Dynamic import to avoid bundling issues if package missing
    // @ts-ignore multicast-dns has no type declarations
    const mdns = await import("multicast-dns");
    const devices: DiscoveredDevice[] = [];
    const seen = new Set<string>();

    return new Promise((resolve) => {
      const m = mdns.default();
      const timeout = setTimeout(() => {
        m.destroy();
        resolve(devices);
      }, 5000);

      m.on("response", (response: any) => {
        for (const answer of response.answers ?? []) {
          if (answer.type === "A" || answer.type === "AAAA") {
            const name = answer.name?.replace(/\._services\._dns-sd\._udp\.local$/, "").replace(/\.local$/, "") ?? "unknown";
            const ip = answer.data;
            if (!ip) continue;
            const key = `${name}@${ip}`;
            if (seen.has(key)) continue;
            seen.add(key);

            // Heuristic protocol detection from service name
            let protocol: DiscoveredDevice["protocol"] = "unknown";
            const lower = answer.name?.toLowerCase() ?? "";
            if (lower.includes("_smb") || lower.includes("_cifs")) protocol = "smb";
            else if (lower.includes("_sftp")) protocol = "sftp";
            else if (lower.includes("_ftp")) protocol = "ftp";
            else if (lower.includes("_webdav")) protocol = "webdav";
            else if (lower.includes("_http")) protocol = "http";
            else if (lower.includes("_nfs")) protocol = "nfs";

            devices.push({
              name,
              ip,
              protocol,
              source: "mdns",
            });
          }
        }
      });

      // Query for common service types
      const queries = [
        "_services._dns-sd._udp.local",
        "_smb._tcp.local",
        "_afpovertcp._tcp.local",
        "_nfs._tcp.local",
        "_ftp._tcp.local",
        "_sftp-ssh._tcp.local",
        "_http._tcp.local",
        "_webdav._tcp.local",
      ];
      for (const q of queries) {
        m.query(q);
      }
    });
  } catch (err) {
    log.warn("network:discovery", `multicast-dns not available: ${err}`);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Avahi (avahi-browse)                                              */
/* ------------------------------------------------------------------ */

function discoverAvahi(): Promise<DiscoveredDevice[]> {
  return new Promise((resolve) => {
    const devices: DiscoveredDevice[] = [];
    const seen = new Set<string>();
    const proc = spawn("avahi-browse", ["-a", "-p", "-t"], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.on("close", () => {
      for (const line of stdout.split("\n")) {
        // Parse avahi-browse -p output: =;eth0;IPv4;MyNAS;_smb._tcp;local;192.168.1.5;445;
        const parts = line.split(";");
        if (parts.length < 8) continue;
        const name = parts[3];
        const service = parts[4]?.toLowerCase() ?? "";
        const ip = parts[7];
        if (!ip) continue;
        const key = `${name}@${ip}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let protocol: DiscoveredDevice["protocol"] = "unknown";
        if (service.includes("smb")) protocol = "smb";
        else if (service.includes("sftp")) protocol = "sftp";
        else if (service.includes("ftp")) protocol = "ftp";
        else if (service.includes("webdav")) protocol = "webdav";
        else if (service.includes("http")) protocol = "http";
        else if (service.includes("nfs")) protocol = "nfs";

        devices.push({ name, ip, protocol, source: "avahi" });
      }
      resolve(devices);
    });

    proc.on("error", () => resolve([]));

    // Kill after timeout
    setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch {}
    }, 5000);
  });
}

/* ------------------------------------------------------------------ */
/*  NMB (nmblookup -S)                                                */
/* ------------------------------------------------------------------ */

function discoverNmb(): Promise<DiscoveredDevice[]> {
  return new Promise((resolve) => {
    const devices: DiscoveredDevice[] = [];
    const seen = new Set<string>();

    // First get master browser IP
    const masterProc = spawn("nmblookup", ["-M", "--"], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    let masterIp = "";
    masterProc.stdout?.on("data", (data: Buffer) => {
      const match = data.toString().match(/(\d+\.\d+\.\d+\.\d+)/);
      if (match) masterIp = match[1];
    });

    masterProc.on("close", () => {
      if (!masterIp) {
        resolve([]);
        return;
      }

      const statusProc = spawn("nmblookup", ["-S", masterIp], {
        stdio: ["ignore", "pipe", "ignore"],
      });

      let stdout = "";
      statusProc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      statusProc.on("close", () => {
        // Parse nmblookup -S output for names and IPs
        const lines = stdout.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const nameMatch = line.match(/^\s*(\S+)\s+<\d+>\s+-\s+([BHDM])/);
          if (nameMatch) {
            const name = nameMatch[1];
            // Look for IP on next lines
            for (let j = i + 1; j < lines.length; j++) {
              const ipMatch = lines[j].match(/(\d+\.\d+\.\d+\.\d+)/);
              if (ipMatch) {
                const ip = ipMatch[1];
                const key = `${name}@${ip}`;
                if (seen.has(key)) continue;
                seen.add(key);
                devices.push({
                  name,
                  ip,
                  protocol: "smb",
                  source: "nmblookup",
                });
                break;
              }
            }
          }
        }
        resolve(devices);
      });

      statusProc.on("error", () => resolve([]));
      setTimeout(() => {
        try { statusProc.kill("SIGTERM"); } catch {}
      }, 5000);
    });

    masterProc.on("error", () => resolve([]));
    setTimeout(() => {
      try { masterProc.kill("SIGTERM"); } catch {}
    }, 5000);
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

export async function discoverNetworkDevices(): Promise<DiscoveredDevice[]> {
  log.info("network:discovery", "starting network discovery...");

  const [mdnsResults, avahiResults, nmbResults] = await Promise.all([
    discoverMdns(),
    discoverAvahi(),
    discoverNmb(),
  ]);

  // Deduplicate by IP (keep first found)
  const seen = new Map<string, DiscoveredDevice>();
  for (const d of [...mdnsResults, ...avahiResults, ...nmbResults]) {
    if (!seen.has(d.ip)) {
      seen.set(d.ip, d);
    }
  }

  const results = Array.from(seen.values());
  log.info("network:discovery", `found ${results.length} unique devices`);
  return results;
}
