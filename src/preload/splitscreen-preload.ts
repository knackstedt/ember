import { contextBridge, ipcRenderer } from "electron";

const api = {
  splitscreen: {
    toggleOverlay: (): void => {
      ipcRenderer.send("splitscreen:toggle-overlay");
    },
    exit: (): void => {
      ipcRenderer.send("splitscreen:exit");
    },
    getSlot: (): Promise<number> => ipcRenderer.invoke("splitscreen:get-slot"),
  },
  flashFilters: {
    list: (): Promise<{ id: string; name: string; content: string }[]> =>
      ipcRenderer.invoke("flash-filters:list"),
  },
  input: {
    devices: (): Promise<unknown[]> => ipcRenderer.invoke("input:devices"),
    getMappings: (deviceId: string): Promise<unknown[]> =>
      ipcRenderer.invoke("input:mappings:get", deviceId),
    setMapping: (deviceId: string, inputCode: string, action: string): Promise<void> =>
      ipcRenderer.invoke("input:mappings:set", deviceId, inputCode, action),
    resetMappings: (deviceId: string): Promise<void> =>
      ipcRenderer.invoke("input:mappings:reset", deviceId),
  },
  onOverlayState: (cb: (visible: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, visible: boolean) => cb(visible);
    ipcRenderer.on("splitscreen:overlay-state", handler);
    return () => ipcRenderer.removeListener("splitscreen:overlay-state", handler);
  },
};

contextBridge.exposeInMainWorld("htpc", api);
