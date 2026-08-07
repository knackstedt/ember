import type { BrowserWindow } from "electron";
import type { ScanItemEvent } from "../services/remote-scan.service";

export interface IpcContext {
  window: BrowserWindow;
  sendToWindow: (channel: string, ...args: any[]) => void;
  sendRemoteProgress: (progress: {
    scanner: string;
    current: number;
    total: number;
    status: "scanning" | "done" | "error";
    message?: string;
  }) => void;
  sendScanItem: (event: ScanItemEvent) => void;
  sendScanTrigger: (types: ("games" | "movies" | "music")[]) => void;
  scanLocks: { movies: boolean; music: boolean; tv: boolean };
  regenerateLocks: Set<string>;
}
