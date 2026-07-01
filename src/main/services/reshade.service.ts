import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  unlinkSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
} from "fs";
import { join } from "path";
import { app } from "electron";
import { spawnSync } from "child_process";
import { Game, ReShadeConfig, TaintEntry, TAINT_ENTRY_VERSION } from "../../shared/types";
import { createLogger } from "../util/logger";
import { getSettings } from "./settings.service";
import { findMainExe } from "./shader-injection.service";

const log = createLogger("info");

const RESHADE_SHADERS_URLS = [
  // Slim branch: provides ReShade.fxh, ReShadeUI.fxh, Macros.fxh, etc. (header files required by legacy shaders)
  "https://github.com/crosire/reshade-shaders/archive/refs/heads/slim.zip",
  // Legacy branch: full collection of .fx effect files (Bloom, DOF, AmbientLight, etc.)
  "https://github.com/crosire/reshade-shaders/archive/refs/heads/legacy.zip",
];
const RESHADE_DLL_PAGE_URL = "https://reshade.me/";

/** Steam app IDs known to be incompatible with ReShade (anti-cheat, etc.) */
const RESHADE_BLOCKED_STEAM_IDS = new Set<number>([
  // Valorant (Vanguard) — not on Steam but listed for completeness
  // Add known incompatible Steam app IDs here as they're discovered
]);

/** Games whose executables match these patterns are likely incompatible */
const RESHADE_BLOCKED_EXE_PATTERNS = [
  /vanguard/i,
  /anticheat/i,
  /easyanticheat/i,
  /battleye/i,
  /eac/i,
];

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function getReShadeDataDir(): string {
  const dir = join(app.getPath("userData"), "reshade");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export async function getReShadeShadersDir(): Promise<string> {
  const settings = await getSettings();
  if (settings.reshadeShadersPath && existsSync(settings.reshadeShadersPath)) {
    return settings.reshadeShadersPath;
  }
  return join(getReShadeDataDir(), "shaders");
}

export async function getReShadeTexturesDir(): Promise<string> {
  const settings = await getSettings();
  if (settings.reshadeTexturesPath && existsSync(settings.reshadeTexturesPath)) {
    return settings.reshadeTexturesPath;
  }
  const dir = join(getReShadeDataDir(), "textures");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getReShadeDllPath(): string {
  return join(getReShadeDataDir(), "ReShade64.dll");
}

export function getReShade32DllPath(): string {
  return join(getReShadeDataDir(), "ReShade32.dll");
}

/**
 * Path to the pre-built Ember ReShade addon DLL (in resources/reshade/).
 * This is copied next to the game exe so ReShade loads it automatically.
 */
export function getReShadeAddonDllPath(): string {
  // resources/ is at the project root (or in the app's resources dir in production)
  const { resolve } = require("path") as typeof import("path");
  const possiblePaths = [
    resolve(app.getAppPath(), "resources", "reshade", "EmberReShadeAddon.dll"),
    resolve(app.getAppPath(), "..", "resources", "reshade", "EmberReShadeAddon.dll"),
    join(process.cwd(), "resources", "reshade", "EmberReShadeAddon.dll"),
  ];
  for (const p of possiblePaths) {
    if (existsSync(p)) return p;
  }
  return possiblePaths[0];
}

// ---------------------------------------------------------------------------
// Compatibility check
// ---------------------------------------------------------------------------

/**
 * Check if a game is compatible with ReShade.
 * Returns false for games known to be incompatible (anti-cheat, etc.)
 */
export function isReShadeCompatible(game: Game): boolean {
  // Only Windows and Steam games are eligible
  if (game.platform !== "windows" && game.platform !== "steam") return false;

  // Check blocklist for Steam games
  if (game.platform === "steam" && game.steamAppId) {
    if (RESHADE_BLOCKED_STEAM_IDS.has(game.steamAppId)) return false;
  }

  // Check exe name patterns
  if (game.mainExe) {
    const exeName = game.mainExe.split(/[\\/]/).pop() ?? "";
    for (const pattern of RESHADE_BLOCKED_EXE_PATTERNS) {
      if (pattern.test(exeName)) return false;
    }
  }

  return true;
}

/**
 * Determine which DLL name to use for ReShade injection.
 * Defaults to dxgi for modern games.
 */
export function resolveReShadeDllName(
  game: Game,
  config: ReShadeConfig,
): string {
  if (config.api && config.api !== "auto") {
    return `${config.api}.dll`;
  }

  // Auto-detect based on exe name or install path
  const exePath = game.mainExe ?? "";
  const exeLower = exePath.toLowerCase();

  // Old DirectX 9 games
  if (exeLower.includes("dx9") || exeLower.includes("d3d9")) {
    return "d3d9.dll";
  }

  // Check for DLLs in the install directory that hint at the API
  if (game.installPath && existsSync(game.installPath)) {
    try {
      const entries = readdirSync(game.installPath);
      const dlls = new Set(entries.map((e) => e.toLowerCase()));
      if (dlls.has("d3d9.dll") && !dlls.has("dxgi.dll") && !dlls.has("d3d11.dll")) {
        return "d3d9.dll";
      }
    } catch {
      // ignore
    }
  }

  // Default: dxgi.dll covers DX10/11/12 on modern Windows
  return "dxgi.dll";
}

// ---------------------------------------------------------------------------
// Shader download & installation
// ---------------------------------------------------------------------------

export type ReShadeProgressCallback = (progress: { step: string; message: string }) => void;

let shaderCheckPromise: Promise<void> | null = null;

/**
 * Ensure reshade-shaders are downloaded and installed.
 * Called on startup. Safe to call multiple times — deduplicates via promise.
 */
export async function ensureReShadeShaders(onProgress?: ReShadeProgressCallback): Promise<void> {
  if (shaderCheckPromise) return shaderCheckPromise;
  shaderCheckPromise = doEnsureReShadeShaders(onProgress);
  try {
    await shaderCheckPromise;
  } finally {
    shaderCheckPromise = null;
  }
}

/**
 * Move extracted shader files into the target directories (flattened).
 * If clearFirst is true, the target directories are wiped before copying.
 * Otherwise, files are merged (existing files are overwritten, new files are added).
 */
async function moveExtractedShaders(
  extractedFolder: string,
  shadersDir: string,
  texturesDir: string,
  clearFirst = true,
): Promise<void> {
  if (clearFirst) {
    if (existsSync(shadersDir)) rmSync(shadersDir, { recursive: true, force: true });
    if (existsSync(texturesDir)) rmSync(texturesDir, { recursive: true, force: true });
  }
  mkdirSync(shadersDir, { recursive: true });
  mkdirSync(texturesDir, { recursive: true });

  const sourceShaders = join(extractedFolder, "Shaders");
  const sourceTextures = join(extractedFolder, "Textures");

  if (existsSync(sourceShaders)) {
    for (const file of readdirSync(sourceShaders)) {
      const src = join(sourceShaders, file);
      const dst = join(shadersDir, file);
      if (existsSync(dst)) rmSync(dst, { force: true });
      renameSync(src, dst);
    }
  }
  if (existsSync(sourceTextures)) {
    for (const file of readdirSync(sourceTextures)) {
      const src = join(sourceTextures, file);
      const dst = join(texturesDir, file);
      if (existsSync(dst)) rmSync(dst, { force: true });
      renameSync(src, dst);
    }
  }
}

async function doEnsureReShadeShaders(onProgress?: ReShadeProgressCallback): Promise<void> {
  const shadersDir = await getReShadeShadersDir();

  // Check if already installed (look for both .fx and .fxh files in shaders dir)
  if (existsSync(shadersDir)) {
    try {
      const files = readdirSync(shadersDir);
      const hasFx = files.some((f) => f.endsWith(".fx"));
      const hasFxh = files.some((f) => f.endsWith(".fxh"));
      if (hasFx && hasFxh) {
        log.info("reshade", "ReShade shaders already present");
        return;
      }
    } catch { /* ignore */ }
  }

  log.info("reshade", "Downloading reshade-shaders...");
  onProgress?.({ step: "download-shaders", message: "Downloading shader pack..." });

  const dataDir = getReShadeDataDir();
  const texturesDir = await getReShadeTexturesDir();
  const zipPath = join(dataDir, "reshade-shaders.zip");
  const extractDir = join(dataDir, ".reshade-extract");

  try {
    for (let i = 0; i < RESHADE_SHADERS_URLS.length; i++) {
      const url = RESHADE_SHADERS_URLS[i];
      const isFirst = i === 0;
      onProgress?.({ step: `download-shaders-${i}`, message: `Downloading shader pack (${i + 1}/${RESHADE_SHADERS_URLS.length})...` });

      await downloadFile(url, zipPath);

      onProgress?.({ step: `extract-shaders-${i}`, message: `Extracting shaders (${i + 1}/${RESHADE_SHADERS_URLS.length})...` });

      // Extract using unzip
      if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true });
      mkdirSync(extractDir, { recursive: true });

      const result = spawnSync("unzip", ["-o", zipPath, "-d", extractDir], {
        stdio: ["ignore", "ignore", "pipe"],
      });

      if (result.status !== 0) {
        log.warn("reshade", `unzip failed: ${result.stderr?.toString() ?? "unknown"}`);
        throw new Error("Failed to extract reshade-shaders zip");
      }

      // Find the extracted folder (reshade-shaders-slim or reshade-shaders-legacy)
      const entries = readdirSync(extractDir);
      const folder = entries.find((e) => {
        try {
          return statSync(join(extractDir, e)).isDirectory() && e.startsWith("reshade-shaders");
        } catch {
          return false;
        }
      });
      if (!folder) {
        throw new Error("Could not find extracted reshade-shaders folder");
      }
      // First download clears the directory, subsequent downloads merge
      await moveExtractedShaders(join(extractDir, folder), shadersDir, texturesDir, isFirst);
    }

    log.info("reshade", "ReShade shaders installed successfully");
    onProgress?.({ step: "shaders-done", message: "Shaders installed" });
  } catch (err) {
    log.warn("reshade", `Failed to download/install reshade-shaders: ${err}`);
  } finally {
    try { unlinkSync(zipPath); } catch { /* ignore */ }
    try { rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// ReShade DLL download
// ---------------------------------------------------------------------------

let dllCheckPromise: Promise<void> | null = null;

/**
 * Ensure the ReShade DLL is downloaded.
 * Downloads the ReShade installer from reshade.me and extracts the DLLs.
 */
export async function ensureReShadeDll(onProgress?: ReShadeProgressCallback): Promise<void> {
  if (existsSync(getReShadeDllPath())) return;
  if (dllCheckPromise) return dllCheckPromise;
  dllCheckPromise = doEnsureReShadeDll(onProgress);
  try {
    await dllCheckPromise;
  } finally {
    dllCheckPromise = null;
  }
}

async function doEnsureReShadeDll(onProgress?: ReShadeProgressCallback): Promise<void> {
  const dllPath = getReShadeDllPath();
  if (existsSync(dllPath)) return;

  log.info("reshade", "Downloading ReShade DLL...");
  onProgress?.({ step: "download-dll", message: "Downloading ReShade DLL..." });

  const dataDir = getReShadeDataDir();
  const installerPath = join(dataDir, "ReShade_Setup.exe");
  const extractDir = join(dataDir, ".reshade-dll-extract");

  try {
    // Scrape the download link from reshade.me homepage (versioned URL, no stable latest redirect)
    const pageResult = spawnSync("curl", ["-L", "-s", "-H", "User-Agent: Ember-HTPC/0.1.0", RESHADE_DLL_PAGE_URL], {
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
      timeout: 30_000,
    });
    if (pageResult.status !== 0 || !pageResult.stdout) {
      throw new Error("Failed to fetch reshade.me homepage");
    }
    const match = pageResult.stdout.match(/href="(\/downloads\/ReShade_Setup_\d+\.\d+\.\d+\.exe)"/);
    if (!match) {
      throw new Error("Could not find ReShade download link on homepage");
    }
    const dllUrl = `https://reshade.me${match[1]}`;
    log.info("reshade", `Found ReShade download URL: ${dllUrl}`);

    await downloadFile(dllUrl, installerPath);

    onProgress?.({ step: "extract-dll", message: "Extracting ReShade DLL..." });

    if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true });
    mkdirSync(extractDir, { recursive: true });

    // Try 7z first (can extract PE files)
    let extracted = false;
    const sevenZipResult = spawnSync("7z", ["x", installerPath, "-o" + extractDir, "-y"], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    if (sevenZipResult.status === 0) {
      extracted = true;
    } else {
      // Try unzip as fallback
      const unzipResult = spawnSync("unzip", ["-o", installerPath, "-d", extractDir], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      if (unzipResult.status === 0) {
        extracted = true;
      }
    }

    if (!extracted) {
      log.warn("reshade", "Could not extract ReShade DLL from installer (7z/unzip not available or failed)");
      log.warn("reshade", "You can manually place ReShade64.dll at: " + dllPath);
      return;
    }

    // Find ReShade64.dll in extracted files
    function findDll(name: string): string | null {
      function scanDir(dir: string): string | null {
        try {
          for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            const stat = statSync(full);
            if (stat.isDirectory()) {
              const found = scanDir(full);
              if (found) return found;
            } else if (entry.toLowerCase() === name.toLowerCase()) {
              return full;
            }
          }
        } catch {
          // ignore
        }
        return null;
      }
      return scanDir(extractDir);
    }

    const dll64 = findDll("ReShade64.dll");
    if (dll64) {
      copyFileSync(dll64, dllPath);
      log.info("reshade", "ReShade64.dll installed successfully");
      onProgress?.({ step: "dll-done", message: "ReShade DLL installed" });
    } else {
      log.warn("reshade", "ReShade64.dll not found in extracted installer");
    }

    const dll32 = findDll("ReShade32.dll");
    if (dll32) {
      copyFileSync(dll32, getReShade32DllPath());
    }
  } catch (err) {
    log.warn("reshade", `Failed to download ReShade DLL: ${err}`);
    log.warn("reshade", "You can manually place ReShade64.dll at: " + dllPath);
  } finally {
    try { unlinkSync(installerPath); } catch { /* ignore */ }
    try { rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Game-level ReShade installation
// ---------------------------------------------------------------------------

/**
 * Get the directory where ReShade DLL and ini should be placed for a game.
 * This is the directory containing the game's main exe (not the install root).
 */
export function getReShadeGameDir(game: Game): string | null {
  // First priority: the directory containing the main exe
  if (game.mainExe) {
    const exeDir = game.mainExe.replace(/[\\/][^\\/]+$/, "");
    if (existsSync(exeDir)) return exeDir;
  }
  // Try to find the exe via findMainExe
  if (game.installPath) {
    const exe = findMainExe(game.installPath, game.title);
    if (exe) {
      const dir = exe.replace(/[\\/][^\\/]+$/, "");
      if (existsSync(dir)) return dir;
    }
    // Last resort: install root
    if (existsSync(game.installPath)) return game.installPath;
  }
  return null;
}

/**
 * Install ReShade for a game: copy DLL, create ReShade.ini with shader paths.
 * Returns taints for cleanup tracking.
 */
export async function installReShadeForGame(
  game: Game,
  config: ReShadeConfig,
): Promise<{ success: boolean; taints: TaintEntry[]; error?: string }> {
  const taints: TaintEntry[] = [];
  const now = Date.now();

  // Ensure DLL is available
  await ensureReShadeDll();

  const dllPath = getReShadeDllPath();
  if (!existsSync(dllPath)) {
    return {
      success: false,
      taints,
      error: "ReShade64.dll not found. Place it at: " + dllPath,
    };
  }

  const gameDir = getReShadeGameDir(game);
  if (!gameDir) {
    return { success: false, taints, error: "Could not determine game directory" };
  }

  const dllName = resolveReShadeDllName(game, config);
  const targetDllPath = join(gameDir, dllName);
  const iniPath = join(gameDir, "ReShade.ini");

  // Copy DLL
  try {
    copyFileSync(dllPath, targetDllPath);
    log.info("reshade", `Copied ReShade DLL as ${dllName} to ${gameDir}`);
    taints.push({
      type: "reshade_dll",
      path: targetDllPath,
      version: TAINT_ENTRY_VERSION,
      createdAt: now,
    });
  } catch (err) {
    return { success: false, taints, error: `Failed to copy DLL: ${err}` };
  }

  // Copy Ember ReShade addon DLL (for runtime control via file polling)
  const addonDllPath = getReShadeAddonDllPath();
  if (existsSync(addonDllPath)) {
    try {
      const targetAddonPath = join(gameDir, "EmberReShadeAddon.dll");
      copyFileSync(addonDllPath, targetAddonPath);
      log.info("reshade", `Copied Ember ReShade addon to ${gameDir}`);
      taints.push({
        type: "reshade_addon",
        path: targetAddonPath,
        version: TAINT_ENTRY_VERSION,
        createdAt: now,
      });
    } catch (err) {
      log.warn("reshade", `Failed to copy addon DLL: ${err}`);
    }
  } else {
    log.warn("reshade", "Ember ReShade addon DLL not found, skipping addon copy");
  }

  // Create ReShade.ini pointing to the central shaders and textures folders
  const shadersDir = await getReShadeShadersDir();
  const texturesDir = await getReShadeTexturesDir();
  // Convert to Windows-style paths for Wine/Proton
  const winShadersDir = toWinePath(shadersDir);
  const winTexturesDir = toWinePath(texturesDir);

  const iniLines = [
    "[GENERAL]",
    `EffectSearchPaths=${winShadersDir}`,
    `TextureSearchPaths=${winTexturesDir}`,
    "PresetPath=",
    "PresetTransitionStyle=0",
    "AddonPath=.",
    "",
    "[INPUT]",
    "KeyOverlay=36",
    "KeyEffects=46",
    "KeyNextEffect=47",
    "KeyPreviousEffect=48",
    "KeyScreenshot=44",
    "",
    "[APP]",
    "",
  ];

  // Apply custom ini overrides from the per-game ReShadeConfig
  if (config.iniOverrides && config.iniOverrides.length > 0) {
    // Group overrides by section
    const bySection = new Map<string, { key: string; value: string }[]>();
    for (const ov of config.iniOverrides) {
      const existing = bySection.get(ov.section) ?? [];
      existing.push({ key: ov.key, value: ov.value });
      bySection.set(ov.section, existing);
    }
    for (const [section, entries] of bySection) {
      // Check if section already exists in iniLines
      const sectionHeader = `[${section}]`;
      const sectionIdx = iniLines.indexOf(sectionHeader);
      if (sectionIdx >= 0) {
        // Insert after the section header
        for (const entry of entries) {
          iniLines.splice(sectionIdx + 1, 0, `${entry.key}=${entry.value}`);
        }
      } else {
        // Add new section
        iniLines.push("", sectionHeader);
        for (const entry of entries) {
          iniLines.push(`${entry.key}=${entry.value}`);
        }
      }
    }
    log.info("reshade", `Applied ${config.iniOverrides.length} ini overrides to ReShade.ini`);
  }

  const iniContent = iniLines.join("\n");

  try {
    writeFileSync(iniPath, iniContent, "utf-8");
    log.info("reshade", `Wrote ReShade.ini to ${gameDir}`);
    taints.push({
      type: "reshade_ini",
      path: iniPath,
      version: TAINT_ENTRY_VERSION,
      createdAt: now,
    });
  } catch (err) {
    // Clean up the DLL if ini write failed
    try { unlinkSync(targetDllPath); } catch { /* ignore */ }
    return { success: false, taints, error: `Failed to write ReShade.ini: ${err}` };
  }

  return { success: true, taints };
}

/**
 * Build WINEDLLOVERRIDES entry for ReShade.
 * The injected DLL needs to be loaded as native, then builtin.
 */
export function buildReShadeDllOverride(
  game: Game,
  config: ReShadeConfig,
  existingOverrides?: string,
): string {
  const dllName = resolveReShadeDllName(game, config);
  const dllBase = dllName.replace(/\.dll$/i, "");
  const reshadeOverride = `${dllBase}=n,b`;

  if (existingOverrides) {
    // Merge: remove any existing override for the same DLL, then add ours
    const parts = existingOverrides.split(";").filter((p) => {
      const name = p.split("=")[0].trim().toLowerCase();
      return name !== dllBase.toLowerCase();
    });
    parts.push(reshadeOverride);
    return parts.join(";");
  }

  return reshadeOverride;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Download a file using curl (follows redirects, handles HTTPS).
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const result = spawnSync("curl", [
    "-L", "-s", "-f",
    "-H", "User-Agent: Ember-HTPC/0.1.0",
    "-o", destPath,
    url,
  ], {
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 120_000,
    encoding: "utf-8",
  });

  if (result.status !== 0 || !existsSync(destPath)) {
    const errMsg = result.stderr?.trim() || `curl exited with code ${result.status}`;
    throw new Error(`curl failed: ${errMsg}`);
  }

  // Validate file is not empty or an HTML error page
  const stat = statSync(destPath);
  if (stat.size < 1024) {
    const content = readFileSync(destPath, "utf-8").trim();
    try { unlinkSync(destPath); } catch { /* ignore */ }
    throw new Error(`Downloaded file too small (${stat.size} bytes), likely an error page: ${content.slice(0, 200)}`);
  }
}

/**
 * Convert a Linux path to a Windows-style path for Wine/Proton.
 * e.g., /home/user/.local/share/ember/reshade/reshade-shaders
 *    -> Z:\home\user\.local\share\ember\reshade\reshade-shaders
 */
function toWinePath(linuxPath: string): string {
  return "Z:" + linuxPath.replace(/\//g, "\\");
}

/**
 * Open the ReShade data folder (parent of shaders/textures) in the system file manager.
 */
export async function openReShadeFolder(): Promise<void> {
  const dir = getReShadeDataDir();
  const { shell } = await import("electron");
  await shell.openPath(dir);
}

/**
 * Get the current ReShade installation status.
 */
export async function getReShadeStatus(): Promise<{
  shadersInstalled: boolean;
  dllInstalled: boolean;
  shadersPath: string;
  texturesPath: string;
  dllPath: string;
}> {
  const shadersDir = await getReShadeShadersDir();
  const texturesDir = await getReShadeTexturesDir();
  return {
    shadersInstalled: existsSync(shadersDir) && readdirSync(shadersDir).some((f) => f.endsWith(".fx") || f.endsWith(".fxh")),
    dllInstalled: existsSync(getReShadeDllPath()),
    shadersPath: shadersDir,
    texturesPath: texturesDir,
    dllPath: getReShadeDllPath(),
  };
}
