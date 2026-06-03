use std::os::raw::{c_char, c_uint, c_void};

pub const RETRO_API_VERSION: c_uint = 1;
pub const RETRO_DEVICE_TYPE_SHIFT: c_uint = 8;
pub const RETRO_DEVICE_MASK: c_uint = (1 << RETRO_DEVICE_TYPE_SHIFT) - 1;
pub const RETRO_DEVICE_NONE: c_uint = 0;
pub const RETRO_DEVICE_JOYPAD: c_uint = 1;
pub const RETRO_DEVICE_ANALOG: c_uint = 5;
pub const RETRO_DEVICE_ID_JOYPAD_B: c_uint = 0;
pub const RETRO_DEVICE_ID_JOYPAD_Y: c_uint = 1;
pub const RETRO_DEVICE_ID_JOYPAD_SELECT: c_uint = 2;
pub const RETRO_DEVICE_ID_JOYPAD_START: c_uint = 3;
pub const RETRO_DEVICE_ID_JOYPAD_UP: c_uint = 4;
pub const RETRO_DEVICE_ID_JOYPAD_DOWN: c_uint = 5;
pub const RETRO_DEVICE_ID_JOYPAD_LEFT: c_uint = 6;
pub const RETRO_DEVICE_ID_JOYPAD_RIGHT: c_uint = 7;
pub const RETRO_DEVICE_ID_JOYPAD_A: c_uint = 8;
pub const RETRO_DEVICE_ID_JOYPAD_X: c_uint = 9;
pub const RETRO_DEVICE_ID_JOYPAD_L: c_uint = 10;
pub const RETRO_DEVICE_ID_JOYPAD_R: c_uint = 11;
pub const RETRO_DEVICE_ID_JOYPAD_L2: c_uint = 12;
pub const RETRO_DEVICE_ID_JOYPAD_R2: c_uint = 13;
pub const RETRO_DEVICE_ID_JOYPAD_L3: c_uint = 14;
pub const RETRO_DEVICE_ID_JOYPAD_R3: c_uint = 15;
pub const RETRO_DEVICE_ID_ANALOG_X: c_uint = 0;
pub const RETRO_DEVICE_ID_ANALOG_Y: c_uint = 1;
pub const RETRO_DEVICE_INDEX_ANALOG_LEFT: c_uint = 0;
pub const RETRO_DEVICE_INDEX_ANALOG_RIGHT: c_uint = 1;
pub const RETRO_PIXEL_FORMAT_0RGB1555: c_uint = 0;
pub const RETRO_PIXEL_FORMAT_XRGB8888: c_uint = 1;
pub const RETRO_PIXEL_FORMAT_RGB565: c_uint = 2;
pub const RETRO_PIXEL_FORMAT_RGBA8888: c_uint = 3;
pub const RETRO_MEMORY_SAVE_RAM: c_uint = 0;
pub const RETRO_MEMORY_RTC: c_uint = 1;
pub const RETRO_MEMORY_SYSTEM_RAM: c_uint = 2;
pub const RETRO_MEMORY_VIDEO_RAM: c_uint = 3;
pub const RETRO_ENVIRONMENT_SET_ROTATION: c_uint = 1;
pub const RETRO_ENVIRONMENT_GET_OVERSCAN: c_uint = 2;
pub const RETRO_ENVIRONMENT_GET_CAN_DUPE: c_uint = 3;
pub const RETRO_ENVIRONMENT_SET_MESSAGE: c_uint = 6;
pub const RETRO_ENVIRONMENT_SHUTDOWN: c_uint = 7;
pub const RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL: c_uint = 8;
pub const RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: c_uint = 9;
pub const RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: c_uint = 10;
pub const RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS: c_uint = 11;
pub const RETRO_ENVIRONMENT_SET_KEYBOARD_CALLBACK: c_uint = 12;
pub const RETRO_ENVIRONMENT_SET_DISK_CONTROL_INTERFACE: c_uint = 13;
pub const RETRO_ENVIRONMENT_SET_HW_RENDER: c_uint = 14;
pub const RETRO_ENVIRONMENT_GET_VARIABLE: c_uint = 15;
pub const RETRO_ENVIRONMENT_SET_VARIABLES: c_uint = 16;
pub const RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: c_uint = 17;
pub const RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: c_uint = 18;
pub const RETRO_ENVIRONMENT_GET_LIBRETRO_PATH: c_uint = 19;
pub const RETRO_ENVIRONMENT_SET_AUDIO_CALLBACK: c_uint = 22;
pub const RETRO_ENVIRONMENT_SET_FRAME_TIME_CALLBACK: c_uint = 25;
pub const RETRO_ENVIRONMENT_GET_LOG_INTERFACE: c_uint = 27;
pub const RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: c_uint = 30;
pub const RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO: c_uint = 32;

#[repr(C)]
#[derive(Debug, Clone)]
pub struct RetroSystemInfo {
    pub library_name: *const c_char,
    pub library_version: *const c_char,
    pub need_fullpath: bool,
    pub block_extract: bool,
    pub valid_extensions: *const c_char,
}

#[derive(Debug, Clone)]
pub struct SystemInfo {
    pub library_name: String,
    pub library_version: String,
    pub need_fullpath: bool,
    pub block_extract: bool,
    pub valid_extensions: String,
}

// SAFETY: All fields are owned String/bool types, safe to send across threads
unsafe impl Send for SystemInfo {}

#[repr(C)]
#[derive(Debug, Clone)]
pub struct RetroGameInfo {
    pub path: *const c_char,
    pub data: *const c_void,
    pub size: usize,
    pub meta: *const c_char,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct RetroGameGeometry {
    pub base_width: c_uint,
    pub base_height: c_uint,
    pub max_width: c_uint,
    pub max_height: c_uint,
    pub aspect_ratio: f32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct RetroSystemTiming {
    pub fps: f64,
    pub sample_rate: f64,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct RetroSystemAvInfo {
    pub geometry: RetroGameGeometry,
    pub timing: RetroSystemTiming,
}

#[repr(C)]
#[derive(Debug, Clone)]
pub struct RetroVariable {
    pub key: *const c_char,
    pub value: *const c_char,
}

#[repr(C)]
#[derive(Debug, Clone)]
pub struct RetroInputDescriptor {
    pub port: c_uint,
    pub device: c_uint,
    pub index: c_uint,
    pub id: c_uint,
    pub description: *const c_char,
}

#[repr(C)]
#[derive(Debug, Clone)]
pub struct RetroMessage {
    pub msg: *const c_char,
    pub frames: c_uint,
}

pub type RetroEnvironmentCallback =
    extern "C" fn(cmd: c_uint, data: *mut c_void) -> bool;
pub type RetroVideoRefreshCallback =
    extern "C" fn(data: *const c_void, width: c_uint, height: c_uint, pitch: usize);
pub type RetroAudioSampleCallback = extern "C" fn(left: i16, right: i16);
pub type RetroAudioSampleBatchCallback =
    extern "C" fn(data: *const i16, frames: usize) -> usize;
pub type RetroInputPollCallback = extern "C" fn();
pub type RetroInputStateCallback =
    extern "C" fn(port: c_uint, device: c_uint, index: c_uint, id: c_uint) -> i16;

pub type RetroInitFn = unsafe extern "C" fn();
pub type RetroDeinitFn = unsafe extern "C" fn();
pub type RetroApiVersionFn = unsafe extern "C" fn() -> c_uint;
pub type RetroGetSystemInfoFn = unsafe extern "C" fn(info: *mut RetroSystemInfo);
pub type RetroGetSystemAvInfoFn = unsafe extern "C" fn(info: *mut RetroSystemAvInfo);
pub type RetroSetEnvironmentFn = unsafe extern "C" fn(cb: RetroEnvironmentCallback);
pub type RetroSetVideoRefreshFn = unsafe extern "C" fn(cb: RetroVideoRefreshCallback);
pub type RetroSetAudioSampleFn = unsafe extern "C" fn(cb: RetroAudioSampleCallback);
pub type RetroSetAudioSampleBatchFn =
    unsafe extern "C" fn(cb: RetroAudioSampleBatchCallback);
pub type RetroSetInputPollFn = unsafe extern "C" fn(cb: RetroInputPollCallback);
pub type RetroSetInputStateFn = unsafe extern "C" fn(cb: RetroInputStateCallback);
pub type RetroResetFn = unsafe extern "C" fn();
pub type RetroRunFn = unsafe extern "C" fn();
pub type RetroLoadGameFn = unsafe extern "C" fn(game: *const RetroGameInfo) -> bool;
pub type RetroUnloadGameFn = unsafe extern "C" fn();
pub type RetroSetControllerPortDeviceFn =
    unsafe extern "C" fn(port: c_uint, device: c_uint);
pub type RetroSerializeSizeFn = unsafe extern "C" fn() -> usize;
pub type RetroSerializeFn = unsafe extern "C" fn(data: *mut c_void, size: usize) -> bool;
pub type RetroUnserializeFn = unsafe extern "C" fn(data: *const c_void, size: usize) -> bool;

#[repr(C)]
pub struct CoreVTable {
    pub retro_init: RetroInitFn,
    pub retro_deinit: RetroDeinitFn,
    pub retro_api_version: RetroApiVersionFn,
    pub retro_get_system_info: RetroGetSystemInfoFn,
    pub retro_get_system_av_info: RetroGetSystemAvInfoFn,
    pub retro_set_environment: RetroSetEnvironmentFn,
    pub retro_set_video_refresh: RetroSetVideoRefreshFn,
    pub retro_set_audio_sample: RetroSetAudioSampleFn,
    pub retro_set_audio_sample_batch: RetroSetAudioSampleBatchFn,
    pub retro_set_input_poll: RetroSetInputPollFn,
    pub retro_set_input_state: RetroSetInputStateFn,
    pub retro_reset: RetroResetFn,
    pub retro_run: RetroRunFn,
    pub retro_load_game: RetroLoadGameFn,
    pub retro_unload_game: RetroUnloadGameFn,
    pub retro_set_controller_port_device: RetroSetControllerPortDeviceFn,
    pub retro_serialize_size: Option<RetroSerializeSizeFn>,
    pub retro_serialize: Option<RetroSerializeFn>,
    pub retro_unserialize: Option<RetroUnserializeFn>,
}

impl CoreVTable {
    pub unsafe fn load(library: &libloading::Library) -> Result<Self, libloading::Error> {
        Ok(Self {
            retro_init: *library.get(b"retro_init")?,
            retro_deinit: *library.get(b"retro_deinit")?,
            retro_api_version: *library.get(b"retro_api_version")?,
            retro_get_system_info: *library.get(b"retro_get_system_info")?,
            retro_get_system_av_info: *library.get(b"retro_get_system_av_info")?,
            retro_set_environment: *library.get(b"retro_set_environment")?,
            retro_set_video_refresh: *library.get(b"retro_set_video_refresh")?,
            retro_set_audio_sample: *library.get(b"retro_set_audio_sample")?,
            retro_set_audio_sample_batch: *library.get(b"retro_set_audio_sample_batch")?,
            retro_set_input_poll: *library.get(b"retro_set_input_poll")?,
            retro_set_input_state: *library.get(b"retro_set_input_state")?,
            retro_reset: *library.get(b"retro_reset")?,
            retro_run: *library.get(b"retro_run")?,
            retro_load_game: *library.get(b"retro_load_game")?,
            retro_unload_game: *library.get(b"retro_unload_game")?,
            retro_set_controller_port_device: *library.get(b"retro_set_controller_port_device")?,
            retro_serialize_size: library.get(b"retro_serialize_size").ok().map(|s: libloading::Symbol<RetroSerializeSizeFn>| *s),
            retro_serialize: library.get(b"retro_serialize").ok().map(|s: libloading::Symbol<RetroSerializeFn>| *s),
            retro_unserialize: library.get(b"retro_unserialize").ok().map(|s: libloading::Symbol<RetroUnserializeFn>| *s),
        })
    }
}
