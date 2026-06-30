import { spawn, SpawnOptions } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { homedir } from "os";
import { WineRunner } from "../../shared/types";

export function runCommand(
  cmd: string,
  args: string[],
  options?: SpawnOptions & { input?: string }
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
      ...options,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => { stdout += d; });
    proc.stderr?.on("data", (d: string) => { stderr += d; });

    if (options?.input) {
      proc.stdin?.write(options.input);
      proc.stdin?.end();
    }

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
    proc.on("error", (err) => {
      resolve({ stdout, stderr: stderr || String(err), code: 1 });
    });
  });
}

export async function isAptInstalled(aptName: string): Promise<boolean> {
  const { code } = await runCommand("dpkg-query", ["-W", "-f='${Status}'", aptName]);
  return code === 0;
}

export async function getAptVersion(aptName: string): Promise<string | undefined> {
  const { stdout, code } = await runCommand("dpkg-query", ["-W", "-f='${Version}'", aptName]);
  if (code === 0) return stdout.trim().replace(/^'|'$/g, "");
  return undefined;
}

export async function isWineInstalled(): Promise<boolean> {
  const { code: sysCode } = await runCommand("sh", ["-c", "command -v wine"]);
  if (sysCode === 0) return true;
  return isAptInstalled("winehq-stable");
}

export async function getWineVersion(): Promise<string | undefined> {
  const { stdout, code } = await runCommand("wine", ["--version"]);
  if (code === 0) return stdout.trim().replace(/^wine-/, "");
  return getAptVersion("winehq-stable");
}

export function getProtonGeDir(): string {
  const steamDir = join(homedir(), ".steam", "root", "compatibilitytools.d");
  const steamFlatpak = join(homedir(), ".var", "app", "com.valvesoftware.Steam", "data", "Steam", "compatibilitytools.d");
  if (existsSync(steamDir)) return steamDir;
  if (existsSync(steamFlatpak)) return steamFlatpak;
  mkdirSync(steamDir, { recursive: true });
  return steamDir;
}

export function getInstalledProtonGeVersion(): string | undefined {
  try {
    const dir = getProtonGeDir();
    const entries = readdirSync(dir);
    const ge = entries.filter((e) => /^GE-Proton/i.test(e));
    if (ge.length === 0) return undefined;
    ge.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    return ge[0];
  } catch {
    return undefined;
  }
}

export async function fetchLatestProtonGeRelease(): Promise<{ tag: string; tarUrl: string } | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest",
      { headers: { Accept: "application/vnd.github+json", "User-Agent": "htpc-app" } }
    );
    if (!res.ok) return null;
    const data = await res.json() as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
    const tarAsset = data.assets.find((a) => a.name.endsWith(".tar.gz") && !a.name.includes("sha512sum"));
    if (!tarAsset) return null;
    return { tag: data.tag_name, tarUrl: tarAsset.browser_download_url };
  } catch {
    return null;
  }
}

export async function isProtonGeInstalled(): Promise<boolean> {
  return getInstalledProtonGeVersion() !== undefined;
}

export async function isUmuRunInstalled(): Promise<boolean> {
  const { code } = await runCommand("sh", ["-c", "command -v umu-run"]);
  return code === 0;
}

export async function detectWineRunner(): Promise<WineRunner | null> {
  if (await isUmuRunInstalled()) return "umu-run";
  if (await isProtonGeInstalled()) return "proton-ge";

  const systemProtonPaths = [
    join(homedir(), ".steam", "root", "ubuntu12_32", "steam-runtime"),
    join(homedir(), ".local", "share", "Steam", "ubuntu12_32", "steam-runtime"),
    "/usr/bin/steam-runtime-launch-client",
  ];
  if (systemProtonPaths.some(existsSync)) return "system-proton";

  if (await isWineInstalled()) return "wine";
  return null;
}

export async function buildWineCommand(exePath: string, preferredRunner?: WineRunner): Promise<{ cmd: string; args: string[] } | null> {
  const runner = preferredRunner ?? (await detectWineRunner());
  if (!runner) return null;

  if (runner === "umu-run") {
    // Check if umu-run is actually available on PATH
    if (await isUmuRunInstalled()) {
      return { cmd: "umu-run", args: [exePath] };
    }
    // Fall back to wine if umu-run is not installed
    if (await isWineInstalled()) {
      return { cmd: "wine", args: [exePath] };
    }
    return null;
  }

  if (runner === "proton-ge" || runner === "system-proton") {
    const geVersion = getInstalledProtonGeVersion();
    if (geVersion) {
      const protonExe = join(getProtonGeDir(), geVersion, "proton");
      if (existsSync(protonExe)) {
        return {
          cmd: protonExe,
          args: ["run", exePath],
        };
      }
    }
  }

  return { cmd: "wine", args: [exePath] };
}
