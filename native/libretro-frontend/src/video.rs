use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Clone, Debug)]
pub struct VideoFrame {
    pub width: u32,
    pub height: u32,
    pub pitch: usize,
    pub format: u32,
    pub data: Vec<u8>,
}

impl VideoFrame {
    pub fn to_rgba(&self) -> Vec<u8> {
        match self.format {
            0 => self.convert_0rgb1555(),
            1 => self.convert_xrgb8888(),
            2 => self.convert_rgb565(),
            3 => self.data.clone(),
            _ => self.convert_xrgb8888(),
        }
    }

    fn convert_0rgb1555(&self) -> Vec<u8> {
        let mut out = vec![0u8; (self.width * self.height * 4) as usize];
        for y in 0..self.height {
            for x in 0..self.width {
                let src_idx = (y as usize * self.pitch) + (x as usize * 2);
                let dst_idx = ((y * self.width + x) * 4) as usize;
                if src_idx + 1 < self.data.len() {
                    let pixel = u16::from_le_bytes([self.data[src_idx], self.data[src_idx + 1]]);
                    let r = ((pixel >> 10) & 0x1F) << 3;
                    let g = ((pixel >> 5) & 0x1F) << 3;
                    let b = (pixel & 0x1F) << 3;
                    out[dst_idx] = r as u8;
                    out[dst_idx + 1] = g as u8;
                    out[dst_idx + 2] = b as u8;
                    out[dst_idx + 3] = 255;
                }
            }
        }
        out
    }

    fn convert_xrgb8888(&self) -> Vec<u8> {
        let mut out = vec![0u8; (self.width * self.height * 4) as usize];
        for y in 0..self.height {
            for x in 0..self.width {
                let src_idx = (y as usize * self.pitch) + (x as usize * 4);
                let dst_idx = ((y * self.width + x) * 4) as usize;
                if src_idx + 3 < self.data.len() {
                    out[dst_idx] = self.data[src_idx + 2];
                    out[dst_idx + 1] = self.data[src_idx + 1];
                    out[dst_idx + 2] = self.data[src_idx];
                    out[dst_idx + 3] = 255;
                }
            }
        }
        out
    }

    fn convert_rgb565(&self) -> Vec<u8> {
        let mut out = vec![0u8; (self.width * self.height * 4) as usize];
        for y in 0..self.height {
            for x in 0..self.width {
                let src_idx = (y as usize * self.pitch) + (x as usize * 2);
                let dst_idx = ((y * self.width + x) * 4) as usize;
                if src_idx + 1 < self.data.len() {
                    let pixel = u16::from_le_bytes([self.data[src_idx], self.data[src_idx + 1]]);
                    let r = ((pixel >> 11) & 0x1F) << 3;
                    let g = ((pixel >> 5) & 0x3F) << 2;
                    let b = (pixel & 0x1F) << 3;
                    out[dst_idx] = r as u8;
                    out[dst_idx + 1] = g as u8;
                    out[dst_idx + 2] = b as u8;
                    out[dst_idx + 3] = 255;
                }
            }
        }
        out
    }
}

/// Pre-allocated frame slot for lock-free double buffering.
pub struct FrameSlot {
    pub width: u32,
    pub height: u32,
    pub pitch: usize,
    pub format: u32,
    pub data: Vec<u8>,
}

impl FrameSlot {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            width: 0,
            height: 0,
            pitch: 0,
            format: 0,
            data: vec![0u8; capacity],
        }
    }

    pub fn write_frame(&mut self, frame: &VideoFrame) {
        let needed = frame.pitch * frame.height as usize;
        // SAFETY: capacity is pre-allocated to handle all retro resolutions.
        // If this panics, increase MAX_FRAMEBUFFER_BYTES in DoubleBuffer::new.
        assert!(
            needed <= self.data.len(),
            "Frame too large for pre-allocated buffer: {} bytes needed, {} available. \
             Increase MAX_FRAMEBUFFER_BYTES in video.rs",
            needed,
            self.data.len()
        );
        self.data[..needed].copy_from_slice(&frame.data[..needed]);
        self.width = frame.width;
        self.height = frame.height;
        self.pitch = frame.pitch;
        self.format = frame.format;
    }

    pub fn as_raw_ptr(&self) -> *const u8 {
        self.data.as_ptr()
    }

    pub fn byte_len(&self) -> usize {
        self.pitch * self.height as usize
    }
}

const MAX_FRAMEBUFFER_BYTES: usize = 2048 * 2048 * 4;

/// Lock-free single-producer single-consumer double buffer.
/// Writer (core thread) always writes to the slot opposite ready_idx,
/// then atomically publishes. Reader (JS main thread) reads ready_idx.
pub struct DoubleBuffer {
    slot0: UnsafeCell<FrameSlot>,
    slot1: UnsafeCell<FrameSlot>,
    ready_idx: AtomicUsize,
}

// SAFETY: Only one writer (core thread) and one reader (JS main thread).
// They never access the same slot simultaneously because the writer only
// touches the non-ready slot and the reader only touches the ready slot.
unsafe impl Send for DoubleBuffer {}
unsafe impl Sync for DoubleBuffer {}

impl DoubleBuffer {
    pub fn new() -> Self {
        Self {
            slot0: UnsafeCell::new(FrameSlot::with_capacity(MAX_FRAMEBUFFER_BYTES)),
            slot1: UnsafeCell::new(FrameSlot::with_capacity(MAX_FRAMEBUFFER_BYTES)),
            ready_idx: AtomicUsize::new(0),
        }
    }

    /// Called from the core runner thread.
    pub fn publish_frame(&self, frame: &VideoFrame) {
        let current = self.ready_idx.load(Ordering::Acquire);
        let write_idx = 1 - current;
        let slot = if write_idx == 0 {
            unsafe { &mut *self.slot0.get() }
        } else {
            unsafe { &mut *self.slot1.get() }
        };
        slot.write_frame(frame);
        self.ready_idx.store(write_idx, Ordering::Release);
    }

    /// Called from the JS main thread. Returns a stable snapshot.
    pub fn get_ready(&self) -> Option<&FrameSlot> {
        let idx = self.ready_idx.load(Ordering::Acquire);
        let slot = if idx == 0 {
            unsafe { &*self.slot0.get() }
        } else {
            unsafe { &*self.slot1.get() }
        };
        if slot.width == 0 || slot.height == 0 {
            return None;
        }
        Some(slot)
    }
}

#[derive(Clone)]
pub struct VideoState {
    pub current_frame: std::sync::Arc<std::sync::Mutex<Option<VideoFrame>>>,
    pub pixel_format: std::sync::Arc<std::sync::atomic::AtomicU32>,
    pub av_info: std::sync::Arc<std::sync::Mutex<Option<crate::ffi::RetroSystemAvInfo>>>,
    pub double_buffer: std::sync::Arc<DoubleBuffer>,
    pub shared_buffer: std::sync::Arc<std::sync::Mutex<Option<crate::shared_buffer::SharedFrameBuffer>>>,
}

impl VideoState {
    pub fn new() -> Self {
        Self {
            current_frame: std::sync::Arc::new(std::sync::Mutex::new(None)),
            pixel_format: std::sync::Arc::new(std::sync::atomic::AtomicU32::new(crate::ffi::RETRO_PIXEL_FORMAT_XRGB8888)),
            av_info: std::sync::Arc::new(std::sync::Mutex::new(None)),
            double_buffer: std::sync::Arc::new(DoubleBuffer::new()),
            shared_buffer: std::sync::Arc::new(std::sync::Mutex::new(None)),
        }
    }

    pub fn set_shared_buffer(&self, sab: crate::shared_buffer::SharedFrameBuffer) {
        *self.shared_buffer.lock().unwrap() = Some(sab);
    }

    pub fn set_frame(&self, frame: VideoFrame) {
        self.double_buffer.publish_frame(&frame);
        if let Ok(mut guard) = self.shared_buffer.lock() {
            if let Some(ref mut sab) = guard.as_mut() {
                sab.publish_frame(frame.width, frame.height, frame.pitch, frame.format, &frame.data);
            }
        }
        *self.current_frame.lock().unwrap() = Some(frame);
    }

    pub fn get_frame(&self) -> Option<VideoFrame> {
        self.current_frame.lock().unwrap().clone()
    }

    pub fn get_raw(&self) -> Option<(u32, u32, usize, u32, *const u8, usize)> {
        let slot = self.double_buffer.get_ready()?;
        let len = slot.byte_len();
        Some((slot.width, slot.height, slot.pitch, slot.format, slot.as_raw_ptr(), len))
    }

    pub fn consume(&self) {
        // No-op with double buffer — the reader just moves on to the next ready slot.
    }
}
