import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const BIOS_DIR = resolve("resources/v86-bios");

// v86 BIOS files are not included in the npm package.
// Download them from the GitHub repo (using the 'latest' tag for stability).
const GITHUB_BASE = "https://raw.githubusercontent.com/copy/v86/latest";

const BIOS_FILES = [
  { url: `${GITHUB_BASE}/bios/seabios.bin`, name: "seabios.bin" },
  { url: `${GITHUB_BASE}/bios/vgabios.bin`, name: "vgabios.bin" },
];

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

async function main() {
  console.log("Setting up v86 BIOS files...\n");
  mkdirSync(BIOS_DIR, { recursive: true });

  for (const file of BIOS_FILES) {
    const dest = resolve(BIOS_DIR, file.name);
    try {
      await download(file.url, dest);
    } catch (err) {
      console.error(`Failed to download ${file.name}:`, err);
      process.exit(1);
    }
  }

  console.log("\nDone. v86 BIOS files are ready in resources/v86-bios/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
