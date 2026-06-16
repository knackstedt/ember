mod audio;
mod buffer;
mod core;
mod ffi;
mod input;
mod shared_buffer;
mod thread;
mod video;

use core::CoreInstance;
use napi::bindgen_prelude::*;
use napi::JsArrayBuffer;
use napi::NapiRaw;
use napi_derive::napi;
use parking_lot::Mutex;
use std::sync::Arc;
use thread::CoreRunner;

struct CoreHandle {
    core: Arc<Mutex<CoreInstance>>,
    runner: Arc<Mutex<Option<CoreRunner>>>,
}

#[napi(object)]
pub struct CoreInfo {
    pub id: i32,
    pub name: String,
    pub version: String,
    pub extensions: String,
    pub need_fullpath: bool,
}

#[napi(object)]
pub struct AvInfo {
    pub fps: f64,
    pub sample_rate: f64,
    pub base_width: i32,
    pub base_height: i32,
    pub max_width: i32,
    pub max_height: i32,
    pub aspect_ratio: f64,
}

#[napi(object)]
pub struct FrameData {
    pub width: i32,
    pub height: i32,
    pub data: Vec<u8>,
}

#[napi]
pub struct LibretroFrontend {
    cores: Arc<Mutex<Vec<CoreHandle>>>,
}

#[napi]
impl LibretroFrontend {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            cores: Arc::new(Mutex::new(Vec::new())),
        }
    }

    #[napi]
    pub fn load_core(&self, core_path: String) -> Result<CoreInfo> {
        let core = unsafe { CoreInstance::load(&core_path).map_err(|e| Error::new(Status::GenericFailure, e))? };
        let runner = Arc::new(Mutex::new(None));
        let handle = CoreHandle {
            core: core.clone(),
            runner: runner.clone(),
        };
        self.cores.lock().push(handle);

        let id = self.cores.lock().len() - 1;
        let sys_info = core.lock().system_info.clone();
        if let Some(sys_info) = sys_info {
            Ok(CoreInfo {
                id: id as i32,
                name: sys_info.library_name,
                version: sys_info.library_version,
                extensions: sys_info.valid_extensions,
                need_fullpath: sys_info.need_fullpath,
            })
        } else {
            Ok(CoreInfo {
                id: id as i32,
                name: String::new(),
                version: String::new(),
                extensions: String::new(),
                need_fullpath: false,
            })
        }
    }

    #[napi]
    pub fn load_game(&self, core_id: i32, rom_path: String) -> Result<bool> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;
        handle.core.lock().load_game(&rom_path).map_err(|e| Error::new(Status::GenericFailure, e))?;
        Ok(true)
    }

    #[napi]
    pub fn start(&self, core_id: i32) -> Result<bool> {
        let mut cores = self.cores.lock();
        let handle = cores
            .get_mut(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;
        let runner = CoreRunner::new(handle.core.clone());
        *handle.runner.lock() = Some(runner);
        Ok(true)
    }

    #[napi]
    pub fn stop(&self, core_id: i32) -> Result<bool> {
        let mut cores = self.cores.lock();
        let handle = cores
            .get_mut(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;
        if let Some(ref mut runner) = *handle.runner.lock() {
            runner.stop();
        }
        *handle.runner.lock() = None;
        Ok(true)
    }

    #[napi]
    pub fn reset(&self, core_id: i32) -> Result<bool> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;
        handle.core.lock().reset();
        Ok(true)
    }

    #[napi]
    pub fn set_input_state(&self, core_id: i32, port: i32, _device: i32, _index: i32, id: i32, value: i32) -> Result<bool> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;
        handle.core.lock().input.set_button(port as u32, id as u32, value != 0);
        Ok(true)
    }

    #[napi]
    pub fn set_analog_state(&self, core_id: i32, port: i32, index: i32, axis: i32, value: i32) -> Result<bool> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;
        handle.core.lock().input.set_analog(port as u32, index as u32, axis as u32, value as i16);
        Ok(true)
    }

    #[napi]
    pub fn set_mute(&self, core_id: i32, mute: bool) -> Result<bool> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;
        handle.core.lock().set_mute(mute);
        Ok(true)
    }

    #[napi]
    pub fn set_audio_enabled(&self, core_id: i32, enabled: bool) -> Result<bool> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;
        handle.core.lock().set_audio_enabled(enabled);
        Ok(true)
    }

    /// Zero-copy frame access: returns an external ArrayBuffer pointing to the
    /// pre-allocated reusable frame buffer. The buffer is valid until the next
    /// frame is written. Callers must check width/height first and copy/upload
    /// immediately.
    #[napi]
    pub fn get_frame_buffer(&self, core_id: i32, env: Env) -> Result<Object> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;

        let raw = handle.core.lock().video.get_raw();
        let mut obj = env.create_object()?;
        if let Some((width, height, pitch, format, ptr, len)) = raw {
            unsafe {
                let buf = buffer::create_external_arraybuffer(&env, ptr as *mut u8, len)?;
                obj.set("width", width as i32)?;
                obj.set("height", height as i32)?;
                obj.set("pitch", pitch as i32)?;
                obj.set("format", format as i32)?;
                obj.set("data", buf)?;
            }
            handle.core.lock().video.consume();
        } else {
            obj.set("width", 0)?;
            obj.set("height", 0)?;
            obj.set("pitch", 0)?;
            obj.set("format", 0)?;
            let empty = unsafe { buffer::create_external_arraybuffer(&env, std::ptr::null_mut(), 0)? };
            obj.set("data", empty)?;
        }
        Ok(obj)
    }

    /// Legacy fallback that copies frame data into a new Vec.
    #[napi]
    pub fn get_frame(&self, core_id: i32) -> Result<FrameData> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;

        let frame = handle
            .core
            .lock()
            .video
            .get_frame();

        if let Some(frame) = frame {
            // For backward compat, convert to RGBA inline.
            let rgba = frame.to_rgba();
            Ok(FrameData {
                width: frame.width as i32,
                height: frame.height as i32,
                data: rgba,
            })
        } else {
            Ok(FrameData {
                width: 0,
                height: 0,
                data: vec![],
            })
        }
    }

    #[napi]
    pub fn get_av_info(&self, core_id: i32) -> Result<Option<AvInfo>> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;

        let av = handle.core.lock().av_info;
        if let Some(av) = av {
            Ok(Some(AvInfo {
                fps: av.timing.fps,
                sample_rate: av.timing.sample_rate,
                base_width: av.geometry.base_width as i32,
                base_height: av.geometry.base_height as i32,
                max_width: av.geometry.max_width as i32,
                max_height: av.geometry.max_height as i32,
                aspect_ratio: av.geometry.aspect_ratio as f64,
            }))
        } else {
            Ok(None)
        }
    }

    #[napi]
    pub fn unload(&self, core_id: i32) -> Result<bool> {
        let mut cores = self.cores.lock();
        let handle = cores
            .get_mut(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;
        if let Some(ref mut runner) = *handle.runner.lock() {
            runner.stop();
        }
        handle.core.lock().unload();
        Ok(true)
    }

    #[napi]
    pub fn unload_all(&self) -> Result<bool> {
        let mut cores = self.cores.lock();
        for handle in cores.iter_mut() {
            if let Some(ref mut runner) = *handle.runner.lock() {
                runner.stop();
            }
            handle.core.lock().unload();
        }
        cores.clear();
        Ok(true)
    }

    /// Attach a SharedArrayBuffer to a core for zero-copy frame delivery.
    /// The buffer must follow the SharedFrameBuffer ABI (see shared_buffer.rs).
    #[napi]
    pub fn attach_shared_buffer(&self, core_id: i32, buffer: JsArrayBuffer, env: Env) -> Result<bool> {
        let cores = self.cores.lock();
        let handle = cores
            .get(core_id as usize)
            .ok_or_else(|| Error::new(Status::InvalidArg, "Invalid core ID"))?;

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

        let sab = unsafe { shared_buffer::SharedFrameBuffer::from_raw(data_ptr as *mut u8, data_len) };
        sab.init(
            shared_buffer::DEFAULT_MAX_WIDTH,
            shared_buffer::DEFAULT_MAX_HEIGHT,
            shared_buffer::DEFAULT_SLOT_COUNT as u32,
        );

        handle.core.lock().video.set_shared_buffer(sab);
        Ok(true)
    }
}

impl Drop for LibretroFrontend {
    fn drop(&mut self) {
        let _ = self.unload_all();
    }
}
