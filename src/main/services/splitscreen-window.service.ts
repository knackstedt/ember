import { execSync } from "child_process";
import { DisplayInfo, SplitscreenSlot, WindowManager, WindowServerType } from "../../shared/splitscreen-types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

function detectWindowServer(): WindowServerType {
  if (process.env.XDG_SESSION_TYPE === "wayland" || process.env.WAYLAND_DISPLAY) {
    return "wayland";
  }
  return "x11";
}

class X11WindowManager implements WindowManager {
  async detectDisplayLayout(): Promise<DisplayInfo[]> {
    try {
      const output = execSync("xrandr --query", { encoding: "utf-8", stdio: "pipe" });
      const displays: DisplayInfo[] = [];
      for (const line of output.split("\n")) {
        // Match lines like: "HDMI-0 connected primary 1920x1080+0+0"
        const match = line.match(/^(\S+)\s+connected\s+(primary\s+)?(\d+)x(\d+)\+(\d+)\+(\d+)/);
        if (match) {
          const id = match[1];
          const isPrimary = !!match[2];
          const width = parseInt(match[3], 10);
          const height = parseInt(match[4], 10);
          const x = parseInt(match[5], 10);
          const y = parseInt(match[6], 10);
          displays.push({ id, name: id, x, y, width, height, isPrimary });
        }
      }
      if (displays.length === 0) {
        // Fallback: assume single display at 0,0
        displays.push({ id: "default", name: "Default", x: 0, y: 0, width: 1920, height: 1080, isPrimary: true });
      }
      log.info("splitscreen-window", `Detected ${displays.length} display(s): ${displays.map((d) => d.id).join(", ")}`);
      return displays;
    } catch (err) {
      log.error("splitscreen-window", `Failed to detect displays via xrandr: ${err}`);
      return [{ id: "default", name: "Default", x: 0, y: 0, width: 1920, height: 1080, isPrimary: true }];
    }
  }

  async positionWindow(windowId: number, slot: SplitscreenSlot): Promise<void> {
    try {
      execSync(`xdotool windowmove ${windowId} ${slot.x} ${slot.y}`, { stdio: "pipe" });
      execSync(`xdotool windowsize ${windowId} ${slot.width} ${slot.height}`, { stdio: "pipe" });
      log.info("splitscreen-window", `Positioned window ${windowId} to (${slot.x},${slot.y}) ${slot.width}x${slot.height}`);
    } catch (err) {
      log.error("splitscreen-window", `Failed to position window ${windowId}: ${err}`);
    }
  }

  async getActiveWindow(): Promise<number | null> {
    try {
      const output = execSync("xdotool getactivewindow", { encoding: "utf-8", stdio: "pipe" }).trim();
      return parseInt(output, 10);
    } catch {
      return null;
    }
  }

  async focusWindow(windowId: number): Promise<void> {
    try {
      execSync(`xdotool windowactivate ${windowId}`, { stdio: "pipe" });
      execSync(`xdotool windowfocus ${windowId}`, { stdio: "pipe" });
    } catch (err) {
      log.error("splitscreen-window", `Failed to focus window ${windowId}: ${err}`);
    }
  }

  async getWindowGeometry(windowId: number): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      const output = execSync(`xdotool getwindowgeometry ${windowId}`, { encoding: "utf-8", stdio: "pipe" });
      const posMatch = output.match(/Position:\s+(\d+),(\d+)/);
      const sizeMatch = output.match(/Geometry:\s+(\d+)x(\d+)/);
      if (posMatch && sizeMatch) {
        return {
          x: parseInt(posMatch[1], 10),
          y: parseInt(posMatch[2], 10),
          width: parseInt(sizeMatch[1], 10),
          height: parseInt(sizeMatch[2], 10),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async waitForGameWindow(pid: number, timeoutMs: number): Promise<number | null> {
    const startTime = Date.now();
    const intervalMs = 200;
    while (Date.now() - startTime < timeoutMs) {
      try {
        const output = execSync(`xdotool search --pid ${pid} --onlyvisible`, { encoding: "utf-8", stdio: "pipe" }).trim();
        const windowIds = output.split("\n").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
        if (windowIds.length > 0) {
          // Return the first visible window
          log.info("splitscreen-window", `Found window ${windowIds[0]} for pid ${pid}`);
          return windowIds[0];
        }
      } catch {
        // No window found yet
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    log.warn("splitscreen-window", `Timed out waiting for window from pid ${pid} after ${timeoutMs}ms`);
    return null;
  }

  async cleanup(): Promise<void> {}
}

class WaylandWindowManager implements WindowManager {
  async detectDisplayLayout(): Promise<DisplayInfo[]> {
    return [{ id: "default", name: "Default", x: 0, y: 0, width: 1920, height: 1080, isPrimary: true }];
  }

  async positionWindow(): Promise<void> {
    throw new Error("Wayland window management not yet supported. A custom compositor is needed.");
  }

  async getActiveWindow(): Promise<number | null> {
    return null;
  }

  async focusWindow(): Promise<void> {
    throw new Error("Wayland window management not yet supported. A custom compositor is needed.");
  }

  async getWindowGeometry(): Promise<null> {
    return null;
  }

  async waitForGameWindow(): Promise<number | null> {
    throw new Error("Wayland window management not yet supported. A custom compositor is needed.");
  }

  async cleanup(): Promise<void> {}
}

let manager: WindowManager | null = null;

function getWindowManager(): WindowManager {
  if (manager) return manager;
  const server = detectWindowServer();
  if (server === "wayland") {
    manager = new WaylandWindowManager();
  } else {
    manager = new X11WindowManager();
  }
  return manager;
}

export function getWindowServer(): WindowServerType {
  return detectWindowServer();
}

export async function detectDisplays(): Promise<DisplayInfo[]> {
  return getWindowManager().detectDisplayLayout();
}

export async function positionWindow(windowId: number, slot: SplitscreenSlot): Promise<void> {
  return getWindowManager().positionWindow(windowId, slot);
}

export async function focusWindow(windowId: number): Promise<void> {
  return getWindowManager().focusWindow(windowId);
}

export async function waitForGameWindow(pid: number, timeoutMs: number): Promise<number | null> {
  return getWindowManager().waitForGameWindow(pid, timeoutMs);
}

export async function getActiveWindow(): Promise<number | null> {
  return getWindowManager().getActiveWindow();
}

export async function cleanupWindowService(): Promise<void> {
  if (manager) {
    await manager.cleanup();
    manager = null;
  }
}
