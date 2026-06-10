/**
 * SharedFrameBuffer — zero-copy frame delivery via SharedArrayBuffer.
 *
 * ABI version 1 (little-endian, 4-byte aligned):
 *   [0x00: 0x04]  u32  magic   = 0x53464D42 ('SFMB')
 *   [0x04: 0x08]  u32  version = 1
 *   [0x08: 0x0C]  u32  maxWidth
 *   [0x0C: 0x10]  u32  maxHeight
 *   [0x10: 0x14]  u32  slotSize
 *   [0x14: 0x18]  u32  slotCount
 *   [0x18: 0x1C]  u32  currentWidth
 *   [0x1C: 0x20]  u32  currentHeight
 *   [0x20: 0x24]  u32  pitch
 *   [0x24: 0x28]  u32  pixelFormat (3 = RGBA8888)
 *   [0x28: 0x2C]  u32  readySlot (atomic, 0 = none, 1 = slot0, 2 = slot1)
 *   [0x2C: 0x30]  u32  sequence (atomic)
 *   [0x30: 0x100] reserved
 *   [0x100: ...]  slot 0 pixel data
 *   [0x100 + slotSize: ...] slot 1 pixel data
 */

const MAGIC = 0x53464D42;
const HEADER_SIZE = 256;
const BYTES_PER_PIXEL = 4;

export interface FrameView {
  width: number;
  height: number;
  pitch: number;
  format: number;
  data: Uint8Array;
  sequence: number;
}

export class SharedFrameBuffer {
  private sab: SharedArrayBuffer;
  private u32: Uint32Array;

  constructor(sab: SharedArrayBuffer) {
    this.sab = sab;
    // View the header as u32 for atomic access.
    this.u32 = new Uint32Array(sab, 0, HEADER_SIZE / 4);
  }

  get raw(): SharedArrayBuffer {
    return this.sab;
  }

  isValid(): boolean {
    return this.u32[0] === MAGIC;
  }

  getMaxDimensions(): { width: number; height: number } {
    return { width: this.u32[2], height: this.u32[3] };
  }

  getSlotSize(): number {
    return this.u32[4];
  }

  getSlotCount(): number {
    return this.u32[5];
  }

  /**
   * Atomically read the ready slot and copy frame metadata.
   * Returns `null` if no frame is ready.
   */
  readFrame(): FrameView | null {
    const ready = Atomics.load(this.u32, 10); // readySlot at offset 40 -> index 10
    if (ready === 0) {
      return null;
    }

    const width = this.u32[6];
    const height = this.u32[7];
    const pitch = this.u32[8];
    const format = this.u32[9];
    const sequence = Atomics.load(this.u32, 11);

    if (width === 0 || height === 0) {
      return null;
    }

    const slotSize = this.u32[4];
    const slotIdx = ready - 1;
    const slotOffset = HEADER_SIZE + slotIdx * slotSize;
    const needed = width * height * BYTES_PER_PIXEL;

    // Create a view into the ready slot. This is zero-copy.
    const data = new Uint8Array(this.sab, slotOffset, needed);

    return { width, height, pitch, format, data, sequence };
  }

  /**
   * Create a zero-copy Uint8Array view for a given slot without checking readiness.
   * Used when the caller already knows which slot to read.
   */
  getSlotData(slotIdx: number, width: number, height: number): Uint8Array {
    const slotSize = this.u32[4];
    const offset = HEADER_SIZE + slotIdx * slotSize;
    const needed = width * height * BYTES_PER_PIXEL;
    return new Uint8Array(this.sab, offset, needed);
  }
}
