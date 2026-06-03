import { existsSync, copyFileSync } from "fs";
import { resolve } from "path";

const ADDON_SRC = resolve("native/libretro-frontend/target/release/liblibretro_frontend.so");
const ADDON_DEST = resolve("resources/libretro-frontend.linux-x64-gnu.node");

async function main() {
  console.log("Setting up libretro native addon...\n");

  if (!existsSync(ADDON_SRC)) {
    console.log("Building Rust native addon...");
    const proc = Bun.spawn({
      cmd: ["cargo", "build", "--release"],
      cwd: resolve("native/libretro-frontend"),
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
    if (proc.exitCode !== 0) {
      console.error("Failed to build Rust native addon");
      process.exit(1);
    }
  }

  if (!existsSync(ADDON_SRC)) {
    console.error(`Addon not found after build: ${ADDON_SRC}`);
    process.exit(1);
  }

  copyFileSync(ADDON_SRC, ADDON_DEST);
  console.log(`Copied ${ADDON_SRC} -> ${ADDON_DEST}`);
  console.log("\nDone. Libretro native addon is ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
