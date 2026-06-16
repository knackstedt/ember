import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { app, BrowserWindow } from "electron";
import { createLogger } from "../util/logger";
import {
  ManagedPackage,
  PackageManager,
  PackageOperationProgress,
} from "../../shared/types";
import {
  BUILDBOT_CORES,
  installBuildbotCore,
  uninstallBuildbotCore,
  isBuildbotCoreInstalled,
  getBuildbotCoreVersion,
} from "./buildbot.service";
import {
  runCommand,
  isAptInstalled,
  getAptVersion,
  isWineInstalled,
  getWineVersion,
  getProtonGeDir,
  getInstalledProtonGeVersion,
  fetchLatestProtonGeRelease,
  isProtonGeInstalled,
  buildWineCommand,
} from "./wine-detection.service";

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
  category: "core" | "emulator" | "dependency" | "media-codec" | "other" | "game";
  platforms?: string[];
  sourceUrl?: string;
  installArgs?: string[];
  flatpakRef?: string;
  aptName?: string;
  appimageUrl?: string;
  // winehq: adds the WineHQ apt repo then installs this package name
  winehqPackage?: string;
  // proton-ge: fetches latest release from GitHub, downloads tar.gz, extracts to compatibilitytools.d
  protonGeGithubRepo?: string;
  // buildbot: reference to a libretro buildbot core definition
  buildbotCore?: string;
}

const KNOWN_PACKAGES: PackageDefinition[] = [
  // Libretro cores via apt (common Debian/Ubuntu packages)
  { id: "libretro-nestopia", name: "nestopia", displayName: "Nestopia (NES)", manager: "apt", category: "core", platforms: ["nes"], aptName: "libretro-nestopia" },
  { id: "libretro-snes9x", name: "snes9x", displayName: "Snes9x (SNES)", manager: "apt", category: "core", platforms: ["snes"], aptName: "libretro-snes9x" },
  { id: "libretro-bsnes-mercury", name: "bsnes_mercury_performance", displayName: "bsnes-mercury (SNES)", manager: "apt", category: "core", platforms: ["snes"], aptName: "libretro-bsnes-mercury-performance" },
  { id: "libretro-gambatte", name: "gambatte", displayName: "Gambatte (GB/GBC)", manager: "apt", category: "core", platforms: ["gb"], aptName: "libretro-gambatte" },
  { id: "libretro-mgba", name: "mgba", displayName: "mGBA (GBA)", manager: "apt", category: "core", platforms: ["gba"], aptName: "libretro-mgba" },
  { id: "libretro-genesis-plus-gx", name: "genesis_plus_gx", displayName: "Genesis Plus GX (Genesis/SMS/GG)", manager: "apt", category: "core", platforms: ["genesis", "sms", "gamegear"], aptName: "libretro-genesisplusgx" },
  { id: "libretro-desmume", name: "desmume", displayName: "DeSmuME (NDS)", manager: "apt", category: "core", platforms: ["nds"], aptName: "libretro-desmume" },
  { id: "libretro-beetle-psx", name: "beetle_psx", displayName: "Beetle PSX (PSX)", manager: "apt", category: "core", platforms: ["psx"], aptName: "libretro-beetle-psx" },

  // Libretro cores via buildbot (nightly linux x86_64)
  { id: "buildbot-fceumm", name: "fceumm", displayName: "FCEUmm (NES)", manager: "buildbot", category: "core", platforms: ["nes"], buildbotCore: "fceumm" },
  { id: "buildbot-picodrive", name: "picodrive", displayName: "PicoDrive (Genesis/32X/SMS/GG)", manager: "buildbot", category: "core", platforms: ["genesis", "sms", "gamegear"], buildbotCore: "picodrive" },
  { id: "buildbot-mupen64plus-next", name: "mupen64plus_next", displayName: "Mupen64Plus-Next (N64)", manager: "buildbot", category: "core", platforms: ["n64"], buildbotCore: "mupen64plus_next" },
  { id: "buildbot-parallel-n64", name: "parallel_n64", displayName: "Parallel N64 (N64)", manager: "buildbot", category: "core", platforms: ["n64"], buildbotCore: "parallel_n64" },
  { id: "buildbot-melonds", name: "melonds", displayName: "melonDS (NDS)", manager: "buildbot", category: "core", platforms: ["nds"], buildbotCore: "melonds" },
  { id: "buildbot-pcsx-rearmed", name: "pcsx_rearmed", displayName: "PCSX-ReARMed (PSX)", manager: "buildbot", category: "core", platforms: ["psx"], buildbotCore: "pcsx_rearmed" },
  { id: "buildbot-flycast", name: "flycast", displayName: "Flycast (Dreamcast)", manager: "buildbot", category: "core", platforms: ["dreamcast"], buildbotCore: "flycast" },
  { id: "buildbot-fbneo", name: "fbneo", displayName: "FinalBurn Neo (Arcade)", manager: "buildbot", category: "core", platforms: ["arcade"], buildbotCore: "fbneo" },
  { id: "buildbot-dosbox-pure", name: "dosbox_pure", displayName: "DOSBox Pure (DOS)", manager: "buildbot", category: "core", platforms: ["dos"], buildbotCore: "dosbox_pure" },
  { id: "buildbot-ppsspp", name: "ppsspp", displayName: "PPSSPP (PSP)", manager: "buildbot", category: "core", platforms: ["psp"], buildbotCore: "ppsspp" },

  // Flatpak emulators
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

  // Bluetooth controller support
  { id: "apt-bluez", name: "bluez", displayName: "BlueZ (Bluetooth stack)", description: "Official Linux Bluetooth protocol stack.", manager: "apt", category: "dependency", aptName: "bluez" },
  { id: "apt-bluetooth", name: "bluetooth", displayName: "Bluetooth metapackage", description: "Metapackage for Bluetooth support, daemons, and utilities.", manager: "apt", category: "dependency", aptName: "bluetooth" },
  { id: "apt-xboxdrv", name: "xboxdrv", displayName: "xboxdrv (Xbox controller driver)", description: "Userspace driver for Xbox and Xbox 360 gamepads.", manager: "apt", category: "dependency", aptName: "xboxdrv" },
  { id: "apt-steam-devices", name: "steam-devices", displayName: "Steam Devices (udev rules)", description: "udev rules for Steam Controller and other Valve hardware.", manager: "apt", category: "dependency", aptName: "steam-devices" },

  // Wiimote controller support
  { id: "apt-wminput", name: "wminput", displayName: "wminput (Wii Remote input driver)", description: "Userspace driver for Nintendo Wii Remotes.", manager: "apt", category: "dependency", aptName: "wminput" },
  { id: "apt-xwiimote", name: "xwiimote", displayName: "xwiimote (Wii Remote driver)", description: "Linux kernel driver and tools for Nintendo Wii Remotes.", manager: "apt", category: "dependency", aptName: "xwiimote" },

  // Media codecs
  { id: "apt-gstreamer-libav", name: "gstreamer1.0-libav", displayName: "GStreamer libav plugin", description: "GStreamer plugin for libav/ffmpeg codecs.", manager: "apt", category: "media-codec", aptName: "gstreamer1.0-libav" },
  { id: "apt-gstreamer-ugly", name: "gstreamer1.0-plugins-ugly", displayName: "GStreamer Ugly Plugins", description: "GStreamer plugins with potential patent issues.", manager: "apt", category: "media-codec", aptName: "gstreamer1.0-plugins-ugly" },
  { id: "apt-gstreamer-bad", name: "gstreamer1.0-plugins-bad", displayName: "GStreamer Bad Plugins", description: "GStreamer plugins that need more testing.", manager: "apt", category: "media-codec", aptName: "gstreamer1.0-plugins-bad" },
  { id: "apt-gstreamer-base", name: "gstreamer1.0-plugins-base", displayName: "GStreamer Base Plugins", description: "Essential GStreamer elements including videoconvert and appsink.", manager: "apt", category: "media-codec", aptName: "gstreamer1.0-plugins-base" },
  { id: "apt-gstreamer-good", name: "gstreamer1.0-plugins-good", displayName: "GStreamer Good Plugins", description: "High-quality GStreamer plugins for common codecs.", manager: "apt", category: "media-codec", aptName: "gstreamer1.0-plugins-good" },
  { id: "apt-gstreamer-tools", name: "gstreamer1.0-tools", displayName: "GStreamer Tools", description: "Utility binaries for GStreamer pipeline inspection and debugging.", manager: "apt", category: "media-codec", aptName: "gstreamer1.0-tools" },
  { id: "apt-libmpv-dev", name: "libmpv-dev", displayName: "libmpv-dev", description: "libmpv development files (required for native video decoder build).", manager: "apt", category: "dependency", aptName: "libmpv-dev" },
  { id: "apt-libegl-mesa", name: "libegl1-mesa-dev", displayName: "libegl1-mesa-dev", description: "EGL development files (required for native video decoder offscreen rendering).", manager: "apt", category: "dependency", aptName: "libegl1-mesa-dev" },

  // Windows compatibility layers
  {
    id: "winehq-stable",
    name: "wine",
    displayName: "Wine (WineHQ stable)",
    description: "Run Windows .exe games and apps on Linux via WineHQ's latest stable build.",
    manager: "winehq",
    category: "dependency",
    platforms: ["windows"],
    winehqPackage: "winehq-stable",
  },
  {
    id: "proton-ge",
    name: "proton-ge",
    displayName: "Proton-GE (GloriousEggroll)",
    description: "Community Proton build with extra patches for better game compatibility. Preferred runner for Windows .exe games.",
    manager: "proton-ge",
    category: "dependency",
    platforms: ["windows"],
    protonGeGithubRepo: "GloriousEggroll/proton-ge-custom",
  },
];

// ---------------------------------------------------------------------------
//  State & helpers
// ---------------------------------------------------------------------------

let aptPassword = "";
const activeOperations = new Map<string, ChildProcess>();

function getAppimageDir(): string {
  let dir;
try { dir = join(app.getPath("userData"), "appimages"); } catch { dir = join(process.cwd(), "appimages"); }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
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
  // winehq and proton-ge are always listed as options on Linux x86_64
  results.push("winehq");
  results.push("proton-ge");
  // buildbot is always available (HTTP download)
  results.push("buildbot");
  return results;
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
//  WineHQ apt repo setup + install
// ---------------------------------------------------------------------------

async function installWineHq(
  packageId: string,
  winehqPackage: string,
  window: BrowserWindow | null
): Promise<boolean> {
  // WineHQ requires: i386 arch, their apt key, and their repo added
  // Steps: add-architecture i386, wget key, add source, apt-get update, apt-get install
  const steps: Array<{ label: string; cmd: string; args: string[]; percent: number }> = [
    { label: "Enabling i386 architecture...", cmd: "dpkg", args: ["--add-architecture", "i386"], percent: 10 },
    { label: "Updating package lists...", cmd: "apt-get", args: ["update", "-y"], percent: 30 },
    { label: `Installing ${winehqPackage}...`, cmd: "apt-get", args: ["install", "-y", winehqPackage], percent: 60 },
  ];

  // Add WineHQ repo if not already present
  const wineSourceFile = "/etc/apt/sources.list.d/winehq.list";
  if (!existsSync(wineSourceFile)) {
    // Detect codename
    const { stdout: codename } = await runCommand("sh", ["-c", "lsb_release -cs 2>/dev/null || echo bookworm"]);
    const cn = codename.trim() || "bookworm";

    sendProgress(window, { packageId, operation: "install", status: "running", message: "Adding WineHQ apt key...", percent: 5 });

    // Download and add the WineHQ signing key
    const keyResult = await runCommand("sh", [
      "-c",
      `mkdir -p /etc/apt/keyrings && wget -qO /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key`,
    ]);
    if (keyResult.code !== 0) {
      sendProgress(window, { packageId, operation: "install", status: "error", message: "Failed to download WineHQ apt key. Check your internet connection." });
      return false;
    }

    // Add the repo source
    const repoLine = `deb [signed-by=/etc/apt/keyrings/winehq-archive.key] https://dl.winehq.org/wine-builds/ubuntu/ ${cn} main\n`;
    const writeResult = await runCommand("sh", ["-c", `echo '${repoLine}' > ${wineSourceFile}`]);
    if (writeResult.code !== 0) {
      sendProgress(window, { packageId, operation: "install", status: "error", message: "Failed to add WineHQ apt repository. Are you running as root/sudo?" });
      return false;
    }
  }

  for (const step of steps) {
    sendProgress(window, { packageId, operation: "install", status: "running", message: step.label, percent: step.percent });
    const useSudo = aptPassword.length > 0;
    const cmd = useSudo ? "sudo" : step.cmd;
    const args = useSudo ? ["-S", step.cmd, ...step.args] : step.args;
    const result = await runCommand(cmd, args, useSudo && aptPassword ? { input: aptPassword + "\n" } : undefined);
    if (result.code !== 0) {
      if (result.stderr.toLowerCase().includes("incorrect password") || result.stderr.toLowerCase().includes("sorry, try again")) {
        aptPassword = "";
      }
      sendProgress(window, { packageId, operation: "install", status: "error", message: result.stderr.trim().slice(-300) || `${step.cmd} failed` });
      return false;
    }
  }

  sendProgress(window, { packageId, operation: "install", status: "success", message: "Wine installed successfully.", percent: 100 });
  return true;
}

// ---------------------------------------------------------------------------
//  Proton-GE download + extract install
// ---------------------------------------------------------------------------

async function installProtonGe(
  packageId: string,
  window: BrowserWindow | null
): Promise<boolean> {
  sendProgress(window, { packageId, operation: "install", status: "running", message: "Fetching latest Proton-GE release info...", percent: 5 });

  const release = await fetchLatestProtonGeRelease();
  if (!release) {
    sendProgress(window, { packageId, operation: "install", status: "error", message: "Could not fetch Proton-GE release info from GitHub. Check your internet connection." });
    return false;
  }

  const destDir = getProtonGeDir();
  const tarName = release.tarUrl.split("/").pop()!;
  const tarPath = join(destDir, tarName);

  sendProgress(window, { packageId, operation: "install", status: "running", message: `Downloading ${release.tag}...`, percent: 15 });

  // Download with curl, streaming progress
  const dlResult = await new Promise<boolean>((resolve) => {
    const proc = spawn("curl", ["-L", "--progress-bar", "-o", tarPath, release.tarUrl], {
      env: { ...process.env },
    });
    activeOperations.set(packageId, proc);

    let lastPercent = 15;
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk: string) => {
      // curl --progress-bar emits # chars; rough progress estimate
      const hashes = (chunk.match(/#/g) || []).length;
      if (hashes > 0) {
        lastPercent = Math.min(75, lastPercent + hashes);
        sendProgress(window, { packageId, operation: "install", status: "running", message: `Downloading ${release.tag}...`, percent: lastPercent });
      }
    });

    proc.on("close", (code) => { activeOperations.delete(packageId); resolve(code === 0); });
    proc.on("error", () => { activeOperations.delete(packageId); resolve(false); });
  });

  if (!dlResult) {
    try { unlinkSync(tarPath); } catch {}
    sendProgress(window, { packageId, operation: "install", status: "error", message: `Failed to download ${release.tag}.` });
    return false;
  }

  sendProgress(window, { packageId, operation: "install", status: "running", message: `Extracting ${release.tag}...`, percent: 80 });

  const extractResult = await runCommand("tar", ["-xzf", tarPath, "-C", destDir]);
  try { unlinkSync(tarPath); } catch {}

  if (extractResult.code !== 0) {
    sendProgress(window, { packageId, operation: "install", status: "error", message: `Extraction failed: ${extractResult.stderr.slice(-200)}` });
    return false;
  }

  sendProgress(window, { packageId, operation: "install", status: "success", message: `${release.tag} installed to ${destDir}`, percent: 100 });
  log.info("package-manager", `Proton-GE ${release.tag} installed to ${destDir}`);
  return true;
}

async function uninstallProtonGe(packageId: string, window: BrowserWindow | null): Promise<boolean> {
  const version = getInstalledProtonGeVersion();
  if (!version) return false;
  const dir = join(getProtonGeDir(), version);
  sendProgress(window, { packageId, operation: "uninstall", status: "running", message: `Removing ${version}...`, percent: 50 });
  const result = await runCommand("rm", ["-rf", dir]);
  if (result.code === 0) {
    sendProgress(window, { packageId, operation: "uninstall", status: "success", message: "Proton-GE removed.", percent: 100 });
    return true;
  }
  sendProgress(window, { packageId, operation: "uninstall", status: "error", message: result.stderr.slice(-200) });
  return false;
}

// ---------------------------------------------------------------------------
//  Wine runner detection (exported for IPC + scanner use)
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

  let buildbotCoresDir;
try { buildbotCoresDir = join(app.getPath("userData"), "cores"); } catch { buildbotCoresDir = join(process.cwd(), "cores"); }

  searchPaths.push(
    join(home, ".config/retroarch/cores"),
    buildbotCoresDir,
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
    ".iso": "psx", ".pbp": "psx",
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
    } else if (def.manager === "winehq") {
      isInstalled = await isWineInstalled();
      if (isInstalled) installedVersion = await getWineVersion();
    } else if (def.manager === "proton-ge") {
      isInstalled = await isProtonGeInstalled();
      if (isInstalled) installedVersion = getInstalledProtonGeVersion();
    } else if (def.manager === "buildbot" && def.buildbotCore) {
      isInstalled = isBuildbotCoreInstalled(def.buildbotCore);
      if (isInstalled) installedVersion = getBuildbotCoreVersion(def.buildbotCore);
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
          ".iso": "psx", ".pbp": "psx",
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

  let result = false;

  if (def.manager === "apt" && def.aptName) {
    result = await execApt("install", packageId, def.aptName, window);
  } else if (def.manager === "flatpak" && def.flatpakRef) {
    result = await execFlatpak("install", packageId, def.flatpakRef, window);
  } else if (def.manager === "appimage") {
    result = await installAppimage(def, window);
    sendProgress(window, {
      packageId,
      operation: "install",
      status: result ? "success" : "error",
      message: result ? "Done" : "Failed",
      percent: result ? 100 : undefined,
    });
  } else if (def.manager === "winehq" && def.winehqPackage) {
    result = await installWineHq(packageId, def.winehqPackage, window);
  } else if (def.manager === "proton-ge") {
    result = await installProtonGe(packageId, window);
  } else if (def.manager === "buildbot" && def.buildbotCore) {
    const coreDef = BUILDBOT_CORES.find((c) => c.coreName === def.buildbotCore);
    if (!coreDef) return false;
    result = await installBuildbotCore(coreDef, window, (progress) => {
      sendProgress(window, progress as PackageOperationProgress);
    });
  }

  if (result && def.category === "core" && window && !window.isDestroyed()) {
    window.webContents.send("libretro:cores:changed");
    const platforms = def.platforms ?? [];
    if (platforms.length > 0) {
      import("./libretro-thumbnail.service")
        .then(({ requeueThumbnailsForPlatforms }) => requeueThumbnailsForPlatforms(platforms))
        .then((count) => {
          if (count > 0 && window && !window.isDestroyed()) {
            window.webContents.send("toast:push", {
              type: "info",
              message: `Queued ${count} ROM${count > 1 ? "s" : ""} for thumbnailing`,
            });
          }
        })
        .catch(() => {});
    }
  }

  return result;
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

  let result = false;

  if (def.manager === "apt" && def.aptName) {
    result = await execApt("remove", packageId, def.aptName, window);
  } else if (def.manager === "flatpak" && def.flatpakRef) {
    result = await execFlatpak("uninstall", packageId, def.flatpakRef, window);
  } else if (def.manager === "winehq" && def.aptName) {
    result = await execApt("remove", packageId, def.aptName, window);
  } else if (def.manager === "proton-ge") {
    result = await uninstallProtonGe(packageId, window);
  } else if (def.manager === "appimage") {
    result = await uninstallAppimage(def);
    sendProgress(window, {
      packageId,
      operation: "uninstall",
      status: result ? "success" : "error",
      message: result ? "Done" : "Failed",
      percent: result ? 100 : undefined,
    });
  } else if (def.manager === "buildbot" && def.buildbotCore) {
    const coreDef = BUILDBOT_CORES.find((c) => c.coreName === def.buildbotCore);
    if (!coreDef) return false;
    result = await uninstallBuildbotCore(coreDef, (progress) => {
      sendProgress(window, progress as PackageOperationProgress);
    });
  }

  if (result && def.category === "core" && window && !window.isDestroyed()) {
    window.webContents.send("libretro:cores:changed");
  }

  return result;
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
        await execApt("install", pkg.id, def.aptName, window);
      }
    }

    if (pkg.manager === "flatpak") {
      const def = KNOWN_PACKAGES.find((p) => p.id === pkg.id);
      if (def?.flatpakRef) {
        await execFlatpak("update", pkg.id, def.flatpakRef, window);
      }
    }

    if (pkg.manager === "buildbot") {
      const def = KNOWN_PACKAGES.find((p) => p.id === pkg.id);
      if (def?.buildbotCore) {
        const coreDef = BUILDBOT_CORES.find((c) => c.coreName === def.buildbotCore);
        if (coreDef) {
          await installBuildbotCore(coreDef, window, (progress) => {
            sendProgress(window, progress as PackageOperationProgress);
          });
        }
      }
    }
  }
}