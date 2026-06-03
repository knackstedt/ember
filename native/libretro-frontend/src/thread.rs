use crate::core::CoreInstance;
use parking_lot::Mutex;
use std::sync::Arc;
use std::thread::{spawn, JoinHandle};

pub struct CoreRunner {
    handle: Option<JoinHandle<()>>,
    running: Arc<std::sync::atomic::AtomicBool>,
}

impl CoreRunner {
    pub fn new(core: Arc<Mutex<CoreInstance>>) -> Self {
        let running = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let running_clone = running.clone();

        let video = core.lock().video.clone();
        let audio = core.lock().audio.clone();
        let input = core.lock().input.clone();
        let variables = core.lock().variables.clone();
        let pixel_format = core.lock().pixel_format.clone();
        let running_tl = core.lock().running.clone();

        let handle = spawn(move || {
            // Set thread-local state for callbacks
            crate::core::TL_VIDEO.with(|v| *v.borrow_mut() = Some(video.clone()));
            crate::core::TL_AUDIO.with(|a| *a.borrow_mut() = Some(audio.clone()));
            crate::core::TL_INPUT.with(|i| *i.borrow_mut() = Some(input.clone()));
            crate::core::TL_PIXEL_FORMAT.with(|p| *p.borrow_mut() = *pixel_format.lock());
            crate::core::TL_VARIABLES.with(|v| *v.borrow_mut() = Some(variables.clone()));
            crate::core::TL_RUNNING.with(|r| *r.borrow_mut() = Some(running_tl.clone()));

            let fps = core
                .lock()
                .av_info
                .as_ref()
                .map(|av| av.timing.fps)
                .unwrap_or(60.0)
                .max(1.0);
            let frame_time = std::time::Duration::from_secs_f64(1.0 / fps);

            while running_clone.load(std::sync::atomic::Ordering::Relaxed) {
                let start = std::time::Instant::now();
                core.lock().run_frame();
                let elapsed = start.elapsed();
                if elapsed < frame_time {
                    std::thread::sleep(frame_time - elapsed);
                }
            }
        });

        Self {
            handle: Some(handle),
            running,
        }
    }

    pub fn stop(&mut self) {
        self.running.store(false, std::sync::atomic::Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            handle.join().ok();
        }
    }
}
