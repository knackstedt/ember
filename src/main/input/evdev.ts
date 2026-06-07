/**
 * Pure Node.js evdev reader — reads Linux input_event structs directly from
 * /dev/input/eventX. No native addon required. Works even when a game process
 * has exclusive focus since we read at the kernel level.
 *
 * struct input_event (64-bit Linux):
 *   __kernel_ulong_t tv_sec;   // 8 bytes
 *   __kernel_ulong_t tv_usec;  // 8 bytes
 *   __u16 type;                // 2 bytes
 *   __u16 code;                // 2 bytes
 *   __s32 value;               // 4 bytes
 *   Total: 24 bytes
 */
import { readdirSync, existsSync, readFileSync, createReadStream } from "fs";
import { join } from "path";
import { BrowserWindow } from "electron";
import {
  NormalizedInputEvent,
  InputSource,
  ControllerDevice,
  ControllerType,
} from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const INPUT_DIR = "/dev/input";

let watcher: ReturnType<typeof setInterval> | null = null;
const activeDevices = new Map<string, { device: unknown; close: () => void }>();

// When a libretro window is open, input events should go there instead of the main window.
let getLibretroWindowRef: (() => BrowserWindow | null) | null = null;

export function setLibretroWindowGetter(getter: (() => BrowserWindow | null) | null): void {
  getLibretroWindowRef = getter;
}

function getInputTargetWindow(): BrowserWindow | null {
  if (getLibretroWindowRef) {
    const win = getLibretroWindowRef();
    if (win && !win.isDestroyed()) {
      return win;
    }
  }
  return null;
}

const ABS_AXIS_MAP: Record<number, string> = {
  0: "left_x",
  1: "left_y",
  2: "left_trigger",
  3: "right_x",
  4: "right_y",
  5: "right_trigger",
  16: "dpad_x",
  17: "dpad_y",
};

const BTN_MAP: Record<number, string> = {
  304: "south",
  305: "east",
  306: "c",
  307: "west",
  308: "north",
  309: "z",
  310: "left_bumper",
  311: "right_bumper",
  312: "left_trigger_btn",
  313: "right_trigger_btn",
  314: "select",
  315: "start",
  316: "home",
  317: "left_thumb",
  318: "right_thumb",
  // D-pad as buttons
  544: "dpad_up",
  545: "dpad_down",
  546: "dpad_left",
  547: "dpad_right",
};

const KEY_MAP: Record<number, string> = {
  103: "up",
  108: "down",
  105: "left",
  106: "right",
  28: "enter",
  1: "escape",
  15: "tab",
  14: "backspace",
};

function detectControllerType(
  name: string,
  vendorId: number,
  productId: number,
): ControllerType {
  const n = name.toLowerCase();
  if (n.includes("xbox") || vendorId === 0x045e) return "xbox";
  if (vendorId === 0x054c) {
    if (productId === 0x0268) return "ps3";
    if (productId === 0x05c4 || productId === 0x09cc) return "ps4";
    if (productId === 0x0ce6) return "ps5";
    return "ps4";
  }
  if (
    n.includes("wiimote") ||
    n.includes("wii remote") ||
    n.includes("nintendo rvu")
  )
    return "wiimote";
  if (n.includes("gamecube") || vendorId === 0x057e) return "gamecube";
  if (n.includes("dualshock") || n.includes("dual shock")) return "ps4";
  if (n.includes("dualsense")) return "ps5";
  return "generic";
}

const EV_ABS = 0x03;
const EV_KEY = 0x01;

const CONTROLLER_NAME_HINTS = [
  "controller", "gamepad", "joystick", "pad", "xbox", "dualshock",
  "dualsense", "playstation", "switch", "pro controller", "wiimote",
  "wii remote", "gamecube", "nintendo", "8bitdo", "steam controller",
];

function nameLooksLikeController(name: string): boolean {
  const lower = name.toLowerCase();
  return CONTROLLER_NAME_HINTS.some((hint) => lower.includes(hint));
}

function hasControllerCapabilities(eventPath: string, name?: string): boolean {
  try {
    if (name && nameLooksLikeController(name)) return true;

    const deviceNum = eventPath.replace("/dev/input/event", "");
    const capPath = `/sys/class/input/event${deviceNum}/device/capabilities/ev`;
    if (!existsSync(capPath)) return false;
    const evCap = parseInt(readFileSync(capPath, "utf-8").trim(), 16);
    // Controllers/joysticks expose absolute axes (EV_ABS). Keyboards, mice,
    // power buttons, and HDMI audio devices do not.
    return (evCap & (1 << EV_ABS)) !== 0;
  } catch {
    return false;
  }
}

function getDeviceInfo(
  eventPath: string,
): { name: string; vendorId: number; productId: number } | null {
  try {
    const deviceNum = eventPath.replace("/dev/input/event", "");
    const sysPath = `/sys/class/input/event${deviceNum}/device`;
    if (!existsSync(sysPath)) return null;

    const namePath = join(sysPath, "name");
    const idPath = join(sysPath, "id");

    const name = existsSync(namePath)
      ? readFileSync(namePath, "utf-8").trim()
      : "Unknown";
    const vendorHex = existsSync(join(idPath, "vendor"))
      ? readFileSync(join(idPath, "vendor"), "utf-8").trim()
      : "0000";
    const productHex = existsSync(join(idPath, "product"))
      ? readFileSync(join(idPath, "product"), "utf-8").trim()
      : "0000";

    return {
      name,
      vendorId: parseInt(vendorHex, 16),
      productId: parseInt(productHex, 16),
    };
  } catch {
    return null;
  }
}

async function openDevice(
  eventPath: string,
  window: BrowserWindow,
  info: { name: string; vendorId: number; productId: number },
): Promise<{ device: unknown; close: () => void } | null> {

  const controllerType = detectControllerType(
    info.name,
    info.vendorId,
    info.productId,
  );
  const deviceId = eventPath;

  const deviceInfo: ControllerDevice = {
    id: deviceId,
    name: info.name,
    type: controllerType,
    vendorId: info.vendorId,
    productId: info.productId,
    axisCount: 6,
    buttonCount: 16,
  };

  const libretroWindow = getInputTargetWindow();
  const targetWindow = libretroWindow ?? window;
  if (!targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed()) {
    targetWindow.webContents.send("input:device-connected", deviceInfo);
  }

  // Pure Node.js binary reader — struct input_event is 24 bytes on 64-bit Linux
  const EVENT_SIZE = 24; // sec(8) + usec(8) + type(2) + code(2) + value(4)
  const EV_SYN = 0,
    EV_KEY = 1,
    EV_ABS = 3;

  try {
    const stream = createReadStream(eventPath);
    let remainder = Buffer.alloc(0);

    stream.on("data", (chunk: Buffer) => {
      if (window.isDestroyed()) {
        stream.destroy();
        return;
      }
      let buf = Buffer.concat([remainder, chunk]);

      while (buf.length >= EVENT_SIZE) {
        const type = buf.readUInt16LE(16);
        const code = buf.readUInt16LE(18);
        const value = buf.readInt32LE(20);
        buf = buf.subarray(EVENT_SIZE);

        if (type === EV_SYN) continue;

        let inputEvent: NormalizedInputEvent | null = null;

        if (type === EV_KEY) {
          const isBtn = code >= 0x100;
          const source: InputSource = isBtn ? "gamepad" : "keyboard";
          const map = isBtn ? BTN_MAP : KEY_MAP;
          inputEvent = {
            source,
            deviceId,
            deviceName: info.name,
            type: value ? "button_press" : "button_release",
            action: map[code] ?? `btn_${code}`,
            rawCode: code,
            timestamp: Date.now(),
          };
        } else if (type === EV_ABS) {
          inputEvent = {
            source: "gamepad",
            deviceId,
            deviceName: info.name,
            type: "axis",
            axis: ABS_AXIS_MAP[code] ?? `abs_${code}`,
            value,
            rawCode: code,
            timestamp: Date.now(),
          };
        }

        if (inputEvent) {
          const libretroWindow = getInputTargetWindow();
          if (libretroWindow) {
            if (!libretroWindow.isDestroyed() && !libretroWindow.webContents.isDestroyed()) {
              libretroWindow.webContents.send("input:event", inputEvent);
            }
          } else if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
            window.webContents.send("input:event", inputEvent);
          }
        }
      }
      remainder = buf;
    });

    stream.on("error", (err) => {
      log.warn("evdev", `Error reading ${eventPath} (${info.name}): ${err}`);
      activeDevices.delete(eventPath);
      const libretroWindow = getInputTargetWindow();
      const targetWindow = libretroWindow ?? window;
      if (!targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed()) {
        targetWindow.webContents.send("input:device-disconnected", deviceId);
      }
    });

    stream.on("close", () => {
      activeDevices.delete(eventPath);
    });

    return {
      device: stream,
      close: () => {
        stream.destroy();
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send("input:device-disconnected", deviceId);
        }
      },
    };
  } catch (err) {
    log.warn("evdev", `Could not open ${eventPath}: ${err}`);
    return null;
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

export async function initInputSystem(window: BrowserWindow): Promise<void> {
  if (!existsSync(INPUT_DIR)) {
    log.warn("evdev", "/dev/input not available");
    return;
  }

  const scanDevices = async (): Promise<void> => {
    let entries: string[];
    try {
      entries = readdirSync(INPUT_DIR);
    } catch {
      return;
    }

    const eventDevices = entries
      .filter((e) => e.startsWith("event"))
      .map((e) => join(INPUT_DIR, e));

    for (const device of eventDevices) {
      if (activeDevices.has(device)) continue;
      const info = getDeviceInfo(device);
      if (!info) continue;
      if (!hasControllerCapabilities(device, info.name)) continue;
      try {
        const handle = await withTimeout(
          openDevice(device, window, info),
          2000,
          `openDevice(${device})`,
        );
        if (handle) activeDevices.set(device, handle);
      } catch (err) {
        log.warn("evdev", `Skipping ${device} due to timeout/error: ${err}`);
      }
    }

    for (const [path] of activeDevices) {
      if (!existsSync(path)) {
        activeDevices.get(path)?.close();
        activeDevices.delete(path);
      }
    }
  };

  try {
    await withTimeout(scanDevices(), 5000, "scanDevices");
    watcher = setInterval(() => {
      scanDevices().catch((err) =>
        log.warn("evdev", `scanDevices error: ${err}`),
      );
    }, 3000);
  } catch (err) {
    log.warn("evdev", `Initial device scan timed out: ${err}`);
  }
}

export async function destroyInputSystem(): Promise<void> {
  if (watcher) {
    clearInterval(watcher);
    watcher = null;
  }
  for (const [, handle] of activeDevices) {
    handle.close();
  }
  activeDevices.clear();
}

export function getConnectedDevices(): ControllerDevice[] {
  return [];
}
