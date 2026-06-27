/**
 * Build native C/C++ graphics components:
 *   - GL hook (libember_gl_hook.so) — LD_PRELOAD OpenGL shader injection
 *   - Vulkan layer (VkLayer_ember_shader.so) — Vulkan layer shader injection
 *
 * These are skipped silently if the required compiler / headers are missing,
 * so `bun scripts/build-native.ts` is safe to run on any machine.
 */
import { existsSync, copyFileSync, statSync, mkdirSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

const PROJECT_ROOT = resolve(__dirname, "..");

/** Check that a command exists on PATH. */
function hasCommand(cmd: string): boolean {
  try {
    const result = Bun.spawnSync(["which", cmd], { stdout: "pipe", stderr: "pipe" });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/** Return mtime of a file, or 0 if it doesn't exist. */
function fileMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** Run a command and return its exit code. */
async function run(cmd: string[], cwd: string, label: string): Promise<number> {
  console.log(`Building ${label}...`);
  const proc = Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  await proc.exited;
  return proc.exitCode ?? 1;
}

// ---------------------------------------------------------------------------
// GL Hook (libember_gl_hook.so)
// ---------------------------------------------------------------------------

async function buildGlHook(): Promise<void> {
  const srcDir = resolve(PROJECT_ROOT, "native/gl-hook");
  const srcFile = resolve(srcDir, "glhook.c");
  const destDir = resolve(PROJECT_ROOT, "resources");
  const destFile = resolve(destDir, "libember_gl_hook.so");

  if (!existsSync(srcFile)) {
    console.log("Skipping GL hook: source not found.");
    return;
  }

  // Check for required headers
  const hasGL = existsSync("/usr/include/GL/gl.h") || existsSync("/usr/include/GL/glx.h");
  const hasEGL = existsSync("/usr/include/EGL/egl.h");
  if (!hasGL || !hasEGL) {
    console.log("Skipping GL hook: missing OpenGL/EGL development headers.");
    console.log("  Install: libgl-dev libegl-dev (Debian) or mesa-libGL-devel mesa-libEGL-devel (Fedora)");
    return;
  }

  const cc = hasCommand("gcc") ? "gcc" : hasCommand("cc") ? "cc" : null;
  if (!cc) {
    console.log("Skipping GL hook: no C compiler found (gcc/cc).");
    return;
  }

  const srcMtime = fileMtime(srcFile);
  const destMtime = fileMtime(destFile);
  if (destMtime > 0 && destMtime >= srcMtime) {
    console.log("Skipping GL hook: up-to-date.");
    return;
  }

  const exitCode = await run(
    [cc, "-std=c11", "-fPIC", "-O2", "-Wall", "-Wno-unused-function", "-shared",
     "-o", destFile, srcFile, "-ldl", "-lGL", "-lEGL", "-lX11", "-lpthread"],
    srcDir,
    "GL hook (libember_gl_hook.so)",
  );

  if (exitCode !== 0) {
    console.warn(`Warning: GL hook build failed (exit ${exitCode}).`);
    return;
  }

  console.log(`Copied -> ${destFile}`);

  // Also install to ~/.local/share/ember/ for dev use
  const installDir = resolve(homedir(), ".local/share/ember");
  const installPath = resolve(installDir, "libember_gl_hook.so");
  try {
    if (!existsSync(installDir)) mkdirSync(installDir, { recursive: true });
    copyFileSync(destFile, installPath);
    console.log(`Installed -> ${installPath}`);
  } catch (err: any) {
    console.warn(`Warning: could not install to ${installPath}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Vulkan Layer (VkLayer_ember_shader.so)
// ---------------------------------------------------------------------------

async function buildVulkanLayer(): Promise<void> {
  const srcDir = resolve(PROJECT_ROOT, "native/vulkan-layer");
  const srcFile = resolve(srcDir, "layer.cpp");
  const destDir = resolve(PROJECT_ROOT, "resources/layers");
  const destFile = resolve(destDir, "VkLayer_ember_shader.so");
  const destJson = resolve(destDir, "VkLayer_ember_shader.json");

  if (!existsSync(srcFile)) {
    console.log("Skipping Vulkan layer: source not found.");
    return;
  }

  // Check for Vulkan headers
  const hasVulkan = existsSync("/usr/include/vulkan/vulkan.h");
  if (!hasVulkan) {
    console.log("Skipping Vulkan layer: missing Vulkan development headers.");
    console.log("  Install: libvulkan-dev (Debian) or vulkan-headers (Fedora/Arch)");
    return;
  }

  const cxx = hasCommand("g++") ? "g++" : hasCommand("clang++") ? "clang++" : null;
  if (!cxx) {
    console.log("Skipping Vulkan layer: no C++ compiler found (g++/clang++).");
    return;
  }

  // Check if shaders need to be compiled (only if shader source exists)
  const hasGlslang = hasCommand("glslangValidator");
  const hasXxd = hasCommand("xxd");
  const shaderDir = resolve(srcDir, "shaders");
  const spirvDir = resolve(srcDir, "spirv");
  const vertHeader = resolve(spirvDir, "post_vert.h");
  const fragHeader = resolve(spirvDir, "post_frag.h");

  if (existsSync(resolve(shaderDir, "post.vert")) && existsSync(resolve(shaderDir, "post.frag"))) {
    const vertSrc = fileMtime(resolve(shaderDir, "post.vert"));
    const fragSrc = fileMtime(resolve(shaderDir, "post.frag"));
    const vertHdr = fileMtime(vertHeader);
    const fragHdr = fileMtime(fragHeader);

    if (hasGlslang && hasXxd && (vertHdr < vertSrc || fragHdr < fragSrc || vertHdr === 0 || fragHdr === 0)) {
      console.log("Compiling Vulkan shaders...");
      if (!existsSync(spirvDir)) mkdirSync(spirvDir, { recursive: true });

      const vertSpv = resolve(spirvDir, "post.vert.spv");
      const fragSpv = resolve(spirvDir, "post.frag.spv");

      await run([hasGlslang ? "glslangValidator" : "", "-V", "-o", vertSpv, resolve(shaderDir, "post.vert")], srcDir, "vertex shader");
      await run(["glslangValidator", "-V", "-o", fragSpv, resolve(shaderDir, "post.frag")], srcDir, "fragment shader");
      await run(["xxd", "-i", vertSpv], spirvDir, "vertex header").then(() => {
        // xxd outputs to stdout, redirect to file
      });
      // xxd -i outputs to stdout, so we need shell redirection
      const xxdVert = Bun.spawn(["xxd", "-i", vertSpv], { cwd: spirvDir, stdout: "file", stdoutFile: vertHeader });
      await xxdVert.exited;
      const xxdFrag = Bun.spawn(["xxd", "-i", fragSpv], { cwd: spirvDir, stdout: "file", stdoutFile: fragHeader });
      await xxdFrag.exited;
    } else if (!hasGlslang || !hasXxd) {
      console.log("Skipping shader compilation: glslangValidator or xxd not found.");
      if (!existsSync(vertHeader) || !existsSync(fragHeader)) {
        console.log("  Pre-compiled shader headers not found — Vulkan layer build may fail.");
        console.log("  Install: glslang-tools (Debian) or glslang (Fedora/Arch) and xxd (vim-common)");
      }
    }
  }

  const srcMtime = fileMtime(srcFile);
  const destMtime = fileMtime(destFile);
  if (destMtime > 0 && destMtime >= srcMtime && destMtime >= fileMtime(vertHeader) && destMtime >= fileMtime(fragHeader)) {
    console.log("Skipping Vulkan layer: up-to-date.");
    return;
  }

  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

  const exitCode = await run(
    [cxx, "-std=c++17", "-fPIC", "-O2", "-Wall", "-Wno-unused-function", "-shared",
     "-o", destFile, srcFile, "-lvulkan"],
    srcDir,
    "Vulkan layer (VkLayer_ember_shader.so)",
  );

  if (exitCode !== 0) {
    console.warn(`Warning: Vulkan layer build failed (exit ${exitCode}).`);
    return;
  }

  // Copy the JSON manifest alongside the .so
  const srcJson = resolve(srcDir, "VkLayer_ember_shader.json");
  if (existsSync(srcJson)) {
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    copyFileSync(srcJson, destJson);
  }

  console.log(`Copied -> ${destFile}`);

  // Also install to ~/.local/share/vulkan/explicit_layer.d/ for dev use
  const installDir = resolve(homedir(), ".local/share/vulkan/explicit_layer.d");
  const installPath = resolve(installDir, "VkLayer_ember_shader.so");
  const installJson = resolve(installDir, "VkLayer_ember_shader.json");
  try {
    if (!existsSync(installDir)) mkdirSync(installDir, { recursive: true });
    copyFileSync(destFile, installPath);
    if (existsSync(destJson)) copyFileSync(destJson, installJson);
    console.log(`Installed -> ${installPath}`);
  } catch (err: any) {
    console.warn(`Warning: could not install to ${installPath}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Building native graphics components...\n");
  await buildGlHook();
  console.log();
  await buildVulkanLayer();
  console.log("\nDone. Native graphics components are ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
