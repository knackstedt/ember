import { app, screen } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createLogger } from "../util/logger";

const log = createLogger("info");

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  fullscreen?: boolean;
  maximized?: boolean;
}

const statePath = join(app.getPath("userData"), "window-state.json");
const defaultState: WindowState = { width: 1280, height: 720 };
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getWindowState(): WindowState {
  try {
    if (existsSync(statePath)) {
      const parsed = JSON.parse(readFileSync(statePath, "utf-8")) as WindowState;
      const displays = screen.getAllDisplays();
      // Clamp size to largest display
      const maxW = Math.max(...displays.map((d) => d.workAreaSize.width));
      const maxH = Math.max(...displays.map((d) => d.workAreaSize.height));
      if (parsed.width > maxW) parsed.width = maxW;
      if (parsed.height > maxH) parsed.height = maxH;
      // Ensure window is visible on at least one display
      const visible = displays.some((d) => {
        const wx = parsed.x ?? 0;
        const wy = parsed.y ?? 0;
        return (
          wx < d.bounds.x + d.bounds.width &&
          wx + parsed.width > d.bounds.x &&
          wy < d.bounds.y + d.bounds.height &&
          wy + parsed.height > d.bounds.y
        );
      });
      if (!visible) {
        parsed.x = undefined;
        parsed.y = undefined;
      }
      log.info("window-state", `loaded ${statePath} ${JSON.stringify(parsed)}`);
      return parsed;
    }
  } catch (err) {
    log.warn("window-state", `failed to load: ${err}`);
  }
  log.info("window-state", `using defaults ${JSON.stringify(defaultState)}`);
  return { ...defaultState };
}

export function saveWindowState(state: WindowState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      writeFileSync(statePath, JSON.stringify(state), "utf-8");
      log.info("window-state", `saved ${statePath} ${JSON.stringify(state)}`);
    } catch (err) {
      log.warn("window-state", `failed to save: ${err}`);
    }
  }, 300);
}
