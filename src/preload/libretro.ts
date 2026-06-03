import { join } from "path";
import { existsSync, readdirSync, statSync } from "fs";

// ---------------------------------------------------------------------------
// Load native addon directly in renderer process (zero IPC overhead)
// ---------------------------------------------------------------------------

const addonPath = join(__dirname, "..", "..", "resources", "libretro-frontend.linux-x64-gnu.node");

let NativeAddon: any = null;
let Frontend: any = null;

try {
  // @ts-ignore — require is available in preload with sandbox: false
  NativeAddon = require(addonPath);
  Frontend = new NativeAddon.LibretroFrontend();
  console.log("[libretro] Native addon loaded directly in renderer process:", addonPath);
} catch (err) {
  console.error("[libretro] Failed to load native addon:", err);
}

// ---------------------------------------------------------------------------
// Core scanning (was in main/services/libretro.service.ts)
// ---------------------------------------------------------------------------

interface CoreInfo {
  id: number;
  name: string;
  version: string;
  extensions: string;
  needFullpath: boolean;
  path: string;
}

interface DetectedCore {
  platform: string;
  corePath: string;
  coreName: string;
  extensions: string[];
}

const CORE_MAP: Record<string, string[]> = {
  nestopia: [".nes", ".fds", ".unf", ".unif"],
  fceumm: [".nes", ".fds", ".unf"],
  snes9x: [".smc", ".sfc", ".fig", ".swc", ".bs", ".st"],
  bsnes: [".smc", ".sfc", ".fig", ".swc", ".bs", ".st"],
  mesen: [".nes", ".fds", ".unf", ".unif", ".smc", ".sfc"],
  gambatte: [".gb", ".gbc", ".dmg", ".sgb"],
  mgba: [".gba", ".gb", ".gbc"],
  vbam: [".gba", ".gb", ".gbc"],
  genesis_plus_gx: [".md", ".smd", ".gen", ".sms", ".gg", ".sg", ".68k", ".sgd"],
  picodrive: [".md", ".smd", ".gen", ".sms", ".gg", ".sg", ".32x", ".68k", ".sgd"],
  fbneo: [".zip", ".7z", ".cue", ".ccd", ".iso"],
  mame2003_plus: [".zip", ".7z"],
  parallel_n64: [".z64", ".n64", ".v64", ".rom", ".ndd"],
  mupen64plus_next: [".z64", ".n64", ".v64", ".rom", ".ndd"],
  desmume: [".nds", ".ndsi"],
  melonds: [".nds", ".ndsi"],
  pcsx_rearmed: [".bin", ".cue", ".img", ".iso", ".pbp", ".toc", ".cbn", ".m3u"],
  beetle_psx: [".bin", ".cue", ".img", ".iso", ".pbp", ".toc", ".cbn", ".m3u"],
  duckstation: [".bin", ".cue", ".img", ".iso", ".pbp", ".toc", ".cbn", ".m3u"],
  flycast: [".cdi", ".gdi", ".chd", ".cue", ".iso"],
  redream: [".cdi", ".gdi", ".chd", ".cue", ".iso"],
  dolphin: [".elf", ".dol", ".gcm", ".iso", ".wbfs", ".ciso", ".gcz", ".wad"],
  ppsspp: [".iso", ".cso", ".pbp"],
  vitaquake2: [".pak"],
  prboom: [".wad", ".iwad", ".pwad"],
  dosbox_pure: [".exe", ".com", ".bat", ".iso", ".img", ".bin", ".cue"],
};

const PLATFORM_EXTS: Record<string, string> = {
  ".nes": "nes",
  ".smc": "snes",
  ".sfc": "snes",
  ".gb": "gb",
  ".gbc": "gb",
  ".gba": "gba",
  ".z64": "n64",
  ".n64": "n64",
  ".v64": "n64",
  ".nds": "nds",
  ".md": "genesis",
  ".smd": "genesis",
  ".gen": "genesis",
  ".sms": "sms",
  ".gg": "gamegear",
  ".pce": "pce",
  ".cue": "psx",
  ".bin": "psx",
  ".iso": "psx",
  ".pbp": "psx",
  ".chd": "dreamcast",
  ".gdi": "dreamcast",
  ".cdi": "dreamcast",
  ".wad": "doom",
};

function findCoresInPath(searchPath: string): CoreInfo[] {
  const cores: CoreInfo[] = [];
  try {
    const entries = readdirSync(searchPath);
    for (const entry of entries) {
      if (!entry.endsWith(".so") && !entry.endsWith(".dll") && !entry.endsWith(".dylib")) {
        continue;
      }
      const fullPath = join(searchPath, entry);
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;

      const baseName = entry.replace(/\.so$/, "").replace(/\.dll$/, "").replace(/\.dylib$/, "");
      const coreName = baseName
        .replace(/^libretro-/, "")
        .replace(/_libretro$/, "")
        .replace(/_hw$/, "");

      const extensions = CORE_MAP[coreName]?.join("|") ?? "";

      cores.push({
        id: cores.length,
        name: coreName,
        version: "",
        extensions,
        needFullpath: false,
        path: fullPath,
      });
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }
  return cores;
}

export function scanForCores(): CoreInfo[] {
  const searchPaths: string[] = [];
  const home = process.env.HOME || "/home/user";

  searchPaths.push(
    join(home, ".config/retroarch/cores"),
    "/usr/lib/libretro",
    "/usr/local/lib/libretro",
    "/usr/lib64/libretro",
    "/usr/local/lib64/libretro",
    "/app/lib/libretro",
  );

  const flatpakCorePath = join(home, ".var/app/org.libretro.RetroArch/config/retroarch/cores");
  if (existsSync(flatpakCorePath)) {
    searchPaths.push(flatpakCorePath);
  }

  const allCores: CoreInfo[] = [];
  const seenPaths = new Set<string>();

  for (const searchPath of searchPaths) {
    const found = findCoresInPath(searchPath);
    for (const core of found) {
      if (seenPaths.has(core.path)) continue;
      seenPaths.add(core.path);
      core.id = allCores.length;
      allCores.push(core);
    }
  }

  console.log("[libretro] Found", allCores.length, "cores");
  return allCores;
}

export function detectCoreForRom(romPath: string, availableCores: CoreInfo[]): DetectedCore | null {
  const ext = (romPath.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const platform = PLATFORM_EXTS[ext];
  if (!platform) return null;

  for (const core of availableCores) {
    const exts = core.extensions.split("|").map((e) => e.toLowerCase());
    if (exts.includes(ext)) {
      return {
        platform,
        corePath: core.path,
        coreName: core.name,
        extensions: exts,
      };
    }
  }

  const platformCoreMap: Record<string, string[]> = {
    nes: ["nestopia", "fceumm", "mesen"],
    snes: ["snes9x", "bsnes", "mesen"],
    gb: ["gambatte", "mgba", "mesen"],
    gba: ["mgba", "vbam"],
    genesis: ["genesis_plus_gx", "picodrive"],
    n64: ["mupen64plus_next", "parallel_n64"],
    nds: ["melonds", "desmume"],
    psx: ["pcsx_rearmed", "beetle_psx", "duckstation"],
    dreamcast: ["flycast", "redream"],
  };

  const preferredCores = platformCoreMap[platform] ?? [];
  for (const preferred of preferredCores) {
    const core = availableCores.find((c) => c.name === preferred);
    if (core) {
      return {
        platform,
        corePath: core.path,
        coreName: core.name,
        extensions: core.extensions.split("|"),
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Direct API exposed to renderer (zero IPC)
// ---------------------------------------------------------------------------

function ensureFrontend() {
  if (!Frontend) {
    throw new Error("Libretro native addon not loaded. Check console for errors.");
  }
  return Frontend;
}

let cachedCores: CoreInfo[] | null = null;

export const libretroApi = {
  listCores: (): CoreInfo[] => {
    if (!cachedCores) {
      cachedCores = scanForCores();
    }
    return cachedCores;
  },

  detectCore: (romPath: string): DetectedCore | null => {
    const cores = libretroApi.listCores();
    return detectCoreForRom(romPath, cores);
  },

  loadCore: (corePath: string): { id: number; name: string; version: string; extensions: string; needFullpath: boolean } => {
    return ensureFrontend().loadCore(corePath);
  },

  loadGame: (coreId: number, romPath: string): boolean => {
    return ensureFrontend().loadGame(coreId, romPath);
  },

  start: (coreId: number): boolean => {
    return ensureFrontend().start(coreId);
  },

  stop: (coreId: number): boolean => {
    return ensureFrontend().stop(coreId);
  },

  reset: (coreId: number): boolean => {
    return ensureFrontend().reset(coreId);
  },

  unload: (coreId: number): boolean => {
    return ensureFrontend().unload(coreId);
  },

  unloadAll: (): boolean => {
    return ensureFrontend().unloadAll();
  },

  getFrame: (coreId: number): { width: number; height: number; data: Uint8Array } | null => {
    try {
      const frame = ensureFrontend().getFrame(coreId);
      if (!frame || frame.width === 0) return null;
      return frame;
    } catch {
      return null;
    }
  },

  getFrameBuffer: (coreId: number): { width: number; height: number; pitch: number; format: number; data: ArrayBuffer } | null => {
    try {
      const frame = ensureFrontend().getFrameBuffer(coreId);
      if (!frame || frame.width === 0) return null;
      return frame;
    } catch {
      return null;
    }
  },

  getAvInfo: (coreId: number): { fps: number; sampleRate: number; baseWidth: number; baseHeight: number; maxWidth: number; maxHeight: number; aspectRatio: number } | null => {
    try {
      return ensureFrontend().getAvInfo(coreId);
    } catch {
      return null;
    }
  },

  setInput: (coreId: number, port: number, device: number, index: number, id: number, value: number): boolean => {
    try {
      return ensureFrontend().setInputState(coreId, port, device, index, id, value);
    } catch {
      return false;
    }
  },

  setAnalog: (coreId: number, port: number, index: number, axis: number, value: number): boolean => {
    try {
      return ensureFrontend().setAnalogState(coreId, port, index, axis, value);
    } catch {
      return false;
    }
  },
};
