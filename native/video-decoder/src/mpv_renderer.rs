use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use crate::mpv_dynamic as api;
use crate::shared_buffer::SharedFrameBuffer;

fn mpv_err(code: c_int) -> Result<(), String> {
    if code < 0 {
        Err(format!("mpv error {}", code))
    } else {
        Ok(())
    }
}

/// Owns an mpv instance using the software (CPU) render API.
/// libmpv is loaded dynamically with RTLD_DEEPBIND so its FFmpeg
/// symbols are resolved against the system libavutil (so.58) rather
/// than Electron/Chromium's bundled libavutil (so.59), avoiding ABI
/// mismatch crashes in the renderer process.
#[derive(Clone, Debug)]
pub struct SubtitleTrack {
    pub id: i64,
    pub title: Option<String>,
    pub lang: Option<String>,
    pub selected: bool,
    pub default: bool,
}

pub struct MpvRenderer {
    mpv: *mut api::mpv_handle,
    render_ctx: *mut api::mpv_render_context,
    video_width: u32,
    video_height: u32,
    render_width: u32,
    render_height: u32,
    duration_ms: i64,
    frame_rate: f64,
    eof_reached: Arc<AtomicBool>,
    shutdown_flag: Option<Arc<AtomicBool>>,
    event_thread: Option<JoinHandle<()>>,
    subtitle_tracks: Vec<SubtitleTrack>,
}

impl MpvRenderer {
    pub fn new() -> Result<Self, String> {
        let mpv_api = api::get_api()?;

        let mpv = unsafe { (mpv_api.mpv_create)() };
        if mpv.is_null() {
            return Err("mpv_create failed".to_string());
        }

        // vo=libmpv is required for the SW render API to work.
        // hwdec=auto lets mpv use NVDEC/VAAPI/DXVA — whatever the GPU
        // supports — then the SW render API reads the composited frame
        // back to CPU memory for WebGL upload.
        // config=no prevents mpv from reading the user's ~/.config/mpv/mpv.conf,
        // which could set an unexpectedly low volume, unwanted filters, etc.
        unsafe {
            (mpv_api.mpv_set_option_string)(mpv, c"vo".as_ptr(), c"libmpv".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"hwdec".as_ptr(), c"auto".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"loop-file".as_ptr(), c"no".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"terminal".as_ptr(), c"no".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"msg-level".as_ptr(), c"all=warn".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"config".as_ptr(), c"no".as_ptr());
            // Software volume + explicit PulseAudio for consistent loudness.
            (mpv_api.mpv_set_option_string)(mpv, c"softvol".as_ptr(), c"yes".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"ao".as_ptr(), c"pulse".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"replaygain".as_ptr(), c"no".as_ptr());
            // Raise ceiling so we have headroom for quiet files.
            (mpv_api.mpv_set_option_string)(mpv, c"volume-max".as_ptr(), c"200".as_ptr());
        }

        mpv_err(unsafe { (mpv_api.mpv_initialize)(mpv) })
            .map_err(|e| format!("mpv_initialize failed: {}", e))?;

        // Explicitly set volume property after init — set_option_string before
        // initialize is unreliable for some properties.
        let vol_name = CString::new("volume").unwrap();
        let vol_value: f64 = 100.0;
        let ret = unsafe {
            (mpv_api.mpv_set_property)(
                mpv,
                vol_name.as_ptr(),
                api::MPV_FORMAT_DOUBLE,
                &vol_value as *const _ as *mut c_void,
            )
        };
        if ret < 0 {
            // Silently ignore volume set failure; mpv still works.
        }

        let api_type = CString::new("sw").unwrap();
        let mut params = [
            api::mpv_render_param {
                type_: api::MPV_RENDER_PARAM_API_TYPE,
                data: api_type.as_ptr() as *mut c_void,
            },
            api::mpv_render_param {
                type_: api::MPV_RENDER_PARAM_INVALID,
                data: ptr::null_mut(),
            },
        ];

        let mut render_ctx: *mut api::mpv_render_context = ptr::null_mut();
        let ret = unsafe { (mpv_api.mpv_render_context_create)(&mut render_ctx, mpv, params.as_mut_ptr()) };
        if ret < 0 {
            unsafe { (mpv_api.mpv_terminate_destroy)(mpv) };
            return Err(format!("mpv_render_context_create failed: {}", ret));
        }

        let eof_reached = Arc::new(AtomicBool::new(false));
        let eof_clone = Arc::clone(&eof_reached);
        let shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_clone = Arc::clone(&shutdown);

        let mpv_ptr = mpv as usize;
        let event_thread = thread::spawn(move || {
            let mpv = mpv_ptr as *mut api::mpv_handle;
            let mpv_api = api::get_api().expect("libmpv API should be loaded");
            loop {
                if shutdown_clone.load(Ordering::Relaxed) {
                    break;
                }
                let event = unsafe { (mpv_api.mpv_wait_event)(mpv, 0.1) };
                if event.is_null() {
                    continue;
                }
                let ev = unsafe { &*event };
                match ev.event_id {
                    api::MPV_EVENT_SHUTDOWN => break,
                    api::MPV_EVENT_END_FILE => {
                        // Only treat true EOF (reason=0) or error (reason=3)
                        // as playback end.  reason=2 is "stop", reason=4 is
                        // "quit" — both happen during normal cleanup.
                        let is_eof = if !ev.data.is_null() {
                            let end_file = unsafe { &*(ev.data as *const api::mpv_event_end_file) };
                            end_file.reason == api::MPV_END_FILE_REASON_EOF
                                || end_file.reason == api::MPV_END_FILE_REASON_ERROR
                        } else {
                            true
                        };
                        if is_eof {
                            eof_clone.store(true, Ordering::Relaxed);
                        }
                        // Do NOT break here — mpv may receive more commands.
                    }
                    _ => {}
                }
            }
        });
        Ok(Self {
            mpv,
            render_ctx,
            video_width: 0,
            video_height: 0,
            render_width: 0,
            render_height: 0,
            duration_ms: 0,
            frame_rate: 30.0,
            eof_reached,
            shutdown_flag: Some(shutdown),
            event_thread: Some(event_thread),
            subtitle_tracks: Vec::new(),
        })
    }

    pub fn open(&mut self, path: &str) -> Result<(), String> {
        // Reset EOF state from any previous playback.
        self.eof_reached.store(false, Ordering::Relaxed);

        let mpv_api = api::get_api()?;
        let path_c = CString::new(path).map_err(|e| format!("Invalid path: {}", e))?;
        let mut args = [
            c"loadfile".as_ptr(),
            path_c.as_ptr(),
            c"replace".as_ptr(),
            ptr::null(),
        ];
        mpv_err(unsafe { (mpv_api.mpv_command)(self.mpv, args.as_mut_ptr()) })
            .map_err(|e| format!("mpv loadfile failed: {}", e))?;

        // Poll for metadata (max 120s — 4K HEVC files on network shares
        // can take a long time to open and decode the first frame).
        for i in 0..12000 {
            if let Some(w) = self.get_property_int("width")? {
                if w > 0 {
                    self.video_width = w as u32;
                    self.video_height = self.get_property_int("height")?.unwrap_or(0) as u32;
                    self.duration_ms =
                        (self.get_property_double("duration")?.unwrap_or(0.0) * 1000.0) as i64;
                    self.frame_rate = self.get_property_double("estimated-vf-fps")?.unwrap_or(30.0);
                    self.refresh_subtitle_tracks();
                    return Ok(());
                }
            }
            if i > 0 && i % 100 == 0 {
                // Still polling for metadata...
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        Err("Timeout waiting for video metadata".to_string())
    }

    pub fn set_render_size(&mut self, width: u32, height: u32) {
        self.render_width = width;
        self.render_height = height;
    }

    pub fn render_frame(
        &mut self,
        sab: Option<(&mut SharedFrameBuffer, u32, u32)>,
    ) -> Result<Option<(u32, u32)>, String> {
        let mpv_api = api::get_api()?;

        if self.eof_reached.load(Ordering::Relaxed) {
            return Ok(None);
        }

        let width = self.video_width;
        let height = self.video_height;
        if width == 0 || height == 0 {
            return Ok(None);
        }

        // Extract requested render dimensions from the sab tuple (caller passes
        // source resolution), then override with explicit render size if set.
        let (sab_ref, req_w, req_h) = match sab {
            Some((s, w, h)) => (Some(s), w, h),
            None => (None, width, height),
        };
        let sab_ref = sab_ref.map(|s| &mut *s);
        // setRenderSize is for downsampling (smaller canvas = less CPU).
        // Never render larger than the source video — the SAB slot is sized
        // for the source resolution and upscaling wastes CPU anyway.
        let render_w = if self.render_width > 0 { self.render_width.min(req_w) } else { req_w };
        let render_h = if self.render_height > 0 { self.render_height.min(req_h) } else { req_h };

        if let Some(sab) = sab_ref {
            let slot_idx = sab.next_write_slot();
            let slot = sab.slot_mut_slice(slot_idx);
            slot.fill(0);

            let stride = (render_w * 4) as usize;
            let needed = stride * render_h as usize;
            if slot.len() < needed {
                return Err(format!("SAB slot too small: {} < {}", slot.len(), needed));
            }

            let size = [render_w as i32, render_h as i32];
            let format = c"rgb0";

            let mut params = [
                api::mpv_render_param {
                    type_: api::MPV_RENDER_PARAM_SW_SIZE,
                    data: &size as *const _ as *mut c_void,
                },
                api::mpv_render_param {
                    type_: api::MPV_RENDER_PARAM_SW_FORMAT,
                    data: format.as_ptr() as *mut c_void,
                },
                api::mpv_render_param {
                    type_: api::MPV_RENDER_PARAM_SW_STRIDE,
                    data: &stride as *const _ as *mut c_void,
                },
                api::mpv_render_param {
                    type_: api::MPV_RENDER_PARAM_SW_POINTER,
                    data: slot.as_mut_ptr() as *mut c_void,
                },
                api::mpv_render_param {
                    type_: api::MPV_RENDER_PARAM_INVALID,
                    data: ptr::null_mut(),
                },
            ];

            let ret = unsafe { (mpv_api.mpv_render_context_render)(self.render_ctx, params.as_mut_ptr()) };
            if ret < 0 {
                return Err(format!("mpv_render_context_render failed: {}", ret));
            }

            sab.publish_metadata(render_w, render_h);
        }

        Ok(Some((render_w, render_h)))
    }

    pub fn seek(&mut self, timestamp_ms: i64) -> Result<(), String> {
        let mpv_api = api::get_api()?;
        let seek_c = CString::new("seek").unwrap();
        let pos_c = CString::new(format!("{}.{:03}", timestamp_ms / 1000, timestamp_ms % 1000)).unwrap();
        let absolute_c = CString::new("absolute").unwrap();
        let mut args = [
            seek_c.as_ptr(),
            pos_c.as_ptr(),
            absolute_c.as_ptr(),
            ptr::null(),
        ];
        mpv_err(unsafe { (mpv_api.mpv_command)(self.mpv, args.as_mut_ptr()) })
            .map_err(|e| format!("mpv seek failed: {}", e))
    }

    pub fn set_pause(&mut self, paused: bool) -> Result<(), String> {
        let mpv_api = api::get_api()?;
        let name = CString::new("pause").unwrap();
        let value = CString::new(if paused { "yes" } else { "no" }).unwrap();
        let mut args = [
            c"set".as_ptr(),
            name.as_ptr(),
            value.as_ptr(),
            ptr::null(),
        ];
        mpv_err(unsafe { (mpv_api.mpv_command)(self.mpv, args.as_mut_ptr()) })
            .map_err(|e| format!("mpv pause failed: {}", e))
    }

    pub fn get_metadata(&self) -> FrameMetadata {
        FrameMetadata {
            width: self.video_width,
            height: self.video_height,
            duration_ms: self.duration_ms,
            frame_rate: self.frame_rate,
        }
    }

    pub fn get_time_pos_ms(&self) -> i64 {
        match self.get_property_double("time-pos") {
            Ok(Some(t)) => (t * 1000.0) as i64,
            _ => 0,
        }
    }

    pub fn close(&mut self) {
        // Signal the event thread to exit before we destroy mpv handles.
        if let Some(ref shutdown) = self.shutdown_flag {
            shutdown.store(true, Ordering::Relaxed);
        }

        let mpv_api = api::get_api().expect("libmpv API should be loaded");

        // 1. Free the render context first.
        if !self.render_ctx.is_null() {
            unsafe { (mpv_api.mpv_render_context_free)(self.render_ctx) };
            self.render_ctx = ptr::null_mut();
        }

        // 2. Terminate mpv (this wakes mpv_wait_event with SHUTDOWN).
        if !self.mpv.is_null() {
            unsafe { (mpv_api.mpv_terminate_destroy)(self.mpv) };
            self.mpv = ptr::null_mut();
        }

        // 3. Join the event thread.
        if let Some(handle) = self.event_thread.take() {
            let _ = handle.join();
        }
    }

    fn get_property_int(&self, name: &str) -> Result<Option<i64>, String> {
        let mpv_api = api::get_api()?;
        let name_c = CString::new(name).map_err(|e| format!("Invalid property name: {}", e))?;
        let mut value: i64 = 0;
        let ret = unsafe { (mpv_api.mpv_get_property)(self.mpv, name_c.as_ptr(), api::MPV_FORMAT_INT64, &mut value as *mut _ as *mut c_void) };
        if ret == 0 {
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }

    fn get_property_double(&self, name: &str) -> Result<Option<f64>, String> {
        let mpv_api = api::get_api()?;
        let name_c = CString::new(name).map_err(|e| format!("Invalid property name: {}", e))?;
        let mut value: f64 = 0.0;
        let ret = unsafe { (mpv_api.mpv_get_property)(self.mpv, name_c.as_ptr(), api::MPV_FORMAT_DOUBLE, &mut value as *mut _ as *mut c_void) };
        if ret == 0 {
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }

    fn get_property_string(&self, name: &str) -> Result<Option<String>, String> {
        let mpv_api = api::get_api()?;
        let name_c = CString::new(name).map_err(|e| format!("Invalid property name: {}", e))?;
        let ptr = unsafe { (mpv_api.mpv_get_property_string)(self.mpv, name_c.as_ptr()) };
        if ptr.is_null() {
            return Ok(None);
        }
        let value = unsafe { CStr::from_ptr(ptr).to_string_lossy().into_owned() };
        // NOTE: mpv docs say to free with mpv_free, but doing so causes
        // "free(): invalid pointer" crashes with the system libmpv.so.2.
        // The leak is tiny (a few KB per property query) and acceptable.
        Ok(Some(value))
    }

    /// Query and cache subtitle tracks from mpv's track-list property.
    pub fn refresh_subtitle_tracks(&mut self) {
        self.subtitle_tracks.clear();
        let json_str = match self.get_property_string("track-list") {
            Ok(Some(s)) => s,
            _ => return,
        };

        #[derive(serde::Deserialize)]
        struct MpvTrack {
            #[serde(rename = "type")]
            track_type: String,
            id: i64,
            title: Option<String>,
            lang: Option<String>,
            selected: Option<bool>,
            default: Option<bool>,
        }

        let tracks: Vec<MpvTrack> = match serde_json::from_str(&json_str) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("[mpv] Failed to parse track-list: {}", e);
                return;
            }
        };

        self.subtitle_tracks = tracks
            .into_iter()
            .filter(|t| t.track_type == "sub")
            .map(|t| SubtitleTrack {
                id: t.id,
                title: t.title,
                lang: t.lang,
                selected: t.selected.unwrap_or(false),
                default: t.default.unwrap_or(false),
            })
            .collect();
    }

    pub fn list_subtitle_tracks(&self) -> Vec<SubtitleTrack> {
        self.subtitle_tracks.clone()
    }

    pub fn select_subtitle_track(&mut self, id: i64) -> Result<(), String> {
        let mpv_api = api::get_api()?;
        let sid = if id < 0 { "no".to_string() } else { format!("{}", id) };
        let name_c = CString::new("sid").unwrap();
        let value_c = CString::new(sid).unwrap();
        let mut args = [
            c"set".as_ptr(),
            name_c.as_ptr(),
            value_c.as_ptr(),
            ptr::null(),
        ];
        mpv_err(unsafe { (mpv_api.mpv_command)(self.mpv, args.as_mut_ptr()) })
            .map_err(|e| format!("mpv select subtitle failed: {}", e))?;
        // Refresh track list so selected state is up to date.
        self.refresh_subtitle_tracks();
        Ok(())
    }

    pub fn load_external_subtitle(&mut self, path: &str) -> Result<(), String> {
        let mpv_api = api::get_api()?;
        let path_c = CString::new(path).map_err(|e| format!("Invalid subtitle path: {}", e))?;
        let mut args = [
            c"sub-add".as_ptr(),
            path_c.as_ptr(),
            c"select".as_ptr(),
            ptr::null(),
        ];
        mpv_err(unsafe { (mpv_api.mpv_command)(self.mpv, args.as_mut_ptr()) })
            .map_err(|e| format!("mpv sub-add failed: {}", e))?;
        self.refresh_subtitle_tracks();
        Ok(())
    }

    // ------------------------------------------------------------------
    // Audio tracks
    // ------------------------------------------------------------------

    pub fn list_audio_tracks(&self) -> Vec<SubtitleTrack> {
        let json_str = match self.get_property_string("track-list") {
            Ok(Some(s)) => s,
            _ => return Vec::new(),
        };

        #[derive(serde::Deserialize)]
        struct MpvTrack {
            #[serde(rename = "type")]
            track_type: String,
            id: i64,
            title: Option<String>,
            lang: Option<String>,
            selected: Option<bool>,
            default: Option<bool>,
        }

        let tracks: Vec<MpvTrack> = match serde_json::from_str(&json_str) {
            Ok(t) => t,
            _ => return Vec::new(),
        };

        tracks
            .into_iter()
            .filter(|t| t.track_type == "audio")
            .map(|t| SubtitleTrack {
                id: t.id,
                title: t.title,
                lang: t.lang,
                selected: t.selected.unwrap_or(false),
                default: t.default.unwrap_or(false),
            })
            .collect()
    }

    pub fn select_audio_track(&mut self, id: i64) -> Result<(), String> {
        let mpv_api = api::get_api()?;
        let aid = if id < 0 { "no".to_string() } else { format!("{}", id) };
        let name_c = CString::new("aid").unwrap();
        let value_c = CString::new(aid).unwrap();
        let mut args = [
            c"set".as_ptr(),
            name_c.as_ptr(),
            value_c.as_ptr(),
            ptr::null(),
        ];
        mpv_err(unsafe { (mpv_api.mpv_command)(self.mpv, args.as_mut_ptr()) })
            .map_err(|e| format!("mpv select audio failed: {}", e))
    }

    // ------------------------------------------------------------------
    // Volume / mute / speed
    // ------------------------------------------------------------------

    pub fn get_volume(&self) -> f64 {
        match self.get_property_double("volume") {
            Ok(Some(v)) => v,
            _ => 100.0,
        }
    }

    pub fn set_volume(&mut self, vol: f64) -> Result<(), String> {
        let mpv_api = api::get_api()?;
        let name_c = CString::new("volume").unwrap();
        let ret = unsafe {
            (mpv_api.mpv_set_property)(
                self.mpv,
                name_c.as_ptr(),
                api::MPV_FORMAT_DOUBLE,
                &vol as *const _ as *mut c_void,
            )
        };
        if ret < 0 {
            return Err(format!("mpv set volume failed: {}", ret));
        }
        // Verify the change took effect.
        let mut check: f64 = 0.0;
        let ret2 = unsafe {
            (mpv_api.mpv_get_property)(
                self.mpv,
                name_c.as_ptr(),
                api::MPV_FORMAT_DOUBLE,
                &mut check as *mut _ as *mut c_void,
            )
        };
        if ret2 == 0 {
            eprintln!("[mpv_renderer] volume set -> requested {} actual {}", vol, check);
        }
        Ok(())
    }

    pub fn get_mute(&self) -> bool {
        match self.get_property_string("mute") {
            Ok(Some(s)) => s == "yes",
            _ => false,
        }
    }

    pub fn set_mute(&mut self, mute: bool) -> Result<(), String> {
        let mpv_api = api::get_api()?;
        let val = if mute { "yes" } else { "no" };
        let name_c = CString::new("mute").unwrap();
        let value_c = CString::new(val).unwrap();
        let mut args = [
            c"set".as_ptr(),
            name_c.as_ptr(),
            value_c.as_ptr(),
            ptr::null(),
        ];
        mpv_err(unsafe { (mpv_api.mpv_command)(self.mpv, args.as_mut_ptr()) })
            .map_err(|e| format!("mpv set mute failed: {}", e))
    }

    pub fn get_speed(&self) -> f64 {
        match self.get_property_double("speed") {
            Ok(Some(v)) => v,
            _ => 1.0,
        }
    }

    pub fn set_speed(&mut self, speed: f64) -> Result<(), String> {
        let mpv_api = api::get_api()?;
        let speed_s = format!("{}", speed);
        let name_c = CString::new("speed").unwrap();
        let value_c = CString::new(speed_s).unwrap();
        let mut args = [
            c"set".as_ptr(),
            name_c.as_ptr(),
            value_c.as_ptr(),
            ptr::null(),
        ];
        mpv_err(unsafe { (mpv_api.mpv_command)(self.mpv, args.as_mut_ptr()) })
            .map_err(|e| format!("mpv set speed failed: {}", e))
    }

    // ------------------------------------------------------------------
    // Chapters
    // ------------------------------------------------------------------

    pub fn list_chapters(&self) -> Vec<ChapterInfo> {
        let json_str = match self.get_property_string("chapter-list") {
            Ok(Some(s)) => s,
            _ => return Vec::new(),
        };

        #[derive(serde::Deserialize)]
        struct MpvChapter {
            title: String,
            time: f64,
        }

        let chapters: Vec<MpvChapter> = match serde_json::from_str(&json_str) {
            Ok(c) => c,
            _ => return Vec::new(),
        };

        chapters
            .into_iter()
            .enumerate()
            .map(|(idx, c)| ChapterInfo {
                index: idx as i64,
                title: c.title,
                time_ms: (c.time * 1000.0) as i64,
            })
            .collect()
    }

    pub fn get_chapter(&self) -> i64 {
        match self.get_property_int("chapter") {
            Ok(Some(c)) => c,
            _ => -1,
        }
    }

    pub fn set_chapter(&mut self, idx: i64) -> Result<(), String> {
        let mpv_api = api::get_api()?;
        let idx_s = format!("{}", idx);
        let name_c = CString::new("chapter").unwrap();
        let value_c = CString::new(idx_s).unwrap();
        let mut args = [
            c"set".as_ptr(),
            name_c.as_ptr(),
            value_c.as_ptr(),
            ptr::null(),
        ];
        mpv_err(unsafe { (mpv_api.mpv_command)(self.mpv, args.as_mut_ptr()) })
            .map_err(|e| format!("mpv set chapter failed: {}", e))
    }
}

#[derive(Clone, Debug)]
pub struct ChapterInfo {
    pub index: i64,
    pub title: String,
    pub time_ms: i64,
}

#[derive(Clone, Copy)]
pub struct FrameMetadata {
    pub width: u32,
    pub height: u32,
    pub duration_ms: i64,
    pub frame_rate: f64,
}
