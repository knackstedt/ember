import { spawn, SpawnOptions, ChildProcess } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { app, BrowserWindow } from "electron";
import { createLogger } from "../util/logger";
import {
  ManagedPackage,
  PackageManager,
  PackageOperationProgress,
} from "../../shared/types";

const log = createLogger("info");

// ---------------------------------------------------------------------------
//  Known package registry (libretro cores and emulator deps)
// ---------------------------------------------------------------------------

interface PackageDefinition {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  manager: PackageManager;
  category: "core" | "emulator" | "dependency" | "game";
  platforms?: string[];
  sourceUrl?: string;
  installArgs?: string[];
  flatpakRef?: string;
  aptName?: string;
  appimageUrl?: string;
}

const KNOWN_PACKAGES: PackageDefinition[] = [
  // Libretro cores via apt (common Debian/Ubuntu packages)
  { id: "libretro-nestopia", name: "nestopia", displayName: "Nestopia (NES)", manager: "apt", category: "core", platforms: ["nes"], aptName: "libretro-nestopia" },
  { id: "libretro-fceumm", name: "fceumm", displayName: "FCEUmm (NES)", manager: "apt", category: "core", platforms: ["nes"], aptName: "libretro-fceumm" },
  { id: "libretro-snes9x", name: "snes9x", displayName: "Snes9x (SNES)", manager: "apt", category: "core", platforms: ["snes"], aptName: "libretro-snes9x" },
  { id: "libretro-bsnes", name: "bsnes", displayName: "bsnes (SNES)", manager: "apt", category: "core", platforms: ["snes"], aptName: "libretro-bsnes" },
  { id: "libretro-gambatte", name: "gambatte", displayName: "Gambatte (GB/GBC)", manager: "apt", category: "core", platforms: ["gb"], aptName: "libretro-gambatte" },
  { id: "libretro-mgba", name: "mgba", displayName: "mGBA (GBA)", manager: "apt", category: "core", platforms: ["gba"], aptName: "libretro-mgba" },
  { id: "libretro-genesis-plus-gx", name: "genesis_plus_gx", displayName: "Genesis Plus GX (Genesis/SMS/GG)", manager: "apt", category: "core", platforms: ["genesis", "sms", "gamegear"], aptName: "libretro-genesisplusgx" },
  { id: "libretro-picodrive", name: "picodrive", displayName: "PicoDrive (Genesis/32X)", manager: "apt", category: "core", platforms: ["genesis", "sms", "gamegear"], aptName: "libretro-picodrive" },
  { id: "libretro-mupen64plus", name: "mupen64plus_next", displayName: "Mupen64Plus-Next (N64)", manager: "apt", category: "core", platforms: ["n64"], aptName: "libretro-mupen64plus-next" },
  { id: "libretro-parallel-n64", name: "parallel_n64", displayName: "Parallel N64 (N64)", manager: "apt", category: "core", platforms: ["n64"], aptName: "libretro-parallel-n64" },
  { id: "libretro-desmume", name: "desmume", displayName: "DeSmuME (NDS)", manager: "apt", category: "core", platforms: ["nds"], aptName: "libretro-desmume" },
  { id: "libretro-melonds", name: "melonds", displayName: "melonDS (NDS)", manager: "apt", category: "core", platforms: ["nds"], aptName: "libretro-melonds" },
  { id: "libretro-pcsx-rearmed", name: "pcsx_rearmed", displayName: "PCSX-ReARMed (PSX)", manager: "apt", category: "core", platforms: ["psx"], aptName: "libretro-pcsx-rearmed" },
  { id: "libretro-beetle-psx", name: "beetle_psx", displayName: "Beetle PSX (PSX)", manager: "apt", category: "core", platforms: ["psx"], aptName: "libretro-beetle-psx-hw" },
  { id: "libretro-flycast", name: "flycast", displayName: "Flycast (Dreamcast)", manager: "apt", category: "core", platforms: ["dreamcast"], aptName: "libretro-flycast" },
  { id: "libretro-fbneo", name: "fbneo", displayName: "FinalBurn Neo (Arcade)", manager: "apt", category: "core", platforms: ["arcade"], aptName: "libretro-fbneo" },
  { id: "libretro-dosbox", name: "dosbox_pure", displayName: "DOSBox Pure (DOS)", manager: "apt", category: "core", platforms: ["dos"], aptName: "libretro-dosbox-pure" },
  { id: "libretro-ppsspp", name: "ppsspp", displayName: "PPSSPP (PSP)", manager: "apt", category: "core", platforms: ["psp"], aptName: "libretro-ppsspp" },

  // Flatpak emulators
  { id: "flatpak-retroarch", name: "retroarch", displayName: "RetroArch", manager: "flatpak", category: "emulator", platforms: [], flatpakRef: "org.libretro.RetroArch/x86_64/stable" },
  { id: "flatpak-dolphin", name: "dolphin-emu", displayName: "Dolphin (GameCube/Wii)", manager: "flatpak", category: "emulator", platforms: ["dolphin-gc", "dolphin-wii"], flatpakRef: "org.DolphinEmu.dolphin-emu/x86_64/stable" },
  { id: "flatpak-pcsx2", name: "pcsx2", displayName: "PCSX2 (PS2)", manager: "flatpak", category: "emulator", platforms: [], flatpakRef: "net.pcsx2.PCSX2/x86_64/stable" },
  { id: "flatpak-rpcs3", name: "rpcs3", displayName: "RPCS3 (PS3)", manager: "flatpak", category: "emulator", platforms: [], flatpakRef: "net.rpcs3.RPCS3/x86_64/stable" },
  { id: "flatpak-yuzu", name: "yuzu", displayName: "Yuzu (Switch)", manager: "flatpak", category: "emulator", platforms: [], flatpakRef: "org.yuzu_emu.yuzu/x86_64/stable" },
  { id: "flatpak-cemu", name: "cemu", displayName: "Cemu (Wii U)", manager: "flatpak", category: "emulator", platforms: [], flatpakRef: "info.cemu.Cemu/x86_64/stable" },
  { id: "flatpak-xemu", name: "xemu", displayName: "xemu (Xbox)", manager: "flatpak", category: "emulator", platforms: [], flatpakRef: "app.xemu.xemu/x86_64/stable" },
  { id: "flatpak-scummvm", name: "scummvm", displayName: "ScummVM", manager: "flatpak", category: "emulator", platforms: [], flatpakRef: "org.scummvm.ScummVM/x86_64/stable" },
  { id: "flatpak-mame", name: "mame", displayName: "MAME", manager: "flatpak", category: "emulator", platforms: ["arcade"], flatpakRef: "org.mamedev.MAME/x86_64/stable" },

  // Dependencies
  { id: "apt-ffmpeg", name: "ffmpeg", displayName: "FFmpeg", manager: "apt", category: "dependency", aptName: "ffmpeg" },
  { id: "apt-xdotool", name: "xdotool", displayName: "xdotool", manager: "apt", category: "dependency", aptName: "xdotool" },
];

// ---------------------------------------------------------------------------
//  State & helpers
// ---------------------------------------------------------------------------

let aptPassword = "";
const activeOperations = new Map<string, ChildProcess>();

function getAppimageDir(): string {
  const dir = join(app.getPath("userData"), "appimages");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function runCommand(
  cmd: string,
  args: string[],
  options?: SpawnOptions & { input?: string }
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
      ...options,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => { stdout += d; });
    proc.stderr?.on("data", (d: string) => { stderr += d; });

    if (options?.input) {
      proc.stdin?.write(options.input);
      proc.stdin?.end();
    }

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
    proc.on("error", (err) => {
      resolve({ stdout, stderr: stderr || String(err), code: 1 });
    });
  });
}

function sendProgress(
  window: BrowserWindow | null,
  progress: PackageOperationProgress
) {
  if (window && !window.isDestroyed()) {
    window.webContents.send("packages:progress", progress);
  }
}

// ---------------------------------------------------------------------------
//  Detection helpers
// ---------------------------------------------------------------------------

export async function detectPackageManager(): Promise<PackageManager[]> {
  const results: PackageManager[] = [];
  const checks: { cmd: string; pm: PackageManager }[] = [
    { cmd: "apt-get", pm: "apt" },
    { cmd: "flatpak", pm: "flatpak" },
  ];
  for (const { cmd, pm } of checks) {
    const { code } = await runCommand("sh", ["-c", `command -v ${cmd}`]);
    if (code === 0) results.push(pm);
  }
  results.push("appimage");
  return results;
}

async function isAptInstalled(aptName: string): Promise<boolean> {
  const { code } = await runCommand("dpkg-query", ["-W", "-f='${Status}'", aptName]);
  return code === 0;
}

async function getAptVersion(aptName: string): Promise<string | undefined> {
  const { stdout, code } = await runCommand("dpkg-query", ["-W", "-f='${Version}'", aptName]);
  if (code === 0) return stdout.trim().replace(/^'|'$/g, "");
  return undefined;
}

async function isFlatpakInstalled(flatpakRef: string): Promise<boolean> {
  const { code } = await runCommand("flatpak", ["info", flatpakRef]);
  return code === 0;
}

async function getFlatpakVersion(flatpakRef: string): Promise<string | undefined> {
  const { stdout, code } = await runCommand("flatpak", ["info", flatpakRef]);
  if (code === 0) {
    const m = stdout.match(/Version:\s*(.+)/);
    return m?.[1]?.trim();
  }
  return undefined;
}

function isAppimageInstalled(name: string): boolean {
  const dir = getAppimageDir();
  try {
    const files = readdirSync(dir);
    return files.some((f) => f.toLowerCase().includes(name.toLowerCase()) && f.endsWith(".AppImage"));
  } catch {
    return false;
  }
}

function getAppimageVersion(name: string): string | undefined {
  const dir = getAppimageDir();
  try {
    const files = readdirSync(dir);
    const file = files.find((f) => f.toLowerCase().includes(name.toLowerCase()) && f.endsWith(".AppImage"));
    if (!file) return undefined;
    const m = file.match(/[\d]+\.[\d]+(?:\.[\d]+)?/);
    return m?.[0];
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
//  Live core detection
// ---------------------------------------------------------------------------

export interface DetectedCore {
  platform: string;
  corePath: string;
  coreName: string;
  extensions: string[];
}

export async function detectInstalledCores(): Promise<DetectedCore[]> {
  const cores: DetectedCore[] = [];
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
  if (existsSync(flatpakCorePath)) searchPaths.push(flatpakCorePath);

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
    ".nes": "nes", ".smc": "snes", ".sfc": "snes",
    ".gb": "gb", ".gbc": "gb", ".gba": "gba",
    ".z64": "n64", ".n64": "n64", ".v64": "n64",
    ".nds": "nds", ".md": "genesis", ".smd": "genesis",
    ".gen": "genesis", ".sms": "sms", ".gg": "gamegear",
    ".pce": "pce", ".cue": "psx", ".bin": "psx",
    ".iso": "psx", ".pbp": "psx", ".chd": "dreamcast",
    ".gdi": "dreamcast", ".cdi": "dreamcast", ".wad": "doom",
  };

  const seenPaths = new Set<string>();

  for (const searchPath of searchPaths) {
    try {
      const entries = readdirSync(searchPath);
      for (const entry of entries) {
        if (!entry.endsWith(".so") && !entry.endsWith(".dll") && !entry.endsWith(".dylib")) continue;
        const fullPath = join(searchPath, entry);
        const st = statSync(fullPath);
        if (!st.isFile()) continue;
        if (seenPaths.has(fullPath)) continue;
        seenPaths.add(fullPath);

        const baseName = entry.replace(/\.(so|dll|dylib)$/, "");
        const coreName = baseName
          .replace(/^libretro-/, "")
          .replace(/_libretro$/, "")
          .replace(/_hw$/, "");

        const extensions = CORE_MAP[coreName] ?? [];
        const platforms = new Set<string>();
        for (const ext of extensions) {
          const plat = PLATFORM_EXTS[ext];
          if (plat) platforms.add(plat);
        }

        cores.push({
          platform: Array.from(platforms).join(",") || coreName,
          corePath: fullPath,
          coreName,
          extensions,
        });
      }
    } catch {
      // Directory doesn't exist or isn't readable
    }
  }

  return cores;
}

// ---------------------------------------------------------------------------
//  Package operations
// ---------------------------------------------------------------------------

export async function setAptPassword(password: string): Promise<void> {
  aptPassword = password;
}

async function execApt(
  operation: "install" | "remove" | "update",
  packageId: string,
  aptName: string,
  window: BrowserWindow | null
): Promise<boolean> {
  const args = [operation === "remove" ? "remove" : operation, "-y", aptName];
  if (operation === "install") args.unshift("install");

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      DEBIAN_FRONTEND: "noninteractive",
      SUDO_ASKPASS: "/bin/false",
    };

    const useSudo = aptPassword.length > 0;
    const cmd = useSudo ? "sudo" : "apt-get";
    const cmdArgs = useSudo ? ["-S", "apt-get", ...args] : args;

    const proc = spawn(cmd, cmdArgs, { env });
    activeOperations.set(packageId, proc);

    let stdout = "";
    let stderr = "";
    let sentPassword = false;

    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => { stdout += d; });
    proc.stderr?.on("data", (d: string) => {
      stderr += d;
      const lower = d.toLowerCase();
      if (lower.includes("password") && !sentPassword && aptPassword) {
        sentPassword = true;
        proc.stdin?.write(`${aptPassword}\n`);
      }
    });

    if (useSudo && aptPassword) {
      proc.stdin?.write(`${aptPassword}\n`);
      sentPassword = true;
    }

    sendProgress(window, {
      packageId,
      operation: operation === "remove" ? "uninstall" : "install",
      status: "running",
      message: `Running apt-get ${operation} ${aptName}...`,
      percent: 30,
    });

    proc.on("close", (code) => {
      activeOperations.delete(packageId);
      if (code === 0) {
        sendProgress(window, {
          packageId,
          operation: operation === "remove" ? "uninstall" : "install",
          status: "success",
          message: "Done",
          percent: 100,
        });
        resolve(true);
      } else {
        if (stderr.toLowerCase().includes("incorrect password") || stderr.toLowerCase().includes("sorry, try again")) {
          aptPassword = "";
        }
        sendProgress(window, {
          packageId,
          operation: operation === "remove" ? "uninstall" : "install",
          status: "error",
          message: stderr.trim().slice(-200) || `apt-get exited with code ${code}`,
        });
        resolve(false);
      }
    });

    proc.on("error", (err) => {
      activeOperations.delete(packageId);
      sendProgress(window, {
        packageId,
        operation: operation === "remove" ? "uninstall" : "install",
        status: "error",
        message: String(err),
      });
      resolve(false);
    });
  });
}

async function execFlatpak(
  operation: "install" | "uninstall" | "update",
  packageId: string,
  flatpakRef: string,
  window: BrowserWindow | null
): Promise<boolean> {
  const args = [operation, "-y", "--noninteractive", flatpakRef];
  if (operation === "install") args.unshift("install");

  return new Promise((resolve) => {
    const proc = spawn("flatpak", args, {
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
    });
    activeOperations.set(packageId, proc);

    let stdout = "";
    let stderr = "";

    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => { stdout += d; });
    proc.stderr?.on("data", (d: string) => { stderr += d; });

    sendProgress(window, {
      packageId,
      operation: operation === "uninstall" ? "uninstall" : "install",
      status: "running",
      message: `Running flatpak ${operation} ${flatpakRef}...`,
      percent: 30,
    });

    proc.on("close", (code) => {
      activeOperations.delete(packageId);
      if (code === 0) {
        sendProgress(window, {
          packageId,
          operation: operation === "uninstall" ? "uninstall" : "install",
          status: "success",
          message: "Done",
          percent: 100,
        });
        resolve(true);
      } else {
        sendProgress(window, {
          packageId,
          operation: operation === "uninstall" ? "uninstall" : "install",
          status: "error",
          message: stderr.trim().slice(-200) || `flatpak exited with code ${code}`,
        });
        resolve(false);
      }
    });

    proc.on("error", (err) => {
      activeOperations.delete(packageId);
      sendProgress(window, {
        packageId,
        operation: operation === "uninstall" ? "uninstall" : "install",
        status: "error",
        message: String(err),
      });
      resolve(false);
    });
  });
}

async function installAppimage(
  pkg: PackageDefinition,
  _window: BrowserWindow | null
): Promise<boolean> {
  if (!pkg.sourceUrl) return false;
  try {
    const dir = getAppimageDir();
    const fileName = pkg.sourceUrl.split("/").pop() || `${pkg.name}.AppImage`;
    const outPath = join(dir, fileName);

    const { spawn } = await import("child_process");
    const proc = spawn("curl", ["-L", "-o", outPath, pkg.sourceUrl], {
      stdio: "ignore",
    });

    await new Promise<void>((resolve, reject) => {
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`curl exited with code ${code}`));
      });
      proc.on("error", reject);
    });

    await runCommand("chmod", ["+x", outPath]);
    return true;
  } catch (err) {
    log.error("package-manager", `Failed to install AppImage ${pkg.name}: ${err}`);
    return false;
  }
}

async function uninstallAppimage(pkg: PackageDefinition): Promise<boolean> {
  const dir = getAppimageDir();
  try {
    const files = readdirSync(dir);
    const file = files.find((f) => f.toLowerCase().includes(pkg.name.toLowerCase()) && f.endsWith(".AppImage"));
    if (file) {
      unlinkSync(join(dir, file));
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export async function listAvailablePackages(): Promise<ManagedPackage[]> {
  const availableManagers = await detectPackageManager();
  const cores = await detectInstalledCores();

  const packages: ManagedPackage[] = [];

  for (const def of KNOWN_PACKAGES) {
    if (!availableManagers.includes(def.manager)) continue;

    let isInstalled = false;
    let installedVersion: string | undefined;

    if (def.manager === "apt" && def.aptName) {
      isInstalled = await isAptInstalled(def.aptName);
      if (isInstalled) installedVersion = await getAptVersion(def.aptName);
    } else if (def.manager === "flatpak" && def.flatpakRef) {
      isInstalled = await isFlatpakInstalled(def.flatpakRef);
      if (isInstalled) installedVersion = await getFlatpakVersion(def.flatpakRef);
    } else if (def.manager === "appimage") {
      isInstalled = isAppimageInstalled(def.name);
      if (isInstalled) installedVersion = getAppimageVersion(def.name);
    }

    let platforms = def.platforms;
    if (def.category === "core" && def.manager === "apt") {
      const liveCore = cores.find((c) => c.coreName === def.name);
      if (liveCore && liveCore.extensions.length > 0) {
        const platMap: Record<string, string> = {
          ".nes": "nes", ".smc": "snes", ".sfc": "snes",
          ".gb": "gb", ".gbc": "gb", ".gba": "gba",
          ".z64": "n64", ".n64": "n64", ".v64": "n64",
          ".nds": "nds", ".md": "genesis", ".smd": "genesis",
          ".gen": "genesis", ".sms": "sms", ".gg": "gamegear",
          ".pce": "pce", ".cue": "psx", ".bin": "psx",
          ".iso": "psx", ".pbp": "psx", ".chd": "dreamcast",
          ".gdi": "dreamcast", ".cdi": "dreamcast", ".wad": "doom",
        };
        platforms = Array.from(new Set(liveCore.extensions.map((e) => platMap[e]).filter(Boolean))) as string[];
      }
    }

    packages.push({
      id: def.id,
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      manager: def.manager,
      version: def.sourceUrl ? "latest" : undefined,
      installedVersion,
      isInstalled,
      isPinned: false,
      autoUpdate: false,
      category: def.category,
      platforms,
      sourceUrl: def.sourceUrl,
    });
  }

  return packages;
}

export async function searchPackages(
  query: string
): Promise<ManagedPackage[]> {
  const all = await listAvailablePackages();
  const q = query.toLowerCase();
  return all.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.displayName.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q)
  );
}

export async function installPackage(
  packageId: string,
  window: BrowserWindow | null
): Promise<boolean> {
  const def = KNOWN_PACKAGES.find((p) => p.id === packageId);
  if (!def) return false;

  sendProgress(window, {
    packageId,
    operation: "install",
    status: "pending",
    message: `Preparing to install ${def.displayName}...`,
    percent: 5,
  });

  if (def.manager === "apt" && def.aptName) {
    return execApt("install", packageId, def.aptName, window);
  }

  if (def.manager === "flatpak" && def.flatpakRef) {
    return execFlatpak("install", packageId, def.flatpakRef, window);
  }

  if (def.manager === "appimage") {
    const ok = await installAppimage(def, window);
    sendProgress(window, {
      packageId,
      operation: "install",
      status: ok ? "success" : "error",
      message: ok ? "Done" : "Failed",
      percent: ok ? 100 : undefined,
    });
    return ok;
  }

  return false;
}

export async function uninstallPackage(
  packageId: string,
  window: BrowserWindow | null
): Promise<boolean> {
  const def = KNOWN_PACKAGES.find((p) => p.id === packageId);
  if (!def) return false;

  sendProgress(window, {
    packageId,
    operation: "uninstall",
    status: "pending",
    message: `Preparing to remove ${def.displayName}...`,
    percent: 5,
  });

  if (def.manager === "apt" && def.aptName) {
    return execApt("remove", packageId, def.aptName, window);
  }

  if (def.manager === "flatpak" && def.flatpakRef) {
    return execFlatpak("uninstall", packageId, def.flatpakRef, window);
  }

  if (def.manager === "appimage") {
    const ok = await uninstallAppimage(def);
    sendProgress(window, {
      packageId,
      operation: "uninstall",
      status: ok ? "success" : "error",
      message: ok ? "Done" : "Failed",
      percent: ok ? 100 : undefined,
    });
    return ok;
  }

  return false;
}

export async function checkUpdates(
  window: BrowserWindow | null
): Promise<void> {
  const packages = await listAvailablePackages();
  for (const pkg of packages) {
    if (!pkg.isInstalled || pkg.isPinned || !pkg.autoUpdate) continue;

    if (pkg.manager === "apt") {
      const def = KNOWN_PACKAGES.find((p) => p.id === pkg.id);
      if (def?.aptName) {
        await execApt("install", def.aptName, window);
      }
    }

    if (pkg.manager === "flatpak") {
      const def = KNOWN_PACKAGES.find((p) => p.id === pkg.id);
      if (def?.flatpakRef) {
        await execFlatpak("update", def.flatpakRef, window);
      }
    }
  }
}