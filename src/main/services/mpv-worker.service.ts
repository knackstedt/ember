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
  // Use system Node.js (not Electron) to avoid loading Electron's bundled
  // libffmpeg.so, which exports libavutil 59 symbols that conflict with
  // libmpv's libavutil 58 and cause heap corruption.
  for (const cmd of ["node", "bun"]) {
    try {
      const path = execSync(`which ${cmd}`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
      if (path && existsSync(path)) return path;
    } catch { /* ignore */ }
  }
  return process.execPath;
}

// --- Binary frame pipe protocol (fd 4) ---
// All integers are little-endian.
// Header (20 bytes):
//   [0:4]   magic = 0x4652414d ('FRAM')
//   [4:8]   decoderId length (u32)
//   [8:12]  width (u32)
//   [12:16] height (u32)
//   [16:20] frame length (u32)
// Then: decoderId bytes + frame data
// (timestampMs is sent via IPC as frame-meta to avoid float encoding in binary)
const FRAME_MAGIC = 0x4652414d;
const FRAME_HEADER_SIZE = 20;

let pendingFrameMeta: { decoderId: string; timestampMs: number } | null = null;
let framePipeChunks: Buffer[] = [];
let framePipeLen = 0;
let framePipeHeadOffset = 0;

function appendFramePipeChunk(chunk: Buffer) {
  framePipeChunks.push(chunk);
  framePipeLen += chunk.length;
}

// Peek the first `n` unconsumed bytes without removing them.
// Returns a fresh Buffer of exactly `n` bytes copied from the chunks.
function peekFramePipe(n: number): Buffer | null {
  if (framePipeLen < n) return null;

  const head = framePipeChunks[0];
  if (head.length - framePipeHeadOffset >= n && framePipeChunks.length === 1) {
    // Fast path: everything is in the single head chunk.
    return head.subarray(framePipeHeadOffset, framePipeHeadOffset + n);
  }

  const parts: Buffer[] = [];
  let needed = n;
  let i = 0;
  while (needed > 0 && i < framePipeChunks.length) {
    const chunk = framePipeChunks[i];
    const start = i === 0 ? framePipeHeadOffset : 0;
    const avail = chunk.length - start;
    const take = Math.min(avail, needed);
    parts.push(chunk.subarray(start, start + take));
    needed -= take;
    i++;
  }
  return Buffer.concat(parts, n);
}

// Remove the first `n` unconsumed bytes from the chunk list.
function consumeFramePipe(n: number) {
  let remaining = n;
  while (remaining > 0 && framePipeChunks.length > 0) {
    const head = framePipeChunks[0];
    const available = head.length - framePipeHeadOffset;
    if (available <= remaining) {
      remaining -= available;
      framePipeChunks.shift();
      framePipeHeadOffset = 0;
    } else {
      framePipeHeadOffset += remaining;
      remaining = 0;
    }
  }
  framePipeLen -= n;
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

  // Use system Node.js to avoid Electron's libffmpeg.so symbol conflicts.
  // Frame data is transferred via a dedicated binary pipe (fd 4) instead of
  // IPC serialization, so V8 version differences don't matter.
  const nodeExec = findNodeExecutable();
  const isSystemNode = nodeExec !== process.execPath;
  const env: Record<string, string | undefined> = { ...process.env };
  if (!isSystemNode) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }

  const w = spawn(nodeExec, [workerScript], {
    env,
    stdio: ["pipe", "pipe", "pipe", "ipc", "pipe"],
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
    } else if (msg.type === "frame-meta") {
      // Frame metadata (decoderId, timestamp) arrives via IPC; the actual
      // pixel data arrives on the binary pipe (fd 4). They are matched up
      // in the binary pipe handler below.
      pendingFrameMeta = msg;
    } else if (msg.type === "event") {
      log.info("mpv-worker", `event ${msg.event} for ${msg.decoderId}${msg.message ? ": " + msg.message : ""}`);
      // Notify renderer of all events (end-file, error, etc.).
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (win) {
        win.webContents.send("mpv:event", {
          id: msg.decoderId,
          event: msg.event,
          message: msg.message,
        });
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

  // Binary frame pipe reader (fd 4 = stdio[4]).
  // Parses the binary frame protocol and matches frames with metadata
  // received via IPC (frame-meta messages).
  const framePipe = w.stdio[4];
  if (framePipe) {
    framePipe.on("data", (chunk: Buffer) => {
      appendFramePipeChunk(chunk);
      while (framePipeLen >= FRAME_HEADER_SIZE) {
        const header = peekFramePipe(FRAME_HEADER_SIZE);
        if (!header) break;

        const magic = header.readUInt32LE(0);
        if (magic !== FRAME_MAGIC) {
          // Out of sync — discard bytes until the next FRAM magic.
          const probe = peekFramePipe(framePipeLen);
          if (!probe) { consumeFramePipe(1); continue; }
          const idx = probe.indexOf(Buffer.from("FRAM"), 1);
          if (idx === -1) {
            consumeFramePipe(framePipeLen);
            break;
          }
          consumeFramePipe(idx);
          continue;
        }

        const idLen = header.readUInt32LE(4);
        const width = header.readUInt32LE(8);
        const height = header.readUInt32LE(12);
        const frameLen = header.readUInt32LE(16);
        const totalLen = FRAME_HEADER_SIZE + idLen + frameLen;
        if (framePipeLen < totalLen) break;

        const frameBuf = peekFramePipe(totalLen);
        if (!frameBuf) break;

        const decoderId = frameBuf.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + idLen).toString("utf8");
        const frameData = frameBuf.subarray(FRAME_HEADER_SIZE + idLen, totalLen);
        consumeFramePipe(totalLen);

        const meta = pendingFrameMeta;
        pendingFrameMeta = null;
        const timestampMs = meta?.timestampMs ?? 0;

        const q = getFrameQueue(decoderId);
        q.push({ width, height, data: frameData, timestampMs });
        if (q.length > MAX_QUEUE_LEN) q.shift();

        const win = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
        if (win) {
          win.webContents.send("mpv:frame", {
            id: decoderId,
            width,
            height,
            data: frameData,
            timestampMs,
          });
        }
      }
    });
  }

  w.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
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
    const ok = w.send!({ reqId, decoderId, type: "cmd", cmd, args });
    if (!ok) {
      log.warn("mpv", `[sendCommand] IPC channel full or closed for reqId=${reqId}`);
    }
    // Timeout after 10s so renderer doesn't hang forever.
    setTimeout(() => {
      if (workerPending.has(reqId)) {
        workerPending.delete(reqId);
        reject(new Error(`MPV worker command ${cmd} timed out`));
      }
    }, 10000);
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
  // Stop buffering frames for this decoder so already-queued frames don't keep
  // playing after the user pauses.
  frameQueues.delete(id);
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
  }
  worker = null;
  for (const pending of workerPending.values()) {
    pending.reject(new Error("MPV worker destroyed"));
  }
  workerPending.clear();
  frameQueues.clear();
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
