import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, copyFileSync, readdirSync, statSync } from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { Game, GameInjectionConfig, VulkanShaderConfig, DllInjectionConfig } from "../../shared/types";
import { createLogger } from "../util/logger";
import { getSettings } from "./settings.service";

const log = createLogger("info");

/** Ember marker comment placed in generated user_settings.py files */
const EMBER_MARKER = "# EMBER_SHADER_INJECTION_V1";
/** Backup suffix for pre-existing user_settings.py files */
const EMBER_BACKUP_SUFFIX = ".ember-backup";

/** Available shader presets for the Vulkan layer */
export const VULKAN_SHADER_PRESETS = [
  { id: "crt", name: "CRT" },
  { id: "bloom", name: "Bloom" },
  { id: "color-grade", name: "Color Grade" },
  { id: "fxaa", name: "FXAA" },
  { id: "cas", name: "Contrast Adaptive Sharpening" },
  { id: "grayscale", name: "Grayscale" },
  { id: "sepia", name: "Sepia" },
  { id: "vignette", name: "Vignette" },
  { id: "film-grain", name: "Film Grain" },
  { id: "chromatic-aberration", name: "Chromatic Aberration" },
  { id: "sharpen", name: "Sharpen" },
  { id: "blur", name: "Gaussian Blur" },
  { id: "pixelate", name: "Pixelate" },
  { id: "posterize", name: "Posterize" },
  { id: "invert", name: "Invert" },
  { id: "scanline", name: "Scanline" },
  { id: "vhs", name: "VHS" },
  { id: "night-vision", name: "Night Vision" },
  { id: "thermal", name: "Thermal" },
  { id: "edge-detect", name: "Edge Detect" },
  { id: "emboss", name: "Emboss" },
  { id: "retro-pixel", name: "Retro Pixel" },
] as const;

/** Parameter definition for a shader preset */
export interface ShaderParamDef {
  /** Display label for the parameter */
  label: string;
  /** Minimum value for the slider */
  min: number;
  /** Maximum value for the slider */
  max: number;
  /** Slider step */
  step: number;
  /** Default value */
  default: number;
}

/** Per-preset parameter definitions. Each key is a preset id, value is an array of up to 8 params. */
export const SHADER_PARAM_DEFS: Record<string, ShaderParamDef[]> = {
  crt: [
    { label: "Scanline Strength", min: 0, max: 1, step: 0.05, default: 0.3 },
    { label: "RGB Aberration", min: 0, max: 0.01, step: 0.0005, default: 0.002 },
    { label: "Vignette Strength", min: 0, max: 2, step: 0.1, default: 0.8 },
  ],
  bloom: [
    { label: "Radius", min: 0.001, max: 0.05, step: 0.001, default: 0.01 },
    { label: "Mix Amount", min: 0, max: 1, step: 0.05, default: 0.5 },
  ],
  "color-grade": [
    { label: "Warmth", min: 0, max: 0.5, step: 0.01, default: 0.1 },
    { label: "Contrast", min: 0, max: 1, step: 0.05, default: 0.2 },
    { label: "Saturation", min: 0, max: 1, step: 0.05, default: 0.3 },
  ],
  fxaa: [
    { label: "Edge Threshold", min: 0.01, max: 0.2, step: 0.01, default: 0.05 },
  ],
  cas: [
    { label: "Sharpness", min: 0, max: 2, step: 0.1, default: 1.0 },
  ],
  grayscale: [],
  sepia: [],
  vignette: [
    { label: "Inner Radius", min: 0.1, max: 0.6, step: 0.05, default: 0.3 },
    { label: "Outer Radius", min: 0.4, max: 1.0, step: 0.05, default: 0.8 },
  ],
  "film-grain": [
    { label: "Noise Amount", min: 0, max: 0.5, step: 0.01, default: 0.15 },
  ],
  "chromatic-aberration": [
    { label: "Shift Amount", min: 0, max: 0.05, step: 0.001, default: 0.01 },
  ],
  sharpen: [
    { label: "Amount", min: 0, max: 5, step: 0.1, default: 2.0 },
  ],
  blur: [
    { label: "Sigma", min: 0.5, max: 10, step: 0.5, default: 2.0 },
  ],
  pixelate: [
    { label: "Max Pixel Count", min: 64, max: 1024, step: 32, default: 512 },
  ],
  posterize: [
    { label: "Max Levels", min: 2, max: 64, step: 1, default: 32 },
  ],
  invert: [],
  scanline: [
    { label: "Strength", min: 0, max: 1, step: 0.05, default: 0.4 },
  ],
  vhs: [
    { label: "Warp Amount", min: 0, max: 0.02, step: 0.001, default: 0.003 },
    { label: "Noise Amount", min: 0, max: 0.5, step: 0.01, default: 0.1 },
  ],
  "night-vision": [
    { label: "Gain", min: 0, max: 5, step: 0.5, default: 2.0 },
    { label: "Noise Amount", min: 0, max: 0.2, step: 0.01, default: 0.05 },
  ],
  thermal: [
    { label: "Gain", min: 0, max: 3, step: 0.1, default: 1.0 },
  ],
  "edge-detect": [
    { label: "Sensitivity", min: 0.5, max: 10, step: 0.5, default: 3.0 },
  ],
  emboss: [],
  "retro-pixel": [
    { label: "Max Pixel Count", min: 32, max: 512, step: 16, default: 256 },
    { label: "Max Levels", min: 2, max: 32, step: 1, default: 16 },
  ],
};

/**
 * Find the Steam compatdata (Proton prefix) directory for a given Steam app ID.
 * Searches all Steam library folders.
 */
export function findCompatDataPath(steamAppId: number): string | null {
  const steamRoots = [
    join(homedir(), ".steam", "steam"),
    join(homedir(), ".local", "share", "Steam"),
  ];

  for (const steamRoot of steamRoots) {
    if (!existsSync(steamRoot)) continue;

    // Primary library
    const primaryCompat = join(steamRoot, "steamapps", "compatdata", String(steamAppId));
    if (existsSync(primaryCompat)) return primaryCompat;

    // Check libraryfolders.vdf for additional libraries
    const libraryFoldersPath = join(steamRoot, "steamapps", "libraryfolders.vdf");
    if (existsSync(libraryFoldersPath)) {
      try {
        const content = readFileSync(libraryFoldersPath, "utf-8");
        const pathMatches = content.matchAll(/"path"\s+"([^"]+)"/g);
        for (const [, p] of pathMatches) {
          const libCompat = join(p, "steamapps", "compatdata", String(steamAppId));
          if (existsSync(libCompat)) return libCompat;
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return null;
}

/**
 * Find the Proton prefix (pfx) directory for a Steam game.
 */
export function findProtonPfxPath(steamAppId: number): string | null {
  const compatData = findCompatDataPath(steamAppId);
  if (!compatData) return null;
  const pfx = join(compatData, "pfx");
  return existsSync(pfx) ? pfx : null;
}

/**
 * Find all Proton installation directories.
 * Proton looks for user_settings.py in its own installation directory
 * (where the `proton` script lives), NOT in the Wine prefix.
 * Proton installations are in:
 */
// * - <steam>/steamapps/common/Proton*/ (official Proton)
// * - <steam>/compatibilitytools.d/*/ (custom Proton like GE-Proton)
export function findProtonInstallations(): string[] {
  const steamRoots = [
    join(homedir(), ".steam", "steam"),
    join(homedir(), ".local", "share", "Steam"),
  ];

  const protonDirs: string[] = [];

  function scanForProton(commonDir: string) {
    if (!existsSync(commonDir)) return;
    try {
      for (const entry of readdirSync(commonDir)) {
        const lower = entry.toLowerCase();
        if (!lower.startsWith("proton")) continue;
        const dir = join(commonDir, entry);
        if (existsSync(join(dir, "proton"))) {
          protonDirs.push(dir);
        }
      }
    } catch {
      // ignore
    }
  }

  for (const steamRoot of steamRoots) {
    if (!existsSync(steamRoot)) continue;

    // steamapps/common/Proton*
    scanForProton(join(steamRoot, "steamapps", "common"));

    // compatibilitytools.d/* (custom Proton versions like GE-Proton)
    const compatToolsDir = join(steamRoot, "compatibilitytools.d");
    if (existsSync(compatToolsDir)) {
      try {
        for (const entry of readdirSync(compatToolsDir)) {
          const dir = join(compatToolsDir, entry);
          if (existsSync(join(dir, "proton"))) {
            protonDirs.push(dir);
          }
        }
      } catch {
        // ignore
      }
    }

    // Check libraryfolders.vdf for additional Steam libraries
    const libraryFoldersPath = join(steamRoot, "steamapps", "libraryfolders.vdf");
    if (existsSync(libraryFoldersPath)) {
      try {
        const content = readFileSync(libraryFoldersPath, "utf-8");
        const pathMatches = content.matchAll(/"path"\s+"([^"]+)"/g);
        for (const [, p] of pathMatches) {
          scanForProton(join(p, "steamapps", "common"));
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return [...new Set(protonDirs)];
}

/**
 * Get user_settings.py paths in all Proton installation directories.
 * Proton loads user_settings.py from its own installation directory,
 * not from the Wine prefix.
 */
export function getUserSettingsPyPaths(): string[] {
  return findProtonInstallations().map((dir) => join(dir, "user_settings.py"));
}

/**
 * Check if a user_settings.py file exists and whether it was created by Ember.
 * Checks all Proton installations.
 * Returns: "none" | "ember" | "external"
 */
export function checkUserSettingsPy(_steamAppId: number): "none" | "ember" | "external" {
  const paths = getUserSettingsPyPaths();
  if (paths.length === 0) return "none";

  let hasEmber = false;
  let hasExternal = false;

  for (const pyPath of paths) {
    if (!existsSync(pyPath)) continue;
    try {
      const content = readFileSync(pyPath, "utf-8");
      if (content.includes(EMBER_MARKER)) {
        hasEmber = true;
      } else {
        hasExternal = true;
      }
    } catch {
      // ignore
    }
  }

  if (hasExternal) return "external";
  if (hasEmber) return "ember";
  return "none";
}

/**
 * Write user_settings.py files to all Proton installation directories.
 * Uses the user_settings dict format that Proton expects:
 *   user_settings = { "KEY": "value", ... }
 * Proton does `import user_settings` then reads `user_settings.user_settings.items()`
 * and merges via `self.env.setdefault(key, value)`.
 *
 * The file checks STEAM_COMPAT_APP_ID so settings only apply to the target game.
 */
export function writeUserSettingsPy(
  steamAppId: number,
  envVars: Record<string, string>,
  overrideExisting: boolean,
): { success: boolean; backedUp?: boolean; error?: string } {
  const paths = getUserSettingsPyPaths();
  if (paths.length === 0) {
    return { success: false, error: "Could not find any Proton installations" };
  }

  let backedUp = false;
  let anySuccess = false;
  const errors: string[] = [];

  for (const pyPath of paths) {
    let isExternal = false;
    if (existsSync(pyPath)) {
      try {
        const content = readFileSync(pyPath, "utf-8");
        if (!content.includes(EMBER_MARKER)) {
          isExternal = true;
        }
      } catch {
        // ignore read errors
      }
    }

    if (isExternal) {
      if (!overrideExisting) {
        errors.push(`External user_settings.py exists at ${pyPath}`);
        continue;
      }
      const backupPath = pyPath + EMBER_BACKUP_SUFFIX;
      try {
        copyFileSync(pyPath, backupPath);
        backedUp = true;
        log.info("shader-injection", `Backed up existing user_settings.py to ${backupPath}`);
      } catch (err) {
        log.warn("shader-injection", `Failed to backup user_settings.py: ${err}`);
      }
    }

    // Build the Python file content using user_settings dict format.
    // Proton does: import user_settings; for k,v in user_settings.user_settings.items(): self.env.setdefault(k, v)
    const entries = Object.entries(envVars).map(
      ([key, value]) => `    "${key}": "${value.replace(/"/g, '\\"')}",`,
    );

    const lines: string[] = [
      EMBER_MARKER,
      "# This file was auto-generated by Ember HTPC for shader injection.",
      "# It will be automatically removed when the game closes.",
      "# Do not edit manually — Ember will overwrite it on next launch.",
      "",
      "import os",
      '_ember_app_id = os.environ.get("STEAM_COMPAT_APP_ID", "") or os.environ.get("SteamAppId", "")',
      `if _ember_app_id == "${String(steamAppId)}":`,
      "    user_settings = {",
      ...entries,
      "    }",
      "else:",
      "    user_settings = {}",
      "",
    ];

    try {
      writeFileSync(pyPath, lines.join("\n"), "utf-8");
      anySuccess = true;
      log.info("shader-injection", `Wrote user_settings.py to ${pyPath} for Steam app ${steamAppId}`);
    } catch (err) {
      errors.push(`Failed to write ${pyPath}: ${err}`);
    }
  }

  if (anySuccess) {
    return { success: true, backedUp };
  }
  return { success: false, error: errors.join("; ") };
}

/**
 * Remove Ember-generated user_settings.py files from all Proton installations
 * and restore backups if they exist.
 */
export function cleanupUserSettingsPy(_steamAppId: number): void {
  const paths = getUserSettingsPyPaths();

  for (const pyPath of paths) {
    if (!existsSync(pyPath)) continue;

    try {
      const content = readFileSync(pyPath, "utf-8");
      if (!content.includes(EMBER_MARKER)) continue;
    } catch {
      continue;
    }

    try {
      unlinkSync(pyPath);
      log.info("shader-injection", `Removed Ember user_settings.py at ${pyPath}`);
    } catch (err) {
      log.warn("shader-injection", `Failed to remove user_settings.py: ${err}`);
    }

    // Restore backup if it exists
    const backupPath = pyPath + EMBER_BACKUP_SUFFIX;
    if (existsSync(backupPath)) {
      try {
        copyFileSync(backupPath, pyPath);
        unlinkSync(backupPath);
        log.info("shader-injection", `Restored original user_settings.py from backup at ${pyPath}`);
      } catch (err) {
        log.warn("shader-injection", `Failed to restore user_settings.py backup: ${err}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Steam Launch Options — for native Linux Steam games (not using Proton)
// ---------------------------------------------------------------------------

const EMBER_LAUNCH_OPTIONS_MARKER = "#ember-inject";

/**
 * Find the Steam user's localconfig.vdf file.
 */
function findSteamLocalConfigPath(): string | null {
  const steamRoots = [
    join(homedir(), ".steam", "steam"),
    join(homedir(), ".local", "share", "Steam"),
  ];
  for (const root of steamRoots) {
    const userdataDir = join(root, "userdata");
    if (!existsSync(userdataDir)) continue;
    try {
      for (const entry of readdirSync(userdataDir)) {
        const configPath = join(userdataDir, entry, "config", "localconfig.vdf");
        if (existsSync(configPath)) return configPath;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Read the current LaunchOptions for a Steam game from localconfig.vdf.
 * Returns null if no launch options are set.
 */
export function getSteamLaunchOptions(steamAppId: number): string | null {
  const configPath = findSteamLocalConfigPath();
  if (!configPath) return null;
  try {
    const content = readFileSync(configPath, "utf-8");
    // Find the app block: "appid" followed by { ... }
    const appIdStr = String(steamAppId);
    const appBlockPattern = new RegExp(
      `"(\\d+)"\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`,
      "g",
    );
    let match: RegExpExecArray | null;
    while ((match = appBlockPattern.exec(content)) !== null) {
      if (match[1] !== appIdStr) continue;
      const block = match[2];
      const loMatch = block.match(/"LaunchOptions"\s*"((?:[^"\\]|\\.)*)"/);
      if (loMatch) {
        return loMatch[1].replace(/\\(.)/g, "$1");
      }
      return null;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Set LaunchOptions for a Steam game in localconfig.vdf.
 * Returns the original launch options (for restoration), or null if none existed.
 */
export function setSteamLaunchOptions(
  steamAppId: number,
  options: string,
): { original: string | null; configPath: string } | null {
  const configPath = findSteamLocalConfigPath();
  if (!configPath) return null;

  try {
    const content = readFileSync(configPath, "utf-8");
    const appIdStr = String(steamAppId);

    // Find the app block
    const appBlockPattern = new RegExp(
      `("(\\d+)"\\s*\\{)([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)(\\})`,
      "g",
    );
    let match: RegExpExecArray | null;
    let modified = false;
    let original: string | null = null;
    let newContent = content;

    while ((match = appBlockPattern.exec(content)) !== null) {
      if (match[2] !== appIdStr) continue;
      const blockOpen = match[1];
      const blockBody = match[3];
      const blockClose = match[4];

      // Check if LaunchOptions already exists
      const loPattern = /"LaunchOptions"\s*"((?:[^"\\]|\\.)*)"/;
      const loMatch = blockBody.match(loPattern);

      if (loMatch) {
        original = loMatch[1].replace(/\\(.)/g, "$1");
        // Replace existing LaunchOptions value
        const newBody = blockBody.replace(
          loPattern,
          `"LaunchOptions"                "${options.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
        );
        newContent =
          newContent.slice(0, match.index) +
          blockOpen +
          newBody +
          blockClose +
          newContent.slice(match.index + match[0].length);
      } else {
        // Insert LaunchOptions at the beginning of the block
        original = null;
        const newBody = `\n                                                "LaunchOptions"                "${options.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"${blockBody}`;
        newContent =
          newContent.slice(0, match.index) +
          blockOpen +
          newBody +
          blockClose +
          newContent.slice(match.index + match[0].length);
      }
      modified = true;
      break;
    }

    if (!modified) {
      log.warn("shader-injection", `Could not find app block for ${steamAppId} in localconfig.vdf`);
      return null;
    }

    writeFileSync(configPath, newContent, "utf-8");
    log.info("shader-injection", `Set Steam launch options for app ${steamAppId}: ${options}`);
    return { original, configPath };
  } catch (err) {
    log.warn("shader-injection", `Failed to set Steam launch options: ${err}`);
    return null;
  }
}

/**
 * Restore original LaunchOptions (or remove if none existed).
 */
export function restoreSteamLaunchOptions(
  steamAppId: number,
  original: string | null,
  configPath: string,
): void {
  try {
    const content = readFileSync(configPath, "utf-8");
    const appIdStr = String(steamAppId);

    const appBlockPattern = new RegExp(
      `("(\\d+)"\\s*\\{)([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)(\\})`,
      "g",
    );
    let match: RegExpExecArray | null;
    let newContent = content;

    while ((match = appBlockPattern.exec(content)) !== null) {
      if (match[2] !== appIdStr) continue;
      const blockOpen = match[1];
      const blockBody = match[3];
      const blockClose = match[4];

      const loPattern = /\n?\s*"LaunchOptions"\s*"(?:[^"\\]|\\.)*"/;
      if (original) {
        // Restore original value
        newContent =
          newContent.slice(0, match.index) +
          blockOpen +
          blockBody.replace(
            loPattern,
            `\n                                                "LaunchOptions"                "${original.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
          ) +
          blockClose +
          newContent.slice(match.index + match[0].length);
      } else {
        // Remove LaunchOptions entirely
        newContent =
          newContent.slice(0, match.index) +
          blockOpen +
          blockBody.replace(loPattern, "") +
          blockClose +
          newContent.slice(match.index + match[0].length);
      }
      break;
    }

    writeFileSync(configPath, newContent, "utf-8");
    log.info("shader-injection", `Restored Steam launch options for app ${steamAppId}`);
  } catch (err) {
    log.warn("shader-injection", `Failed to restore Steam launch options: ${err}`);
  }
}

/**
 * Build a launch options string from injection env vars.
 * Format: "ENV1=val1 ENV2=val2 %command%"
 */
export function buildLaunchOptionsString(envVars: Record<string, string>): string {
  const parts = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
  return [...parts, "%command%"].join(" ");
}

/**
 * Check if a Steam game uses Proton (has a compatdata/pfx directory).
 */
export function isSteamGameProton(steamAppId: number): boolean {
  const compatData = findCompatDataPath(steamAppId);
  if (!compatData) return false;
  return existsSync(join(compatData, "pfx"));
}

/**
 * Get the path to the Ember Vulkan layer shared library.
 * Checks settings override, then default locations.
 */
export function getVulkanLayerPath(): string | null {
  // Check if we have a settings override
  // (read synchronously from default location since this is called in launch path)
  const defaultPaths = [
    join(process.resourcesPath ?? "", "layers", "VkLayer_ember_shader.so"),
    join(__dirname, "..", "..", "..", "resources", "layers", "VkLayer_ember_shader.so"),
    join(__dirname, "..", "..", "..", "native", "vulkan-layer", "VkLayer_ember_shader.so"),
    join(homedir(), ".local", "share", "vulkan", "explicit_layer.d", "VkLayer_ember_shader.so"),
    "/opt/ember/layers/VkLayer_ember_shader.so",
  ];

  for (const p of defaultPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

/**
 * Get the directory containing the Vulkan layer manifest JSON.
 */
export function getVulkanLayerDir(): string | null {
  const layerPath = getVulkanLayerPath();
  if (!layerPath) return null;
  return dirname(layerPath);
}

/**
 * Build environment variables for Vulkan layer injection.
 */
export function buildVulkanLayerEnv(config: VulkanShaderConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const layerPath = getVulkanLayerPath();
  const layerDir = layerPath ? dirname(layerPath) : null;

  if (layerDir) {
    env["VK_INSTANCE_LAYERS"] = "VK_LAYER_ember_shader";
    env["VK_LAYER_PATH"] = layerDir;
    env["EMBER_SHADER_PRESET"] = config.preset;
    if (config.intensity !== undefined) {
      env["EMBER_SHADER_INTENSITY"] = String(config.intensity);
    }
    if (config.params) {
      for (let i = 0; i < Math.min(config.params.length, 8); i++) {
        if (config.params[i] !== undefined && config.params[i] !== null) {
          env[`EMBER_SHADER_PARAM${i}`] = String(config.params[i]);
        }
      }
    }
    log.info("shader-injection", `Vulkan layer env: layerPath=${layerPath}, dir=${layerDir}, preset=${config.preset}`);
  } else {
    log.warn("shader-injection", "Vulkan layer .so not found — shader injection will not work");
  }

  return env;
}

/**
 * Get the path to the installed GL hook shared library.
 */
export function getGLHookPath(): string | null {
  const home = homedir();
  const path = join(home, ".local", "share", "ember", "libember_gl_hook.so");
  return existsSync(path) ? path : null;
}

/**
 * Build environment variables for OpenGL LD_PRELOAD hook injection.
 * Used for native Linux OpenGL games where the Vulkan layer can't hook
 * (e.g. NVIDIA proprietary + GLX games).
 */
export function buildGLHookEnv(config: VulkanShaderConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const hookPath = getGLHookPath();

  if (hookPath) {
    env["LD_PRELOAD"] = hookPath;
    env["EMBER_GL_HOOK_LIB"] = hookPath;
    env["EMBER_SHADER_PRESET"] = config.preset;
    if (config.intensity !== undefined) {
      env["EMBER_SHADER_INTENSITY"] = String(config.intensity);
    }
    if (config.params) {
      for (let i = 0; i < Math.min(config.params.length, 8); i++) {
        if (config.params[i] !== undefined && config.params[i] !== null) {
          env[`EMBER_SHADER_PARAM${i}`] = String(config.params[i]);
        }
      }
    }
    log.info("shader-injection", `GL hook env: hookPath=${hookPath}, preset=${config.preset}`);
  } else {
    log.warn("shader-injection", "GL hook .so not found — OpenGL injection will not work");
  }

  return env;
}

/**
 * Build WINEDLLOVERRIDES string for DLL injection.
 */
export function buildDllOverrideEnv(config: DllInjectionConfig): string {
  // Format: "dxgi=n,b;d3d11=n,b" (native then builtin)
  return config.overrideDlls.map((dll) => `${dll}=n,b`).join(";");
}

/**
 * Copy custom DLL files into the Wine prefix's system32 directory.
 */
export function copyDllsToPrefix(
  prefixPath: string,
  customDlls: string[],
): { copied: string[]; errors: string[] } {
  const copied: string[] = [];
  const errors: string[] = [];

  const system32 = join(prefixPath, "drive_c", "windows", "system32");
  if (!existsSync(system32)) {
    mkdirSync(system32, { recursive: true });
  }

  for (const dllPath of customDlls) {
    if (!existsSync(dllPath)) {
      errors.push(`DLL not found: ${dllPath}`);
      continue;
    }
    const dest = join(system32, basename(dllPath));
    try {
      copyFileSync(dllPath, dest);
      copied.push(basename(dllPath));
      log.info("shader-injection", `Copied ${basename(dllPath)} to prefix system32`);
    } catch (err) {
      errors.push(`Failed to copy ${basename(dllPath)}: ${err}`);
    }
  }

  return { copied, errors };
}

/**
 * Find the Wine prefix for a non-Steam Windows game.
 * For umu-run, the prefix is typically at ~/.local/share/umu/prefixes/<game-id>/
 * or can be specified via WINEPREFIX.
 */
export function findUmuPrefixPath(game: Game): string | null {
  // If WINEPREFIX is in launchEnv, use that
  if (game.launchEnv?.WINEPREFIX && existsSync(game.launchEnv.WINEPREFIX)) {
    return game.launchEnv.WINEPREFIX;
  }

  // umu-run default prefix location
  const umuPrefixes = join(homedir(), ".local", "share", "umu", "prefixes");
  if (existsSync(umuPrefixes)) {
    // Try to find a prefix matching the game id or exe name
    try {
      const entries = readdirSync(umuPrefixes);
      const gameId = game.id.replace(/[^a-zA-Z0-9_-]/g, "_");
      for (const entry of entries) {
        if (entry.includes(gameId) || entry.includes(game.title.replace(/[^a-zA-Z0-9_-]/g, "_"))) {
          const prefix = join(umuPrefixes, entry);
          if (existsSync(join(prefix, "drive_c"))) return prefix;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Find the Wine prefix for a Steam game (Proton compatdata).
 */
export function findSteamPrefixPath(steamAppId: number): string | null {
  const compatData = findCompatDataPath(steamAppId);
  if (!compatData) return null;
  const pfx = join(compatData, "pfx");
  return existsSync(pfx) ? pfx : null;
}

/**
 * Resolve the effective injection config for a game, merging per-game config with global defaults.
 */
export async function resolveInjectionConfig(
  game: Game,
  gameConfig: GameInjectionConfig | null,
): Promise<GameInjectionConfig> {
  const settings = await getSettings();

  const vulkanShader = gameConfig?.vulkanShader ?? settings.defaultVulkanShader ?? undefined;
  const dllInjection = gameConfig?.dllInjection ?? settings.defaultDllInjection ?? undefined;

  return {
    vulkanShader: vulkanShader?.enabled ? vulkanShader : undefined,
    dllInjection: dllInjection?.enabled ? dllInjection : undefined,
  };
}

/**
 * Check if any injection is active for a game.
 */
export function hasActiveInjection(config: GameInjectionConfig | null): boolean {
  if (!config) return false;
  return !!(config.vulkanShader?.enabled || config.dllInjection?.enabled);
}

/**
 * Find the main .exe in a game install directory.
 * Heuristic: look for an .exe matching the game title, or the largest .exe, or the only .exe.
 */
export function findMainExe(installPath: string, gameTitle?: string): string | null {
  if (!existsSync(installPath)) return null;

  const exes: { path: string; size: number; name: string }[] = [];

  function scanDir(dir: string, depth: number) {
    if (depth > 2) return; // Don't go too deep
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const full = join(dir, entry);
        try {
          const st = statSync(full);
          if (st.isDirectory()) {
            // Skip common non-game directories
            const lower = entry.toLowerCase();
            if (lower === "redist" || lower === "directx" || lower === "bin" || lower === "data" || lower === "cache") continue;
            scanDir(full, depth + 1);
          } else if (entry.toLowerCase().endsWith(".exe")) {
            exes.push({ path: full, size: st.size, name: entry });
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  scanDir(installPath, 0);

  if (exes.length === 0) return null;
  if (exes.length === 1) return exes[0].path;

  // Try to match by game title
  if (gameTitle) {
    const titleLower = gameTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const exe of exes) {
      const nameLower = exe.name.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/\.exe$/, "");
      if (nameLower === titleLower || nameLower.includes(titleLower) || titleLower.includes(nameLower)) {
        return exe.path;
      }
    }
  }

  // Skip common helper/utility exes
  const skipNames = ["unins", "setup", "crash", "reporter", "helper", "config", "update", "settings", "dgvoodoo", "voodoo", "cpl", "sx"];
  const filtered = exes.filter((e) => !skipNames.some((s) => e.name.toLowerCase().includes(s)));
  const candidates = filtered.length > 0 ? filtered : exes;

  // Prefer common game executable names
  const preferredNames = ["game", "play", "start", "run", "main"];
  for (const preferred of preferredNames) {
    const match = candidates.find((e) => e.name.toLowerCase().replace(/\.exe$/, "") === preferred);
    if (match) return match.path;
  }

  // Return the largest exe
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0].path;
}
