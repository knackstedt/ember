use napi::bindgen_prelude::*;
use napi::sys;
use napi::{JsArrayBuffer, NapiValue};
use std::ffi::c_void;
use std::ptr;

extern "C" fn noop_finalizer(_env: sys::napi_env, _data: *mut c_void, _hint: *mut c_void) {
    // The underlying buffer is owned by FrameBuffer in Rust; do not free here.
}

/// Create a JsArrayBuffer backed by existing Rust memory without copying.
/// SAFETY: The caller must ensure `ptr` remains valid for the lifetime of the returned JsArrayBuffer.
pub unsafe fn create_external_arraybuffer(
    env: &Env,
    ptr: *mut u8,
    len: usize,
) -> Result<JsArrayBuffer> {
    let mut raw_value = ptr::null_mut();
    let status = if len == 0 {
        sys::napi_create_arraybuffer(env.raw(), 0, ptr::null_mut(), &mut raw_value)
    } else {
        sys::napi_create_external_arraybuffer(
            env.raw(),
            ptr.cast(),
            len,
            Some(noop_finalizer),
            ptr::null_mut(),
            &mut raw_value,
        )
    };
    check_status!(status)?;
    Ok(JsArrayBuffer::from_raw_unchecked(env.raw(), raw_value))
}
