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

    /// Decode the next frame directly into pre-allocated Y and UV buffers.
    /// Returns `(width, height)` on success, `None` on EOS.
    /// Buffers must be large enough for the frame dimensions.
    fn decode_frame_nv12_into(
        &mut self,
        y_buf: &mut [u8],
        uv_buf: &mut [u8],
    ) -> Result<Option<(u32, u32)>, String>;

    /// Seek to a timestamp (milliseconds).
    fn seek(&mut self, timestamp_ms: i64) -> Result<(), String>;

    /// Pause playback (stop the pipeline clock but keep resources allocated).
    fn pause(&mut self) -> Result<(), String>;

    /// Resume playback.
    fn resume(&mut self) -> Result<(), String>;

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

    /// Colorimetry string from the negotiated caps (e.g. "bt709", "bt601",
    /// "2:4:5:1").  Forwarded verbatim to the WebGL shader.
    fn colorimetry(&self) -> &str { "bt709" }

    /// Pixel aspect ratio numerator (1 for square pixels).
    fn par_n(&self) -> u32 { 1 }

    /// Pixel aspect ratio denominator (1 for square pixels).
    fn par_d(&self) -> u32 { 1 }

    /// Clean up resources.
    fn close(&mut self);
}

/// Wrapper that owns a backend and handles frame decoding.
pub struct VideoDecoderState {
    pub backend: Option<Box<dyn VideoDecoderBackend>>,
    sab_ptr: Option<*mut u8>,
    sab_len: usize,
}

impl VideoDecoderState {
    pub fn new() -> Self {
        Self {
            backend: None,
            sab_ptr: None,
            sab_len: 0,
        }
    }

    /// Attach a SharedArrayBuffer for zero-copy frame delivery.
    /// # Safety
    /// `ptr` must remain valid for `len` bytes until detached or closed.
    pub unsafe fn attach_shared_buffer(&mut self, ptr: *mut u8, len: usize) {
        self.sab_ptr = Some(ptr);
        self.sab_len = len;
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

    /// Decode the next frame into the attached SharedArrayBuffer.
    /// Returns `(width, height)` on success, `None` on EOS.
    /// Requires that `attach_shared_buffer` was called first.
    pub fn decode_next_frame_sab(&mut self) -> Result<Option<(u32, u32)>, String> {
        let backend = self.backend.as_mut().ok_or("Decoder not opened")?;
        let ptr = self.sab_ptr.ok_or("No shared buffer attached")?;
        let width = backend.video_width();
        let height = backend.video_height();
        let y_size = (width * height) as usize;
        let uv_size = y_size / 2;
        if y_size + uv_size > self.sab_len {
            return Err(format!("SAB too small: need {}B have {}B", y_size + uv_size, self.sab_len));
        }
        unsafe {
            let y_slice = std::slice::from_raw_parts_mut(ptr, y_size);
            let uv_slice = std::slice::from_raw_parts_mut(ptr.add(y_size), uv_size);
            backend.decode_frame_nv12_into(y_slice, uv_slice)
        }
    }

    pub fn seek(&mut self, timestamp_ms: i64) -> Result<(), String> {
        let backend = self.backend.as_mut().ok_or("Decoder not opened")?;
        backend.seek(timestamp_ms)
    }

    pub fn pause(&mut self) -> Result<(), String> {
        let backend = self.backend.as_mut().ok_or("Decoder not opened")?;
        backend.pause()
    }

    pub fn resume(&mut self) -> Result<(), String> {
        let backend = self.backend.as_mut().ok_or("Decoder not opened")?;
        backend.resume()
    }

    pub fn get_metadata(&self) -> VideoMetadata {
        match &self.backend {
            Some(b) => VideoMetadata {
                backend: b.backend_name().to_string(),
                width: b.video_width(),
                height: b.video_height(),
                duration_ms: b.duration_ms(),
                frame_rate: b.frame_rate(),
                colorimetry: b.colorimetry().to_string(),
                par_n: b.par_n(),
                par_d: b.par_d(),
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
    pub colorimetry: String,
    pub par_n: u32,
    pub par_d: u32,
}
