use std::ffi::{c_char, c_double, c_int, c_void, CStr, CString};
use std::ptr;
use std::sync::Once;

use libc::{dlerror, dlsym, dlopen, RTLD_NOW, RTLD_GLOBAL, RTLD_DEEPBIND};

// ---------------------------------------------------------------------------
// Minimal FFI types for libmpv (matches mpv/render.h & mpv/client.h)
// ---------------------------------------------------------------------------

pub type mpv_handle = c_void;
pub type mpv_render_context = c_void;
pub type mpv_render_param_type = u32;
pub type mpv_event_id = u32;
pub type mpv_format = u32;

#[repr(C)]
pub struct mpv_render_param {
    pub type_: mpv_render_param_type,
    pub data: *mut c_void,
}

#[repr(C)]
pub struct mpv_event {
    pub event_id: mpv_event_id,
    pub error: c_int,
    pub reply_userdata: u64,
    pub data: *mut c_void,
}

pub const MPV_RENDER_PARAM_INVALID: mpv_render_param_type = 0;
pub const MPV_RENDER_PARAM_API_TYPE: mpv_render_param_type = 1;
pub const MPV_RENDER_PARAM_SW_SIZE: mpv_render_param_type = 17;
pub const MPV_RENDER_PARAM_SW_FORMAT: mpv_render_param_type = 18;
pub const MPV_RENDER_PARAM_SW_STRIDE: mpv_render_param_type = 19;
pub const MPV_RENDER_PARAM_SW_POINTER: mpv_render_param_type = 20;
pub const MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME: mpv_render_param_type = 12;

pub const MPV_EVENT_SHUTDOWN: mpv_event_id = 1;
pub const MPV_EVENT_END_FILE: mpv_event_id = 7;

#[repr(C)]
pub struct mpv_event_end_file {
    pub reason: c_int,
    pub error: c_int,
}

pub const MPV_END_FILE_REASON_EOF: c_int = 0;
pub const MPV_END_FILE_REASON_STOP: c_int = 2;
pub const MPV_END_FILE_REASON_ERROR: c_int = 3;
pub const MPV_END_FILE_REASON_QUIT: c_int = 4;

pub const MPV_FORMAT_INT64: mpv_format = 4;
pub const MPV_FORMAT_DOUBLE: mpv_format = 5;

// ---------------------------------------------------------------------------
// Dynamically loaded function pointers
// ---------------------------------------------------------------------------

type Fnv_mpv_create = unsafe extern "C" fn() -> *mut mpv_handle;
type Fnv_mpv_initialize = unsafe extern "C" fn(*mut mpv_handle) -> c_int;
type Fnv_mpv_terminate_destroy = unsafe extern "C" fn(*mut mpv_handle) -> c_int;
type Fnv_mpv_set_option_string = unsafe extern "C" fn(*mut mpv_handle, *const c_char, *const c_char) -> c_int;
type Fnv_mpv_set_property = unsafe extern "C" fn(*mut mpv_handle, *const c_char, mpv_format, *mut c_void) -> c_int;
type Fnv_mpv_command = unsafe extern "C" fn(*mut mpv_handle, *mut *const c_char) -> c_int;
type Fnv_mpv_wait_event = unsafe extern "C" fn(*mut mpv_handle, c_double) -> *mut mpv_event;
type Fnv_mpv_get_property = unsafe extern "C" fn(*mut mpv_handle, *const c_char, mpv_format, *mut c_void) -> c_int;
type Fnv_mpv_get_property_string = unsafe extern "C" fn(*mut mpv_handle, *const c_char) -> *mut c_char;
type Fnv_mpv_free = unsafe extern "C" fn(*mut c_void);
type Fnv_mpv_render_context_create = unsafe extern "C" fn(*mut *mut mpv_render_context, *mut mpv_handle, *mut mpv_render_param) -> c_int;
type Fnv_mpv_render_context_render = unsafe extern "C" fn(*mut mpv_render_context, *mut mpv_render_param) -> c_int;
type Fnv_mpv_render_context_free = unsafe extern "C" fn(*mut mpv_render_context);

pub struct MpvApi {
    pub mpv_create: Fnv_mpv_create,
    pub mpv_initialize: Fnv_mpv_initialize,
    pub mpv_terminate_destroy: Fnv_mpv_terminate_destroy,
    pub mpv_set_option_string: Fnv_mpv_set_option_string,
    pub mpv_set_property: Fnv_mpv_set_property,
    pub mpv_command: Fnv_mpv_command,
    pub mpv_wait_event: Fnv_mpv_wait_event,
    pub mpv_get_property: Fnv_mpv_get_property,
    pub mpv_get_property_string: Fnv_mpv_get_property_string,
    pub mpv_free: Fnv_mpv_free,
    pub mpv_render_context_create: Fnv_mpv_render_context_create,
    pub mpv_render_context_render: Fnv_mpv_render_context_render,
    pub mpv_render_context_free: Fnv_mpv_render_context_free,
}

static mut API: Option<MpvApi> = None;
static INIT: Once = Once::new();

pub fn get_api() -> Result<&'static MpvApi, String> {
    unsafe {
        INIT.call_once(|| {
            API = Some(load_api().expect("Failed to load libmpv"));
        });
        API.as_ref().ok_or_else(|| "libmpv API not loaded".to_string())
    }
}

fn load_api() -> Result<MpvApi, String> {
    let mut handle: *mut c_void = ptr::null_mut();

    // Pre-load system FFmpeg libraries with RTLD_GLOBAL so their symbols
    // take precedence over Electron's bundled libffmpeg.so (which exports
    // libavutil 59 symbols).  libmpv was compiled against system libavutil 58,
    // so mixing allocators causes heap corruption (free(): invalid pointer).
    // By preloading the system libraries globally, libmpv and its dependencies
    // will resolve av_malloc/av_free/etc. to the system versions.
    // Preload system FFmpeg libraries with RTLD_GLOBAL so they override
    // Electron's bundled libffmpeg.so in the global symbol namespace.
    let ffmpeg_libs = [
        "libavutil.so.58",
        "libavcodec.so.60",
        "libavformat.so.60",
        "libavfilter.so.9",
        "libswresample.so.4",
        "libswscale.so.7",
        "libavdevice.so.60",
    ];
    for lib in &ffmpeg_libs {
        let c_path = CString::new(*lib).unwrap();
        let h = unsafe { dlopen(c_path.as_ptr(), RTLD_NOW | RTLD_GLOBAL) };
        if !h.is_null() {
            eprintln!("[mpv_dynamic] preloaded {}", lib);
        }
    }
    // Preload libvulkan without RTLD_GLOBAL so it remains available for
    // libmpv's dependency chain but doesn't interfere with Electron's Vulkan.
    let vulkan_path = CString::new("libvulkan.so.1").unwrap();
    unsafe { dlopen(vulkan_path.as_ptr(), RTLD_NOW); }

    for path in &["libmpv.so.2", "libmpv.so.1", "libmpv.so"] {
        let c_path = CString::new(*path).unwrap();
        // RTLD_DEEPBIND ensures libmpv's internal symbols (especially
        // libavutil functions) resolve to the system libraries we just
        // preloaded, NOT to Electron's bundled libffmpeg.so.
        handle = unsafe { dlopen(c_path.as_ptr(), RTLD_NOW | RTLD_DEEPBIND) };
        if !handle.is_null() {
            eprintln!("[mpv_dynamic] loaded libmpv from {}", path);
            break;
        }
    }

    if handle.is_null() {
        let err = unsafe {
            let raw = dlerror();
            if raw.is_null() {
                "unknown dlopen error".to_string()
            } else {
                CStr::from_ptr(raw as *const c_char)
                    .to_string_lossy()
                    .into_owned()
            }
        };
        return Err(format!("dlopen(libmpv.so) failed: {}", err));
    }

    macro_rules! sym {
        ($name:ident) => {{
            let c_name = CString::new(stringify!($name)).unwrap();
            let ptr = unsafe { dlsym(handle, c_name.as_ptr()) };
            if ptr.is_null() {
                return Err(format!("dlsym({}) returned null", stringify!($name)));
            }
            unsafe { std::mem::transmute(ptr) }
        }};
    }

    Ok(MpvApi {
        mpv_create: sym!(mpv_create),
        mpv_initialize: sym!(mpv_initialize),
        mpv_terminate_destroy: sym!(mpv_terminate_destroy),
        mpv_set_option_string: sym!(mpv_set_option_string),
        mpv_set_property: sym!(mpv_set_property),
        mpv_command: sym!(mpv_command),
        mpv_wait_event: sym!(mpv_wait_event),
        mpv_get_property: sym!(mpv_get_property),
        mpv_get_property_string: sym!(mpv_get_property_string),
        mpv_free: sym!(mpv_free),
        mpv_render_context_create: sym!(mpv_render_context_create),
        mpv_render_context_render: sym!(mpv_render_context_render),
        mpv_render_context_free: sym!(mpv_render_context_free),
    })
}
