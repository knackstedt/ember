mod backends;
mod decoder;
mod shared_buffer;

use decoder::VideoDecoderState;
use napi::bindgen_prelude::*;
use napi::{Env, JsArrayBuffer, NapiRaw};
use napi_derive::napi;

#[napi(object)]
pub struct VideoMetadata {
    pub backend: String,
    pub width: u32,
    pub height: u32,
    pub duration_ms: i64,
    pub frame_rate: f64,
    /// Colorimetry string from caps (e.g. "bt709", "bt601", "2:4:5:1").
    pub colorimetry: String,
    /// Pixel aspect ratio numerator (1 for square pixels).
    pub par_n: u32,
    /// Pixel aspect ratio denominator (1 for square pixels).
    pub par_d: u32,
}

#[napi(object)]
pub struct FrameData {
    pub width: u32,
    pub height: u32,
    pub y: Buffer,
    pub uv: Buffer,
}

#[napi]
pub struct VideoDecoder {
    state: VideoDecoderState,
}

#[napi]
impl VideoDecoder {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            state: VideoDecoderState::new(),
        }
    }

    /// Open a media file. Returns the selected backend name ("ffmpeg",
    /// "ffmpeg-nvdec", or "gstreamer").
    #[napi]
    pub fn open(&mut self, path: String) -> Result<String> {
        self.state.open(&path).map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Decode the next frame. Returns NV12 frame data or None on end-of-stream.
    #[napi]
    pub fn decode_next_frame(&mut self) -> Result<Option<FrameData>> {
        match self.state.decode_next_frame() {
            Ok(Some((width, height, y, uv))) => Ok(Some(FrameData {
                width,
                height,
                y: Buffer::from(y),
                uv: Buffer::from(uv),
            })),
            Ok(None) => Ok(None),
            Err(e) => Err(Error::new(Status::GenericFailure, e)),
        }
    }

    /// Attach a SharedArrayBuffer for zero-copy frame delivery.
    /// The SAB must be large enough for the video (width*height*1.5 bytes).
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
            return Err(Error::new(Status::GenericFailure, "Failed to get ArrayBuffer info"));
        }
        unsafe {
            self.state.attach_shared_buffer(data_ptr as *mut u8, data_len);
        }
        Ok(true)
    }

    /// Decode the next frame into the attached SharedArrayBuffer.
    /// Returns width/height metadata or None on EOS.
    #[napi]
    pub fn decode_next_frame_sab(&mut self) -> Result<Option<VideoMetadata>> {
        match self.state.decode_next_frame_sab() {
            Ok(Some((width, height))) => Ok(Some(VideoMetadata {
                backend: String::new(),
                width,
                height,
                duration_ms: 0,
                frame_rate: 0.0,
                colorimetry: String::new(),
                par_n: 1,
                par_d: 1,
            })),
            Ok(None) => Ok(None),
            Err(e) => Err(Error::new(Status::GenericFailure, e)),
        }
    }

    /// Seek to the given timestamp in milliseconds.
    #[napi]
    pub fn seek(&mut self, timestamp_ms: i64) -> Result<()> {
        self.state.seek(timestamp_ms).map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Pause playback (stops pipeline clock, keeps resources allocated).
    #[napi]
    pub fn pause(&mut self) -> Result<()> {
        self.state.pause().map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Resume playback.
    #[napi]
    pub fn resume(&mut self) -> Result<()> {
        self.state.resume().map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Get current video metadata.
    #[napi]
    pub fn get_metadata(&self) -> Result<VideoMetadata> {
        let m = self.state.get_metadata();
        Ok(VideoMetadata {
            backend: m.backend,
            width: m.width,
            height: m.height,
            duration_ms: m.duration_ms,
            frame_rate: m.frame_rate,
            colorimetry: m.colorimetry,
            par_n: m.par_n,
            par_d: m.par_d,
        })
    }

    /// Close the decoder and release resources.
    #[napi]
    pub fn close(&mut self) -> Result<()> {
        if let Some(ref mut backend) = self.state.backend {
            backend.close();
        }
        self.state.backend = None;
        Ok(())
    }
}
