import { ChildProcess } from "child_process";
import { BrowserWindow, ipcMain } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import {
    mpvWorkerAvailable,
    registerMpvIpcHandlers,
} from "../services/mpv-worker.service";
import type { ScanItemEvent } from "../services/remote-scan.service";
import { createLogger } from "../util/logger";
import type { IpcContext } from "./types";

// Handler module imports
import { registerAppHandlers } from "./handlers/app";
import { registerBluetoothHandlers } from "./handlers/bluetooth";
import { registerCollectionsHandlers } from "./handlers/collections";
import { registerDbHandlers } from "./handlers/db";
import { registerGamesHandlers } from "./handlers/games";
import { registerInputHandlers } from "./handlers/input";
import { registerMoviesHandlers } from "./handlers/movies";
import { registerMusicHandlers } from "./handlers/music";
import { registerPackagesHandlers } from "./handlers/packages";
import { registerPluginsHandlers } from "./handlers/plugins";
import { registerRemoteHandlers } from "./handlers/remote";
import { registerSplitscreenHandlers } from "./handlers/splitscreen";
import { registerStoreHandlers } from "./handlers/store";
import { registerStreamingHandlers } from "./handlers/streaming";
import { registerSystemHandlers } from "./handlers/system";
import { registerTvHandlers } from "./handlers/tv";

const log = createLogger("info");

// ---------------------------------------------------------------------------
// Libretro worker process — isolates dynarec cores from Electron V8
// ---------------------------------------------------------------------------

let libretroWorker: ChildProcess | null = null;
let workerReqId = 0;
const workerPending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function ensureLibretroWorker(): ChildProcess {
  if (libretroWorker && !libretroWorker.killed && libretroWorker.exitCode === null) {
    return libretroWorker;
  }

  const workerScript = join(__dirname, "libretro-worker.js");
  if (!existsSync(workerScript)) {
    throw new Error(`Libretro worker not found at ${workerScript}`);
  }

  const worker = require("child_process").spawn(process.execPath, [workerScript], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    // V8 structured clone over the IPC channel — lets Buffers/TypedArrays
    // cross the process boundary natively instead of base64 or JSON arrays.
    serialization: "advanced",
  });

  worker.on("message", (msg: any) => {
    const pending = workerPending.get(msg.id);
    if (pending) {
      workerPending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    }
  });

  const NOISY_PATTERNS = [
    /^PU region/i,
    /^PU: region/i,
    /^unknown ARM9 IO write32/i,
    /^remapping (DTCM|SWRAM)/i,
    /^SET DATAPERM/i,
    /^done resetting jit mem/i,
    /^\s*\d{8}\/\d{8}\s*$/,
    /^\s*\d{8}\/\d{8}\s+\S+$/,
    /^NDS SRAM: Flush requested/i,
  ];

  function shouldLogWorkerLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return !NOISY_PATTERNS.some((p) => p.test(trimmed));
  }

  worker.stdout!.on("data", (chunk: Buffer) => {
    const lines = chunk.toString("utf8").split("\n");
    for (const line of lines) {
      if (shouldLogWorkerLine(line)) {
        log.info("libretro-worker", line.trim());
      }
    }
  });

  worker.stderr!.on("data", (chunk: Buffer) => {
    const lines = chunk.toString("utf8").split("\n");
    for (const line of lines) {
      if (shouldLogWorkerLine(line)) {
        log.info("libretro-worker", line.trim());
      }
    }
  });

  worker.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    log.warn("libretro", `Worker exited code=${code} signal=${signal}`);
    const isCurrent = libretroWorker === worker;
    if (isCurrent) {
      libretroWorker = null;
      for (const pending of workerPending.values()) {
        pending.reject(new Error("Libretro worker crashed"));
      }
      workerPending.clear();
    }
  });

  libretroWorker = worker;
  return worker;
}

export async function destroyWorker(): Promise<void> {
  if (!libretroWorker) return;
  const dyingWorker = libretroWorker;
  libretroWorker = null;
  for (const pending of workerPending.values()) {
    pending.reject(new Error("Libretro worker destroyed"));
  }
  workerPending.clear();
  workerReqId = 0;

  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    dyingWorker.once("exit", done);

    try {
      dyingWorker.disconnect();
    } catch {}

    setTimeout(() => {
      if (resolved) return;
      try {
        dyingWorker.kill("SIGKILL");
      } catch {}
      done();
    }, 500);
  });
}

export function workerCall(method: string, ...args: any[]): Promise<any> {
  const worker = ensureLibretroWorker();
  const id = ++workerReqId;
  return new Promise((resolve, reject) => {
    workerPending.set(id, { resolve, reject });
    worker.send!({ id, method, args });
  });
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

const scanLocks = {
  movies: false,
  music: false,
  tv: false,
};

const regenerateLocks = new Set<string>();

function sendToWindow(win: BrowserWindow, channel: string, ...args: any[]) {
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

// ---------------------------------------------------------------------------
// Register all IPC handlers
// ---------------------------------------------------------------------------

export function registerIpcHandlers(window: BrowserWindow): void {
  const sendRemoteProgress = (progress: {
    scanner: string;
    current: number;
    total: number;
    status: "scanning" | "done" | "error";
    message?: string;
  }) => {
    sendToWindow(window, "scan:progress", progress);
  };

  const sendScanItem = (event: ScanItemEvent) => {
    sendToWindow(window, "scan:item", event);
  };

  function sendScanTrigger(types: ("games" | "movies" | "music")[]): void {
    sendToWindow(window, "scan:trigger", { types });
  }

  const ctx: IpcContext = {
    window,
    sendToWindow: (channel: string, ...args: any[]) => sendToWindow(window, channel, ...args),
    sendRemoteProgress,
    sendScanItem,
    sendScanTrigger,
    scanLocks,
    regenerateLocks,
  };

  // Devtools handlers (small, tied to window lifecycle)
  ipcMain.handle("devtools:is-open", () => window.webContents.isDevToolsOpened());
  window.webContents.on("devtools-opened", () => sendToWindow(window, "devtools:changed", true));
  window.webContents.on("devtools-closed", () => sendToWindow(window, "devtools:changed", false));

  // MPV worker handlers
  if (mpvWorkerAvailable()) {
    registerMpvIpcHandlers();
  }
  registerFfmpegIpcHandlers();
  registerLibretroCoresIpcHandlers();

  ipcMain.on("mpv:available", (event) => {
    const start = performance.now();
    const value = mpvWorkerAvailable();
    const elapsed = performance.now() - start;
    if (elapsed > 20) {
      log.warn("ipc", `mpv:available handler took ${elapsed.toFixed(1)}ms`);
    }
    event.returnValue = value;
  });

  // Domain handler modules
  registerAppHandlers(ctx);
  registerSplitscreenHandlers(ctx);
  registerGamesHandlers(ctx);
  registerMoviesHandlers(ctx);
  registerMusicHandlers(ctx);
  registerTvHandlers(ctx);
  registerInputHandlers(ctx);
  registerBluetoothHandlers(ctx);
  registerPluginsHandlers(ctx);
  registerStreamingHandlers(ctx);
  registerPackagesHandlers(ctx);
  registerCollectionsHandlers(ctx);
  registerDbHandlers(ctx);
  registerStoreHandlers(ctx);
  registerRemoteHandlers(ctx);
  registerSystemHandlers(ctx);
}
