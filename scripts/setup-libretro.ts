import { existsSync, copyFileSync } from "fs";
import { resolve } from "path";

const ARCHS = [
  { target: "x86_64-unknown-linux-gnu", arch: "x64", dir: "target/release" },
  { target: "aarch64-unknown-linux-gnu", arch: "arm64", dir: "target/aarch64-unknown-linux-gnu/release" },
] as const;

async function buildArch(target: string, cwd: string): Promise<number> {
  console.log(`Building libretro-frontend for ${target}...`);
  const env: Record<string, string> = { ...process.env };
  if (target === "aarch64-unknown-linux-gnu") {
    env.PKG_CONFIG_ALLOW_CROSS = "1";
    env.PKG_CONFIG_SYSROOT_DIR = "/usr/aarch64-linux-gnu";
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

async function main() {
  const rustDir = resolve("native/libretro-frontend");
  console.log("Setting up libretro native addon...\n");

  for (const { target, arch, dir } of ARCHS) {
    const src = resolve(rustDir, dir, "liblibretro_frontend.so");
    const dest = resolve(`resources/libretro-frontend.linux-${arch}-gnu.node`);

    if (!existsSync(src)) {
      const exitCode = await buildArch(target, rustDir);
      if (exitCode !== 0) {
        console.warn(`Warning: failed to build ${target} (exit ${exitCode}). Skipping ${arch}.`);
        continue;
      }
    }

    if (!existsSync(src)) {
      console.error(`Addon not found after build: ${src}`);
      process.exit(1);
    }

    copyFileSync(src, dest);
    console.log(`Copied ${src} -> ${dest}`);
  }

  console.log("\nDone. Libretro native addons are ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
