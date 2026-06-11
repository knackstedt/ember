mod backends;
mod decoder;
mod shared_buffer;

use decoder::VideoDecoderState;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct VideoMetadata {
    pub backend: String,
    pub width: u32,
    pub height: u32,
    pub duration_ms: i64,
    pub frame_rate: f64,
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

    /// Seek to the given timestamp in milliseconds.
    #[napi]
    pub fn seek(&mut self, timestamp_ms: i64) -> Result<()> {
        self.state.seek(timestamp_ms).map_err(|e| Error::new(Status::GenericFailure, e))
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
