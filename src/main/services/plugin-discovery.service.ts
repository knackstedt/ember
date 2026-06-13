import { DiscoveredPlugin } from "../../shared/types";
import { createLogger } from "../util/logger";
import { getInstalledPluginIds, getInstalledPlugin } from "../plugins/plugin-registry";

const log = createLogger("info");

const DEFAULT_PLUGIN_REPO = "dotglitch/ember";

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
  const match = name.match(/^ember-plugin-([a-z0-9-]+)-v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\.(tar\.(?:gz|zst|zstd)|zip)$/);
  if (!match) return null;
  return { id: match[1], version: match[2] };
}

export async function discoverPlugins(
  repo = DEFAULT_PLUGIN_REPO,
): Promise<DiscoveredPlugin[]> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  log.info("plugin-discovery", `Fetching releases from ${url}`);

  let release: GitHubRelease;
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
    release = (await res.json()) as GitHubRelease;
  } catch (err) {
    log.error("plugin-discovery", `Failed to fetch releases: ${err}`);
    return [];
  }

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

export async function discoverAllReleases(
  repo = DEFAULT_PLUGIN_REPO,
): Promise<DiscoveredPlugin[]> {
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

  return Array.from(discovered.values());
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
