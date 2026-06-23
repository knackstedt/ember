import { join } from "path";
import { existsSync, readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { DiscoveredPlugin } from "../../shared/types";
import { createLogger } from "../util/logger";
import { getInstalledPluginIds } from "../plugins/plugin-registry";

const log = createLogger("info");

const DEV_PLUGINS_DIR = join(process.cwd(), "plugins");

function getBundledPluginsDir(): string {
  if (process.resourcesPath) {
    return join(process.resourcesPath, "plugins");
  }
  return join(process.cwd(), "plugins");
}

const DEFAULT_PLUGIN_REPO = "knackstedt/ember";

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: GitHubReleaseAsset[];
}

function parsePluginAssetName(name: string): { id: string; version: string } | null {
  const match = name.match(/^~plugin-([a-z0-9-]+)-v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\.(tar\.(?:gz|zst|zstd)|zip)$/);
  if (!match) return null;
  return { id: match[1], version: match[2] };
}

function decompressZstd(buffer: Buffer): Buffer | null {
  try {
    const tmpDir = mkdtempSync(join(tmpdir(), "ember-zstd-"));
    const inputPath = join(tmpDir, "input.zst");
    const outputPath = join(tmpDir, "output");
    writeFileSync(inputPath, buffer);

    const result = spawnSync("zstd", ["-d", "-o", outputPath, inputPath], { stdio: "ignore" });
    if (result.status === 0) {
      const output = readFileSync(outputPath);
      rmSync(tmpDir, { recursive: true, force: true });
      return output;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // zstd CLI not available
  }
  return null;
}

async function fetchLatestRelease(repo: string): Promise<GitHubRelease | null> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  log.info("plugin-discovery", `Fetching latest release from ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Ember-HTPC/0.1.0",
      },
    });
    if (!res.ok) {
      log.error("plugin-discovery", `GitHub API error: ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as GitHubRelease;
  } catch (err) {
    log.error("plugin-discovery", `Failed to fetch latest release: ${err}`);
    return null;
  }
}

async function parsePluginIndex(
  release: GitHubRelease,
  repo: string,
): Promise<DiscoveredPlugin[]> {
  const zstAsset = release.assets.find((a) => a.name === "ember-plugins.json.zst");
  const jsonAsset = release.assets.find((a) => a.name === "ember-plugins.json");
  const indexAsset = zstAsset ?? jsonAsset;
  if (!indexAsset) {
    log.info("plugin-discovery", "No plugin index found in release");
    return [];
  }

  try {
    log.info("plugin-discovery", `Downloading plugin index (${indexAsset.name})`);
    const res = await fetch(indexAsset.browser_download_url, {
      headers: { "User-Agent": "Ember-HTPC/0.1.0" },
    });
    if (!res.ok) {
      log.error("plugin-discovery", `Download failed: ${res.status} ${res.statusText}`);
      return [];
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    let jsonText: string;

    if (indexAsset.name.endsWith(".zst")) {
      const decompressed = decompressZstd(buffer);
      if (!decompressed) {
        log.warn("plugin-discovery", "zstd decompression failed, trying uncompressed fallback");
        // If we have a .json asset, try that instead
        if (zstAsset && jsonAsset) {
          const jsonRes = await fetch(jsonAsset.browser_download_url, {
            headers: { "User-Agent": "Ember-HTPC/0.1.0" },
          });
          if (jsonRes.ok) {
            jsonText = await jsonRes.text();
          } else {
            return [];
          }
        } else {
          return [];
        }
      } else {
        jsonText = decompressed.toString("utf-8");
      }
    } else {
      jsonText = buffer.toString("utf-8");
    }

    const manifests = JSON.parse(jsonText) as Array<{
      id: string;
      name: string;
      displayName?: string;
      version: string;
      description?: string;
      author?: string;
      sourceUrl?: string;
    }>;

    const installed = getInstalledPluginIds();
    const discovered: DiscoveredPlugin[] = [];

    for (const manifest of manifests) {
      const existing = installed.get(manifest.id);
      // Find the matching plugin asset in this release for the download URL
      const asset = release.assets.find((a) => {
        const parsed = parsePluginAssetName(a.name);
        return parsed?.id === manifest.id;
      });

      discovered.push({
        id: manifest.id,
        name: manifest.name,
        displayName: manifest.displayName ?? manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        sourceUrl: manifest.sourceUrl ?? `https://github.com/${repo}/releases`,
        downloadUrl: asset?.browser_download_url ?? "",
        installed: !!existing,
        installedVersion: existing?.manifest.version,
        enabled: existing?.enabled ?? false,
      });
    }

    log.info("plugin-discovery", `Found ${discovered.length} plugin(s) in index`);
    return discovered;
  } catch (err) {
    log.error("plugin-discovery", `Failed to parse plugin index: ${err}`);
    return [];
  }
}

export async function discoverPlugins(
  repo = DEFAULT_PLUGIN_REPO,
): Promise<DiscoveredPlugin[]> {
  const release = await fetchLatestRelease(repo);
  if (!release) return [];

  const fromIndex = await parsePluginIndex(release, repo);
  if (fromIndex.length > 0) {
    return fromIndex;
  }

  // Fallback: parse release assets by name
  const installed = getInstalledPluginIds();
  const discovered: DiscoveredPlugin[] = [];

  for (const asset of release.assets) {
    const parsed = parsePluginAssetName(asset.name);
    if (!parsed) continue;

    const existing = installed.get(parsed.id);
    discovered.push({
      id: parsed.id,
      name: parsed.id,
      displayName: parsed.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      version: parsed.version,
      description: undefined,
      author: undefined,
      sourceUrl: `https://github.com/${repo}/releases`,
      downloadUrl: asset.browser_download_url,
      installed: !!existing,
      installedVersion: existing?.manifest.version,
      enabled: existing?.enabled ?? false,
    });
  }

  log.info("plugin-discovery", `Found ${discovered.length} plugin(s) in release ${release.tag_name}`);
  return discovered;
}

export function discoverBundledPlugins(): DiscoveredPlugin[] {
  const bundledDir = getBundledPluginsDir();
  if (!existsSync(bundledDir)) return [];

  const installed = getInstalledPluginIds();
  const results: DiscoveredPlugin[] = [];

  for (const entry of readdirSync(bundledDir)) {
    const manifestPath = join(bundledDir, entry, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const existing = installed.get(manifest.id ?? entry);
      results.push({
        id: manifest.id ?? entry,
        name: manifest.name ?? entry,
        displayName: manifest.displayName ?? manifest.name ?? entry,
        version: manifest.version ?? "0.0.0",
        description: manifest.description,
        author: manifest.author,
        sourceUrl: manifest.sourceUrl,
        downloadUrl: "",
        installed: !!existing,
        installedVersion: existing?.manifest.version,
        enabled: existing?.enabled ?? false,
        devPath: join(bundledDir, entry),
      });
    } catch {
      /* ignore invalid manifests */
    }
  }

  log.info("plugin-discovery", `Found ${results.length} bundled plugin(s) in ${bundledDir}`);
  return results;
}

export async function discoverAllReleases(
  repo = DEFAULT_PLUGIN_REPO,
): Promise<DiscoveredPlugin[]> {
  const release = await fetchLatestRelease(repo);
  if (!release) return [];

  const fromIndex = await parsePluginIndex(release, repo);
  if (fromIndex.length > 0) {
    return fromIndex;
  }

  // Fallback: parse release assets by name across all releases
  const url = `https://api.github.com/repos/${repo}/releases`;
  log.info("plugin-discovery", `Fetching all releases from ${url}`);

  let releases: GitHubRelease[];
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Ember-HTPC/0.1.0",
      },
    });
    if (!res.ok) {
      log.error("plugin-discovery", `GitHub API error: ${res.status} ${res.statusText}`);
      return [];
    }
    releases = (await res.json()) as GitHubRelease[];
  } catch (err) {
    log.error("plugin-discovery", `Failed to fetch releases: ${err}`);
    return [];
  }

  const installed = getInstalledPluginIds();
  const discovered = new Map<string, DiscoveredPlugin>();

  for (const release of releases) {
    for (const asset of release.assets) {
      const parsed = parsePluginAssetName(asset.name);
      if (!parsed) continue;

      const existing = installed.get(parsed.id);
      const entry: DiscoveredPlugin = {
        id: parsed.id,
        name: parsed.id,
        displayName: parsed.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        version: parsed.version,
        description: release.body?.slice(0, 200) || undefined,
        author: undefined,
        sourceUrl: `https://github.com/${repo}/releases`,
        downloadUrl: asset.browser_download_url,
        installed: !!existing,
        installedVersion: existing?.manifest.version,
        enabled: existing?.enabled ?? false,
      };

      // Keep the latest version if multiple releases have the same plugin
      const existingEntry = discovered.get(parsed.id);
      if (!existingEntry || compareVersions(parsed.version, existingEntry.version) > 0) {
        discovered.set(parsed.id, entry);
      }
    }
  }

  // Merge bundled plugins as fallback when GitHub has no releases
  for (const bundled of discoverBundledPlugins()) {
    if (!discovered.has(bundled.id)) {
      discovered.set(bundled.id, bundled);
    }
  }

  return Array.from(discovered.values());
}

export function discoverDevPlugins(): DiscoveredPlugin[] {
  if (!existsSync(DEV_PLUGINS_DIR)) return [];

  const installed = getInstalledPluginIds();
  const results: DiscoveredPlugin[] = [];

  for (const entry of readdirSync(DEV_PLUGINS_DIR)) {
    const manifestPath = join(DEV_PLUGINS_DIR, entry, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const existing = installed.get(manifest.id ?? entry);
      results.push({
        id: manifest.id ?? entry,
        name: manifest.name ?? entry,
        displayName: manifest.displayName ?? manifest.name ?? entry,
        version: manifest.version ?? "0.0.0",
        description: manifest.description,
        author: manifest.author,
        sourceUrl: manifest.sourceUrl,
        downloadUrl: "",
        installed: !!existing,
        installedVersion: existing?.manifest.version,
        enabled: existing?.enabled ?? false,
        devPath: join(DEV_PLUGINS_DIR, entry),
      });
    } catch {
      /* ignore invalid manifests */
    }
  }

  log.info("plugin-discovery", `Found ${results.length} dev plugin(s) in ${DEV_PLUGINS_DIR}`);
  return results;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => (isNaN(Number(n)) ? n : Number(n)));
  const pb = b.split(/[.-]/).map((n) => (isNaN(Number(n)) ? n : Number(n)));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (typeof va === "number" && typeof vb === "number") {
      if (va !== vb) return va - vb;
    } else {
      const sa = String(va);
      const sb = String(vb);
      if (sa !== sb) return sa.localeCompare(sb);
    }
  }
  return 0;
}
