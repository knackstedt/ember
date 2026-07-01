import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { createLogger } from "../util/logger";

const log = createLogger("info");

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type GameOsPlatform = "windows" | "linux";

export type GameEngineType =
  | "unity"
  | "unreal"
  | "godot"
  | "gamemaker"
  | "java"
  | "source"
  | "idtech"
  | "rpgmaker"
  | "renpy"
  | "adventure"
  | "flascc"
  | "unknown";

export type GraphicsApi =
  | "directx9"
  | "directx11"
  | "directx12"
  | "opengl"
  | "vulkan"
  | "metal"
  | "software"
  | "unknown";

export interface GameEntrypoint {
  /** Label for the entrypoint, e.g. "Level Editor", "Mod Tool" */
  label: string;
  /** Path to the executable */
  path: string;
  /** Type of entrypoint */
  type: "editor" | "mod-tool" | "config" | "launcher" | "server" | "other";
}

export interface GameDetectionResult {
  osPlatform: GameOsPlatform;
  engine: GameEngineType;
  engineVersion?: string;
  graphicsApi: GraphicsApi;
  entrypoints: GameEntrypoint[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function listDirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function existsSafe(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function statSizeSafe(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** Recursively find files matching a predicate, up to a max depth. */
function findFiles(
  dir: string,
  predicate: (name: string, fullPath: string) => boolean,
  maxDepth = 3,
  _depth = 0,
): string[] {
  if (_depth > maxDepth) return [];
  const results: string[] = [];
  const entries = listDirSafe(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        // Skip common noise directories
        const lower = entry.toLowerCase();
        if (lower === "redist" || lower === "directx" || lower === "__redist" || lower === "dotnet") continue;
        results.push(...findFiles(fullPath, predicate, maxDepth, _depth + 1));
      } else if (stat.isFile() && predicate(entry, fullPath)) {
        results.push(fullPath);
      }
    } catch {
      // ignore
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  OS Platform detection                                              */
/* ------------------------------------------------------------------ */

function detectOsPlatform(installPath: string, mainExe?: string | null): GameOsPlatform {
  // If the main executable is a Linux binary (.sh, no extension, ELF), it's Linux
  if (mainExe) {
    const ext = extname(mainExe).toLowerCase();
    if (ext === ".sh" || ext === ".bin" || ext === "") {
      // Check for ELF magic
      try {
        const fd = readFileSync(mainExe, { encoding: null } as any);
        const buf = Buffer.isBuffer(fd) ? fd : Buffer.from(fd);
        if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
          return "linux";
        }
      } catch {
        // ignore
      }
    }
    if (ext === ".exe" || ext === ".bat" || ext === ".com" || ext === ".msi") {
      return "windows";
    }
  }

  // Check install directory for .exe vs Linux binaries
  const entries = listDirSafe(installPath);
  const hasExe = entries.some((e) => e.toLowerCase().endsWith(".exe"));
  const hasSh = entries.some((e) => e.toLowerCase().endsWith(".sh"));
  const hasAppImage = entries.some((e) => e.toLowerCase().endsWith(".appimage"));

  if (hasAppImage || (hasSh && !hasExe)) return "linux";
  if (hasExe) return "windows";

  // Check for x86_64-linux-gnu style directories (common in Linux game installs)
  if (entries.some((e) => e.toLowerCase().includes("linux") || e.toLowerCase().includes("x86_64"))) {
    return "linux";
  }

  return "windows"; // default assumption for .exe-based scanners
}

/* ------------------------------------------------------------------ */
/*  Engine detection                                                   */
/* ------------------------------------------------------------------ */

function detectUnity(dir: string): { detected: boolean; version?: string } {
  // Unity games have a *_Data/ folder matching the exe name, plus:
  // - UnityPlayer.dll (Unity 5.3+)
  // - Managed/ directory with UnityEngine.dll
  // - globalgamemanagers files in *_Data/

  const entries = listDirSafe(dir);
  const dataDirs = entries.filter((e) => e.toLowerCase().endsWith("_data"));

  // Check for UnityPlayer.dll
  const hasUnityPlayer = entries.some((e) => e.toLowerCase() === "unityplayer.dll") ||
    findFiles(dir, (name) => name.toLowerCase() === "unityplayer.dll", 2).length > 0;

  // Check for UnityEngine.dll in Managed folders
  const hasUnityEngine = findFiles(dir, (name) => name.toLowerCase() === "unityengine.dll", 3).length > 0;

  // Check for globalgamemanagers (binary asset file in *_Data/)
  const hasGgm = dataDirs.some((dataDir) => {
    const ggmPath = join(dir, dataDir, "globalgamemanagers");
    return existsSafe(ggmPath);
  });

  if (hasUnityPlayer || hasUnityEngine || hasGgm) {
    // Try to extract version from globalgamemanagers
    let version: string | undefined;
    for (const dataDir of dataDirs) {
      const ggmPath = join(dir, dataDir, "globalgamemanagers");
      if (existsSafe(ggmPath)) {
        version = extractUnityVersion(ggmPath);
        if (version) break;
      }
    }
    // Also try from UnityPlayer.dll version info or boot.config
    if (!version) {
      for (const dataDir of dataDirs) {
        const bootConfig = join(dir, dataDir, "boot.config");
        if (existsSafe(bootConfig)) {
          try {
            const content = readFileSync(bootConfig, "utf-8");
            const match = content.match(/unity_version\s*=\s*([\d.]+)/);
            if (match) {
              version = match[1];
              break;
            }
          } catch {
            // ignore
          }
        }
      }
    }
    return { detected: true, version };
  }

  return { detected: false };
}

function extractUnityVersion(ggmPath: string): string | undefined {
  try {
    const buf = readFileSync(ggmPath);
    // Unity version is stored as a null-terminated string early in the file
    // Look for pattern like "20XX.X.XfX" or "5.X.XfX"
    const text = buf.toString("latin1", 0, Math.min(buf.length, 2048));
    const match = text.match(/(20\d{2}\.\d+\.\d+[a-z]\d+|5\.\d+\.\d+[a-z]\d+)/);
    if (match) return match[1];
  } catch {
    // ignore
  }
  return undefined;
}

function detectUnreal(dir: string): { detected: boolean; version?: string } {
  // Unreal Engine games have:
  // - Engine/ directory
  // - .pak files in Content/Paks/
  // - UE4 or UE5 in paths
  // - Binaries/Win64/ or Binaries/Linux/

  const entries = listDirSafe(dir);

  // Check for Engine/ directory
  const hasEngineDir = entries.some((e) => e.toLowerCase() === "engine");

  // Check for .pak files
  const pakFiles = findFiles(dir, (name) => name.toLowerCase().endsWith(".pak"), 4);
  const hasPak = pakFiles.length > 0;

  // Check for Unreal-specific binaries
  const hasUnrealBinary = findFiles(dir, (name) => {
    const lower = name.toLowerCase();
    return lower.includes("ue4") || lower.includes("ue5") || lower.includes("unreal");
  }, 3).length > 0;

  // Check for Content/Paks structure
  const hasContentPaks = findFiles(dir, (name, fullPath) => {
    return fullPath.toLowerCase().includes("content") && fullPath.toLowerCase().includes("paks");
  }, 4).length > 0;

  if (hasEngineDir || (hasPak && (hasUnrealBinary || hasContentPaks))) {
    // Determine version (UE4 vs UE5)
    let version: string | undefined;

    // Check for UE5-specific signatures
    const allFiles = findFiles(dir, (name) => {
      const lower = name.toLowerCase();
      return lower.includes("ue5") || lower.includes("nanite") || lower.includes("lumen");
    }, 3);

    if (allFiles.length > 0) {
      version = "5.x";
    } else {
      // Check for UE4 signatures
      const ue4Files = findFiles(dir, (name) => name.toLowerCase().includes("ue4"), 3);
      if (ue4Files.length > 0) {
        version = "4.x";
      }
    }

    // Try to extract more specific version from .pak file names or engine.ini
    if (!version) {
      // Default to UE4 for older games
      version = "4.x";
    }

    // Try to find specific version from Build.txt or similar
    const buildFiles = findFiles(dir, (name) => {
      const lower = name.toLowerCase();
      return lower === "build.txt" || lower === "build.version" || lower === "engine_version.txt";
    }, 4);
    for (const buildFile of buildFiles) {
      try {
        const content = readFileSync(buildFile, "utf-8").trim();
        // Unreal build.txt typically contains the version like "++UE5+Release-5.3"
        const match = content.match(/(\d+\.\d+)/);
        if (match) {
          version = match[1];
          break;
        }
      } catch {
        // ignore
      }
    }

    return { detected: true, version };
  }

  return { detected: false };
}

function detectGodot(dir: string): { detected: boolean; version?: string } {
  // Godot games have .pck files
  const entries = listDirSafe(dir);
  const hasPck = entries.some((e) => e.toLowerCase().endsWith(".pck"));

  // Godot also ships with a .exe that has the same name as the .pck
  const hasGodotExe = entries.some((e) => {
    const lower = e.toLowerCase();
    return lower.endsWith(".exe") && existsSafe(join(dir, e.replace(/\.exe$/i, ".pck")));
  });

  if (hasPck || hasGodotExe) {
    // Try to detect version from .pck file header
    const pckFile = entries.find((e) => e.toLowerCase().endsWith(".pck"));
    let version: string | undefined;
    if (pckFile) {
      version = extractGodotVersion(join(dir, pckFile));
    }
    return { detected: true, version };
  }

  return { detected: false };
}

function extractGodotVersion(pckPath: string): string | undefined {
  try {
    const buf = readFileSync(pckPath);
    // Godot PCK magic: "GDPC" at offset 0
    if (buf.length < 8) return undefined;
    const magic = buf.toString("latin1", 0, 4);
    if (magic === "GDPC") {
      // Pack version at offset 4 (uint32)
      const packVersion = buf.readUInt32LE(4);
      // Engine version major/minor/patch at offsets 8/12/16
      if (buf.length >= 20) {
        const major = buf.readUInt32LE(8);
        const minor = buf.readUInt32LE(12);
        const patch = buf.readUInt32LE(16);
        if (major > 0 && major < 10) {
          return `${major}.${minor}.${patch}`;
        }
      }
      // Fallback: pack version
      if (packVersion === 2) return "4.x";
      if (packVersion === 1) return "3.x";
    }
  } catch {
    // ignore
  }
  return undefined;
}

function detectGameMaker(dir: string): boolean {
  // GameMaker games often have:
  // - data.win (YoYo Games compiled asset file)
  // - runner.exe / YoYoRunner.exe
  const entries = listDirSafe(dir);
  const hasDataWin = entries.some((e) => e.toLowerCase() === "data.win");
  const hasYoyo = entries.some((e) => {
    const lower = e.toLowerCase();
    return lower.includes("yoyo") || lower === "runner.exe";
  });
  return hasDataWin || hasYoyo;
}

function detectJava(dir: string): boolean {
  // Java games have .jar files
  const jarFiles = findFiles(dir, (name) => name.toLowerCase().endsWith(".jar"), 3);
  if (jarFiles.length > 0) return true;

  // Check for .bat/.sh that runs java
  const entries = listDirSafe(dir);
  const launchers = entries.filter((e) => {
    const lower = e.toLowerCase();
    return lower.endsWith(".bat") || lower.endsWith(".sh");
  });
  for (const launcher of launchers) {
    try {
      const content = readFileSync(join(dir, launcher), "utf-8").toLowerCase();
      if (content.includes("java") && content.includes("-jar")) return true;
      if (content.includes("java") && content.includes("-cp")) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

function detectSource(dir: string): boolean {
  // Source engine games have:
  // - bin/ with source engine DLLs
  // - .vpk files
  // - hl2.exe or similar
  const hasVpk = findFiles(dir, (name) => name.toLowerCase().endsWith(".vpk"), 3).length > 0;
  const entries = listDirSafe(dir);
  const hasSourceBin = entries.some((e) => {
    const lower = e.toLowerCase();
    return lower === "hl2.exe" || lower.includes("source") || lower === "bin";
  });
  const hasSourceDlls = findFiles(dir, (name) => {
    const lower = name.toLowerCase();
    return lower === "engine.dll" || lower === "vphysics.dll" || lower === "client.dll";
  }, 3).length > 0;
  return hasVpk && (hasSourceBin || hasSourceDlls);
}

function detectIdTech(dir: string): boolean {
  // id Tech engine games have:
  // - .pk3, .pk4, .wad files
  // - doom.exe, quake.exe, etc.
  const hasPk = findFiles(dir, (name) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".pk3") || lower.endsWith(".pk4") || lower.endsWith(".wad");
  }, 3).length > 0;
  const entries = listDirSafe(dir);
  const hasIdExe = entries.some((e) => {
    const lower = e.toLowerCase();
    return lower.includes("doom") || lower.includes("quake") || lower.includes("wolf");
  });
  return hasPk && hasIdExe;
}

function detectRpgMaker(dir: string): boolean {
  // RPG Maker games have:
  // - www/ folder (MV/MZ)
  // - Game.exe, Game.ini
  // - rgss/ or data/ folder
  const entries = listDirSafe(dir);
  const hasWww = entries.some((e) => e.toLowerCase() === "www");
  const hasGameIni = entries.some((e) => e.toLowerCase() === "game.ini");
  const hasRgss = entries.some((e) => e.toLowerCase().startsWith("rgss"));
  const hasDataDir = entries.some((e) => e.toLowerCase() === "data");
  return (hasWww && hasGameIni) || hasRgss || (hasGameIni && hasDataDir);
}

function detectRenpy(dir: string): boolean {
  // Ren'Py games have:
  // - game/ folder with .rpy/.rpyc files
  // - renpy/ folder
  // - .exe with "renpy" in name
  const entries = listDirSafe(dir);
  const hasRenpyDir = entries.some((e) => e.toLowerCase() === "renpy");
  const hasGameDir = entries.some((e) => e.toLowerCase() === "game");
  if (hasRenpyDir) return true;
  if (hasGameDir) {
    const rpyFiles = findFiles(join(dir, "game"), (name) => {
      const lower = name.toLowerCase();
      return lower.endsWith(".rpy") || lower.endsWith(".rpyc");
    }, 1);
    if (rpyFiles.length > 0) return true;
  }
  return false;
}

function detectAdventure(dir: string): boolean {
  // Adventure Game Studio games have .ags, ac2game.dat
  const entries = listDirSafe(dir);
  const hasAgs = entries.some((e) => {
    const lower = e.toLowerCase();
    return lower.endsWith(".ags") || lower === "ac2game.dat";
  });
  return hasAgs;
}

function detectEngine(installPath: string, mainExe?: string | null): { engine: GameEngineType; version?: string } {
  // Use mainExe's directory if available, otherwise installPath
  const dir = mainExe ? dirname(mainExe) : installPath;

  // Try Unity first (most common)
  const unity = detectUnity(dir);
  if (unity.detected) return { engine: "unity", version: unity.version };

  // Unreal
  const unreal = detectUnreal(installPath);
  if (unreal.detected) return { engine: "unreal", version: unreal.version };

  // Godot
  const godot = detectGodot(dir);
  if (godot.detected) return { engine: "godot", version: godot.version };

  // GameMaker
  if (detectGameMaker(dir)) return { engine: "gamemaker" };

  // Java
  if (detectJava(dir)) return { engine: "java" };

  // Source
  if (detectSource(dir)) return { engine: "source" };

  // id Tech
  if (detectIdTech(dir)) return { engine: "idtech" };

  // RPG Maker
  if (detectRpgMaker(dir)) return { engine: "rpgmaker" };

  // Ren'Py
  if (detectRenpy(dir)) return { engine: "renpy" };

  // Adventure Game Studio
  if (detectAdventure(dir)) return { engine: "adventure" };

  return { engine: "unknown" };
}

/* ------------------------------------------------------------------ */
/*  Graphics API detection                                             */
/* ------------------------------------------------------------------ */

function detectGraphicsApi(installPath: string, mainExe?: string | null, engine?: GameEngineType): GraphicsApi {
  const dir = mainExe ? dirname(mainExe) : installPath;

  // Check for graphics API DLLs
  const graphicsDlls = findFiles(dir, (name) => {
    const lower = name.toLowerCase();
    return lower === "d3d9.dll" ||
      lower === "d3d11.dll" ||
      lower === "d3d12.dll" ||
      lower === "dxgi.dll" ||
      lower === "opengl32.dll" ||
      lower === "vulkan-1.dll" ||
      lower === "libgl.so" ||
      lower === "libvulkan.so";
  }, 3);

  const dllNames = new Set(graphicsDlls.map((p) => basename(p).toLowerCase()));

  if (dllNames.has("d3d12.dll") || dllNames.has("dxgi.dll")) return "directx12";
  if (dllNames.has("d3d11.dll")) return "directx11";
  if (dllNames.has("d3d9.dll")) return "directx9";
  if (dllNames.has("vulkan-1.dll") || dllNames.has("libvulkan.so")) return "vulkan";
  if (dllNames.has("opengl32.dll") || dllNames.has("libgl.so")) return "opengl";

  // Engine-based inference (only when DLL detection fails)
  if (engine === "unreal") {
    // UE5 defaults to DX12, UE4 defaults to DX11
    return "directx11";
  }
  if (engine === "unity") {
    // Unity defaults to DX11 on Windows
    return "directx11";
  }
  if (engine === "godot") {
    // Godot 4 defaults to Vulkan
    return "vulkan";
  }
  if (engine === "java") {
    return "opengl";
  }
  if (engine === "source") {
    return "directx9";
  }

  // Check for DirectX redistributables or shader files
  const hasDxFiles = findFiles(installPath, (name) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".cso") || lower.endsWith(".dxbc") || lower.endsWith(".fxc");
  }, 3).length > 0;
  if (hasDxFiles) return "directx11";

  // Check for SPIR-V shader files (Vulkan)
  const hasSpirv = findFiles(installPath, (name) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".spv") || lower.endsWith(".spirv");
  }, 3).length > 0;
  if (hasSpirv) return "vulkan";

  // Check for GLSL shader files
  const hasGlsl = findFiles(installPath, (name) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".glsl") || lower.endsWith(".vert") || lower.endsWith(".frag");
  }, 3).length > 0;
  if (hasGlsl) return "opengl";

  return "unknown";
}

/* ------------------------------------------------------------------ */
/*  Entrypoint detection                                               */
/* ------------------------------------------------------------------ */

const EDITOR_PATTERNS: { pattern: RegExp; label: string; type: GameEntrypoint["type"] }[] = [
  { pattern: /editor\.exe$/i, label: "Editor", type: "editor" },
  { pattern: /leveleditor\.exe$/i, label: "Level Editor", type: "editor" },
  { pattern: /worldeditor\.exe$/i, label: "World Editor", type: "editor" },
  { pattern: /creationkit\.exe$/i, label: "Creation Kit", type: "editor" },
  { pattern: /geck\.exe$/i, label: "GECK", type: "editor" },
  { pattern: /toolset\.exe$/i, label: "Toolset", type: "editor" },
  { pattern: /modkit\.exe$/i, label: "Mod Kit", type: "mod-tool" },
  { pattern: /modtool/i, label: "Mod Tools", type: "mod-tool" },
  { pattern: /sdk.*\.exe$/i, label: "SDK", type: "mod-tool" },
  { pattern: /\bsdk\b/i, label: "SDK", type: "mod-tool" },
  { pattern: /config(ure|urator)?\.exe$/i, label: "Configuration", type: "config" },
  { pattern: /settings\.exe$/i, label: "Settings", type: "config" },
  { pattern: /launcher\.exe$/i, label: "Launcher", type: "launcher" },
  { pattern: /server\.exe$/i, label: "Server", type: "server" },
  { pattern: /dedicated.*server/i, label: "Dedicated Server", type: "server" },
  { pattern: /benchmark\.exe$/i, label: "Benchmark", type: "other" },
];

function detectEntrypoints(installPath: string, mainExe?: string | null): GameEntrypoint[] {
  const entrypoints: GameEntrypoint[] = [];
  const seen = new Set<string>();

  const scanDir = mainExe ? dirname(mainExe) : installPath;

  // Scan the install directory (and one level of subdirs) for entrypoint executables
  const allExes = findFiles(installPath, (name) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".exe") || lower.endsWith(".sh") || lower.endsWith(".appimage");
  }, 2);

  for (const exePath of allExes) {
    const name = basename(exePath);
    const lowerName = name.toLowerCase();

    // Skip the main exe itself
    if (mainExe && exePath === mainExe) continue;

    // Skip obvious junk
    if (lowerName.includes("unins") || lowerName.includes("crash") || lowerName.includes("reporter")) continue;

    for (const { pattern, label, type } of EDITOR_PATTERNS) {
      if (pattern.test(name)) {
        if (!seen.has(exePath)) {
          seen.add(exePath);
          entrypoints.push({ label, path: exePath, type });
        }
        break;
      }
    }
  }

  // Also check for Unreal editor binaries in Engine/Binaries
  const engineBinaries = join(installPath, "Engine", "Binaries");
  if (existsSafe(engineBinaries)) {
    const editorExes = findFiles(engineBinaries, (name) => {
      const lower = name.toLowerCase();
      return lower.includes("editor") && (lower.endsWith(".exe") || lower.endsWith(".sh"));
    }, 2);
    for (const exePath of editorExes) {
      if (!seen.has(exePath)) {
        seen.add(exePath);
        entrypoints.push({ label: "Unreal Editor", path: exePath, type: "editor" });
      }
    }
  }

  // Check for Unity editor (rare in game installs, but possible)
  const unityEditor = findFiles(installPath, (name) => {
    const lower = name.toLowerCase();
    return lower === "unityeditor.exe" || lower === "unityeditor";
  }, 2);
  for (const exePath of unityEditor) {
    if (!seen.has(exePath)) {
      seen.add(exePath);
      entrypoints.push({ label: "Unity Editor", path: exePath, type: "editor" });
    }
  }

  return entrypoints;
}

/* ------------------------------------------------------------------ */
/*  Main detection function                                            */
/* ------------------------------------------------------------------ */

export function detectGameInfo(installPath: string, mainExe?: string | null): GameDetectionResult {
  const osPlatform = detectOsPlatform(installPath, mainExe);
  const { engine, version: engineVersion } = detectEngine(installPath, mainExe);
  const graphicsApi = detectGraphicsApi(installPath, mainExe, engine);
  const entrypoints = detectEntrypoints(installPath, mainExe);

  log.debug("detection", `detectGameInfo: ${installPath} → os=${osPlatform} engine=${engine}${engineVersion ? ` v${engineVersion}` : ""} gfx=${graphicsApi} entrypoints=${entrypoints.length}`);

  return {
    osPlatform,
    engine,
    engineVersion,
    graphicsApi,
    entrypoints,
  };
}
