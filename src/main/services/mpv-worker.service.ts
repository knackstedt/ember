/**
 * MPV worker service — manages the isolated mpv child process and bridges
 * frames/commands between renderer and worker.
 */

import { join } from "path";
import { existsSync, statSync } from "fs";
import { BrowserWindow, ipcMain } from "electron";
import { spawn, ChildProcess, execSync } from "child_process";
import { createLogger } from "../util/logger";

function findNodeExecutable(): string {
  // Prefer system Node.js or Bun over Electron's executable.
  // Electron bundles libffmpeg.so which exports libavutil 59 symbols,
  // conflicting with libmpv's libavutil 58 and causing heap corruption.
  for (const cmd of ["node", "bun"]) {
    try {
      const path = execSync(`which ${cmd}`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
      if (path && existsSync(path)) {
        return path;
      }
    } catch { /* ignore */ }
  }
  return process.execPath;
}

const log = createLogger("info");

let worker: ChildProcess | null = null;
let workerAddonMtime = 0;
let workerReqId = 0;
const workerPending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: any) => void }
>();

// Per-decoder frame queue — worker pushes, renderer pulls.
const frameQueues = new Map<
  string,
  Array<{ width: number; height: number; data: Buffer; timestampMs: number }>
>();
const MAX_QUEUE_LEN = 3;

function getAddonMtime(): number {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const addonName = `video-decoder.linux-${arch}-gnu.node`;
  const candidates = [
    join(process.resourcesPath, addonName),
    join(__dirname, "..", "..", "resources", addonName),
    join(__dirname, "..", "renderer", addonName),
    join(__dirname, addonName),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return statSync(p).mtimeMs;
      } catch {
        return 0;
      }
    }
  }
  return 0;
}

function getFrameQueue(id: string) {
  let q = frameQueues.get(id);
  if (!q) {
    q = [];
    frameQueues.set(id, q);
  }
  return q;
}

function ensureWorker(): ChildProcess {
  const addonMtime = getAddonMtime();

  if (worker && !worker.killed && worker.exitCode === null) {
    if (addonMtime > 0 && workerAddonMtime > 0 && addonMtime !== workerAddonMtime) {
      log.info("mpv", "Native addon changed on disk; restarting worker...");
      try { worker.kill("SIGTERM"); } catch { /* ignore */ }
      // Let the exit handler clean up; null it out now so we spawn fresh below.
      worker = null;
      for (const pending of workerPending.values()) {
        pending.reject(new Error("MPV worker restarted due to addon update"));
      }
      workerPending.clear();
      frameQueues.clear();
    } else {
      return worker;
    }
  }

  const workerScript = join(__dirname, "mpv-worker.js");
  if (!existsSync(workerScript)) {
    throw new Error(`MPV worker not found at ${workerScript}`);
  }

  const nodeExec = findNodeExecutable();
  const isSystemNode = nodeExec !== process.execPath;
  const env: Record<string, string | undefined> = { ...process.env };
  if (!isSystemNode) {
    // Only set ELECTRON_RUN_AS_NODE when we're actually using Electron.
    env.ELECTRON_RUN_AS_NODE = "1";
  }

  const w = spawn(nodeExec, [workerScript], {
    env,
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    serialization: "advanced",
  });

  w.on("message", (msg: any) => {
    if (msg.type === "response") {
      const pending = workerPending.get(msg.reqId);
      if (pending) {
        workerPending.delete(msg.reqId);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (msg.type === "frame") {
      const frameData = Buffer.isBuffer(msg.data) ? msg.data : Buffer.from(msg.data);
      const q = getFrameQueue(msg.decoderId);
      q.push({
        width: msg.width,
        height: msg.height,
        data: frameData,
        timestampMs: msg.timestampMs,
      });
      if (q.length > MAX_QUEUE_LEN) {
        q.shift();
      }
      // Forward latest frame to renderer immediately.
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (win) {
        win.webContents.send("mpv:frame", {
          id: msg.decoderId,
          width: msg.width,
          height: msg.height,
          data: frameData,
          timestampMs: msg.timestampMs,
        });
      }
    } else if (msg.type === "event") {
      log.info("mpv-worker", `event ${msg.event} for ${msg.decoderId}`);
      if (msg.event === "end-file") {
        // Notify renderer that playback ended.
        const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
        if (win) {
          win.webContents.send("mpv:event", {
            id: msg.decoderId,
            event: msg.event,
          });
        }
      }
    }
  });

  w.stdout!.on("data", (chunk: Buffer) => {
    const lines = chunk.toString("utf8").split("\n");
    for (const line of lines) {
      if (line.trim()) log.info("mpv-worker", line.trim());
    }
  });

  w.stderr!.on("data", (chunk: Buffer) => {
    const lines = chunk.toString("utf8").split("\n");
    for (const line of lines) {
      if (line.trim()) log.warn("mpv-worker", line.trim());
    }
  });

  w.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    log.warn("mpv", `Worker exited code=${code} signal=${signal}`);
    const isCurrent = worker === w;
    if (isCurrent) {
      worker = null;
      for (const pending of workerPending.values()) {
        pending.reject(new Error("MPV worker crashed"));
      }
      workerPending.clear();
      frameQueues.clear();
    }
  });

  workerAddonMtime = addonMtime;
  worker = w;
  return w;
}

function sendCommand(cmd: string, decoderId: string, args?: any[]): Promise<any> {
  const w = ensureWorker();
  return new Promise((resolve, reject) => {
    const reqId = ++workerReqId;
    workerPending.set(reqId, { resolve, reject });
    w.send!({ reqId, decoderId, type: "cmd", cmd, args });
  });
}

export async function mpvCreate(id: string): Promise<void> {
  await sendCommand("create", id);
}

export async function mpvOpen(id: string, path: string): Promise<any> {
  return await sendCommand("open", id, [path]);
}

export async function mpvClose(id: string): Promise<void> {
  await sendCommand("close", id);
}

export async function mpvPlay(id: string): Promise<void> {
  await sendCommand("play", id);
}

export async function mpvPause(id: string): Promise<void> {
  await sendCommand("pause", id);
}

export async function mpvSeek(id: string, ms: number): Promise<void> {
  await sendCommand("seek", id, [ms]);
}

export async function mpvGetMetadata(id: string): Promise<any> {
  return await sendCommand("getMetadata", id);
}

export async function mpvGetTimePosMs(id: string): Promise<number> {
  return await sendCommand("getTimePosMs", id);
}

export async function mpvSetCurrentTime(id: string, ms: number): Promise<void> {
  await sendCommand("setCurrentTime", id, [ms]);
}

export async function mpvSetRenderSize(id: string, width: number, height: number): Promise<void> {
  await sendCommand("setRenderSize", id, [width, height]);
}

export async function mpvListSubtitleTracks(id: string): Promise<any[]> {
  return await sendCommand("listSubtitleTracks", id);
}

export async function mpvSelectSubtitleTrack(
  id: string,
  trackId: number,
): Promise<void> {
  await sendCommand("selectSubtitleTrack", id, [trackId]);
}

export async function mpvLoadExternalSubtitle(
  id: string,
  path: string,
): Promise<void> {
  await sendCommand("loadExternalSubtitle", id, [path]);
}

export async function mpvListAudioTracks(id: string): Promise<any[]> {
  return await sendCommand("listAudioTracks", id);
}

export async function mpvSelectAudioTrack(
  id: string,
  trackId: number,
): Promise<void> {
  await sendCommand("selectAudioTrack", id, [trackId]);
}

export async function mpvGetVolume(id: string): Promise<number> {
  return await sendCommand("getVolume", id);
}

export async function mpvSetVolume(id: string, vol: number): Promise<void> {
  await sendCommand("setVolume", id, [vol]);
}

export async function mpvGetMute(id: string): Promise<boolean> {
  return await sendCommand("getMute", id);
}

export async function mpvSetMute(id: string, mute: boolean): Promise<void> {
  await sendCommand("setMute", id, [mute]);
}

export async function mpvGetSpeed(id: string): Promise<number> {
  return await sendCommand("getSpeed", id);
}

export async function mpvSetSpeed(id: string, speed: number): Promise<void> {
  await sendCommand("setSpeed", id, [speed]);
}

export async function mpvListChapters(id: string): Promise<any[]> {
  return await sendCommand("listChapters", id);
}

export async function mpvGetChapter(id: string): Promise<number> {
  return await sendCommand("getChapter", id);
}

export async function mpvSetChapter(id: string, idx: number): Promise<void> {
  await sendCommand("setChapter", id, [idx]);
}

// Frame pulling — renderer calls this to get the next frame.
export async function mpvRenderNextFrame(
  id: string,
): Promise<{ width: number; height: number; data: Buffer } | null> {
  // Wait up to 100ms for a frame to arrive.
  const q = getFrameQueue(id);
  const start = Date.now();
  while (q.length === 0 && Date.now() - start < 100) {
    await new Promise((r) => setTimeout(r, 5));
  }
  return q.shift() ?? null;
}

export function mpvDestroy(id: string): void {
  frameQueues.delete(id);
  sendCommand("close", id).catch(() => {});
}

export function mpvWorkerAvailable(): boolean {
  try {
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const addonName = `video-decoder.linux-${arch}-gnu.node`;
    const candidates = [
      join(process.resourcesPath, addonName),
      join(__dirname, "..", "..", "resources", addonName),
      join(__dirname, "..", "renderer", addonName),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function destroyMpvWorker(): void {
  if (worker && !worker.killed) {
    try {
      worker.kill("SIGTERM");
    } catch { /* ignore */ }
    worker = null;
  }
}

export function registerMpvIpcHandlers(): void {
  ipcMain.handle("mpv:create", async (_e, id: string) => mpvCreate(id));
  ipcMain.handle("mpv:open", async (_e, id: string, path: string) =>
    mpvOpen(id, path),
  );
  ipcMain.handle("mpv:play", async (_e, id: string) => mpvPlay(id));
  ipcMain.handle("mpv:pause", async (_e, id: string) => mpvPause(id));
  ipcMain.handle("mpv:seek", async (_e, id: string, ms: number) =>
    mpvSeek(id, ms),
  );
  ipcMain.handle("mpv:getMetadata", async (_e, id: string) =>
    mpvGetMetadata(id),
  );
  ipcMain.handle("mpv:getTimePosMs", async (_e, id: string) =>
    mpvGetTimePosMs(id),
  );
  ipcMain.handle("mpv:setCurrentTime", async (_e, id: string, ms: number) =>
    mpvSetCurrentTime(id, ms),
  );
  ipcMain.handle("mpv:setRenderSize", async (_e, id: string, width: number, height: number) =>
    mpvSetRenderSize(id, width, height),
  );
  ipcMain.handle("mpv:renderNextFrame", async (_e, id: string) =>
    mpvRenderNextFrame(id),
  );
  ipcMain.handle(
    "mpv:listSubtitleTracks",
    async (_e, id: string) => mpvListSubtitleTracks(id),
  );
  ipcMain.handle(
    "mpv:selectSubtitleTrack",
    async (_e, id: string, trackId: number) =>
      mpvSelectSubtitleTrack(id, trackId),
  );
  ipcMain.handle(
    "mpv:loadExternalSubtitle",
    async (_e, id: string, path: string) =>
      mpvLoadExternalSubtitle(id, path),
  );
  ipcMain.handle("mpv:listAudioTracks", async (_e, id: string) =>
    mpvListAudioTracks(id),
  );
  ipcMain.handle(
    "mpv:selectAudioTrack",
    async (_e, id: string, trackId: number) =>
      mpvSelectAudioTrack(id, trackId),
  );
  ipcMain.handle("mpv:getVolume", async (_e, id: string) => mpvGetVolume(id));
  ipcMain.handle("mpv:setVolume", async (_e, id: string, vol: number) =>
    mpvSetVolume(id, vol),
  );
  ipcMain.handle("mpv:getMute", async (_e, id: string) => mpvGetMute(id));
  ipcMain.handle("mpv:setMute", async (_e, id: string, mute: boolean) =>
    mpvSetMute(id, mute),
  );
  ipcMain.handle("mpv:getSpeed", async (_e, id: string) => mpvGetSpeed(id));
  ipcMain.handle("mpv:setSpeed", async (_e, id: string, speed: number) =>
    mpvSetSpeed(id, speed),
  );
  ipcMain.handle("mpv:listChapters", async (_e, id: string) =>
    mpvListChapters(id),
  );
  ipcMain.handle("mpv:getChapter", async (_e, id: string) => mpvGetChapter(id));
  ipcMain.handle("mpv:setChapter", async (_e, id: string, idx: number) =>
    mpvSetChapter(id, idx),
  );
  ipcMain.handle("mpv:destroy", async (_e, id: string) => {
    mpvDestroy(id);
  });
}
