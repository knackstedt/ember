#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve, join } from "path";
import { spawnSync } from "child_process";

const PLUGINS_DIR = resolve("plugins");
const OUT_DIR = resolve("release", "plugins");

interface PluginManifest {
  id: string;
  name: string;
  displayName?: string;
  version: string;
  description?: string;
  author?: string;
  sourceUrl?: string;
}

function log(msg: string) {
  console.log(`[generate-plugin-index] ${msg}`);
}

function die(msg: string): never {
  console.error(`[generate-plugin-index] ERROR: ${msg}`);
  process.exit(1);
}

function main() {
  if (!existsSync(PLUGINS_DIR)) {
    log("No plugins directory found, skipping");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const entries: PluginManifest[] = [];
  for (const dir of readdirSync(PLUGINS_DIR)) {
    const manifestPath = join(PLUGINS_DIR, dir, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      entries.push({
        id: manifest.id,
        name: manifest.name,
        displayName: manifest.displayName,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        sourceUrl: manifest.sourceUrl,
      });
    } catch {
      console.warn(`[generate-plugin-index] Skipping ${dir}: invalid manifest`);
    }
  }

  if (entries.length === 0) {
    log("No plugins found to index");
    return;
  }

  // Minified JSON
  const json = JSON.stringify(entries);
  const jsonPath = join(OUT_DIR, "ember-plugins.json");
  writeFileSync(jsonPath, json);

  // zstd compress
  const zstPath = join(OUT_DIR, "ember-plugins.json.zst");
  const result = spawnSync("zstd", ["-f", "--rm", "-o", zstPath, jsonPath], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    die("zstd compression failed");
  }

  const originalSize = Buffer.byteLength(json);
  const compressedSize = readFileSync(zstPath).length;
  log(`Generated index with ${entries.length} plugin(s)`);
  log(`${originalSize} bytes → ${compressedSize} bytes (${(compressedSize / originalSize * 100).toFixed(1)}%)`);
}

main();
