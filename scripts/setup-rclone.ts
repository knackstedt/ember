import { mkdirSync, existsSync, copyFileSync, chmodSync, readdirSync, statSync, rmSync, unlinkSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

const RCLONE_DIR = resolve("resources/rclone");

const ARCHS = [
  {
    arch: "x64",
    url: "https://downloads.rclone.org/rclone-current-linux-amd64.zip",
    binaryName: "rclone",
  },
  {
    arch: "arm64",
    url: "https://downloads.rclone.org/rclone-current-linux-arm64.zip",
    binaryName: "rclone",
  },
] as const;

async function download(url: string, dest: string) {
  console.log(`Downloading ${url} -> ${dest}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // Use Bun.write for large binary files
  await Bun.write(dest, buffer);
  console.log(`  Saved (${buffer.length} bytes)`);
}

function extractZip(zipPath: string, destDir: string): string | undefined {
  // Extract to a temp directory
  const tmpDir = resolve(destDir, ".tmp-extract");
  mkdirSync(tmpDir, { recursive: true });

  const result = spawnSync("unzip", ["-o", zipPath, "-d", tmpDir], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (result.status !== 0) {
    console.error(`Failed to extract ${zipPath}`);
    return undefined;
  }

  // Find the rclone binary inside the extracted directory tree
  function findBinary(dir: string): string | undefined {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) {
        const found = findBinary(full);
        if (found) return found;
      } else if (entry === "rclone" && s.isFile()) {
        return full;
      }
    }
    return undefined;
  }

  const binary = findBinary(tmpDir);
  return binary;
}

async function main() {
  console.log("Setting up rclone binaries...\n");
  mkdirSync(RCLONE_DIR, { recursive: true });

  for (const { arch, url, binaryName } of ARCHS) {
    const destBinary = resolve(RCLONE_DIR, `${binaryName}-${arch}`);
    if (existsSync(destBinary)) {
      console.log(`rclone ${arch} already exists at ${destBinary}, skipping.`);
      continue;
    }

    const zipPath = resolve(RCLONE_DIR, `rclone-${arch}.zip`);
    try {
      await download(url, zipPath);
    } catch (err) {
      console.error(`Failed to download rclone ${arch}:`, err);
      try { unlinkSync(zipPath); } catch { /* ignore */ }
      process.exit(1);
    }

    const extracted = extractZip(zipPath, RCLONE_DIR);
    if (!extracted) {
      console.error(`Failed to extract rclone ${arch}`);
      try { unlinkSync(zipPath); } catch { /* ignore */ }
      process.exit(1);
    }

    copyFileSync(extracted, destBinary);
    chmodSync(destBinary, 0o755);

    // Clean up temp files
    try {
      rmSync(resolve(RCLONE_DIR, ".tmp-extract"), { recursive: true, force: true });
      unlinkSync(zipPath);
    } catch {
      // ignore cleanup errors
    }

    console.log(`  Installed rclone ${arch} -> ${destBinary}\n`);
  }

  console.log("Done. rclone binaries are ready in resources/rclone/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
