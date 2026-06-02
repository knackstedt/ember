import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";

const RESOURCES_DIR = resolve("resources/emulatorjs");
const CORES_DIR = resolve(RESOURCES_DIR, "cores");

// Core packages needed for supported platforms
const CORE_PACKAGES: Record<string, string> = {
  nestopia: "@emulatorjs/core-nestopia",
  snes9x: "@emulatorjs/core-snes9x",
  gambatte: "@emulatorjs/core-gambatte",
  mgba: "@emulatorjs/core-mgba",
};

// CDN URLs for pre-built frontend assets (npm package is source-only)
const CDN_BASE = "https://cdn.emulatorjs.org/latest/data";

async function download(url: string, dest: string) {
  console.log(`Downloading ${url} -> ${dest}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buffer);
  console.log(`  Saved (${buffer.length} bytes)`);
}

function patchEmulatorMinJs(path: string) {
  console.log(`Patching ${path} for classic-script compatibility...`);
  let content = readFileSync(path, "utf-8");

  // Replace ES module export with global window assignment
  // The CDN file ends with: export{b as default};
  if (content.includes("export{b as default}")) {
    content = content.replace("export{b as default}", "window.EmulatorJS=b");
    console.log("  Replaced 'export{b as default}' with 'window.EmulatorJS=b'");
  } else if (content.includes("export{")) {
    // Fallback for any other export pattern
    const match = content.match(/export\{([^}]+)\}/);
    if (match) {
      content = content.replace(match[0], `window.EmulatorJS=${match[1].split("as")[0].trim()}`);
      console.log(`  Replaced '${match[0]}' with global assignment`);
    }
  } else {
    console.log("  No ES module export found - may already be patched or format changed");
  }

  writeFileSync(path, content);
}

function copyCores() {
  console.log("Copying core .data files from npm packages...");
  mkdirSync(CORES_DIR, { recursive: true });

  for (const [coreName, pkgName] of Object.entries(CORE_PACKAGES)) {
    const pkgDir = resolve("node_modules", pkgName);
    if (!existsSync(pkgDir)) {
      console.warn(`  Package not found: ${pkgName} (skipping ${coreName})`);
      continue;
    }

    const files = readdirSync(pkgDir).filter((f) => f.endsWith(".data"));
    if (files.length === 0) {
      console.warn(`  No .data files in ${pkgName}`);
      continue;
    }

    for (const file of files) {
      const src = resolve(pkgDir, file);
      const dest = resolve(CORES_DIR, file);
      copyFileSync(src, dest);
      console.log(`  ${pkgName}/${file} -> cores/${file}`);
    }
  }
}

async function main() {
  console.log("Setting up EmulatorJS local assets...\n");
  mkdirSync(RESOURCES_DIR, { recursive: true });
  mkdirSync(CORES_DIR, { recursive: true });

  // Download pre-built frontend assets from CDN
  const minJsPath = resolve(RESOURCES_DIR, "emulator.min.js");
  const minCssPath = resolve(RESOURCES_DIR, "emulator.min.css");

  try {
    await download(`${CDN_BASE}/emulator.min.js`, minJsPath);
    await download(`${CDN_BASE}/emulator.min.css`, minCssPath);
  } catch (err) {
    console.error("Failed to download from CDN:", err);
    process.exit(1);
  }

  // Patch the JS file for classic-script loading
  patchEmulatorMinJs(minJsPath);

  // Copy core WASM data files from installed npm packages
  copyCores();

  console.log("\nDone. EmulatorJS assets are ready in resources/emulatorjs/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
