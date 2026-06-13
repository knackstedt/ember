import { join } from "path";
import { app } from "electron";
import { createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync, statSync, createReadStream } from "fs";
import { createUnzip } from "zlib";

const log = console;

// ---------------------------------------------------------------------------
//  Libretro Buildbot core downloader
// ---------------------------------------------------------------------------

const BUILDBOT_BASE = "https://buildbot.libretro.com/nightly/linux/x86_64/latest";

interface BuildbotCore {
  id: string;
  coreName: string;        // e.g. "fceumm"
  displayName: string;
  filename: string;        // e.g. "fceumm_libretro.so.zip"
  platforms: string[];
  category: "core";
}

export const BUILDBOT_CORES: BuildbotCore[] = [
  { id: "buildbot-fceumm", coreName: "fceumm", displayName: "FCEUmm (NES)", filename: "fceumm_libretro.so.zip", platforms: ["nes"], category: "core" },
  { id: "buildbot-picodrive", coreName: "picodrive", displayName: "PicoDrive (Genesis/32X/SMS/GG)", filename: "picodrive_libretro.so.zip", platforms: ["genesis", "sms", "gamegear"], category: "core" },
  { id: "buildbot-mupen64plus-next", coreName: "mupen64plus_next", displayName: "Mupen64Plus-Next (N64)", filename: "mupen64plus_next_libretro.so.zip", platforms: ["n64"], category: "core" },
  { id: "buildbot-parallel-n64", coreName: "parallel_n64", displayName: "Parallel N64 (N64)", filename: "parallel_n64_libretro.so.zip", platforms: ["n64"], category: "core" },
  { id: "buildbot-melonds", coreName: "melonds", displayName: "melonDS (NDS)", filename: "melonds_libretro.so.zip", platforms: ["nds"], category: "core" },
  { id: "buildbot-pcsx-rearmed", coreName: "pcsx_rearmed", displayName: "PCSX-ReARMed (PSX)", filename: "pcsx_rearmed_libretro.so.zip", platforms: ["psx"], category: "core" },
  { id: "buildbot-flycast", coreName: "flycast", displayName: "Flycast (Dreamcast)", filename: "flycast_libretro.so.zip", platforms: ["dreamcast"], category: "core" },
  { id: "buildbot-fbneo", coreName: "fbneo", displayName: "FinalBurn Neo (Arcade)", filename: "fbneo_libretro.so.zip", platforms: ["arcade"], category: "core" },
  { id: "buildbot-dosbox-pure", coreName: "dosbox_pure", displayName: "DOSBox Pure (DOS)", filename: "dosbox_pure_libretro.so.zip", platforms: ["dos"], category: "core" },
  { id: "buildbot-ppsspp", coreName: "ppsspp", displayName: "PPSSPP (PSP)", filename: "ppsspp_libretro.so.zip", platforms: ["psp"], category: "core" },
];

function getCoresDir(): string {
  let dir;
try { dir = join(app.getPath("userData"), "cores"); } catch { dir = join(process.cwd(), "cores"); }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function isBuildbotCoreInstalled(coreName: string): boolean {
  const coresDir = getCoresDir();
  const soName = coreName.includes("_libretro")
    ? `${coreName}.so`
    : `${coreName}_libretro.so`;
  return existsSync(join(coresDir, soName));
}

export function getBuildbotCorePath(coreName: string): string | undefined {
  const coresDir = getCoresDir();
  const soName = coreName.includes("_libretro")
    ? `${coreName}.so`
    : `${coreName}_libretro.so`;
  const path = join(coresDir, soName);
  return existsSync(path) ? path : undefined;
}

function downloadFile(url: string, dest: string, onProgress?: (downloaded: number, total: number) => void): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
        return;
      }
      const total = Number(response.headers.get("content-length")) || 0;
      const fileStream = createWriteStream(dest);

      let downloaded = 0;
      const reader = response.body!.getReader();

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          downloaded += value.length;
          fileStream.write(value);
          onProgress?.(downloaded, total);
        }
        fileStream.end();
      };

      fileStream.on("finish", () => resolve());
      fileStream.on("error", reject);

      await pump().catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Simple ZIP extraction for single-file .so.zip files from buildbot.
    // These are deflate-compressed zip files with a single .so entry.
    // We use node-stream-zip for robustness if available, otherwise a simple approach.
    try {
      const StreamZip = require("node-stream-zip");
      const zip = new StreamZip.async({ file: zipPath });
      zip.extract(null, destDir)
        .then(() => zip.close())
        .then(() => resolve())
        .catch((err: any) => reject(err));
    } catch {
      // Fallback: try using zlib unzip on the raw file (works for single-file zip)
      try {
        const dest = join(destDir, zipPath.replace(/\.zip$/, "").replace(/.*\//, ""));
        const source = createReadStream(zipPath);
        const destStream = createWriteStream(dest);
        source.pipe(createUnzip()).pipe(destStream);
        destStream.on("finish", () => resolve());
        destStream.on("error", reject);
      } catch (err) {
        reject(err);
      }
    }
  });
}

export async function installBuildbotCore(
  coreDef: BuildbotCore,
  window: Electron.BrowserWindow | null,
  sendProgress?: (progress: { packageId: string; operation: string; status: string; message?: string; percent?: number }) => void
): Promise<boolean> {
  const coresDir = getCoresDir();
  const zipUrl = `${BUILDBOT_BASE}/${coreDef.filename}`;
  const zipPath = join(coresDir, coreDef.filename);
  const soName = coreDef.coreName.includes("_libretro")
    ? `${coreDef.coreName}.so`
    : `${coreDef.coreName}_libretro.so`;

  sendProgress?.({
    packageId: coreDef.id,
    operation: "install",
    status: "running",
    message: `Downloading ${coreDef.displayName}...`,
    percent: 10,
  });

  try {
    await downloadFile(zipUrl, zipPath, (downloaded, total) => {
      const pct = total > 0 ? Math.round(10 + (downloaded / total) * 60) : 10;
      sendProgress?.({
        packageId: coreDef.id,
        operation: "install",
        status: "running",
        message: `Downloading ${coreDef.displayName} (${Math.round(downloaded / 1024)}KB)...`,
        percent: pct,
      });
    });

    sendProgress?.({
      packageId: coreDef.id,
      operation: "install",
      status: "running",
      message: `Extracting ${coreDef.displayName}...`,
      percent: 80,
    });

    await extractZip(zipPath, coresDir);

    // Clean up zip
    try { unlinkSync(zipPath); } catch { /* ignore */ }

    // Verify the .so exists
    const soPath = join(coresDir, soName);
    if (!existsSync(soPath)) {
      // The extracted file might have a different name, try to find it
      const entries = readdirSync(coresDir);
      const matchingSo = entries.find((e) => e.endsWith(".so") && e.includes(coreDef.coreName.split("_")[0]));
      if (!matchingSo) {
        throw new Error(`Expected .so file not found after extraction: ${soName}`);
      }
    }

    sendProgress?.({
      packageId: coreDef.id,
      operation: "install",
      status: "success",
      message: "Done",
      percent: 100,
    });

    return true;
  } catch (err: any) {
    // Clean up on failure
    try { unlinkSync(zipPath); } catch { /* ignore */ }

    sendProgress?.({
      packageId: coreDef.id,
      operation: "install",
      status: "error",
      message: err?.message ?? String(err),
    });

    log.error(`[buildbot] Failed to install ${coreDef.displayName}:`, err);
    return false;
  }
}

export async function uninstallBuildbotCore(
  coreDef: BuildbotCore,
  sendProgress?: (progress: { packageId: string; operation: string; status: string; message?: string; percent?: number }) => void
): Promise<boolean> {
  const coresDir = getCoresDir();
  const soName = coreDef.coreName.includes("_libretro")
    ? `${coreDef.coreName}.so`
    : `${coreDef.coreName}_libretro.so`;
  const soPath = join(coresDir, soName);

  sendProgress?.({
    packageId: coreDef.id,
    operation: "uninstall",
    status: "running",
    message: `Removing ${coreDef.displayName}...`,
    percent: 50,
  });

  try {
    if (existsSync(soPath)) {
      unlinkSync(soPath);
    }

    // Also try to remove any similarly-named .so files
    const entries = readdirSync(coresDir);
    for (const entry of entries) {
      if (entry.includes(coreDef.coreName) && entry.endsWith(".so")) {
        try { unlinkSync(join(coresDir, entry)); } catch { /* ignore */ }
      }
    }

    sendProgress?.({
      packageId: coreDef.id,
      operation: "uninstall",
      status: "success",
      message: "Done",
      percent: 100,
    });

    return true;
  } catch (err: any) {
    sendProgress?.({
      packageId: coreDef.id,
      operation: "uninstall",
      status: "error",
      message: err?.message ?? String(err),
    });

    log.error(`[buildbot] Failed to uninstall ${coreDef.displayName}:`, err);
    return false;
  }
}

export function getBuildbotCoreVersion(coreName: string): string | undefined {
  const path = getBuildbotCorePath(coreName);
  if (!path) return undefined;
  try {
    const stat = statSync(path);
    // Use file modification date as version proxy
    return new Date(stat.mtime).toISOString().split("T")[0];
  } catch {
    return undefined;
  }
}
