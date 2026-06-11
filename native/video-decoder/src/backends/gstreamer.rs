use crate::decoder::VideoDecoderBackend;
use gstreamer as gst;
use gstreamer_app as gst_app;
use gstreamer::prelude::{Cast, ElementExt, ElementExtManual, GstBinExtManual, GstObjectExt, PadExt, PluginFeatureExtManual};

pub struct GstreamerDecoder {
    pipeline: gst::Pipeline,
    appsink: gst_app::AppSink,
    bus: gst::Bus,
    native_width: u32,
    native_height: u32,
    duration_ms: i64,
    frame_rate: f64,
    /// Colorimetry string from the negotiated caps (e.g. "bt709", "bt601",
    /// or "2:4:5:1").  Forwarded to the WebGL renderer so it can pick the
    /// correct YCbCr→RGB matrix.
    colorimetry: String,
    /// Pixel aspect ratio — numerator and denominator.  Most modern content
    /// has square pixels (1:1).  Anamorphic sources (e.g. 1440×1080 with
    /// PAR 4:3) need the display width adjusted accordingly.
    par_n: u32,
    par_d: u32,
    /// True when the next decode call should use pull_preroll() to get the
    /// first frame at a new seek position without waiting for clock sync.
    needs_preroll: bool,
    /// Whether the pipeline was in Playing state before the last seek.
    /// Used to restore the correct state after the seek thumbnail is rendered.
    preroll_was_playing: bool,
    /// Tracks the intended pipeline state so seek() can restore it correctly.
    is_playing: bool,
}

impl VideoDecoderBackend for GstreamerDecoder {
    fn open(path: &str) -> Result<Self, String> {
        // Enable all VAAPI drivers (Intel/AMD) before GStreamer init.
        std::env::set_var("GST_VAAPI_ALL_DRIVERS", "1");
        gst::init().map_err(|e| format!("GStreamer init failed: {}", e))?;

        let uri = if path.starts_with("http://") || path.starts_with("https://") || path.starts_with("file://") {
            path.to_string()
        } else {
            let abs_path = std::path::Path::new(path)
                .canonicalize()
                .map_err(|e| format!("Invalid path: {}", e))?;
            format!("file://{}", abs_path.display())
        };

        // Boost VAAPI decoder rank above software decoders so uridecodebin picks them.
        fn boost_rank(name: &str) {
            if let Some(factory) = gst::ElementFactory::find(name) {
                factory.set_rank(gst::Rank::PRIMARY + 100);
            }
        }
        boost_rank("vaapih265dec");
        boost_rank("vaapih264dec");
        boost_rank("nvh265dec");
        boost_rank("nvh264dec");

        // Build pipeline programmatically so we can route both audio and video.
        let uridecodebin = gst::ElementFactory::make("uridecodebin")
            .property("uri", &uri)
            .build()
            .map_err(|e| format!("Failed to create uridecodebin: {}", e))?;

        let vq = gst::ElementFactory::make("queue")
            .property("max-size-buffers", 3u32)
            .build()
            .map_err(|e| format!("Failed to create video queue: {}", e))?;
        let vconv = gst::ElementFactory::make("videoconvert")
            .build()
            .map_err(|e| format!("Failed to create videoconvert: {}", e))?;
        let appsink_el = gst::ElementFactory::make("appsink")
            .property("caps", &gst::Caps::builder("video/x-raw").field("format", "NV12").build())
            // Limit the internal queue to 2 frames and drop the oldest when full.
            // Without this limit, frames accumulate without bound when the pipeline
            // is left in Playing state but nobody calls pull_sample() (e.g. after a
            // seek while paused), causing an OOM crash in the renderer process.
            .property("max-buffers", 2u32)
            .property("drop", true)
            .property("emit-signals", true)
            .property("sync", true)
            .build()
            .map_err(|e| format!("Failed to create appsink: {}", e))?;
        let appsink = appsink_el.clone()
            .downcast::<gst_app::AppSink>()
            .map_err(|_| "Element is not an AppSink".to_string())?;

        let aq = gst::ElementFactory::make("queue")
            .build()
            .map_err(|e| format!("Failed to create audio queue: {}", e))?;
        let aconv = gst::ElementFactory::make("audioconvert")
            .build()
            .map_err(|e| format!("Failed to create audioconvert: {}", e))?;
        let ares = gst::ElementFactory::make("audioresample")
            .build()
            .map_err(|e| format!("Failed to create audioresample: {}", e))?;
        let asink = gst::ElementFactory::make("autoaudiosink")
            .build()
            .map_err(|e| format!("Failed to create autoaudiosink: {}", e))?;

        let pipeline = gst::Pipeline::new();
        pipeline.add_many([
            &uridecodebin, &vq, &vconv, &appsink_el,
            &aq, &aconv, &ares, &asink,
        ]).map_err(|e| format!("Failed to add elements: {}", e))?;

        vq.link(&vconv).map_err(|e| format!("Failed to link video queue: {}", e))?;
        vconv.link(&appsink_el).map_err(|e| format!("Failed to link videoconvert: {}", e))?;
        aq.link(&aconv).map_err(|e| format!("Failed to link audio queue: {}", e))?;
        aconv.link(&ares).map_err(|e| format!("Failed to link audioconvert: {}", e))?;
        ares.link(&asink).map_err(|e| format!("Failed to link audioresample: {}", e))?;

        let vq_clone = vq.clone();
        let aq_clone = aq.clone();
        uridecodebin.connect_pad_added(move |_, src_pad| {
            if src_pad.is_linked() {
                return;
            }
            let name = src_pad.current_caps()
                .and_then(|c| c.structure(0).map(|s| s.name().as_str().to_string()))
                .unwrap_or_default();
            if name.starts_with("video/") {
                let sink_pad = vq_clone.static_pad("sink")
                    .expect("video queue has no sink pad");
                if let Err(e) = src_pad.link(&sink_pad) {
                    eprintln!("[GStreamer] video pad link failed: {:?}", e);
                }
            } else if name.starts_with("audio/") {
                let sink_pad = aq_clone.static_pad("sink")
                    .expect("audio queue has no sink pad");
                if let Err(e) = src_pad.link(&sink_pad) {
                    eprintln!("[GStreamer] audio pad link failed: {:?}", e);
                }
            }
        });

        let bus = pipeline.bus().ok_or("Pipeline has no bus")?;

        // Transition to PAUSED.  Caps negotiation and preroll happen during the
        // PAUSED state, so we never need to go to PLAYING here.  Keeping the
        // pipeline in PAUSED until the caller explicitly calls resume() prevents
        // audio from leaking out before playback starts and eliminates all
        // frame accumulation during initialisation.
        if let Err(e) = pipeline.set_state(gst::State::Paused) {
            pipeline.set_state(gst::State::Null).ok();
            return Err(format!("Failed to pause pipeline: {}", e));
        }

        let timeout = gst::ClockTime::from_seconds(10);
        let (success, state, _) = pipeline.state(timeout);
        if success != Ok(gst::StateChangeSuccess::Success) {
            pipeline.set_state(gst::State::Null).ok();
            return Err(format!(
                "Pipeline failed to reach PAUSED state (got {:?})",
                state
            ));
        }

        // Caps are fully negotiated once the pipeline has prerolled into PAUSED.
        // Read them directly from the appsink's sink pad — no polling needed.
        let sink_pad = match appsink.static_pad("sink") {
            Some(p) => p,
            None => {
                pipeline.set_state(gst::State::Null).ok();
                return Err("appsink has no sink pad".to_string());
            }
        };
        let caps = match sink_pad.current_caps() {
            Some(c) => c,
            None => {
                pipeline.set_state(gst::State::Null).ok();
                return Err("No caps on appsink sink pad after PAUSED — video stream may be unsupported".to_string());
            }
        };
        let s = match caps.structure(0) {
            Some(s) => s,
            None => {
                pipeline.set_state(gst::State::Null).ok();
                return Err("Empty caps structure on appsink".to_string());
            }
        };

        // Recursively log all elements so we can see the actual decoder inside uridecodebin.
        fn log_elements(el: &gst::Element, depth: usize) {
            let name = el.factory().map(|f| f.name().to_string()).unwrap_or_default();
            let indent = "  ".repeat(depth);
            eprintln!("[GStreamer] {}{}", indent, name);
            if let Ok(bin) = el.clone().downcast::<gst::Bin>() {
                for iter in bin.iterate_elements() {
                    if let Ok(child) = iter {
                        log_elements(&child, depth + 1);
                    }
                }
            }
        }
        log_elements(pipeline.upcast_ref::<gst::Element>(), 0);

        // Extract metadata from the already-negotiated caps.
        let width = s.get::<i32>("width").unwrap_or(0) as u32;
        let height = s.get::<i32>("height").unwrap_or(0) as u32;
        let fps = s
            .get::<gst::Fraction>("framerate")
            .map(|f| f.numer() as f64 / f.denom() as f64)
            .unwrap_or(0.0);
        let dur = pipeline
            .query_duration::<gst::ClockTime>()
            .map(|t| t.mseconds() as i64)
            .unwrap_or(0);

        // Colorimetry string — forwarded to the JS shader so it can choose
        // the right YCbCr→RGB matrix and range.  Log it for diagnostics.
        let colorimetry = s.get::<String>("colorimetry")
            .unwrap_or_else(|_| "bt709".to_string());

        // Pixel-aspect-ratio (PAR).  Most content is 1:1 (square pixels).
        // Anamorphic sources (e.g. 1440×1080 @ 4:3 PAR) need the display
        // width corrected to par_n/par_d * coded_width.
        let (par_n, par_d) = s.get::<gst::Fraction>("pixel-aspect-ratio")
            .map(|f| (f.numer().max(1) as u32, f.denom().max(1) as u32))
            .unwrap_or((1, 1));

        eprintln!(
            "[GStreamer] caps: {}x{} @ {:.3} fps | colorimetry={} | PAR={}/{}",
            width, height, fps, colorimetry, par_n, par_d
        );

        if width == 0 || height == 0 {
            pipeline.set_state(gst::State::Null).ok();
            return Err("Failed to negotiate video caps — width or height is zero".to_string());
        }

        Ok(Self {
            pipeline,
            appsink,
            bus,
            native_width: width,
            native_height: height,
            duration_ms: dur,
            frame_rate: fps,
            colorimetry,
            par_n,
            par_d,
            // Pipeline is intentionally left in PAUSED.  Audio does NOT play
            // until resume() is called by the JS pump.  No frames are produced,
            // so there is nothing to accumulate during initialisation.
            needs_preroll: false,
            preroll_was_playing: false,
            is_playing: false,
        })
    }

    fn decode_frame_nv12(&mut self) -> Result<Option<(Vec<u8>, Vec<u8>)>, String> {
        // Drain bus messages so they don't accumulate.
        while let Some(msg) = self.bus.pop() {
            match msg.view() {
                gstreamer::MessageView::Error(err) => {
                    eprintln!("[GStreamer] bus error: {:?}", err.error());
                }
                _ => {}
            }
        }

        let sample = if self.needs_preroll {
            // After a seek the pipeline needs to preroll at the new position.
            // Wait for Paused state (preroll complete) then pull_preroll() so
            // we get the seek-thumbnail frame without needing the clock to run.
            let timeout = gst::ClockTime::from_seconds(5);
            let (res, _, _) = self.pipeline.state(timeout);
            if res.is_err() {
                eprintln!("[GStreamer] preroll state wait timed out");
            }
            let sample = match self.appsink.pull_preroll() {
                Ok(s) => s,
                Err(_) => return Ok(None),
            };
            // Restore the pipeline to its intended state.
            if self.preroll_was_playing {
                self.pipeline
                    .set_state(gst::State::Playing)
                    .map_err(|e| format!("Failed to resume pipeline after preroll: {}", e))?;
            }
            self.needs_preroll = false;
            sample
        } else {
            match self.appsink.pull_sample() {
                Ok(s) => s,
                Err(_) => return Ok(None), // EOS or other error -> end of stream
            }
        };

        let buffer = sample.buffer().ok_or("Sample has no buffer")?;
        let caps = sample.caps().ok_or("Sample has no caps")?;
        let s = caps.structure(0).ok_or("Empty caps")?;
        let width = s.get::<i32>("width").unwrap_or(self.native_width as i32) as u32;
        let height = s.get::<i32>("height").unwrap_or(self.native_height as i32) as u32;

        let map = buffer.map_readable().map_err(|e| format!("Buffer map failed: {:?}", e))?;
        let data = map.as_slice();

        let stride_y = s.get::<i32>("stride")
            .ok()
            .map(|v| v as usize)
            .unwrap_or(width as usize);
        let y_size = stride_y * height as usize;
        let uv_size = stride_y * height as usize / 2;

        let y = data[..y_size.min(data.len())].to_vec();
        let uv = data[y_size..(y_size + uv_size).min(data.len())].to_vec();

        Ok(Some((y, uv)))
    }

    fn decode_frame_nv12_into(
        &mut self,
        y_buf: &mut [u8],
        uv_buf: &mut [u8],
    ) -> Result<Option<(u32, u32)>, String> {
        // Drain bus messages so they don't accumulate in memory.
        while let Some(msg) = self.bus.pop() {
            match msg.view() {
                gstreamer::MessageView::Error(err) => {
                    eprintln!("[GStreamer] bus error: {:?}", err.error());
                }
                _ => {}
            }
        }

        let sample = if self.needs_preroll {
            // After a seek the pipeline needs to preroll at the new position.
            // Wait for Paused state (preroll complete) then pull_preroll() so
            // we get the seek-thumbnail frame without needing the clock to run.
            let timeout = gst::ClockTime::from_seconds(5);
            let (res, _, _) = self.pipeline.state(timeout);
            if res.is_err() {
                eprintln!("[GStreamer] preroll state wait timed out");
            }
            let sample = match self.appsink.pull_preroll() {
                Ok(s) => s,
                Err(_) => return Ok(None),
            };
            // Restore the pipeline to its intended state.
            // If the user was playing before the seek, resume audio/video now.
            // If the user was paused, leave the pipeline in Paused so audio
            // does NOT restart and frames do NOT accumulate in the appsink.
            if self.preroll_was_playing {
                self.pipeline
                    .set_state(gst::State::Playing)
                    .map_err(|e| format!("Failed to resume pipeline after preroll: {}", e))?;
            }
            self.needs_preroll = false;
            sample
        } else {
            match self.appsink.pull_sample() {
                Ok(s) => s,
                Err(_) => return Ok(None),
            }
        };

        let buffer = sample.buffer().ok_or("Sample has no buffer")?;
        let caps = sample.caps().ok_or("Sample has no caps")?;
        let s = caps.structure(0).ok_or("Empty caps")?;
        let width = s.get::<i32>("width").unwrap_or(self.native_width as i32) as u32;
        let height = s.get::<i32>("height").unwrap_or(self.native_height as i32) as u32;

        let map = buffer.map_readable().map_err(|e| format!("Buffer map failed: {:?}", e))?;
        let data = map.as_slice();

        let stride_y = s.get::<i32>("stride")
            .ok()
            .map(|v| v as usize)
            .unwrap_or(width as usize);
        let y_size = stride_y * height as usize;
        let uv_size = stride_y * height as usize / 2;

        let y_src = &data[..y_size.min(data.len())];
        let uv_src = &data[y_size..(y_size + uv_size).min(data.len())];

        if y_buf.len() < y_src.len() || uv_buf.len() < uv_src.len() {
            return Err("Output buffer too small".to_string());
        }

        y_buf[..y_src.len()].copy_from_slice(y_src);
        uv_buf[..uv_src.len()].copy_from_slice(uv_src);

        Ok(Some((width, height)))
    }

    fn seek(&mut self, timestamp_ms: i64) -> Result<(), String> {
        // Remember the intended play state so the preroll step can restore it.
        // This prevents audio from restarting when the user seeks while paused.
        self.preroll_was_playing = self.is_playing;

        let time = gst::ClockTime::from_mseconds((timestamp_ms as u64).into());
        let seek_event = gst::event::Seek::new(
            1.0,
            gst::SeekFlags::FLUSH | gst::SeekFlags::KEY_UNIT,
            gst::SeekType::Set,
            time,
            gst::SeekType::Set,
            gst::ClockTime::NONE,
        );
        self.pipeline
            .send_event(seek_event)
            .then_some(())
            .ok_or("Seek event was not handled".to_string())?;

        // If the pipeline was Playing, GStreamer transitions it through Paused
        // (flush/preroll) and then back to Playing automatically.  Force it to
        // Paused so the preroll step can use pull_preroll() and then decide
        // whether to go back to Playing based on preroll_was_playing.
        if self.is_playing {
            self.pipeline
                .set_state(gst::State::Paused)
                .map_err(|e| format!("Failed to pause pipeline for seek: {}", e))?;
        }

        self.needs_preroll = true;
        Ok(())
    }

    fn pause(&mut self) -> Result<(), String> {
        self.is_playing = false;
        self.pipeline
            .set_state(gst::State::Paused)
            .map_err(|e| format!("Failed to pause pipeline: {}", e))?;
        Ok(())
    }

    fn resume(&mut self) -> Result<(), String> {
        self.is_playing = true;
        self.pipeline
            .set_state(gst::State::Playing)
            .map_err(|e| format!("Failed to resume pipeline: {}", e))?;
        Ok(())
    }

    fn duration_ms(&self) -> i64 {
        self.duration_ms
    }

    fn frame_rate(&self) -> f64 {
        self.frame_rate
    }

    fn video_width(&self) -> u32 {
        self.native_width
    }

    fn video_height(&self) -> u32 {
        self.native_height
    }

    fn backend_name(&self) -> &'static str {
        "gstreamer"
    }

    fn colorimetry(&self) -> &str {
        &self.colorimetry
    }

    fn par_n(&self) -> u32 { self.par_n }
    fn par_d(&self) -> u32 { self.par_d }

    fn close(&mut self) {
        self.pipeline.set_state(gst::State::Null).ok();
        // Wait for state change to complete so audio stops immediately.
        let _ = self.pipeline.state(gst::ClockTime::from_mseconds(500));
    }
}

impl Drop for GstreamerDecoder {
    fn drop(&mut self) {
        // Safety net: ensure the GStreamer pipeline is fully stopped even if
        // close() was never called (e.g. the VideoDecoder JS object was GC'd
        // without an explicit destroy(), or open() returned Err partway through
        // and the struct was dropped as a local variable).  Without this, the
        // internal GStreamer threads hold a GLib ref to the pipeline and keep
        // it alive indefinitely — audio plays in the background and, with a
        // Playing pipeline, decoded frames can accumulate unboundedly.
        self.pipeline.set_state(gst::State::Null).ok();
    }
}
