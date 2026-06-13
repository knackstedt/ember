import { existsSync, copyFileSync } from "fs";
import { resolve } from "path";

const ARCHS = [
  { target: "x86_64-unknown-linux-gnu", arch: "x64" },
  { target: "aarch64-unknown-linux-gnu", arch: "arm64" },
] as const;

async function build(target: string, cwd: string): Promise<number> {
  console.log(`Building video-decoder for ${target}...`);
  const env: Record<string, string> = { ...process.env };
  if (target === "aarch64-unknown-linux-gnu") {
    env.PKG_CONFIG_ALLOW_CROSS = "1";
    env.PKG_CONFIG_SYSROOT_DIR = "/usr/aarch64-linux-gnu";
    // Force the cross-linker; without this Rust defaults to rust-lld
    // which is the host (x86_64) linker and cannot link aarch64 objects.
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
  const dir = resolve(rustDir, `target/${target}/release`);
  const candidate = resolve(dir, "libvideo_decoder.so");
  if (existsSync(candidate)) {
    return candidate;
  }
  return undefined;
}

async function main() {
  const rustDir = resolve("native/video-decoder");
  console.log("Setting up video-decoder native addon...\n");

  for (const { target, arch } of ARCHS) {
    const dest = resolve(`resources/video-decoder.linux-${arch}-gnu.node`);
    const exitCode = await build(target, rustDir);

    if (exitCode === 0) {
      const src = findArtifact(rustDir, target);
      if (src) {
        copyFileSync(src, dest);
        console.log(`Copied ${src} -> ${dest}`);
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
