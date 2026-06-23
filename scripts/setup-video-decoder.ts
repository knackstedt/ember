import { existsSync, copyFileSync, mkdirSync, statSync, readdirSync, symlinkSync, unlinkSync, readlinkSync } from "fs";
import { resolve } from "path";

const ARCHS = [
  { target: "x86_64-unknown-linux-gnu", arch: "x64" },
  // { target: "aarch64-unknown-linux-gnu", arch: "arm64" },
] as const;

/** Return the newest mtime of any .rs file under dir, or 0 if none found. */
function newestRustMtime(dir: string): number {
  let max = 0;
  function walk(p: string) {
    try {
      for (const entry of readdirSync(p, { withFileTypes: true })) {
        const full = resolve(p, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".rs")) {
          const m = statSync(full).mtimeMs;
          if (m > max) max = m;
        }
      }
    } catch { /* ignore unreadable dirs */ }
  }
  walk(dir);
  return max;
}

/** Return mtime of a file, or 0 if it doesn't exist. */
function fileMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

async function build(target: string, cwd: string): Promise<number> {
  console.log(`Building video-decoder for ${target}...`);
  const env: Record<string, string> = { ...process.env };
  if (target === "aarch64-unknown-linux-gnu") {
    env.PKG_CONFIG_ALLOW_CROSS = "1";
    env.PKG_CONFIG_SYSROOT_DIR = "/usr/aarch64-linux-gnu";
    env.CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER = "aarch64-linux-gnu-gcc";
  }
  const proc = Bun.spawn({
    cmd: ["cargo", "build", "--release", "--target", target],
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env,
  });
  await proc.exited;
  return proc.exitCode ?? 1;
}

function findArtifact(rustDir: string, target: string): string | undefined {
  // Check target-specific dir first, then fallback to default release dir.
  const dirs = [
    resolve(rustDir, `target/${target}/release`),
    resolve(rustDir, "target/release"),
  ];
  for (const dir of dirs) {
    const candidate = resolve(dir, "libvideo_decoder.so");
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function main() {
  const rustDir = resolve("native/video-decoder");
  console.log("Setting up video-decoder native addon...\n");

  const srcMtime = newestRustMtime(resolve(rustDir, "src"));

  for (const { target, arch } of ARCHS) {
    const dest = resolve(`resources/video-decoder.linux-${arch}-gnu.node`);
    const destMtime = fileMtime(dest);

    // Skip if the addon exists and is newer than all Rust source files.
    if (destMtime > 0 && destMtime >= srcMtime) {
      console.log(`Skipping ${arch}: ${dest} is up-to-date.`);
      continue;
    }

    const exitCode = await build(target, rustDir);

    if (exitCode === 0) {
      const src = findArtifact(rustDir, target);
      if (src) {
        copyFileSync(src, dest);
        console.log(`Copied ${src} -> ${dest}`);
        // Symlink into build output directories so dev-mode workers find it
        // without duplicating the binary on every rebuild.
        const fileName = `video-decoder.linux-${arch}-gnu.node`;
        for (const outDir of ["out/main", "out/renderer"]) {
          const dir = resolve(outDir);
          if (!existsSync(dir)) continue;
          const outDest = resolve(dir, fileName);
          if (existsSync(outDest)) {
            try {
              const link = readlinkSync(outDest);
              if (link === dest) {
                console.log(`Symlink up-to-date: ${outDest} -> ${dest}`);
                continue;
              }
            } catch {
              // Not a symlink; remove and recreate.
            }
            try { unlinkSync(outDest); } catch { /* ignore */ }
          }
          try {
            symlinkSync(dest, outDest);
            console.log(`Symlinked ${outDest} -> ${dest}`);
          } catch (err: any) {
            console.warn(`Symlink failed for ${outDest}: ${err.message}. Falling back to copy.`);
            copyFileSync(dest, outDest);
            console.log(`Copied ${dest} -> ${outDest}`);
          }
        }
      } else {
        console.warn(`Warning: build succeeded but artifact not found for ${target}`);
      }
    } else {
      console.warn(
        `Warning: failed to build video-decoder for ${target} (exit ${exitCode}).`
      );
    }
  }

  console.log("\nDone. Video decoder native addon is ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
