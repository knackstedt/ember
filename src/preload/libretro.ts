import { ipcRenderer } from "electron";

export interface CoreInfo {
  id: number;
  name: string;
  version: string;
  extensions: string;
  need_fullpath: boolean;
  path: string;
}

export interface DetectedCore {
  platform: string;
  corePath: string;
  coreName: string;
  extensions: string[];
}

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
  ".gdi": "dreamcast",
  ".cdi": "dreamcast",
  ".wad": "doom",
};

/** Core scanning lives in the main process (preload is sandboxed). */
export async function scanForCores(): Promise<CoreInfo[]> {
  return ipcRenderer.invoke("libretro:listCores");
}

const CORE_PRIORITY: Record<string, string[]> = {
  nes: ["nestopia", "fceumm", "mesen"],
  snes: ["bsnes", "snes9x", "mesen"],
  gb: ["gambatte", "mgba", "mesen"],
  gbc: ["gambatte", "mgba", "mesen"],
  gba: ["mgba", "vbam"],
  genesis: ["genesis_plus_gx", "picodrive"],
  sms: ["genesis_plus_gx", "picodrive"],
  gamegear: ["genesis_plus_gx", "picodrive"],
  n64: ["mupen64plus_next", "parallel_n64"],
  nds: ["melonds", "desmume"],
  psx: ["duckstation", "beetle_psx", "pcsx_rearmed"],
  dreamcast: ["flycast", "redream"],
  pce: ["beetle_pce", "beetle_pce_fast"],
};

export async function detectCoreForRom(romPath: string, availableCores: CoreInfo[]): Promise<DetectedCore | null> {
  const all = await detectAllCoresForRom(romPath, availableCores);
  return all[0] ?? null;
}

export async function detectAllCoresForRom(romPath: string, availableCores: CoreInfo[]): Promise<DetectedCore[]> {
  const ext = (romPath.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  let platform = PLATFORM_EXTS[ext];
  if (!platform && ext === ".chd") {
    // CHD header sniffing lives in the main process (fs is not reachable
    // from a sandboxed preload).
    const detected = await ipcRenderer.invoke("libretro:detectChdPlatform", romPath);
    if (detected) platform = detected;
  }
  if (!platform) return [];

  const compatible: DetectedCore[] = [];

  for (const core of availableCores) {
    const exts = core.extensions.split("|").map((e) => e.toLowerCase());
    if (exts.includes(ext) || exts.includes("")) {
      compatible.push({
        platform,
        corePath: core.path,
        coreName: core.name,
        extensions: exts,
      });
    }
  }

  const priorityList = CORE_PRIORITY[platform] ?? [];

  compatible.sort((a, b) => {
    const aIdx = priorityList.indexOf(a.coreName);
    const bIdx = priorityList.indexOf(b.coreName);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.coreName.localeCompare(b.coreName);
  });

  return compatible;
}

let cachedCoresPromise: Promise<CoreInfo[]> | null = null;

export const libretroApi = {
  listCores: async (): Promise<CoreInfo[]> => {
    if (!cachedCoresPromise) {
      cachedCoresPromise = scanForCores();
    }
    return cachedCoresPromise;
  },

  detectCore: async (romPath: string): Promise<DetectedCore | null> => {
    const cores = await libretroApi.listCores();
    return detectCoreForRom(romPath, cores);
  },

  detectAllCores: async (romPath: string): Promise<DetectedCore[]> => {
    const cores = await libretroApi.listCores();
    return detectAllCoresForRom(romPath, cores);
  },

  invalidateCoreCache: (): void => {
    cachedCoresPromise = null;
  },

  // ---------------------------------------------------------------------------
  // Addon methods — proxied to main process via IPC to avoid V8 signal conflicts
  // ---------------------------------------------------------------------------

  loadCore: (corePath: string): Promise<{ id: number; name: string; version: string; extensions: string; need_fullpath: boolean }> =>
    ipcRenderer.invoke("libretro:addon", "loadCore", corePath),

  loadGame: (coreId: number, romPath: string): Promise<boolean> =>
    ipcRenderer.invoke("libretro:addon", "loadGame", coreId, romPath),

  start: (coreId: number): Promise<boolean> =>
    ipcRenderer.invoke("libretro:addon", "start", coreId),

  stop: (coreId: number): Promise<boolean> =>
    ipcRenderer.invoke("libretro:addon", "stop", coreId),

  reset: (coreId: number): Promise<boolean> =>
    ipcRenderer.invoke("libretro:addon", "reset", coreId),

  unload: (coreId: number): Promise<boolean> =>
    ipcRenderer.invoke("libretro:addon", "unload", coreId),

  unloadAll: (): Promise<boolean> =>
    ipcRenderer.invoke("libretro:addon", "unloadAll"),

  getFrame: (coreId: number): Promise<{ width: number; height: number; data: Uint8Array } | null> =>
    ipcRenderer.invoke("libretro:addon", "getFrame", coreId),

  getFrameBuffer: (coreId: number): Promise<{ width: number; height: number; pitch: number; format: number; data: Uint8Array } | null> =>
    ipcRenderer.invoke("libretro:addon", "getFrameBuffer", coreId),

  getAvInfo: (coreId: number): Promise<{ fps: number; sampleRate: number; baseWidth: number; baseHeight: number; maxWidth: number; maxHeight: number; aspectRatio: number } | null> =>
    ipcRenderer.invoke("libretro:addon", "getAvInfo", coreId),

  setInput: (coreId: number, port: number, device: number, index: number, id: number, value: number): Promise<boolean> =>
    ipcRenderer.invoke("libretro:addon", "setInputState", coreId, port, device, index, id, value),

  setAnalog: (coreId: number, port: number, index: number, axis: number, value: number): Promise<boolean> =>
    ipcRenderer.invoke("libretro:addon", "setAnalogState", coreId, port, index, axis, value),
};
