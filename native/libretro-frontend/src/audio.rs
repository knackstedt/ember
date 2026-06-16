use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct AudioSystem {
    sample_rate: Arc<Mutex<f64>>,
    buffer: Arc<Mutex<Vec<i16>>>,
    muted: Arc<AtomicBool>,
    _stream: Option<cpal::Stream>,
}

// SAFETY: The cpal::Stream is only used internally by cpal's audio thread.
// The only shared state is `buffer` which is already thread-safe (Arc<Mutex<Vec<i16>>>).
unsafe impl Send for AudioSystem {}

impl AudioSystem {
    pub fn new() -> Result<Self, String> {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or("No default audio output device")?;
        let config = device
            .default_output_config()
            .map_err(|e| format!("Failed to get default output config: {}", e))?;

        let buffer: Arc<Mutex<Vec<i16>>> = Arc::new(Mutex::new(Vec::with_capacity(32768)));
        let sample_rate = Arc::new(Mutex::new(config.sample_rate().0 as f64));
        let muted = Arc::new(AtomicBool::new(false));

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                let buffer_clone = buffer.clone();
                let muted_clone = muted.clone();
                device
                    .build_output_stream(
                        &config.config(),
                        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                            let mut buf = buffer_clone.lock();
                            let is_muted = muted_clone.load(Ordering::Relaxed);
                            for sample in data.iter_mut() {
                                if is_muted {
                                    if !buf.is_empty() {
                                        buf.remove(0);
                                    }
                                    *sample = 0.0;
                                } else if let Some(s) = buf.first() {
                                    *sample = (*s as f32 / 32768.0) * 0.8;
                                    buf.remove(0);
                                } else {
                                    *sample = 0.0;
                                }
                            }
                        },
                        |err| eprintln!("Audio stream error: {}", err),
                        None,
                    )
                    .map_err(|e| format!("Failed to build audio stream: {}", e))?
            }
            cpal::SampleFormat::I16 => {
                let buffer_clone = buffer.clone();
                let muted_clone = muted.clone();
                device
                    .build_output_stream(
                        &config.config(),
                        move |data: &mut [i16], _: &cpal::OutputCallbackInfo| {
                            let mut buf = buffer_clone.lock();
                            let is_muted = muted_clone.load(Ordering::Relaxed);
                            for sample in data.iter_mut() {
                                if is_muted {
                                    if !buf.is_empty() {
                                        buf.remove(0);
                                    }
                                    *sample = 0;
                                } else if let Some(s) = buf.first() {
                                    *sample = *s;
                                    buf.remove(0);
                                } else {
                                    *sample = 0;
                                }
                            }
                        },
                        |err| eprintln!("Audio stream error: {}", err),
                        None,
                    )
                    .map_err(|e| format!("Failed to build audio stream: {}", e))?
            }
            _ => {
                return Err("Unsupported audio sample format".to_string());
            }
        };

        stream.play().map_err(|e| format!("Failed to play audio stream: {}", e))?;

        Ok(Self {
            sample_rate,
            buffer,
            muted,
            _stream: Some(stream),
        })
    }

    pub fn set_sample_rate(&self, rate: f64) {
        *self.sample_rate.lock() = rate;
    }

    pub fn set_mute(&self, mute: bool) {
        self.muted.store(mute, Ordering::Relaxed);
    }

    pub fn push_samples(&self, samples: &[i16]) {
        let mut buf = self.buffer.lock();
        buf.extend_from_slice(samples);
        let len = buf.len();
        if len > 32768 {
            let remove_count = len - 32768;
            buf.drain(0..remove_count);
        }
    }
}
