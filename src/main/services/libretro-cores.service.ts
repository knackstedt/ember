/**
 * Libretro core discovery — lives in the main process because it touches the
 * filesystem (the preload is fully sandboxed). Renderer calls these via IPC.
 */

import { existsSync } from "fs";
import { readdir as readdirAsync, stat as statAsync } from "fs/promises";
import { join } from "path";
import { ipcMain } from "electron";
import { detectChdPlatform } from "../../shared/chd";
import { isMediaAccessAllowed } from "./media-access.service";
import { createLogger } from "../util/logger";

const log = createLogger("info");

export interface CoreInfo {
  id: number;
  name: string;
  version: string;
  extensions: string;
  need_fullpath: boolean;
  path: string;
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

async function findCoresInPath(searchPath: string): Promise<CoreInfo[]> {
  const cores: CoreInfo[] = [];
  try {
    const entries = await readdirAsync(searchPath);
    for (const entry of entries) {
      if (!entry.endsWith(".so") && !entry.endsWith(".dll") && !entry.endsWith(".dylib")) {
        continue;
      }
      const fullPath = join(searchPath, entry);
      const st = await statAsync(fullPath);
      if (!st.isFile()) continue;

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
        need_fullpath: false,
        path: fullPath,
      });
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }
  return cores;
}

export async function scanForCores(): Promise<CoreInfo[]> {
  const searchPaths: string[] = [];
  const home = process.env.HOME || "/home/user";

  searchPaths.push(
    join(home, ".config/retroarch/cores"),
    join(home, ".config/ember/cores"),
    "/usr/lib/libretro",
    "/usr/lib/x86_64-linux-gnu/libretro",
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
    const found = await findCoresInPath(searchPath);
    for (const core of found) {
      if (seenPaths.has(core.path)) continue;
      seenPaths.add(core.path);
      core.id = allCores.length;
      allCores.push(core);
    }
  }

  log.info("libretro", `Found ${allCores.length} cores`);
  return allCores;
}

export function registerLibretroCoresIpcHandlers(): void {
  ipcMain.handle("libretro:listCores", async () => scanForCores());

  ipcMain.handle("libretro:detectChdPlatform", async (_e, romPath: string) => {
    // Reading arbitrary file headers is gated by the media allowlist.
    if (!(await isMediaAccessAllowed(romPath))) {
      log.warn("libretro", `detectChdPlatform denied for ${romPath}`);
      return null;
    }
    return detectChdPlatform(romPath);
  });
}
