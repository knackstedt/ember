/**
 * SharedControllerBuffer — zero-copy controller state delivery via SharedArrayBuffer.
 *
 * ABI version 1 (little-endian, 4-byte aligned):
 *   [0x00: 0x04]  u32  magic   = 0x43544C52 ('CTRL')
 *   [0x04: 0x08]  u32  version = 1
 *   [0x08: 0x0C]  u32  controllerCount
 *   [0x0C: 0x10]  u32  maxControllers
 *   [0x10: 0x14]  u32  sequence (atomic)
 *   [0x14: 0x20]  reserved
 *
 * Per-controller slot (64 bytes), starts at 0x20:
 *   [0x00] u8  connected (0 or 1)
 *   [0x01] u8  type      (ControllerType enum)
 *   [0x02] u8  reserved[2]
 *   [0x04] f32 axis[8]   // left_x, left_y, right_x, right_y, left_trigger, right_trigger, dpad_x, dpad_y
 *   [0x24] u32 buttonBitmask
 *   [0x28] u32 rawButtonBitmask
 *   [0x2C] u16 lastAxisCode
 *   [0x2E] u16 lastButtonCode
 *   [0x30] f32 lastAxisValue
 *   [0x34] u32 lastEventTimestamp
 *   [0x38] u8  reserved[8]
 */

export const CTRL_MAGIC = 0x43544c52;
export const CTRL_VERSION = 1;
export const CTRL_HEADER_SIZE = 32;
export const CTRL_SLOT_SIZE = 64;
export const CTRL_MAX_CONTROLLERS = 16;
export const CTRL_AXES_PER_CONTROLLER = 8;

/** Axis indices inside the Float32Array for each controller slot. */
export const enum ControllerAxis {
  LEFT_X = 0,
  LEFT_Y = 1,
  RIGHT_X = 2,
  RIGHT_Y = 3,
  LEFT_TRIGGER = 4,
  RIGHT_TRIGGER = 5,
  DPAD_X = 6,
  DPAD_Y = 7,
}

/** Standard button bit positions in the 32-bit button bitmask. */
export const enum ControllerButtonBit {
  SOUTH = 0,
  EAST = 1,
  WEST = 2,
  NORTH = 3,
  LEFT_BUMPER = 4,
  RIGHT_BUMPER = 5,
  LEFT_TRIGGER_BTN = 6,
  RIGHT_TRIGGER_BTN = 7,
  SELECT = 8,
  START = 9,
  HOME = 10,
  LEFT_THUMB = 11,
  RIGHT_THUMB = 12,
  DPAD_UP = 13,
  DPAD_DOWN = 14,
  DPAD_LEFT = 15,
  DPAD_RIGHT = 16,
  C = 17,
  Z = 18,
  TOUCHPAD = 19,
}

/** ControllerType enum stored in the SAB type field. */
export const enum ControllerTypeEnum {
  XBOX = 0,
  PS1 = 1,
  PS2 = 2,
  PS3 = 3,
  PS4 = 4,
  PS5 = 5,
  GAMECUBE = 6,
  WIIMOTE = 7,
  GENERIC = 8,
  SWITCH = 9,
  N64 = 10,
}

export function controllerTypeToEnum(type: string): ControllerTypeEnum {
  switch (type) {
    case "xbox": return ControllerTypeEnum.XBOX;
    case "ps1": return ControllerTypeEnum.PS1;
    case "ps2": return ControllerTypeEnum.PS2;
    case "ps3": return ControllerTypeEnum.PS3;
    case "ps4": return ControllerTypeEnum.PS4;
    case "ps5": return ControllerTypeEnum.PS5;
    case "gamecube": return ControllerTypeEnum.GAMECUBE;
    case "n64": return ControllerTypeEnum.N64;
    case "switch": return ControllerTypeEnum.SWITCH;
    case "wiimote": return ControllerTypeEnum.WIIMOTE;
    default: return ControllerTypeEnum.GENERIC;
  }
}

export function enumToControllerType(t: ControllerTypeEnum): string {
  switch (t) {
    case ControllerTypeEnum.XBOX: return "xbox";
    case ControllerTypeEnum.PS1: return "ps1";
    case ControllerTypeEnum.PS2: return "ps2";
    case ControllerTypeEnum.PS3: return "ps3";
    case ControllerTypeEnum.PS4: return "ps4";
    case ControllerTypeEnum.PS5: return "ps5";
    case ControllerTypeEnum.GAMECUBE: return "gamecube";
    case ControllerTypeEnum.N64: return "n64";
    case ControllerTypeEnum.SWITCH: return "switch";
    case ControllerTypeEnum.WIIMOTE: return "wiimote";
    default: return "generic";
  }
}

/** Total bytes required for the default SAB. */
export function getControllerSabSize(maxControllers = CTRL_MAX_CONTROLLERS): number {
  return CTRL_HEADER_SIZE + maxControllers * CTRL_SLOT_SIZE;
}

/** Compact event kinds sent from main → renderer → worker. */
export const enum CompactEventKind {
  AXIS = 1,
  BUTTON_PRESS = 2,
  BUTTON_RELEASE = 3,
}

/** Layout of the 12-byte compact event buffer. */
export const COMPACT_EVENT_SIZE = 12;

export function writeCompactEvent(
  view: DataView,
  kind: CompactEventKind,
  controllerIdx: number,
  code: number,
  value: number,
  timestamp: number,
): void {
  view.setUint8(0, kind);
  view.setUint8(1, controllerIdx);
  view.setUint16(2, code, true);
  view.setFloat32(4, value, true);
  view.setUint32(8, timestamp, true);
}

export function readCompactEvent(view: DataView): {
  kind: CompactEventKind;
  controllerIdx: number;
  code: number;
  value: number;
  timestamp: number;
} {
  return {
    kind: view.getUint8(0) as CompactEventKind,
    controllerIdx: view.getUint8(1),
    code: view.getUint16(2, true),
    value: view.getFloat32(4, true),
    timestamp: view.getUint32(8, true),
  };
}
