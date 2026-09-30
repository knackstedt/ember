/**
 * Minimal preload for the hidden flash-thumbnail capture window.
 * Replaces the old nodeIntegration:true approach: the generated page can only
 * read the (allowlisted) SWF bytes and signal ready/error back to main.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__flashCapture", {
  readSwf: (path: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke("flash-capture:swf", path),
  ready: (): void => {
    ipcRenderer.send("flash-capture:ready");
  },
  error: (message: string): void => {
    ipcRenderer.send("flash-capture:error", message);
  },
  log: (message: string): void => {
    ipcRenderer.send("flash-capture:log", message);
  },
});
