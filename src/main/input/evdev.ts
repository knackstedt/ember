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
  ControllerConnectionType,
} from "../../shared/types";
import { createLogger } from "../util/logger";
import {
  CompactEventKind,
  COMPACT_EVENT_SIZE,
  writeCompactEvent,
} from "../../shared/controller-buffer";

const log = createLogger("info");

const INPUT_DIR = "/dev/input";

let watcher: ReturnType<typeof setInterval> | null = null;
interface ActiveDeviceEntry {
  device: unknown;
  close: () => void;
  info: ControllerDevice;
  controllerIdx: number;
  /** Rolling window of recent event latencies (ms) */
  latencySamples: number[];
  lastActivityAt: number;
}
const activeDevices = new Map<string, ActiveDeviceEntry>();

/** Allocate a free controller index (0..7). Returns -1 if full. */
function allocControllerIdx(): number {
  const used = new Set<number>();
  for (const d of activeDevices.values()) used.add(d.controllerIdx);
  for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
  return -1;
}

function freeControllerIdx(idx: number): void {
  // No-op; allocation just scans for gaps.
}

/* ─── Connection & sysfs helpers ─── */

function readSysfsText(path: string): string | null {
  try {
    if (existsSync(path)) return readFileSync(path, "utf-8").trim();
  } catch { /* ignore */ }
  return null;
}

function readSysfsInt(path: string): number | undefined {
  const text = readSysfsText(path);
  if (text === null) return undefined;
  const n = parseInt(text, 10);
  return Number.isNaN(n) ? undefined : n;
}

const MAC_RE = /^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$/;

function detectConnectionType(
  phys: string | null,
  vendorId: number,
  productId: number,
): ControllerConnectionType {
  const p = (phys ?? "").trim();
  // Bluetooth phys is a MAC address or contains "bluetooth"
  if (MAC_RE.test(p) || p.toLowerCase().includes("bluetooth")) return "bluetooth";
  // USB Xbox Wireless Adapter (vendor-only detection since there are
  // several product IDs for the adapter and its firmware variants)
  if (vendorId === 0x045e) {
    const dongleProducts = new Set([0x02fe, 0x02fd, 0x0916, 0x0b4f, 0x0816]);
    if (dongleProducts.has(productId)) return "dongle";
  }
  // Sony wireless adapter
  if (vendorId === 0x054c && productId === 0x0ba0) return "dongle";
  // 8BitDo wireless USB adapter
  if (vendorId === 0x2dc8) return "dongle";
  // Generic USB — could be wired or a dongle we don't recognise.
  if (p.startsWith("usb-")) return "wired";
  // Default to wired for everything else. Most controllers on a desktop
  // PC are physically connected; "unknown" is unhelpful noise.
  return "wired";
}

/** Walk up the sysfs tree looking for a bluetooth device RSSI. */
function findBluetoothRssi(inputSysPath: string): number | undefined {
  try {
    const { realpathSync } = require("fs");
    let cur = realpathSync(inputSysPath);
    for (let depth = 0; depth < 6; depth++) {
      const rssiPath = join(cur, "rssi");
      const rssi = readSysfsInt(rssiPath);
      if (rssi !== undefined) {
        // RSSI is negative dBm; map typical gamepad range (-90..-30) to 0..100
        const clamped = Math.max(-90, Math.min(-30, rssi));
        return Math.round(((clamped + 90) / 60) * 100);
      }
      const parent = join(cur, "..");
      cur = realpathSync(parent);
    }
  } catch { /* ignore */ }
  return undefined;
}

/** Try to find a battery capacity for a bluetooth MAC-matched power_supply. */
function findBatteryLevel(macHint: string | null): number | undefined {
  if (!macHint) return undefined;
  try {
    const psDir = "/sys/class/power_supply";
    if (!existsSync(psDir)) return undefined;
    for (const entry of readdirSync(psDir)) {
      const macPath = join(psDir, entry, "mac");
      if (existsSync(macPath)) {
        const mac = readFileSync(macPath, "utf-8").trim().toLowerCase();
        if (mac === macHint.toLowerCase()) {
          return readSysfsInt(join(psDir, entry, "capacity"));
        }
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

function getDeviceDriver(inputSysPath: string): string | undefined {
  try {
    const { realpathSync } = require("fs");
    const driverLink = join(realpathSync(inputSysPath), "driver");
    const resolved = realpathSync(driverLink);
    return resolved.split("/").pop();
  } catch { /* ignore */ }
  return undefined;
}

interface ExtraDeviceInfo {
  connectionType: ControllerConnectionType;
  driverName?: string;
  physPath?: string;
  signalStrengthPercent?: number;
  batteryPercent?: number;
}

function getExtraDeviceInfo(
  eventPath: string,
  vendorId: number,
  productId: number,
): ExtraDeviceInfo {
  const deviceNum = eventPath.replace("/dev/input/event", "");
  const sysPath = `/sys/class/input/event${deviceNum}/device`;
  const phys = readSysfsText(join(sysPath, "phys"));
  const connectionType = detectConnectionType(phys, vendorId, productId);
  const driverName = getDeviceDriver(sysPath);

  let signalStrengthPercent: number | undefined;
  let batteryPercent: number | undefined;

  if (connectionType === "bluetooth") {
    signalStrengthPercent = findBluetoothRssi(sysPath);
    // phys for bluetooth is usually the MAC address
    if (phys && MAC_RE.test(phys)) {
      batteryPercent = findBatteryLevel(phys);
    }
  }

  return {
    connectionType,
    driverName,
    physPath: phys ?? undefined,
    signalStrengthPercent,
    batteryPercent,
  };
}

/* ─── Axis layouts ───
 * Different Linux drivers expose axes in different orders.
 * We pick a map per device so the Controllers tab labels match reality.
 */

const XBOX_AXIS_MAP: Record<number, string> = {
  0: "left_x",
  1: "left_y",
  2: "left_trigger",
  3: "right_x",
  4: "right_y",
  5: "right_trigger",
  9: "right_trigger",
  10: "left_trigger",
  16: "dpad_x",
  17: "dpad_y",
};

const GENERIC_AXIS_MAP: Record<number, string> = {
  0: "left_x",
  1: "left_y",
  2: "right_x",
  5: "right_y",
  9: "right_trigger",
  10: "left_trigger",
  16: "dpad_x",
  17: "dpad_y",
};

function getAxisMap(name: string): Record<number, string> {
  const n = name.toLowerCase();
  // "Gamepad P5" and similar generic HID pads use an alternate layout
  if (n === "gamepad p5" || /gamepad\s*p\d/.test(n)) {
    return GENERIC_AXIS_MAP;
  }
  // Generic USB GameCube adapters (e.g. Microntek) expose right stick on
  // codes 2 and 5 instead of the Xbox-style 3 and 4.
  if (n.includes("microntek") || n.includes("gamecube")) {
    return GENERIC_AXIS_MAP;
  }
  return XBOX_AXIS_MAP;
}

/** Normalise raw axis values to the standard -1..1 (sticks) or 0..1
 *  (triggers) range so downstream code doesn't need to guess driver formats.
 *
 *  Linux drivers report wildly different raw ranges:
 *    - hid-generic (Gamepad P5 etc): everything 0..255, center 128
 *    - xpad (Xbox): sticks signed-16, triggers 0..1023
 *    - ds4drv (PS4): sticks signed-16, triggers 0..255
 *  We auto-detect by value magnitude so name matching isn't required.
 */
function normalizeAxis(value: number, code: number, axisName?: string): number {
  // EV_ABS value is signed 32-bit from kernel, but the actual range
  // depends on the HID descriptor the driver loaded.

  // Use the mapped axis name for trigger detection so alternate layouts
  // (e.g. generic HID pads that put right_x on code 2) are handled correctly.
  const isTrigger = axisName
    ? axisName.includes("trigger")
    : code === 2 || code === 5 || code === 9 || code === 10;

  // D-pad axes are digital directions, not analog — the kernel reports
  // small discrete values (-1, 0, 1 or similar). Pass through unchanged.
  if (axisName === "dpad_x" || axisName === "dpad_y") return value;

  // Already normalised float (some drivers report -1..1 floats).
  // Integer values must go through the normal path so raw 0 from
  // 0..255 drivers is mapped to the minimum, not centre.
  if (Math.abs(value) < 1 && !Number.isInteger(value)) return value;

  if (value >= 0 && value <= 255) {
    // 0..255 range: generic HID pad (or ds4drv triggers)
    if (isTrigger) return value / 255;
    // Stick deadzone: ±8 around center (128) so imperfect centering reads as 0
    const centered = value - 128;
    if (Math.abs(centered) <= 8) return 0;
    return centered / 128;
  }

  if (value > 255 && value <= 1023) {
    // 0..1023 range: xpad triggers
    if (isTrigger) return value / 1023;
    return value / 32767; // should not happen for sticks, but safe fallback
  }

  // Signed-16 range: xpad / ds4drv sticks (and any other signed-16 axes)
  if (isTrigger) return Math.max(0, value) / 32767;
  // Stick deadzone: ±1024 (~3%) around center so drift is reported as 0
  if (Math.abs(value) <= 1024) return 0;
  return value / 32767;
}

const BTN_MAP: Record<number, string> = {
  // Old-style joystick buttons (e.g. Microntek USB GameCube adapters)
  288: "west", // Y
  289: "north", // X
  290: "south", // A
  291: "east", // B
  292: "left_trigger_btn", // L
  293: "right_trigger_btn", // R
  294: "z", // Z
  297: "start", // Start
  // Standard gamepad buttons (xpad, ds4drv, etc)
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
  172: "home", // KEY_HOMEPAGE on some generic pads
};

function detectControllerType(
  name: string,
  vendorId: number,
  productId: number,
): ControllerType {
  const n = name.toLowerCase();
  if (n.includes("xbox") || vendorId === 0x045e || n.includes("xinput")) return "xbox";
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
  if (n.includes("gamecube") || n.includes("microntek") || vendorId === 0x057e || vendorId === 0x0079) return "gamecube";
  if (n.includes("dualshock") || n.includes("dual shock")) return "ps4";
  if (n.includes("dualsense")) return "ps5";
  // Most generic USB gamepads present as Xbox-style (standard mapping).
  // Show the Xbox diagram since it is the most complete and widely applicable.
  if (n.includes("gamepad") || n.includes("controller") || n.includes("joystick") || n.includes("pad")) return "xbox";
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
): Promise<ActiveDeviceEntry | null> {

  const controllerType = detectControllerType(
    info.name,
    info.vendorId,
    info.productId,
  );
  const deviceId = eventPath;
  const controllerIdx = allocControllerIdx();
  if (controllerIdx < 0) {
    log.warn("evdev", `Too many controllers, skipping ${eventPath}`);
    return null;
  }

  const extra = getExtraDeviceInfo(eventPath, info.vendorId, info.productId);
  const now = Date.now();
  const deviceInfo: ControllerDevice = {
    id: deviceId,
    name: info.name,
    type: controllerType,
    vendorId: info.vendorId,
    productId: info.productId,
    axisCount: 6,
    buttonCount: 16,
    controllerIdx,
    connectedAt: now,
    lastActivityAt: now,
    ...extra,
  };

  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send("input:device-connected", deviceInfo);
  }

  // Pick the correct axis map for this controller model
  const axisMap = getAxisMap(info.name);

  // Pure Node.js binary reader — struct input_event is 24 bytes on 64-bit Linux
  const EVENT_SIZE = 24; // sec(8) + usec(8) + type(2) + code(2) + value(4)
  const EV_SYN = 0,
    EV_KEY = 1,
    EV_ABS = 3;

  try {
    const stream = createReadStream(eventPath);
    let remainder = Buffer.alloc(0);

    // Pre-allocate a reusable compact event buffer to avoid GC churn
    const compactBuf = Buffer.allocUnsafe(COMPACT_EVENT_SIZE);

    stream.on("data", (chunk) => {
      if (window.isDestroyed()) {
        stream.destroy();
        return;
      }
      const data = chunk as Buffer;
      let buf = Buffer.concat([remainder, data]);

      while (buf.length >= EVENT_SIZE) {
        const tvSec = Number(buf.readBigUInt64LE(0));
        const tvUsec = Number(buf.readBigUInt64LE(8));
        const type = buf.readUInt16LE(16);
        const code = buf.readUInt16LE(18);
        const value = buf.readInt32LE(20);
        buf = buf.subarray(EVENT_SIZE);

        const kernelMs = tvSec * 1000 + tvUsec / 1000;
        const latency = Math.max(0, Date.now() - kernelMs);
        const entry = activeDevices.get(eventPath);
        if (entry) {
          entry.lastActivityAt = Date.now();
          entry.latencySamples.push(latency);
          if (entry.latencySamples.length > 50) entry.latencySamples.shift();
        }

        if (type === EV_SYN) continue;

        if (type === EV_KEY) {
          const isBtn = code >= 0x100;
          if (isBtn) {
            compactBuf.writeUInt8(
              value ? CompactEventKind.BUTTON_PRESS : CompactEventKind.BUTTON_RELEASE,
              0,
            );
            compactBuf.writeUInt8(controllerIdx, 1);
            compactBuf.writeUInt16LE(code, 2);
            compactBuf.writeFloatLE(value ? 1 : 0, 4);
            compactBuf.writeUInt32LE(Date.now() >>> 0, 8);
            if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
              window.webContents.send("input:event", compactBuf.buffer.slice(compactBuf.byteOffset, compactBuf.byteOffset + COMPACT_EVENT_SIZE));
            }
          } else {
            // Keyboard events — still send as rich objects (infrequent, needed by App.tsx keyboard handler)
            const map = KEY_MAP;
            const inputEvent: NormalizedInputEvent = {
              source: "keyboard",
              deviceId,
              deviceName: info.name,
              type: value ? "button_press" : "button_release",
              action: map[code] ?? `btn_${code}`,
              rawCode: code,
              timestamp: Date.now(),
            };
            if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
              window.webContents.send("input:event-keyboard", inputEvent);
            }
          }
        } else if (type === EV_ABS) {
          const mappedAxis = axisMap[code] ?? `abs_${code}`;
          const normalized = normalizeAxis(value, code, mappedAxis);
          compactBuf.writeUInt8(CompactEventKind.AXIS, 0);
          compactBuf.writeUInt8(controllerIdx, 1);
          compactBuf.writeUInt16LE(code, 2);
          compactBuf.writeFloatLE(normalized, 4);
          compactBuf.writeUInt32LE(Date.now() >>> 0, 8);
          if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
            window.webContents.send("input:event", compactBuf.buffer.slice(compactBuf.byteOffset, compactBuf.byteOffset + COMPACT_EVENT_SIZE));
          }
        }
      }
      remainder = buf;
    });

    stream.on("error", (err) => {
      log.warn("evdev", `Error reading ${eventPath} (${info.name}): ${err}`);
      activeDevices.delete(eventPath);
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send("input:device-disconnected", { deviceId, controllerIdx });
      }
    });

    stream.on("close", () => {
      activeDevices.delete(eventPath);
    });

    return {
      device: stream,
      info: deviceInfo,
      controllerIdx,
      latencySamples: [],
      lastActivityAt: Date.now(),
      close: () => {
        stream.destroy();
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send("input:device-disconnected", { deviceId, controllerIdx });
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
  return Array.from(activeDevices.values()).map((h) => {
    const info = { ...h.info };
    // Refresh dynamic fields
    const avgLatency =
      h.latencySamples.length > 0
        ? h.latencySamples.reduce((a, b) => a + b, 0) / h.latencySamples.length
        : undefined;
    if (avgLatency !== undefined) info.latencyMs = Math.round(avgLatency);
    info.lastActivityAt = h.lastActivityAt;
    // Re-read wireless signal strength in case it changed
    if (info.connectionType === "bluetooth" && info.physPath) {
      const deviceNum = info.id.replace("/dev/input/event", "");
      const sysPath = `/sys/class/input/event${deviceNum}/device`;
      info.signalStrengthPercent = findBluetoothRssi(sysPath);
      if (MAC_RE.test(info.physPath)) {
        info.batteryPercent = findBatteryLevel(info.physPath);
      }
    }
    return info;
  });
}
