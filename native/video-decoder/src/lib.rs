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

#[napi(object)]
pub struct SubtitleTrackInfo {
    pub id: i64,
    pub title: Option<String>,
    pub lang: Option<String>,
    pub selected: bool,
    pub default: bool,
}

#[napi(object)]
pub struct AudioTrackInfo {
    pub id: i64,
    pub title: Option<String>,
    pub lang: Option<String>,
    pub selected: bool,
    pub default: bool,
}

#[napi(object)]
pub struct ChapterInfo {
    pub index: i64,
    pub title: String,
    pub time_ms: i64,
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

    /// Set the target render resolution.  Passing (0, 0) resets to the
    /// source video resolution.  Decoding at a smaller size (e.g. the
    /// window pixel size) dramatically reduces CPU load and IPC traffic.
    #[napi]
    pub fn set_render_size(&mut self, width: u32, height: u32) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder already closed",
        ))?;
        decoder.set_render_size(width, height);
        Ok(())
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

    /// Get current playback position in milliseconds.
    #[napi]
    pub fn get_time_pos_ms(&self) -> Result<i64> {
        let decoder = self.decoder.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        Ok(decoder.get_time_pos_ms())
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

    /// List available subtitle tracks.
    #[napi]
    pub fn list_subtitle_tracks(&self) -> Result<Vec<SubtitleTrackInfo>> {
        let decoder = self.decoder.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        let tracks = decoder.list_subtitle_tracks();
        Ok(tracks
            .into_iter()
            .map(|t| SubtitleTrackInfo {
                id: t.id,
                title: t.title,
                lang: t.lang,
                selected: t.selected,
                default: t.default,
            })
            .collect())
    }

    /// Select a subtitle track by id (use -1 to disable).
    #[napi]
    pub fn select_subtitle_track(&mut self, track_id: i64) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        decoder
            .select_subtitle_track(track_id)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Load an external subtitle file.
    #[napi]
    pub fn load_external_subtitle(&mut self, path: String) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        decoder
            .load_external_subtitle(&path)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// List available audio tracks.
    #[napi]
    pub fn list_audio_tracks(&self) -> Result<Vec<AudioTrackInfo>> {
        let decoder = self.decoder.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        let tracks = decoder.list_audio_tracks();
        Ok(tracks
            .into_iter()
            .map(|t| AudioTrackInfo {
                id: t.id,
                title: t.title,
                lang: t.lang,
                selected: t.selected,
                default: t.default,
            })
            .collect())
    }

    /// Select an audio track by id (use -1 to disable).
    #[napi]
    pub fn select_audio_track(&mut self, track_id: i64) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        decoder
            .select_audio_track(track_id)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Get current volume (0-100+).
    #[napi]
    pub fn get_volume(&self) -> Result<f64> {
        let decoder = self.decoder.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        Ok(decoder.get_volume())
    }

    /// Set volume (0-100+).
    #[napi]
    pub fn set_volume(&mut self, volume: f64) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        decoder
            .set_volume(volume)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Get mute state.
    #[napi]
    pub fn get_mute(&self) -> Result<bool> {
        let decoder = self.decoder.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        Ok(decoder.get_mute())
    }

    /// Set mute state.
    #[napi]
    pub fn set_mute(&mut self, mute: bool) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        decoder
            .set_mute(mute)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Get playback speed (1.0 = normal).
    #[napi]
    pub fn get_speed(&self) -> Result<f64> {
        let decoder = self.decoder.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        Ok(decoder.get_speed())
    }

    /// Set playback speed.
    #[napi]
    pub fn set_speed(&mut self, speed: f64) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        decoder
            .set_speed(speed)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// List chapters.
    #[napi]
    pub fn list_chapters(&self) -> Result<Vec<ChapterInfo>> {
        let decoder = self.decoder.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        let chapters = decoder.list_chapters();
        Ok(chapters
            .into_iter()
            .map(|c| ChapterInfo {
                index: c.index,
                title: c.title,
                time_ms: c.time_ms,
            })
            .collect())
    }

    /// Get current chapter index.
    #[napi]
    pub fn get_chapter(&self) -> Result<i64> {
        let decoder = self.decoder.as_ref().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        Ok(decoder.get_chapter())
    }

    /// Seek to chapter by index.
    #[napi]
    pub fn set_chapter(&mut self, index: i64) -> Result<()> {
        let decoder = self.decoder.as_mut().ok_or(Error::new(
            Status::GenericFailure,
            "Decoder not opened",
        ))?;
        decoder
            .set_chapter(index)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }
}
