import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve, join, basename } from "path";
import { spawnSync } from "child_process";

const PLUGINS_DIR = resolve("plugins");
const OUT_DIR = resolve("release", "plugins");

interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entryPoint?: string;
}

function log(msg: string) {
  console.log(`[package-plugins] ${msg}`);
}

function die(msg: string): never {
  console.error(`[package-plugins] ERROR: ${msg}`);
  process.exit(1);
}

function checkCommand(cmd: string): boolean {
  const result = spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
  return result.status === 0;
}

function packagePlugin(pluginDir: string, manifest: PluginManifest): string {
  const slug = manifest.id.replace(/[^a-z0-9-]/g, "-");
  const outName = `~plugin-${slug}-${manifest.version}.tar.zst`;
  const outPath = join(OUT_DIR, outName);

  // Ensure assets directory exists (plugins may reference it even if empty)
  const assetsDir = join(pluginDir, "assets");
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }

  // Create tar.zst from plugin directory contents
  const tarResult = spawnSync(
    "tar",
    [
      "--zstd",
      "-cf", outPath,
      "-C", pluginDir,
      ".",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );

  if (tarResult.status !== 0) {
    die(`Failed to package ${manifest.id}: tar exited ${tarResult.status}`);
  }

  const size = statSync(outPath).size;
  log(`Packaged ${manifest.id} v${manifest.version} -> ${outName} (${(size / 1024).toFixed(1)} KiB)`);
  return outPath;
}

function main() {
  if (!checkCommand("tar")) {
    die("tar is required but not found in PATH");
  }
  if (!checkCommand("zstd")) {
    die("zstd is required but not found in PATH. Install it: apt install zstd");
  }

  if (!existsSync(PLUGINS_DIR)) {
    log("No plugins directory found, skipping");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const entries = readdirSync(PLUGINS_DIR);
  let packaged = 0;

  for (const entry of entries) {
    const pluginDir = join(PLUGINS_DIR, entry);
    const manifestPath = join(pluginDir, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch (err) {
      console.warn(`[package-plugins] Skipping ${entry}: invalid manifest.json`);
      continue;
    }

    if (!manifest.id || !manifest.version) {
      console.warn(`[package-plugins] Skipping ${entry}: missing id or version in manifest`);
      continue;
    }

    packagePlugin(pluginDir, manifest);
    packaged++;
  }

  if (packaged === 0) {
    log("No plugins found to package");
  } else {
    log(`Packaged ${packaged} plugin(s) to ${OUT_DIR}`);
  }
}

main();
