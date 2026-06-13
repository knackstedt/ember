mod mpv_dynamic;
mod mpv_renderer;
mod shared_buffer;

use mpv_renderer::MpvRenderer;
use napi::bindgen_prelude::*;
use napi::{Env, JsArrayBuffer, NapiRaw};
use napi_derive::napi;
use shared_buffer::SharedFrameBuffer;

#[napi(object)]
pub struct FrameMetadata {
    pub width: u32,
    pub height: u32,
    pub duration_ms: i64,
    pub frame_rate: f64,
}

#[napi]
pub struct VideoDecoder {
    decoder: Option<MpvRenderer>,
    sab: Option<SharedFrameBuffer>,
}

#[napi]
impl VideoDecoder {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        let decoder = MpvRenderer::new()
            .map_err(|e| Error::new(Status::GenericFailure, e))?;
        Ok(Self {
            decoder: Some(decoder),
            sab: None,
        })
    }

    /// Open a media file.
    #[napi]
    pub fn open(&mut self, path: String) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder already closed",
        ))?;
        decoder
            .open(&path)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Render the current frame into the attached SharedArrayBuffer.
    /// Returns frame width/height on success, None on end-of-stream.
    #[napi]
    pub fn render_frame(&mut self) -> Result<Option<FrameMetadata>> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;

        let meta = decoder.get_metadata();
        if meta.width == 0 || meta.height == 0 {
            return Ok(None);
        }

        let sab = self.sab.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "No shared buffer attached",
        ))?;

        match decoder.render_frame(Some((sab, meta.width, meta.height))) {
            Ok(Some((width, height))) => Ok(Some(FrameMetadata {
                width,
                height,
                duration_ms: meta.duration_ms,
                frame_rate: meta.frame_rate,
            })),
            Ok(None) => Ok(None),
            Err(e) => Err(Error::new(Status::GenericFailure, e)),
        }
    }

    /// Attach a SharedArrayBuffer for zero-copy frame delivery.
    /// The SAB must be large enough for the configured slots.
    #[napi]
    pub fn attach_shared_buffer(&mut self, buffer: JsArrayBuffer, env: Env) -> Result<bool> {
        let mut data_ptr: *mut std::ffi::c_void = std::ptr::null_mut();
        let mut data_len: usize = 0;
        let status = unsafe {
            napi::sys::napi_get_arraybuffer_info(
                env.raw(),
                buffer.raw(),
                &mut data_ptr,
                &mut data_len,
            )
        };
        if status != napi::Status::Ok as i32 {
            return Err(Error::new(
                Status::GenericFailure,
                "Failed to get ArrayBuffer info",
            ));
        }
        unsafe {
            self.sab = Some(SharedFrameBuffer::from_raw(data_ptr as *mut u8, data_len));
            if let Some(ref sab) = self.sab {
                let (max_w, max_h) = if let Some(ref decoder) = self.decoder {
                    let meta = decoder.get_metadata();
                    (meta.width.max(1), meta.height.max(1))
                } else {
                    (4096, 4096)
                };
                sab.init(max_w, max_h, 2);
                let required = sab.required_size();
                if data_len < required {
                    return Err(Error::new(
                        Status::GenericFailure,
                        &format!("SharedArrayBuffer too small: {} bytes, need {} bytes", data_len, required),
                    ));
                }
            }
        }
        Ok(true)
    }

    /// Seek to the given timestamp in milliseconds.
    #[napi]
    pub fn seek(&mut self, timestamp_ms: i64) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        decoder
            .seek(timestamp_ms)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Pause or resume playback.
    #[napi]
    pub fn set_pause(&mut self, paused: bool) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        decoder
            .set_pause(paused)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Get current video metadata.
    #[napi]
    pub fn get_metadata(&self) -> Result<FrameMetadata> {
        let decoder = self.decoder.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        let m = decoder.get_metadata();
        Ok(FrameMetadata {
            width: m.width,
            height: m.height,
            duration_ms: m.duration_ms,
            frame_rate: m.frame_rate,
        })
    }

    /// Close the decoder and release resources.
    #[napi]
    pub fn close(&mut self) -> Result<()> {
        if let Some(mut decoder) = self.decoder.take() {
            decoder.close();
        }
        self.sab = None;
        Ok(())
    }
}
