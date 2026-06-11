import { existsSync, copyFileSync } from "fs";
import { resolve } from "path";

const ARCHS = [
  { target: "x86_64-unknown-linux-gnu", arch: "x64" },
  { target: "aarch64-unknown-linux-gnu", arch: "arm64" },
] as const;

async function buildFeature(
  target: string,
  feature: string,
  cwd: string
): Promise<number> {
  console.log(`Building video-decoder (${feature}) for ${target}...`);
  const env: Record<string, string> = { ...process.env };
  if (target === "aarch64-unknown-linux-gnu") {
    env.PKG_CONFIG_ALLOW_CROSS = "1";
    env.PKG_CONFIG_SYSROOT_DIR = "/usr/aarch64-linux-gnu";
  }
  const proc = Bun.spawn({
    cmd: [
      "cargo",
      "build",
      "--release",
      "--target",
      target,
      "--features",
      feature,
    ],
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env,
  });
  await proc.exited;
  return proc.exitCode ?? 1;
}

function findArtifact(
  rustDir: string,
  target: string,
  feature: string
): string | undefined {
  const dir =
    feature === "ffmpeg"
      ? resolve(rustDir, `target/ffmpeg/${target}/release`)
      : resolve(rustDir, `target/gstreamer/${target}/release`);
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
    // Build FFmpeg backend
    {
      const dest = resolve(
        `resources/video-decoder-ffmpeg.linux-${arch}-gnu.node`
      );
      const env: Record<string, string> = {
        ...process.env,
        CARGO_TARGET_DIR: resolve(rustDir, "target/ffmpeg"),
      };
      if (target === "aarch64-unknown-linux-gnu") {
        env.PKG_CONFIG_ALLOW_CROSS = "1";
        env.PKG_CONFIG_SYSROOT_DIR = "/usr/aarch64-linux-gnu";
      }

      const proc = Bun.spawn({
        cmd: [
          "cargo",
          "build",
          "--release",
          "--target",
          target,
          "--features",
          "ffmpeg",
        ],
        cwd: rustDir,
        stdout: "inherit",
        stderr: "inherit",
        env,
      });
      await proc.exited;

      if (proc.exitCode === 0) {
        const src = findArtifact(rustDir, target, "ffmpeg");
        if (src) {
          copyFileSync(src, dest);
          console.log(`Copied ${src} -> ${dest}`);
        }
      } else {
        console.warn(
          `Warning: failed to build FFmpeg backend for ${target} (exit ${proc.exitCode}).`
        );
      }
    }

    // Build GStreamer backend
    {
      const dest = resolve(
        `resources/video-decoder-gstreamer.linux-${arch}-gnu.node`
      );
      const env: Record<string, string> = {
        ...process.env,
        CARGO_TARGET_DIR: resolve(rustDir, "target/gstreamer"),
      };
      if (target === "aarch64-unknown-linux-gnu") {
        env.PKG_CONFIG_ALLOW_CROSS = "1";
        env.PKG_CONFIG_SYSROOT_DIR = "/usr/aarch64-linux-gnu";
      }

      const proc = Bun.spawn({
        cmd: [
          "cargo",
          "build",
          "--release",
          "--target",
          target,
          "--features",
          "gstreamer",
        ],
        cwd: rustDir,
        stdout: "inherit",
        stderr: "inherit",
        env,
      });
      await proc.exited;

      if (proc.exitCode === 0) {
        const src = findArtifact(rustDir, target, "gstreamer");
        if (src) {
          copyFileSync(src, dest);
          console.log(`Copied ${src} -> ${dest}`);
        }
      } else {
        console.warn(
          `Warning: failed to build GStreamer backend for ${target} (exit ${proc.exitCode}).`
        );
      }
    }
  }

  console.log("\nDone. Video decoder native addons are ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
