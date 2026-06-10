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
// only one writer (core thread) and one reader (JS main thread) access
// this buffer, with proper atomic synchronization on ready_slot.
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

    fn slot_offset(&self, slot_idx: usize) -> usize {
        let slot_size = self.u32_at(OFF_SLOT_SIZE).load(Ordering::Relaxed) as usize;
        HEADER_SIZE + slot_idx * slot_size
    }

    fn slot_mut_slice(&self, slot_idx: usize) -> &mut [u8] {
        let offset = self.slot_offset(slot_idx);
        let slot_size = self.u32_at(OFF_SLOT_SIZE).load(Ordering::Relaxed) as usize;
        // SAFETY: caller ensures slot_idx < slot_count and buffer is large enough.
        unsafe { slice::from_raw_parts_mut(self.ptr.add(offset), slot_size) }
    }

    /// Convert frame data to RGBA8888 and write into the next available slot,
    /// then atomically publish.
    pub fn publish_frame(&self, width: u32, height: u32, pitch: usize, format: u32, data: &[u8]) {
        if width == 0 || height == 0 {
            return;
        }

        let current_ready = self.u32_at(OFF_READY_SLOT).load(Ordering::Acquire);
        // Slots are 0-indexed internally; pick the one that isn't currently ready.
        let write_idx = if current_ready == 1 { 0 } else { 1 };

        let slot = self.slot_mut_slice(write_idx);
        let needed = (width * height * BYTES_PER_PIXEL) as usize;

        if needed > slot.len() {
            eprintln!("[shared_buffer] Frame too large: {} bytes needed, {} available", needed, slot.len());
            return;
        }

        // Convert to RGBA8888 in-place into the slot.
        match format {
            0 => convert_0rgb1555_to_rgba(width, height, pitch, data, &mut slot[..needed]),
            1 => convert_xrgb8888_to_rgba(width, height, pitch, data, &mut slot[..needed]),
            2 => convert_rgb565_to_rgba(width, height, pitch, data, &mut slot[..needed]),
            3 => slot[..needed].copy_from_slice(&data[..needed.min(data.len())]),
            _ => convert_xrgb8888_to_rgba(width, height, pitch, data, &mut slot[..needed]),
        }

        // Publish metadata and flip ready slot.
        self.u32_at(OFF_WIDTH).store(width, Ordering::Relaxed);
        self.u32_at(OFF_HEIGHT).store(height, Ordering::Relaxed);
        self.u32_at(OFF_PITCH).store(width * BYTES_PER_PIXEL, Ordering::Relaxed);
        self.u32_at(OFF_FORMAT).store(3, Ordering::Relaxed); // RGBA8888
        self.u32_at(OFF_SEQUENCE).fetch_add(1, Ordering::Relaxed);
        // Slot 0 ready = 1, slot 1 ready = 2 (0 = none)
        self.u32_at(OFF_READY_SLOT).store(write_idx as u32 + 1, Ordering::Release);
    }

    /// Read current metadata (width, height, pitch, format, ready_slot, sequence).
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

    /// Get a read-only slice for the currently ready slot.
    /// Returns `None` if no frame is ready.
    pub fn get_ready_pixels(&self) -> Option<&[u8]> {
        let ready = self.u32_at(OFF_READY_SLOT).load(Ordering::Acquire);
        if ready == 0 {
            return None;
        }
        let slot_idx = (ready - 1) as usize;
        let meta = self.read_metadata();
        let needed = (meta.width * meta.height * BYTES_PER_PIXEL) as usize;
        let slot = self.slot_mut_slice(slot_idx);
        Some(&slot[..needed.min(slot.len())])
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

fn convert_0rgb1555_to_rgba(width: u32, height: u32, pitch: usize, src: &[u8], dst: &mut [u8]) {
    for y in 0..height {
        for x in 0..width {
            let src_idx = (y as usize * pitch) + (x as usize * 2);
            let dst_idx = ((y * width + x) * 4) as usize;
            if src_idx + 1 < src.len() && dst_idx + 3 < dst.len() {
                let pixel = u16::from_le_bytes([src[src_idx], src[src_idx + 1]]);
                dst[dst_idx] = ((pixel >> 10) & 0x1F) as u8 * 8;
                dst[dst_idx + 1] = ((pixel >> 5) & 0x1F) as u8 * 8;
                dst[dst_idx + 2] = (pixel & 0x1F) as u8 * 8;
                dst[dst_idx + 3] = 255;
            }
        }
    }
}

fn convert_xrgb8888_to_rgba(width: u32, height: u32, pitch: usize, src: &[u8], dst: &mut [u8]) {
    for y in 0..height {
        for x in 0..width {
            let src_idx = (y as usize * pitch) + (x as usize * 4);
            let dst_idx = ((y * width + x) * 4) as usize;
            if src_idx + 3 < src.len() && dst_idx + 3 < dst.len() {
                dst[dst_idx] = src[src_idx + 2];     // R
                dst[dst_idx + 1] = src[src_idx + 1]; // G
                dst[dst_idx + 2] = src[src_idx];     // B
                dst[dst_idx + 3] = 255;              // A
            }
        }
    }
}

fn convert_rgb565_to_rgba(width: u32, height: u32, pitch: usize, src: &[u8], dst: &mut [u8]) {
    for y in 0..height {
        for x in 0..width {
            let src_idx = (y as usize * pitch) + (x as usize * 2);
            let dst_idx = ((y * width + x) * 4) as usize;
            if src_idx + 1 < src.len() && dst_idx + 3 < dst.len() {
                let pixel = u16::from_le_bytes([src[src_idx], src[src_idx + 1]]);
                dst[dst_idx] = ((pixel >> 11) & 0x1F) as u8 * 8;
                dst[dst_idx + 1] = ((pixel >> 5) & 0x3F) as u8 * 4;
                dst[dst_idx + 2] = (pixel & 0x1F) as u8 * 8;
                dst[dst_idx + 3] = 255;
            }
        }
    }
}
