/**
 * Controller Worker — runs in a Web Worker, receives compact controller events
 * and gamepad state, processes them (normalisation, deadzone, mapping), and sends
 * state updates back to the renderer.
 *
 * This isolates all CPU-heavy input processing from the renderer thread.
 * Future scaling: one worker per controller partition if needed.
 */

import {
  ControllerTypeEnum,
  controllerTypeToEnum,
  enumToControllerType,
  CompactEventKind,
  COMPACT_EVENT_SIZE,
  readCompactEvent,
} from "../../../shared/controller-buffer";

/* ── Local state per controller slot ── */
interface SlotState {
  deviceId: string;
  name: string;
  type: ControllerTypeEnum;
  connected: boolean;
  axes: Float32Array;
  buttons: Record<string, boolean>;
  rawButtons: Record<number, boolean>;
  axisMap: Record<number, string>;
  lastAxisCode: number;
  lastButtonCode: number;
  touchpadX?: number;
  touchpadY?: number;
}

const slots: (SlotState | null)[] = Array(16).fill(null);
let learningActive = false;

/* ── Axis layouts (must match evdev.ts exactly) ── */
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

/** Nintendo Switch Pro Controller / Joy-Con.
 *  Right stick is on 3/4; triggers are typically digital buttons. */
const SWITCH_AXIS_MAP: Record<number, string> = {
  0: "left_x",
  1: "left_y",
  3: "right_x",
  4: "right_y",
  16: "dpad_x",
  17: "dpad_y",
};

/** xwiimote driver — IR and accelerometer axes must not map to gamepad controls. */
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

/** PlayStation controllers (DualShock / DualSense) — adds touchpad axes. */
const PS_AXIS_MAP: Record<number, string> = {
  ...XBOX_AXIS_MAP,
  1000: "touchpad_x",
  1001: "touchpad_y",
};

function getAxisMap(name: string, driverName?: string): Record<number, string> {
  const n = name.toLowerCase();
  if (n === "gamepad p5" || /gamepad\s*p\d/.test(n)) return GENERIC_AXIS_MAP;
  if (n.includes("microntek") || n.includes("gamecube")) return GENERIC_AXIS_MAP;
  if (n.includes("nintendo") && n.includes("pro controller")) return SWITCH_AXIS_MAP;
  if (n.includes("joy-con") || n.includes("switch")) return SWITCH_AXIS_MAP;
  if (n.includes("wiimote") || n.includes("wii remote")) return WIIMOTE_AXIS_MAP;
  if (n.includes("dualsense") || n.includes("dualshock") || n.includes("playstation")) {
    return PS_AXIS_MAP;
  }
  return XBOX_AXIS_MAP;
}

const AXIS_NAME_TO_INDEX: Record<string, number> = {
  left_x: 0,
  left_y: 1,
  right_x: 2,
  right_y: 3,
  left_trigger: 4,
  right_trigger: 5,
  dpad_x: 6,
  dpad_y: 7,
};

/* ── Button mapping (must match evdev.ts exactly) ── */
const BTN_MAP: Record<number, string> = {
  // Old-style joystick buttons (e.g. Microntek USB GameCube adapters)
  288: "west",
  289: "north",
  290: "south",
  291: "east",
  292: "left_trigger_btn",
  293: "right_trigger_btn",
  294: "z",
  297: "start",
  // Standard gamepad buttons
  304: "south",
  305: "east",
  306: "c",
  307: "west",
  308: "north",
  309: "capture",
  310: "left_bumper",
  311: "right_bumper",
  312: "left_trigger_btn",
  313: "right_trigger_btn",
  314: "select",
  315: "start",
  316: "home",
  317: "left_thumb",
  318: "right_thumb",
  330: "touchpad", // DualSense / DS4 touchpad click
  // D-pad as buttons
  544: "dpad_up",
  545: "dpad_down",
  546: "dpad_left",
  547: "dpad_right",
  // Nintendo Wii Remote buttons
  103: "dpad_up",
  105: "dpad_left",
  106: "dpad_right",
  108: "dpad_down",
  257: "west", // 1
  258: "north", // 2
  407: "start", // +
  412: "select", // -
};

/** Nintendo Switch Pro Controller button remaps.
 *  - X/Y swapped on the diamond
 *  - ZL/ZR (312/313) are digital buttons, map to trigger actions for the diagram */
const SWITCH_BTN_MAP: Record<number, string> = {
  ...BTN_MAP,
  307: "north",        // physical X button (top)
  308: "west",         // physical Y button (left)
  312: "left_trigger",  // ZL
  313: "right_trigger", // ZR
};

/** DragonRise N64 USB adapter button remaps.
 *  - A/B swapped vs standard layout
 *  - C-pad and D-pad down use non-standard raw codes
 *  - Raw codes 9 and 10 both map to Z trigger */
const N64_BTN_MAP: Record<number, string> = {
  ...BTN_MAP,
  9: "z",
  10: "z",
  304: "east",        // physical B button
  305: "south",       // physical A button
  307: "c_left",
  308: "c_down",
  314: "c_up",
  315: "c_right",
};

function getBtnMap(name: string, type?: ControllerTypeEnum): Record<number, string> {
  if (type === ControllerTypeEnum.N64) return N64_BTN_MAP;
  const n = name.toLowerCase();
  if (n.includes("nintendo") && n.includes("pro controller")) return SWITCH_BTN_MAP;
  if (n.includes("joy-con") || n.includes("switch")) return SWITCH_BTN_MAP;
  return BTN_MAP;
}

const ACTION_TO_BIT: Record<string, number> = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  left_bumper: 4,
  right_bumper: 5,
  left_trigger_btn: 6,
  right_trigger_btn: 7,
  select: 8,
  start: 9,
  home: 10,
  left_thumb: 11,
  right_thumb: 12,
  dpad_up: 13,
  dpad_down: 14,
  dpad_left: 15,
  dpad_right: 16,
  c: 17,
  z: 18,
  touchpad: 19,
};

/* ── Deadzone for stick axes (moved from useGamepadApi.ts) ──
 * NOTE: values arriving here are already normalised by evdev.ts.
 */
function applyDeadzone(val: number, axisName: string): number {
  if (axisName.includes("trigger")) return val;
  if (Math.abs(val) < 0.08) return 0;
  return val;
}

/* ── Slot management ── */
function ensureSlot(idx: number, deviceId: string, name: string, type: ControllerTypeEnum, driverName?: string): SlotState {
  let s = slots[idx];
  if (!s) {
    s = {
      deviceId,
      name,
      type,
      connected: true,
      axes: new Float32Array(8),
      buttons: {},
      rawButtons: {},
      axisMap: getAxisMap(name, driverName),
      lastAxisCode: 0,
      lastButtonCode: 0,
    };
    slots[idx] = s;
  }
  return s;
}

function clearSlot(idx: number): void {
  slots[idx] = null;
}

function getConnectedCount(): number {
  return slots.filter((s) => s?.connected).length;
}

function buildStateUpdate() {
  const result = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot || !slot.connected) continue;
    result.push({
      idx: i,
      deviceId: slot.deviceId,
      name: slot.name,
      type: enumToControllerType(slot.type),
      axes: Array.from(slot.axes),
      buttons: { ...slot.buttons },
      rawButtons: { ...slot.rawButtons },
      lastAxisCode: slot.lastAxisCode,
      lastButtonCode: slot.lastButtonCode,
      touchpadX: slot.touchpadX,
      touchpadY: slot.touchpadY,
    });
  }
  return result;
}

/* ── State-update throttling (60 Hz max) ── */
const UPDATE_INTERVAL = 1000 / 60; // ~16.67 ms
let pendingStateUpdate = false;
let stateUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let lastSentStateJson = "";

function scheduleStateUpdate() {
  pendingStateUpdate = true;
  if (!stateUpdateTimer) {
    stateUpdateTimer = setTimeout(flushStateUpdate, UPDATE_INTERVAL);
  }
}

function flushStateUpdate() {
  stateUpdateTimer = null;
  if (!pendingStateUpdate) return;

  pendingStateUpdate = false;
  const current = buildStateUpdate();
  const json = JSON.stringify(current);

  // Only send when state actually changed vs last emission
  if (json !== lastSentStateJson) {
    lastSentStateJson = json;
    self.postMessage({ type: "state-update", slots: current });
  }

  // If more events arrived while we were flushing, schedule the next tick
  if (pendingStateUpdate) {
    stateUpdateTimer = setTimeout(flushStateUpdate, UPDATE_INTERVAL);
  }
}

/** PlayStation controllers (some Bluetooth models) report Square and Triangle
 *  swapped at the evdev level. Fix them here so the UI and action mapping are
 *  consistent with the physical button layout. */
function fixPlayStationAction(type: ControllerTypeEnum, action: string): string {
  if (type !== ControllerTypeEnum.PS3 && type !== ControllerTypeEnum.PS4 && type !== ControllerTypeEnum.PS5) return action;
  if (action === "west") return "north";
  if (action === "north") return "west";
  return action;
}

/* ── Event processing ── */
function handleCompactEvent(buf: ArrayBuffer): void {
  const view = new DataView(buf);
  const ev = readCompactEvent(view);

  const slot = slots[ev.controllerIdx];
  if (!slot) return;

  switch (ev.kind) {
    case CompactEventKind.AXIS: {
      if (ev.code === 1000) {
        slot.touchpadX = ev.value;
        console.log("[worker] touchpadX", ev.value);
      } else if (ev.code === 1001) {
        slot.touchpadY = ev.value;
        console.log("[worker] touchpadY", ev.value);
      } else {
        const axisName = slot.axisMap[ev.code] ?? `abs_${ev.code}`;
        // ev.value is already normalised by evdev.ts; just apply deadzone
        const deadzoned = applyDeadzone(ev.value, axisName);
        const axisIdx = AXIS_NAME_TO_INDEX[axisName];
        if (axisIdx !== undefined) {
          slot.axes[axisIdx] = deadzoned;
        }
      }
      slot.lastAxisCode = ev.code;
      break;
    }
    case CompactEventKind.BUTTON_PRESS: {
      const btnMap = getBtnMap(slot.name, slot.type);
      const action = fixPlayStationAction(slot.type, btnMap[ev.code] ?? `btn_${ev.code}`);
      slot.buttons[action] = true;
      slot.rawButtons[ev.code] = true;
      slot.lastButtonCode = ev.code;
      if (learningActive) {
        self.postMessage({ type: "learn-event", deviceId: slot.deviceId, rawCode: ev.code, action });
      }
      break;
    }
    case CompactEventKind.BUTTON_RELEASE: {
      const btnMap = getBtnMap(slot.name, slot.type);
      const action = fixPlayStationAction(slot.type, btnMap[ev.code] ?? `btn_${ev.code}`);
      slot.buttons[action] = false;
      slot.rawButtons[ev.code] = false;
      slot.lastButtonCode = ev.code;
      break;
    }
  }

  scheduleStateUpdate();
}

/* ── Message handlers ── */
self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg?.type === "connect") {
    const { controllerIdx, deviceId, name, deviceType, driverName } = msg;
    const enumType = typeof deviceType === "number" ? deviceType : controllerTypeToEnum(deviceType);
    const slot = ensureSlot(controllerIdx, deviceId, name, enumType, driverName);
    slot.connected = true;
    self.postMessage({ type: "device-connected", controllerIdx, deviceId, name, deviceType: enumToControllerType(enumType) });
    scheduleStateUpdate();
    return;
  }

  if (msg?.type === "disconnect") {
    const { controllerIdx } = msg;
    const slot = slots[controllerIdx];
    if (slot) {
      slot.connected = false;
      clearSlot(controllerIdx);
      self.postMessage({ type: "device-disconnected", controllerIdx, deviceId: slot.deviceId });
      scheduleStateUpdate();
    }
    return;
  }

  if (msg?.type === "compact-event") {
    let buf = msg.buffer;
    if (buf instanceof Uint8Array) buf = buf.buffer;
    if (buf instanceof ArrayBuffer) {
      handleCompactEvent(buf);
    }
    return;
  }

  if (msg?.type === "set-learning") {
    learningActive = !!msg.active;
    return;
  }

  if (msg?.type === "gamepad-state") {
    // Direct state injection from useGamepadApi (avoids compact encoding)
    const { controllerIdx, axes, buttons } = msg;
    const slot = slots[controllerIdx];
    if (!slot) return;

    for (let i = 0; i < axes.length && i < 8; i++) {
      slot.axes[i] = axes[i] ?? 0;
    }

    for (const [action, pressed] of Object.entries(buttons as Record<string, boolean>)) {
      slot.buttons[action] = pressed;
    }

    scheduleStateUpdate();
    return;
  }
};
