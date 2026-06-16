use crate::audio::AudioSystem;
use crate::ffi::*;
use crate::input::InputManager;
use crate::video::{VideoFrame, VideoState};
use libloading::Library;
use parking_lot::Mutex;
use std::cell::RefCell;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_uint, c_void};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

thread_local! {
    pub static TL_VIDEO: RefCell<Option<Arc<VideoState>>> = RefCell::new(None);
    pub static TL_AUDIO: RefCell<Option<Arc<Mutex<Option<AudioSystem>>>>> = RefCell::new(None);
    pub static TL_INPUT: RefCell<Option<Arc<InputManager>>> = RefCell::new(None);
    pub static TL_PIXEL_FORMAT: RefCell<u32> = RefCell::new(RETRO_PIXEL_FORMAT_XRGB8888);
    pub static TL_VARIABLES: RefCell<Option<Arc<Mutex<Vec<(String, String)>>>>> = RefCell::new(None);
    pub static TL_RUNNING: RefCell<Option<Arc<AtomicBool>>> = RefCell::new(None);
}

pub struct CoreInstance {
    pub vtable: CoreVTable,
    pub library: Library,
    pub system_info: Option<SystemInfo>,
    pub av_info: Option<RetroSystemAvInfo>,
    pub video: Arc<VideoState>,
    pub audio: Arc<Mutex<Option<AudioSystem>>>,
    pub input: Arc<InputManager>,
    pub variables: Arc<Mutex<Vec<(String, String)>>>,
    pub running: Arc<AtomicBool>,
    pub pixel_format: Arc<Mutex<u32>>,
    pub game_data: Option<Vec<u8>>,
    pub audio_enabled: bool,
}

impl CoreInstance {
    pub unsafe fn load(core_path: &str) -> Result<Arc<Mutex<Self>>, String> {
        let library = Library::new(core_path).map_err(|e| format!("Failed to load core: {}", e))?;
        let vtable = CoreVTable::load(&library).map_err(|e| format!("Failed to load core symbols: {}", e))?;

        let video = Arc::new(VideoState::new());
        let audio = Arc::new(Mutex::new(None));
        let input = Arc::new(InputManager::new());
        let variables = Arc::new(Mutex::new(Vec::new()));
        let running = Arc::new(AtomicBool::new(false));
        let pixel_format = Arc::new(Mutex::new(RETRO_PIXEL_FORMAT_XRGB8888));

        let core = Arc::new(Mutex::new(CoreInstance {
            vtable,
            library,
            system_info: None,
            av_info: None,
            video: video.clone(),
            audio: audio.clone(),
            input: input.clone(),
            variables: variables.clone(),
            running: running.clone(),
            pixel_format: pixel_format.clone(),
            game_data: None,
            audio_enabled: true,
        }));

        // Set thread-local state before calling any core functions
        TL_VIDEO.with(|v| *v.borrow_mut() = Some(video.clone()));
        TL_AUDIO.with(|a| *a.borrow_mut() = Some(audio.clone()));
        TL_INPUT.with(|i| *i.borrow_mut() = Some(input.clone()));
        TL_PIXEL_FORMAT.with(|p| *p.borrow_mut() = RETRO_PIXEL_FORMAT_XRGB8888);
        TL_VARIABLES.with(|v| *v.borrow_mut() = Some(variables.clone()));
        TL_RUNNING.with(|r| *r.borrow_mut() = Some(running.clone()));

        (core.lock().vtable.retro_set_environment)(core_environment_callback);
        (core.lock().vtable.retro_set_video_refresh)(video_refresh_callback);
        (core.lock().vtable.retro_set_audio_sample_batch)(audio_sample_batch_callback);
        (core.lock().vtable.retro_set_audio_sample)(audio_sample_callback);
        (core.lock().vtable.retro_set_input_poll)(input_poll_callback);
        (core.lock().vtable.retro_set_input_state)(input_state_callback);

        (core.lock().vtable.retro_init)();

        // Get system info
        let mut sys_info = RetroSystemInfo {
            library_name: std::ptr::null(),
            library_version: std::ptr::null(),
            need_fullpath: false,
            block_extract: false,
            valid_extensions: std::ptr::null(),
        };
        (core.lock().vtable.retro_get_system_info)(&mut sys_info);
        
        core.lock().system_info = Some(SystemInfo {
            library_name: if sys_info.library_name.is_null() {
                String::new()
            } else {
                CStr::from_ptr(sys_info.library_name).to_string_lossy().to_string()
            },
            library_version: if sys_info.library_version.is_null() {
                String::new()
            } else {
                CStr::from_ptr(sys_info.library_version).to_string_lossy().to_string()
            },
            need_fullpath: sys_info.need_fullpath,
            block_extract: sys_info.block_extract,
            valid_extensions: if sys_info.valid_extensions.is_null() {
                String::new()
            } else {
                CStr::from_ptr(sys_info.valid_extensions).to_string_lossy().to_string()
            },
        });

        Ok(core)
    }

    pub fn load_game(&mut self, rom_path: &str) -> Result<(), String> {
        let need_fullpath = self
            .system_info
            .as_ref()
            .map(|s| s.need_fullpath)
            .unwrap_or(false);

        let c_path = CString::new(rom_path).map_err(|e| format!("Invalid ROM path: {}", e))?;

        let game_info = if need_fullpath {
            RetroGameInfo {
                path: c_path.as_ptr(),
                data: std::ptr::null(),
                size: 0,
                meta: std::ptr::null(),
            }
        } else {
            let data = std::fs::read(rom_path)
                .map_err(|e| format!("Failed to read ROM: {}", e))?;
            let size = data.len();
            let data_ptr = data.as_ptr() as *const c_void;
            self.game_data = Some(data);
            RetroGameInfo {
                path: c_path.as_ptr(),
                data: data_ptr,
                size,
                meta: std::ptr::null(),
            }
        };

        let success = unsafe { (self.vtable.retro_load_game)(&game_info) };
        if !success {
            return Err("Failed to load game in core".to_string());
        }

        let mut av_info = RetroSystemAvInfo {
            geometry: RetroGameGeometry {
                base_width: 0,
                base_height: 0,
                max_width: 0,
                max_height: 0,
                aspect_ratio: 0.0,
            },
            timing: RetroSystemTiming {
                fps: 0.0,
                sample_rate: 0.0,
            },
        };
        unsafe {
            (self.vtable.retro_get_system_av_info)(&mut av_info);
        }
        self.av_info = Some(av_info);

        // Initialize audio system with correct sample rate
        if self.audio_enabled {
            match AudioSystem::new() {
                Ok(sys) => {
                    sys.set_sample_rate(av_info.timing.sample_rate);
                    *self.audio.lock() = Some(sys);
                }
                Err(e) => {
                    eprintln!("Failed to initialize audio: {}", e);
                }
            }
        }

        Ok(())
    }

    pub fn set_audio_enabled(&mut self, enabled: bool) {
        self.audio_enabled = enabled;
    }

    pub fn run_frame(&self) {
        unsafe {
            (self.vtable.retro_run)();
        }
    }

    pub fn reset(&self) {
        unsafe {
            (self.vtable.retro_reset)();
        }
    }

    pub fn unload(&mut self) {
        unsafe {
            (self.vtable.retro_unload_game)();
            (self.vtable.retro_deinit)();
        }
        *self.audio.lock() = None;
    }

    pub fn set_mute(&self, mute: bool) {
        if let Some(ref sys) = *self.audio.lock() {
            sys.set_mute(mute);
        }
    }
}

extern "C" fn core_environment_callback(cmd: c_uint, data: *mut c_void) -> bool {
    unsafe {
        match cmd {
            RETRO_ENVIRONMENT_SET_PIXEL_FORMAT => {
                if !data.is_null() {
                    let format = *(data as *const c_uint);
                    TL_PIXEL_FORMAT.with(|p| *p.borrow_mut() = format);
                }
                true
            }
            RETRO_ENVIRONMENT_GET_CAN_DUPE => {
                if !data.is_null() {
                    *(data as *mut bool) = true;
                }
                true
            }
            RETRO_ENVIRONMENT_GET_VARIABLE => {
                if !data.is_null() {
                    let var = &mut *(data as *mut RetroVariable);
                    let key = CStr::from_ptr(var.key).to_string_lossy().to_string();
                    TL_VARIABLES.with(|vars| {
                        if let Some(ref vars_arc) = *vars.borrow() {
                            let vars_locked = vars_arc.lock();
                            for (k, v) in vars_locked.iter() {
                                if k == &key {
                                    let c_val = CString::new(v.as_str()).unwrap();
                                    var.value = c_val.into_raw();
                                    return true;
                                }
                            }
                        }
                        false
                    })
                } else {
                    false
                }
            }
            RETRO_ENVIRONMENT_SET_VARIABLES => {
                if !data.is_null() {
                    let vars = data as *const RetroVariable;
                    let mut i = 0;
                    TL_VARIABLES.with(|tl| {
                        if let Some(ref vars_arc) = *tl.borrow() {
                            vars_arc.lock().clear();
                        }
                    });
                    loop {
                        let var = &*vars.add(i);
                        if var.key.is_null() {
                            break;
                        }
                        let key = CStr::from_ptr(var.key).to_string_lossy().to_string();
                        let raw_value = if var.value.is_null() {
                            String::new()
                        } else {
                            CStr::from_ptr(var.value).to_string_lossy().to_string()
                        };
                        // The value string is "default|option2|option3|...".
                        // Extract the default (first option) for GET_VARIABLE to return.
                        // Format is "description; default|option2|option3"
                        // Extract the default value (first option after the semicolon).
                        let default_value = raw_value
                            .split(';')
                            .nth(1)
                            .unwrap_or("")
                            .split('|')
                            .next()
                            .unwrap_or("")
                            .trim()
                            .to_string();
                        TL_VARIABLES.with(|tl| {
                            if let Some(ref vars_arc) = *tl.borrow() {
                                vars_arc.lock().push((key, default_value));
                            }
                        });
                        i += 1;
                    }
                }
                true
            }
            RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY => {
                if !data.is_null() {
                    let dir = std::env::var("HOME")
                        .unwrap_or_else(|_| "/tmp".to_string());
                    let sys_dir = format!("{}/.config/retroarch/system", dir);
                    std::fs::create_dir_all(&sys_dir).ok();
                    let c_dir = CString::new(sys_dir).unwrap();
                    *(data as *mut *const c_char) = c_dir.into_raw();
                }
                true
            }
            RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY => {
                if !data.is_null() {
                    let dir = std::env::var("HOME")
                        .unwrap_or_else(|_| "/tmp".to_string());
                    let save_dir = format!("{}/.config/retroarch/saves", dir);
                    std::fs::create_dir_all(&save_dir).ok();
                    let c_dir = CString::new(save_dir).unwrap();
                    *(data as *mut *const c_char) = c_dir.into_raw();
                }
                true
            }
            RETRO_ENVIRONMENT_SET_MESSAGE => {
                if !data.is_null() {
                    let msg = &*(data as *const RetroMessage);
                    if !msg.msg.is_null() {
                        let text = CStr::from_ptr(msg.msg).to_string_lossy();
                        println!("[CORE MSG] {}", text);
                    }
                }
                true
            }
            RETRO_ENVIRONMENT_GET_LOG_INTERFACE => {
                if !data.is_null() {
                    let cb = data as *mut RetroLogCallback;
                    (*cb).log = Some(log_callback);
                }
                true
            }
            RETRO_ENVIRONMENT_GET_PERF_INTERFACE => {
                // No-op: we don't support performance counters
                false
            }
            RETRO_ENVIRONMENT_SHUTDOWN => {
                TL_RUNNING.with(|r| {
                    if let Some(ref running) = *r.borrow() {
                        running.store(false, Ordering::SeqCst);
                    }
                });
                true
            }
            RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME => true,
            RETRO_ENVIRONMENT_SET_HW_RENDER => false,
            _ => false,
        }
    }
}

unsafe extern "C" fn log_callback(_level: c_uint, fmt: *const c_char) {
    if !fmt.is_null() {
        // Forward to libc printf so variadic args are actually formatted.
        // On x86_64 SysV ABI the caller has already placed args in registers/on the stack;
        // calling printf directly works because it reads from the same locations.
        libc::printf(fmt);
    }
}

extern "C" fn video_refresh_callback(data: *const c_void, width: c_uint, height: c_uint, pitch: usize) {
    unsafe {
        if data.is_null() {
            return;
        }
        let fmt = TL_PIXEL_FORMAT.with(|p| *p.borrow());
        let size = pitch * height as usize;
        let frame_data = std::slice::from_raw_parts(data as *const u8, size).to_vec();
        TL_VIDEO.with(|video| {
            if let Some(ref video_state) = *video.borrow() {
                video_state.set_frame(VideoFrame {
                    width,
                    height,
                    pitch,
                    format: fmt,
                    data: frame_data,
                });
            }
        });
    }
}

extern "C" fn audio_sample_batch_callback(data: *const i16, frames: usize) -> usize {
    unsafe {
        if !data.is_null() {
            let samples = std::slice::from_raw_parts(data, frames * 2);
            TL_AUDIO.with(|audio| {
                if let Some(ref audio_arc) = *audio.borrow() {
                    if let Some(ref sys) = *audio_arc.lock() {
                        sys.push_samples(samples);
                    }
                }
            });
        }
        frames
    }
}

extern "C" fn audio_sample_callback(left: i16, right: i16) {
    TL_AUDIO.with(|audio| {
        if let Some(ref audio_arc) = *audio.borrow() {
            if let Some(ref sys) = *audio_arc.lock() {
                sys.push_samples(&[left, right]);
            }
        }
    });
}

extern "C" fn input_poll_callback() {}

extern "C" fn input_state_callback(port: c_uint, device: c_uint, index: c_uint, id: c_uint) -> i16 {
    TL_INPUT.with(|input| {
        if let Some(ref input_mgr) = *input.borrow() {
            input_mgr.get_input_state(port, device, index, id)
        } else {
            0
        }
    })
}
