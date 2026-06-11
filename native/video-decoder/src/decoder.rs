/// Common interface for video decoder backends.
/// Both FFmpeg and GStreamer implement this trait so they are
/// interchangeable from the JS side.
pub trait VideoDecoderBackend: Send {
    /// Open a media file and prepare for decoding.
    fn open(path: &str) -> Result<Self, String>
    where
        Self: Sized;

    /// Decode the next frame into NV12 Y and UV planes.
    /// Returns `(y_data, uv_data)` if a frame was decoded, `None` on EOS.
    /// y_data is width*height bytes, uv_data is width*height/2 bytes (interleaved UV).
    fn decode_frame_nv12(&mut self) -> Result<Option<(Vec<u8>, Vec<u8>)>, String>;

    /// Seek to a timestamp (milliseconds).
    fn seek(&mut self, timestamp_ms: i64) -> Result<(), String>;

    /// Total duration in milliseconds, if known.
    fn duration_ms(&self) -> i64;

    /// Frame rate, if known.
    fn frame_rate(&self) -> f64;

    /// Native video width.
    fn video_width(&self) -> u32;

    /// Native video height.
    fn video_height(&self) -> u32;

    /// Human-readable backend name (e.g. "ffmpeg", "gstreamer").
    fn backend_name(&self) -> &'static str;

    /// Clean up resources.
    fn close(&mut self);
}

/// Wrapper that owns a backend and handles frame decoding.
pub struct VideoDecoderState {
    pub backend: Option<Box<dyn VideoDecoderBackend>>,
}

impl VideoDecoderState {
    pub fn new() -> Self {
        Self {
            backend: None,
        }
    }

    pub fn open(&mut self, path: &str) -> Result<String, String> {
        // Each .node addon is compiled with only one feature, so only one
        // of the two blocks below is active. Propagate the real error so
        // the JS side can see why the backend failed.
        #[cfg(feature = "ffmpeg")]
        {
            let decoder = crate::backends::ffmpeg::FfmpegDecoder::open(path)
                .map_err(|e| format!("FFmpeg open failed: {}", e))?;
            let name = decoder.backend_name();
            self.backend = Some(Box::new(decoder));
            return Ok(name.to_string());
        }

        #[cfg(feature = "gstreamer")]
        {
            let decoder = crate::backends::gstreamer::GstreamerDecoder::open(path)
                .map_err(|e| format!("GStreamer open failed: {}", e))?;
            let name = decoder.backend_name();
            self.backend = Some(Box::new(decoder));
            return Ok(name.to_string());
        }

        Err("No video decoder backend available for this file.".to_string())
    }

    /// Decode the next frame into NV12 Y and UV planes.
    /// Returns `(width, height, y_data, uv_data)` on success, `None` on EOS.
    pub fn decode_next_frame(&mut self) -> Result<Option<(u32, u32, Vec<u8>, Vec<u8>)>, String> {
        let backend = self.backend.as_mut().ok_or("Decoder not opened")?;
        if let Some((y, uv)) = backend.decode_frame_nv12()? {
            Ok(Some((backend.video_width(), backend.video_height(), y, uv)))
        } else {
            Ok(None)
        }
    }

    pub fn seek(&mut self, timestamp_ms: i64) -> Result<(), String> {
        let backend = self.backend.as_mut().ok_or("Decoder not opened")?;
        backend.seek(timestamp_ms)
    }

    pub fn get_metadata(&self) -> VideoMetadata {
        match &self.backend {
            Some(b) => VideoMetadata {
                backend: b.backend_name().to_string(),
                width: b.video_width(),
                height: b.video_height(),
                duration_ms: b.duration_ms(),
                frame_rate: b.frame_rate(),
            },
            None => VideoMetadata::default(),
        }
    }
}

impl Default for VideoDecoderState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Default, Debug, Clone)]
pub struct VideoMetadata {
    pub backend: String,
    pub width: u32,
    pub height: u32,
    pub duration_ms: i64,
    pub frame_rate: f64,
}
