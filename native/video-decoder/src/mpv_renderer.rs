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
pub struct MpvRenderer {
    mpv: *mut api::mpv_handle,
    render_ctx: *mut api::mpv_render_context,
    video_width: u32,
    video_height: u32,
    duration_ms: i64,
    frame_rate: f64,
    eof_reached: Arc<AtomicBool>,
    event_thread: Option<JoinHandle<()>>,
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
        unsafe {
            (mpv_api.mpv_set_option_string)(mpv, c"vo".as_ptr(), c"libmpv".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"hwdec".as_ptr(), c"auto".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"loop-file".as_ptr(), c"no".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"terminal".as_ptr(), c"no".as_ptr());
            (mpv_api.mpv_set_option_string)(mpv, c"msg-level".as_ptr(), c"all=warn".as_ptr());
        }

        mpv_err(unsafe { (mpv_api.mpv_initialize)(mpv) })
            .map_err(|e| format!("mpv_initialize failed: {}", e))?;

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

        let mpv_ptr = mpv as usize;
        let event_thread = thread::spawn(move || {
            let mpv = mpv_ptr as *mut api::mpv_handle;
            let mpv_api = api::get_api().expect("libmpv API should be loaded");
            loop {
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
            duration_ms: 0,
            frame_rate: 30.0,
            eof_reached,
            event_thread: Some(event_thread),
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

        // Poll for metadata (max 30s — 4K HEVC files on network shares
        // can take a long time to open and decode the first frame).
        for i in 0..3000 {
            if let Some(w) = self.get_property_int("width")? {
                if w > 0 {
                    self.video_width = w as u32;
                    self.video_height = self.get_property_int("height")?.unwrap_or(0) as u32;
                    self.duration_ms =
                        (self.get_property_double("duration")?.unwrap_or(0.0) * 1000.0) as i64;
                    self.frame_rate = self.get_property_double("estimated-vf-fps")?.unwrap_or(30.0);
                    return Ok(());
                }
            }
            if i > 0 && i % 100 == 0 {
                eprintln!("[mpv] still waiting for metadata... {} ms", i * 10);
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        Err("Timeout waiting for video metadata".to_string())
    }

    pub fn render_frame(
        &mut self,
        sab: Option<(&SharedFrameBuffer, u32, u32)>,
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

        if let Some((sab, w, h)) = sab {
            let slot_idx = sab.next_write_slot();
            let slot = sab.slot_mut_slice(slot_idx);
            slot.fill(0);

            let stride = (w * 4) as usize;
            let needed = stride * h as usize;
            if slot.len() < needed {
                return Err(format!("SAB slot too small: {} < {}", slot.len(), needed));
            }

            let size = [w as i32, h as i32];
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

            sab.publish_metadata(w, h);
        }

        Ok(Some((width, height)))
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

    pub fn close(&mut self) {
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
}

#[derive(Clone, Copy)]
pub struct FrameMetadata {
    pub width: u32,
    pub height: u32,
    pub duration_ms: i64,
    pub frame_rate: f64,
}
