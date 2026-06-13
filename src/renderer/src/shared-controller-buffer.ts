/**
 * SharedControllerBuffer — renderer-side reader for the controller SharedArrayBuffer.
 *
 * The worker writes state into the SAB; the renderer polls it at 60 Hz
 * (via requestAnimationFrame) to drive UI updates and navigation logic.
 */

import {
  CTRL_MAGIC,
  CTRL_VERSION,
  CTRL_HEADER_SIZE,
  CTRL_SLOT_SIZE,
  CTRL_AXES_PER_CONTROLLER,
  ControllerAxis,
  ControllerButtonBit,
  enumToControllerType,
} from "../../shared/controller-buffer";

export interface ControllerSlotView {
  connected: boolean;
  type: string;
  axes: Float32Array;
  buttonBitmask: number;
  rawButtonBitmask: number;
  lastAxisCode: number;
  lastButtonCode: number;
  lastAxisValue: number;
  lastEventTimestamp: number;
}

export class SharedControllerBuffer {
  private sab: SharedArrayBuffer;
  private u32: Uint32Array;

  constructor(sab: SharedArrayBuffer) {
    this.sab = sab;
    this.u32 = new Uint32Array(sab, 0, CTRL_HEADER_SIZE / 4);
  }

  get raw(): SharedArrayBuffer {
    return this.sab;
  }

  isValid(): boolean {
    return this.u32[0] === CTRL_MAGIC && this.u32[1] === CTRL_VERSION;
  }

  getControllerCount(): number {
    return this.u32[2];
  }

  getMaxControllers(): number {
    return this.u32[3];
  }

  /** Atomically read the global sequence counter. */
  getSequence(): number {
    return Atomics.load(this.u32, 4);
  }

  /** Read a single controller slot from the SAB. */
  readSlot(idx: number): ControllerSlotView | null {
    if (idx < 0 || idx >= this.getMaxControllers()) return null;

    const offset = CTRL_HEADER_SIZE + idx * CTRL_SLOT_SIZE;
    const u8 = new Uint8Array(this.sab, offset, CTRL_SLOT_SIZE);

    if (u8[0] === 0) return null; // not connected

    const axes = new Float32Array(this.sab, offset + 4, CTRL_AXES_PER_CONTROLLER);
    const slotU32 = new Uint32Array(this.sab, offset, CTRL_SLOT_SIZE / 4);

    const u16 = new Uint16Array(this.sab, offset + 0x2c, 2);
    return {
      connected: true,
      type: enumToControllerType(u8[1]),
      axes,
      buttonBitmask: slotU32[9],
      rawButtonBitmask: slotU32[10],
      lastAxisCode: u16[0],
      lastButtonCode: u16[1],
      lastAxisValue: new Float32Array(this.sab, offset + 0x30, 1)[0],
      lastEventTimestamp: slotU32[13],
    };
  }

  /** Check if a specific button bit is set in the bitmask. */
  static isButtonPressed(bitmask: number, bit: ControllerButtonBit): boolean {
    return (bitmask & (1 << bit)) !== 0;
  }

  /** Iterate over all connected slots. */
  *readAllSlots(): Generator<{ idx: number; slot: ControllerSlotView }> {
    const count = this.getMaxControllers();
    for (let i = 0; i < count; i++) {
      const slot = this.readSlot(i);
      if (slot?.connected) {
        yield { idx: i, slot };
      }
    }
  }
}
