use std::sync::atomic::{AtomicU32, Ordering};
use std::slice;

pub const MAGIC: u32 = 0x53464D42; // 'SFMB'
pub const VERSION: u32 = 1;
pub const HEADER_SIZE: usize = 256;
pub const DEFAULT_SLOT_COUNT: usize = 2;
pub const DEFAULT_MAX_WIDTH: u32 = 2048;
pub const DEFAULT_MAX_HEIGHT: u32 = 2048;
pub const BYTES_PER_PIXEL: u32 = 4; // RGBA8888

// Offsets (all u32, 4-byte aligned)
pub const OFF_MAGIC: usize = 0;
pub const OFF_VERSION: usize = 4;
pub const OFF_MAX_WIDTH: usize = 8;
pub const OFF_MAX_HEIGHT: usize = 12;
pub const OFF_SLOT_SIZE: usize = 16;
pub const OFF_SLOT_COUNT: usize = 20;
pub const OFF_WIDTH: usize = 24;
pub const OFF_HEIGHT: usize = 28;
pub const OFF_PITCH: usize = 32;
pub const OFF_FORMAT: usize = 36;
pub const OFF_READY_SLOT: usize = 40;
pub const OFF_SEQUENCE: usize = 44;

/// Shared frame buffer backed by externally-allocated memory (SharedArrayBuffer).
/// Layout is agreed upon by Rust (writer) and JS (reader).
pub struct SharedFrameBuffer {
    ptr: *mut u8,
    len: usize,
}

// SAFETY: The caller must ensure the pointer remains valid and that
// only one writer and one reader access this buffer, with proper
// atomic synchronization on ready_slot.
unsafe impl Send for SharedFrameBuffer {}
unsafe impl Sync for SharedFrameBuffer {}

impl SharedFrameBuffer {
    /// # Safety
    /// `ptr` must be valid for `len` bytes for the lifetime of this struct.
    pub unsafe fn from_raw(ptr: *mut u8, len: usize) -> Self {
        Self { ptr, len }
    }

    fn u32_at(&self, offset: usize) -> &AtomicU32 {
        // SAFETY: offsets are within header, properly aligned (multiples of 4).
        unsafe { &*(self.ptr.add(offset) as *mut AtomicU32) }
    }

    pub fn is_valid(&self) -> bool {
        self.u32_at(OFF_MAGIC).load(Ordering::Relaxed) == MAGIC
    }

    pub fn init(&self, max_width: u32, max_height: u32, slot_count: u32) {
        let slot_size = max_width * max_height * BYTES_PER_PIXEL;
        self.u32_at(OFF_MAGIC).store(MAGIC, Ordering::Relaxed);
        self.u32_at(OFF_VERSION).store(VERSION, Ordering::Relaxed);
        self.u32_at(OFF_MAX_WIDTH).store(max_width, Ordering::Relaxed);
        self.u32_at(OFF_MAX_HEIGHT).store(max_height, Ordering::Relaxed);
        self.u32_at(OFF_SLOT_SIZE).store(slot_size, Ordering::Relaxed);
        self.u32_at(OFF_SLOT_COUNT).store(slot_count, Ordering::Relaxed);
        self.u32_at(OFF_WIDTH).store(0, Ordering::Relaxed);
        self.u32_at(OFF_HEIGHT).store(0, Ordering::Relaxed);
        self.u32_at(OFF_PITCH).store(0, Ordering::Relaxed);
        self.u32_at(OFF_FORMAT).store(3, Ordering::Relaxed); // RGBA8888
        self.u32_at(OFF_READY_SLOT).store(0, Ordering::Relaxed);
        self.u32_at(OFF_SEQUENCE).store(0, Ordering::Relaxed);
    }

    pub fn required_size(&self) -> usize {
        let slot_size = self.u32_at(OFF_SLOT_SIZE).load(Ordering::Relaxed) as usize;
        let slot_count = self.u32_at(OFF_SLOT_COUNT).load(Ordering::Relaxed) as usize;
        HEADER_SIZE + slot_count * slot_size
    }

    fn slot_offset(&self, slot_idx: usize) -> usize {
        let slot_size = self.u32_at(OFF_SLOT_SIZE).load(Ordering::Relaxed) as usize;
        HEADER_SIZE + slot_idx * slot_size
    }

    /// Returns a mutable slice for the entire slot buffer (max_width * max_height * 4 bytes).
    /// This is useful when the caller needs the full buffer for external rendering.
    pub fn slot_mut_slice(&self, slot_idx: usize) -> &mut [u8] {
        let offset = self.slot_offset(slot_idx);
        let slot_size = self.u32_at(OFF_SLOT_SIZE).load(Ordering::Relaxed) as usize;
        // SAFETY: caller ensures slot_idx < slot_count and buffer is large enough.
        unsafe { slice::from_raw_parts_mut(self.ptr.add(offset), slot_size) }
    }

    /// Write an RGBA frame into the next available slot, then atomically publish.
    pub fn publish_rgba_frame(&self, width: u32, height: u32, data: &[u8]) {
        if width == 0 || height == 0 {
            return;
        }

        let current_ready = self.u32_at(OFF_READY_SLOT).load(Ordering::Acquire);
        let write_idx = if current_ready == 1 { 0 } else { 1 };

        let slot = self.slot_mut_slice(write_idx);
        let needed = (width * height * BYTES_PER_PIXEL) as usize;
        let slot_len = slot.len();

        if needed > slot_len {
            eprintln!("[shared_buffer] Frame too large: {} bytes needed, {} available", needed, slot_len);
            return;
        }

        let copy_len = needed.min(data.len()).min(slot_len);
        slot[..copy_len].copy_from_slice(&data[..copy_len]);

        self.u32_at(OFF_WIDTH).store(width, Ordering::Relaxed);
        self.u32_at(OFF_HEIGHT).store(height, Ordering::Relaxed);
        self.u32_at(OFF_PITCH).store(width * BYTES_PER_PIXEL, Ordering::Relaxed);
        self.u32_at(OFF_FORMAT).store(3, Ordering::Relaxed); // RGBA8888
        self.u32_at(OFF_SEQUENCE).fetch_add(1, Ordering::Relaxed);
        self.u32_at(OFF_READY_SLOT).store(write_idx as u32 + 1, Ordering::Release);
    }

    /// Get a mutable slice for a given slot for direct writing.
    pub fn slot_mut_rgba(&self, slot_idx: usize, width: u32, height: u32) -> Option<&mut [u8]> {
        let needed = (width * height * BYTES_PER_PIXEL) as usize;
        let slot = self.slot_mut_slice(slot_idx);
        if needed > slot.len() {
            return None;
        }
        Some(&mut slot[..needed])
    }

    /// Returns the index of the next slot that should be written to
    /// (the one that is NOT currently ready).
    pub fn next_write_slot(&self) -> usize {
        let current_ready = self.u32_at(OFF_READY_SLOT).load(Ordering::Acquire);
        // ready_slot: 0=none, 1=slot0, 2=slot1
        // Write to the slot that is NOT ready.
        if current_ready == 1 { 1 } else { 0 }
    }

    /// Atomically publish metadata after writing into a slot via `slot_mut_rgba`.
    pub fn publish_metadata(&self, width: u32, height: u32) {
        let current_ready = self.u32_at(OFF_READY_SLOT).load(Ordering::Acquire);
        // ready_slot: 0=none, 1=slot0, 2=slot1
        // Write to the slot that is NOT ready.
        let write_idx = if current_ready == 1 { 1 } else { 0 };
        self.u32_at(OFF_WIDTH).store(width, Ordering::Relaxed);
        self.u32_at(OFF_HEIGHT).store(height, Ordering::Relaxed);
        self.u32_at(OFF_PITCH).store(width * BYTES_PER_PIXEL, Ordering::Relaxed);
        self.u32_at(OFF_FORMAT).store(3, Ordering::Relaxed);
        self.u32_at(OFF_SEQUENCE).fetch_add(1, Ordering::Relaxed);
        self.u32_at(OFF_READY_SLOT).store(write_idx as u32 + 1, Ordering::Release);
    }

    pub fn read_metadata(&self) -> FrameMetadata {
        FrameMetadata {
            width: self.u32_at(OFF_WIDTH).load(Ordering::Relaxed),
            height: self.u32_at(OFF_HEIGHT).load(Ordering::Relaxed),
            pitch: self.u32_at(OFF_PITCH).load(Ordering::Relaxed),
            format: self.u32_at(OFF_FORMAT).load(Ordering::Relaxed),
            ready_slot: self.u32_at(OFF_READY_SLOT).load(Ordering::Acquire),
            sequence: self.u32_at(OFF_SEQUENCE).load(Ordering::Relaxed),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct FrameMetadata {
    pub width: u32,
    pub height: u32,
    pub pitch: u32,
    pub format: u32,
    pub ready_slot: u32,
    pub sequence: u32,
}
