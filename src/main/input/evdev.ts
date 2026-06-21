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
import { readdirSync, existsSync, readFileSync, createReadStream, promises as fsPromises } from "fs";
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
  /** True if this is a touchpad auxiliary device for a controller */
  isTouchpad?: boolean;
}
const activeDevices = new Map<string, ActiveDeviceEntry>();

/** Devices that recently failed to open (EACCES after sleep, etc.) */
const recentFailures = new Map<string, number>();
const FAILURE_COOLDOWN_MS = 30_000;

/** Allocate a free controller index (0..7). Returns -1 if full. */
function allocControllerIdx(): number {
  const used = new Set<number>();
  for (const d of activeDevices.values()) used.add(d.controllerIdx);
  for (let i = 0; i < 80; i++) if (!used.has(i)) return i;
  return -1;
}

function freeControllerIdx(idx: number): void {
  // No-op; allocation just scans for gaps.
}

/* ─── Connection & sysfs helpers ─── */

async function readSysfsText(path: string): Promise<string | null> {
  try {
    if (existsSync(path)) {
      const data = await fsPromises.readFile(path, "utf-8");
      return data.trim();
    }
  } catch { /* ignore */ }
  return null;
}

async function readSysfsInt(path: string): Promise<number | undefined> {
  const text = await readSysfsText(path);
  if (text === null) return undefined;
  const n = parseInt(text, 10);
  return Number.isNaN(n) ? undefined : n;
}

const MAC_RE = /^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/;

function detectConnectionType(
  phys: string | null,
  vendorId: number,
  productId: number,
): ControllerConnectionType {
  const p = (phys ?? "").trim();
  // Bluetooth phys is a MAC address (sometimes with a channel suffix like /7)
  // or contains "bluetooth"
  if (MAC_RE.test(p) || p.toLowerCase().includes("bluetooth")) return "bluetooth";
  // USB Xbox Wireless Adapter — detect by vendor/product BEFORE the generic
  // usb- fallback so receiver dongles don't show as wired.
  if (vendorId === 0x045e) {
    const dongleProducts = new Set([
      // Xbox One / Series wireless adapters
      0x02fe, 0x02fd, 0x0916, 0x0b4f, 0x0816,
      // Xbox 360 wireless receiver (genuine and clone)
      0x0719, 0x0291,
    ]);
    if (dongleProducts.has(productId)) return "dongle";
  }
  // Sony wireless adapter
  if (vendorId === 0x054c && productId === 0x0ba0) return "dongle";
  // 8BitDo wireless USB adapter
  if (vendorId === 0x2dc8) return "dongle";
  // Generic USB — could be wired or a dongle we don't recognise.
  if (p.startsWith("usb-")) return "wired";
  // Sony (PlayStation) controllers that aren't on USB are almost always
  // Bluetooth (hid-sony driver). Default to wireless when unsure.
  if (vendorId === 0x054c && !p.startsWith("usb-")) return "bluetooth";
  // Default to wired for everything else. Most controllers on a desktop
  // PC are physically connected; "unknown" is unhelpful noise.
  return "wired";
}

/** Walk up the sysfs tree looking for a bluetooth device RSSI. */
async function findBluetoothRssi(inputSysPath: string): Promise<number | undefined> {
  try {
    let cur = await fsPromises.realpath(inputSysPath);
    for (let depth = 0; depth < 6; depth++) {
      const rssiPath = join(cur, "rssi");
      const rssi = await readSysfsInt(rssiPath);
      if (rssi !== undefined) {
        // RSSI is negative dBm; map typical gamepad range (-90..-30) to 0..100
        const clamped = Math.max(-90, Math.min(-30, rssi));
        return Math.round(((clamped + 90) / 60) * 100);
      }
      const parent = join(cur, "..");
      cur = await fsPromises.realpath(parent);
    }
  } catch { /* ignore */ }
  return undefined;
}

/** Try to find a battery capacity for a bluetooth MAC-matched power_supply. */
async function findBatteryLevel(macHint: string | null): Promise<number | undefined> {
  if (!macHint) return undefined;
  try {
    const psDir = "/sys/class/power_supply";
    if (!existsSync(psDir)) return undefined;
    const entries = await fsPromises.readdir(psDir);
    for (const entry of entries) {
      const macPath = join(psDir, entry, "mac");
      if (existsSync(macPath)) {
        const mac = (await fsPromises.readFile(macPath, "utf-8")).trim().toLowerCase();
        if (mac === macHint.toLowerCase()) {
          return await readSysfsInt(join(psDir, entry, "capacity"));
        }
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

async function getDeviceDriver(inputSysPath: string): Promise<string | undefined> {
  try {
    const driverLink = join(await fsPromises.realpath(inputSysPath), "driver");
    const resolved = await fsPromises.realpath(driverLink);
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

async function getExtraDeviceInfo(
  eventPath: string,
  vendorId: number,
  productId: number,
): Promise<ExtraDeviceInfo> {
  const deviceNum = eventPath.replace("/dev/input/event", "");
  const sysPath = `/sys/class/input/event${deviceNum}/device`;
  const phys = await readSysfsText(join(sysPath, "phys"));
  const connectionType = detectConnectionType(phys, vendorId, productId);
  const driverName = await getDeviceDriver(sysPath);

  let signalStrengthPercent: number | undefined;
  let batteryPercent: number | undefined;

  if (connectionType === "bluetooth") {
    signalStrengthPercent = await findBluetoothRssi(sysPath);
    // phys for bluetooth is usually the MAC address
    if (phys && MAC_RE.test(phys)) {
      batteryPercent = await findBatteryLevel(phys);
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

/** Nintendo Switch Pro Controller / Joy-Con via usbhid/hid-nintendo.
 *  Right stick is on 3/4; triggers are typically digital buttons (L/R/ZL/ZR). */
const SWITCH_AXIS_MAP: Record<number, string> = {
  0: "left_x",
  1: "left_y",
  3: "right_x",
  4: "right_y",
  16: "dpad_x",
  17: "dpad_y",
};

/** xwiimote driver axes.
 *  The nunchuk stick uses ABS_X/ABS_Y. IR and accelerometer share the
 *  same codes on different devices — map them to harmless names so
 *  they don't pollute the gamepad state. */
const WIIMOTE_AXIS_MAP: Record<number, string> = {
  0: "left_x",
  1: "left_y",
  2: "accel_z",
  3: "accel_rx",
  4: "accel_ry",
  5: "accel_rz",
  16: "ir_x",
  17: "ir_y",
};

function getAxisMap(name: string, driverName?: string): Record<number, string> {
  const n = name.toLowerCase();
  // "Gamepad P5" and similar generic HID pads use an alternate layout
  if (n === "gamepad p5" || /gamepad\s*p\d/.test(n)) {
    return GENERIC_AXIS_MAP;
  }
  // Generic USB GameCube adapters (e.g. Microntek) expose right stick on
  // codes 2 and 5 instead of the Xbox-style 3 and 4.
  if (n.includes("microntek") || n.includes("gamecube") || n.includes("n64")) {
    return GENERIC_AXIS_MAP;
  }
  // Nintendo Switch Pro Controller / Joy-Con
  if (n.includes("nintendo") && n.includes("pro controller")) {
    return SWITCH_AXIS_MAP;
  }
  if (n.includes("joy-con") || n.includes("switch")) {
    return SWITCH_AXIS_MAP;
  }
  // Nintendo Wii Remote / extension devices (xwiimote driver).
  // IR and accelerometer axes must NOT map to gamepad controls.
  if (n.includes("wiimote") || n.includes("wii remote")) {
    return WIIMOTE_AXIS_MAP;
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
    // Stick deadzone: ±12 around center (128) so imperfect centering reads as 0.
    // (±12 ≈ 9% — generic HID pads often have noisier centres than xpad.)
    const centered = value - 128;
    if (Math.abs(centered) <= 12) return 0;
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
  // Nintendo Switch controllers (Pro Controller, Joy-Con, etc)
  if (vendorId === 0x057e) {
    if (productId === 0x2009 || n.includes("pro controller")) return "switch";
    if (productId === 0x2006 || productId === 0x2007 || n.includes("joy-con")) return "switch";
    if (n.includes("switch")) return "switch";
  }
  // N64 USB adapter (DragonRise 0x0079:0x181C "Android Gamepad")
  if (vendorId === 0x0079 && productId === 0x181c) return "n64";
  if (n.includes("gamecube") || n.includes("microntek") || vendorId === 0x0079) return "gamecube";
  if (n.includes("n64")) return "n64";
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
  "wii remote", "gamecube", "n64", "nintendo", "8bitdo", "steam controller",
];

function nameLooksLikeController(name: string): boolean {
  const lower = name.toLowerCase();
  return CONTROLLER_NAME_HINTS.some((hint) => lower.includes(hint));
}

/** Reject motion-sensor / IMU sub-devices that share the same USB/BT
 *  connection as the actual gamepad.  They expose ABS axes (gyro/accel)
 *  and names containing "controller", so they slip through the usual
 *  heuristics and appear as duplicate gamepads. */
function isMotionSensorDevice(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("motion sensors") || lower.includes(" imu");
}

/** True for touchpad auxiliary devices (e.g. DualSense touchpad). */
function isTouchpadDevice(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("touchpad") || lower.includes("trackpad");
}

async function hasControllerCapabilities(eventPath: string, name?: string): Promise<boolean> {
  try {
    if (name && isMotionSensorDevice(name)) return false;
    if (name && nameLooksLikeController(name)) return true;

    const deviceNum = eventPath.replace("/dev/input/event", "");
    const capPath = `/sys/class/input/event${deviceNum}/device/capabilities/ev`;
    if (!existsSync(capPath)) return false;
    const evCap = parseInt((await fsPromises.readFile(capPath, "utf-8")).trim(), 16);
    // Controllers/joysticks expose absolute axes (EV_ABS). Keyboards, mice,
    // power buttons, and HDMI audio devices do not.
    return (evCap & (1 << EV_ABS)) !== 0;
  } catch {
    return false;
  }
}

async function getDeviceInfo(
  eventPath: string,
): Promise<{ name: string; vendorId: number; productId: number } | null> {
  try {
    const deviceNum = eventPath.replace("/dev/input/event", "");
    const sysPath = `/sys/class/input/event${deviceNum}/device`;
    if (!existsSync(sysPath)) return null;

    const namePath = join(sysPath, "name");
    const idPath = join(sysPath, "id");

    const name = existsSync(namePath)
      ? (await fsPromises.readFile(namePath, "utf-8")).trim()
      : "Unknown";
    const vendorHex = existsSync(join(idPath, "vendor"))
      ? (await fsPromises.readFile(join(idPath, "vendor"), "utf-8")).trim()
      : "0000";
    const productHex = existsSync(join(idPath, "product"))
      ? (await fsPromises.readFile(join(idPath, "product"), "utf-8")).trim()
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

/** Find an already-opened controller that matches this vendor/product.
 *  When `physHint` is provided, it is used to disambiguate multiple
 *  identical controllers (same USB port / BT MAC). */
function findParentControllerIdx(vendorId: number, productId: number, physHint?: string): number {
  let fallbackIdx = -1;
  for (const entry of activeDevices.values()) {
    if (entry.info.vendorId !== vendorId || entry.info.productId !== productId || entry.isTouchpad) {
      continue;
    }
    if (physHint && entry.info.physPath) {
      const parentPhys = entry.info.physPath;
      const tpPhys = physHint;
      // Exact match (bluetooth) or same USB root (differ only by /inputN)
      if (parentPhys === tpPhys || parentPhys.split("/input")[0] === tpPhys.split("/input")[0]) {
        return entry.controllerIdx;
      }
    } else {
      fallbackIdx = entry.controllerIdx;
    }
  }
  return fallbackIdx;
}

/** Try to read the ABS max value for a given axis code from sysfs.
 *  Falls back to a sensible default if sysfs doesn't expose it. */
async function readAbsMax(eventPath: string, code: number): Promise<number> {
  try {
    const deviceNum = eventPath.replace("/dev/input/event", "");
    const paths = [
      `/sys/class/input/event${deviceNum}/device/absinfo/${code}`,
      `/sys/class/input/event${deviceNum}/device/device/absinfo/${code}`,
    ];
    for (const p of paths) {
      if (existsSync(p)) {
        const text = (await fsPromises.readFile(p, "utf-8")).trim();
        const parts = text.split(/\s+/);
        if (parts.length >= 3) {
          const max = parseInt(parts[2], 10);
          if (!Number.isNaN(max) && max > 0) return max;
        }
      }
    }
  } catch { /* ignore */ }
  // DualSense touchpad is 1920x1080; generic fallback
  return code === 1 ? 1079 : 1919;
}

async function openDevice(
  eventPath: string,
  window: BrowserWindow,
  info: { name: string; vendorId: number; productId: number },
  parentControllerIdx?: number,
): Promise<ActiveDeviceEntry | null> {
  const isTouchpad = isTouchpadDevice(info.name);
  const controllerType = detectControllerType(
    info.name,
    info.vendorId,
    info.productId,
  );
  const deviceId = eventPath;
  let controllerIdx: number;
  if (parentControllerIdx !== undefined) {
    controllerIdx = parentControllerIdx;
  } else {
    controllerIdx = allocControllerIdx();
    if (controllerIdx < 0) {
      log.warn("evdev", `Too many controllers, skipping ${eventPath}`);
      return null;
    }
  }

  const extra = await getExtraDeviceInfo(eventPath, info.vendorId, info.productId);
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

  if (!isTouchpad && !window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send("input:device-connected", deviceInfo);
  }

  // Pick the correct axis map for this controller model
  const axisMap = getAxisMap(info.name, extra.driverName);

  // Pre-read touchpad abs ranges so we can normalise to 0..1
  const touchpadAbsMax: Record<number, number> = {};
  if (isTouchpad) {
    touchpadAbsMax[0] = await readAbsMax(eventPath, 0);
    touchpadAbsMax[1] = await readAbsMax(eventPath, 1);
    touchpadAbsMax[53] = await readAbsMax(eventPath, 53);
    touchpadAbsMax[54] = await readAbsMax(eventPath, 54);
  }

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
          // Wii Remote d-pad keys (103/105/106/108) are directional buttons,
          // not keyboard keys. Treat them as controller buttons when the
          // device is a wiimote so they go through the compact event path.
          const isWiiDpad = controllerType === "wiimote" && [103, 105, 106, 108].includes(code);
          const isBtn = code >= 0x100 || isWiiDpad;
          if (isBtn) {
            let outCode = code;
            // Map touchpad click to a standard code the worker recognises
            if (isTouchpad && (code === 272 || code === 330)) {
              outCode = 330; // BTN_TOUCH → "touchpad" in worker
            }
            compactBuf.writeUInt8(
              value ? CompactEventKind.BUTTON_PRESS : CompactEventKind.BUTTON_RELEASE,
              0,
            );
            compactBuf.writeUInt8(controllerIdx, 1);
            compactBuf.writeUInt16LE(outCode, 2);
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
          let outCode = code;
          let normalized: number;
          if (isTouchpad) {
            if (code === 0 || code === 53) {
              outCode = 1000; // touchpad_x
              const max = touchpadAbsMax[code] ?? 1919;
              normalized = Math.max(0, Math.min(1, value / max));
              log.info("evdev", `Touchpad X event: code=${code} raw=${value} max=${max} norm=${normalized.toFixed(3)} idx=${controllerIdx}`);
            } else if (code === 1 || code === 54) {
              outCode = 1001; // touchpad_y
              const max = touchpadAbsMax[code] ?? 1079;
              normalized = Math.max(0, Math.min(1, value / max));
              log.info("evdev", `Touchpad Y event: code=${code} raw=${value} max=${max} norm=${normalized.toFixed(3)} idx=${controllerIdx}`);
            } else {
              const mappedAxis = axisMap[code] ?? `abs_${code}`;
              normalized = normalizeAxis(value, code, mappedAxis);
            }
          } else {
            const mappedAxis = axisMap[code] ?? `abs_${code}`;
            normalized = normalizeAxis(value, code, mappedAxis);
          }
          compactBuf.writeUInt8(CompactEventKind.AXIS, 0);
          compactBuf.writeUInt8(controllerIdx, 1);
          compactBuf.writeUInt16LE(outCode, 2);
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
      // EACCES on an already-open stream means the fd went stale
      // (sleep/wake, USB re-enumeration). Don't put it on the long
      // failure cooldown — the device should be retried immediately.
      // Only initial open failures go into recentFailures.
      log.warn("evdev", `Error reading ${eventPath} (${info.name}): ${err}`);
      stream.destroy();
      activeDevices.delete(eventPath);
      // Touchpads share a slot with their parent controller; don't
      // send disconnect for auxiliary devices.
      if (!isTouchpad && !window.isDestroyed() && !window.webContents.isDestroyed()) {
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
      isTouchpad,
      latencySamples: [],
      lastActivityAt: Date.now(),
      close: () => {
        stream.destroy();
        if (!isTouchpad && !window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send("input:device-disconnected", { deviceId, controllerIdx });
        }
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EACCES") {
      recentFailures.set(eventPath, Date.now());
    }
    log.warn("evdev", `Could not open ${eventPath}: ${err}`);
    return null;
  }
}

let targetWindow: BrowserWindow | null = null;

async function scanDevices(): Promise<void> {
  if (!targetWindow || targetWindow.isDestroyed()) return;

  let entries: string[];
  try {
    entries = readdirSync(INPUT_DIR);
  } catch {
    return;
  }

  const eventDevices = entries
    .filter((e) => e.startsWith("event"))
    .map((e) => join(INPUT_DIR, e));

  const touchpadCandidates: { device: string; info: { name: string; vendorId: number; productId: number } }[] = [];

  // First pass: open regular controllers (skip motion sensors and touchpads)
  for (const device of eventDevices) {
    if (activeDevices.has(device)) continue;
    const lastFail = recentFailures.get(device);
    if (lastFail && Date.now() - lastFail < FAILURE_COOLDOWN_MS) continue;

    const info = await getDeviceInfo(device);
    if (!info) continue;
    if (!(await hasControllerCapabilities(device, info.name))) continue;
    if (isTouchpadDevice(info.name)) {
      touchpadCandidates.push({ device, info });
      continue;
    }
    try {
      const handle = await withTimeout(
        openDevice(device, targetWindow, info),
        2000,
        `openDevice(${device})`,
      );
      if (handle) {
        activeDevices.set(device, handle);
        recentFailures.delete(device);
        log.info("evdev", `Opened ${device} (${info.name})`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EACCES") {
        recentFailures.set(device, Date.now());
      }
      log.warn("evdev", `Skipping ${device} due to timeout/error: ${err}`);
    }
  }

  // Second pass: open touchpads, associating them with their parent controller
  for (const { device, info } of touchpadCandidates) {
    if (activeDevices.has(device)) continue;
    const extra = await getExtraDeviceInfo(device, info.vendorId, info.productId);
    const parentIdx = findParentControllerIdx(info.vendorId, info.productId, extra.physPath);
    if (parentIdx < 0) {
      // Parent not yet opened — retry on next scan
      continue;
    }
    try {
      const handle = await withTimeout(
        openDevice(device, targetWindow, info, parentIdx),
        2000,
        `openDevice(${device})`,
      );
      if (handle) {
        activeDevices.set(device, handle);
        recentFailures.delete(device);
        log.info("evdev", `Opened touchpad ${device} (${info.name}) -> controller ${parentIdx}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EACCES") {
        recentFailures.set(device, Date.now());
      }
      log.warn("evdev", `Skipping touchpad ${device} due to timeout/error: ${err}`);
    }
  }

  for (const [path] of activeDevices) {
    if (!existsSync(path)) {
      activeDevices.get(path)?.close();
      activeDevices.delete(path);
      recentFailures.delete(path);
    }
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

  targetWindow = window;

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

/** Trigger an immediate rescan (e.g. after system resume). */
export function triggerRescan(): void {
  scanDevices().catch((err) =>
    log.warn("evdev", `triggerRescan error: ${err}`),
  );
}

/** Clear all recent-failure cooldowns (call on system resume). */
export function clearFailureCooldowns(): void {
  recentFailures.clear();
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

/** Force-close a device and clear its failure cooldown so it is re-scanned immediately. */
export function rescanDevice(deviceId: string): void {
  for (const [path, handle] of activeDevices) {
    if (handle.info.id === deviceId) {
      handle.close();
      activeDevices.delete(path);
      recentFailures.delete(path);
      return;
    }
  }
  // If not currently active, clear any failure cooldown anyway
  for (const [path] of recentFailures) {
    if (path.endsWith(deviceId.replace("/dev/input/", ""))) {
      recentFailures.delete(path);
      return;
    }
  }
}

export async function getConnectedDevices(): Promise<ControllerDevice[]> {
  const entries = Array.from(activeDevices.values()).filter((h) => !h.isTouchpad);
  const results: ControllerDevice[] = [];
  for (const h of entries) {
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
      info.signalStrengthPercent = await findBluetoothRssi(sysPath);
      if (MAC_RE.test(info.physPath)) {
        info.batteryPercent = await findBatteryLevel(info.physPath);
      }
    }
    results.push(info);
  }
  return results;
}
