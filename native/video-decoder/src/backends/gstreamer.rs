use crate::decoder::VideoDecoderBackend;
use gstreamer as gst;
use gstreamer_app as gst_app;
use gstreamer::prelude::{Cast, ElementExt, ElementExtManual, GstBinExtManual, GstObjectExt, PadExt, PluginFeatureExtManual};
use gstreamer_video as gst_video;

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

        // Boost every known hardware decoder above software alternatives so that
        // uridecodebin prefers them.  We try both the legacy gstreamer-vaapi names
        // (vaapih26Xdec) and the newer GStreamer-1.20+ VA plug-in (vah26Xdec /
        // vavp9dec), Intel Quick Sync (msdkh26Xdec), and NVIDIA NVDEC (nvh26Xdec /
        // nvav1dec).  Elements that are not installed are silently skipped.
        fn boost_rank(name: &str) {
            if let Some(factory) = gst::ElementFactory::find(name) {
                factory.set_rank(gst::Rank::PRIMARY + 100);
                eprintln!("[GStreamer] hardware decoder available: {}", name);
            }
        }
        // Legacy gstreamer-vaapi (gstreamer1.0-vaapi package)
        boost_rank("vaapih265dec");
        boost_rank("vaapih264dec");
        boost_rank("vaapiav1dec");
        boost_rank("vaapivp9dec");
        boost_rank("vaapivp8dec");
        // New GStreamer-1.20+ VA plug-in (gstreamer1.0-plugins-bad on modern distros)
        boost_rank("vah265dec");
        boost_rank("vah264dec");
        boost_rank("vavp9dec");
        boost_rank("vavp8dec");
        boost_rank("vaav1dec");
        // Intel Quick Sync / Media SDK (gstreamer1.0-plugins-bad, requires libmfx)
        boost_rank("msdkh265dec");
        boost_rank("msdkh264dec");
        boost_rank("qsvh265dec");
        boost_rank("qsvh264dec");
        // NVIDIA NVDEC (gstreamer1.0-plugins-bad with CUDA support)
        boost_rank("nvh265dec");
        boost_rank("nvh264dec");
        boost_rank("nvav1dec");
        boost_rank("nvvp9dec");

        // Build pipeline programmatically so we can route both audio and video.
        let uridecodebin = gst::ElementFactory::make("uridecodebin")
            .property("uri", &uri)
            .build()
            .map_err(|e| format!("Failed to create uridecodebin: {}", e))?;

        // One buffer in the video queue so the decoder cannot run more than one
        // frame ahead of the display clock.  Fewer buffers = less CPU wasted on
        // speculative decoding that will be dropped before it is ever shown.
        let vq = gst::ElementFactory::make("queue")
            .property("max-size-buffers", 1u32)
            .property("max-size-bytes", 0u32)    // unlimited; let buffer count limit
            .property("max-size-time", 0u64)     // unlimited
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
            // 1 buffer with drop=false: appsink back-pressures the pipeline so
            // the decoder only runs when we are ready to consume the frame.
            // This prevents the GStreamer threads from burning CPU decoding
            // frames faster than wall-clock time, which is the main cause of
            // 90-100% CPU during software-decoded playback.
            .property("max-buffers", 1u32)
            .property("drop", false)
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

        // Recursively log all elements.  At depth > 0 (inside uridecodebin)
        // we look for the actual video-decoder element and call it out clearly
        // so the user can tell whether hardware or software decoding is active.
        fn log_elements(el: &gst::Element, depth: usize) {
            let fname = el.factory().map(|f| f.name().to_string()).unwrap_or_default();
            let indent = "  ".repeat(depth);

            // Classify the element
            let hw_names = ["vaapi", "vah26", "vavp", "vaav", "nvh26", "nvav", "nvvp",
                             "msdk", "qsv", "d3d11", "cudah"];
            let sw_names = ["avdec_h265", "avdec_h264", "avdec_vp9", "avdec_vp8",
                             "openh264", "theoradec", "vp8dec", "vp9dec"];
            let is_hw = hw_names.iter().any(|p| fname.contains(p));
            let is_sw_codec = sw_names.iter().any(|p| fname.starts_with(p));

            eprintln!("[GStreamer] {}{}", indent, fname);

            if is_hw {
                eprintln!("[GStreamer] ✔ HARDWARE decoder in use: {} — expect low CPU", fname);
            } else if is_sw_codec {
                eprintln!("[GStreamer] ✘ SOFTWARE decoder in use: {} — expect high CPU.", fname);
                eprintln!("[GStreamer]   Install hardware-decode GStreamer plug-ins to reduce CPU:");
                eprintln!("[GStreamer]     Intel/AMD VA-API : sudo apt install gstreamer1.0-vaapi");
                eprintln!("[GStreamer]     or newer VA plug-in : sudo apt install gstreamer1.0-plugins-bad");
                eprintln!("[GStreamer]     NVIDIA NVDEC     : sudo apt install gstreamer1.0-plugins-bad (with CUDA)");
            }

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

        // Use VideoInfo to get the real stride and plane offsets.  The caps
        // "stride" field we tried before does not exist — it only lives in
        // GstVideoMeta.  For hardware-decoded padded buffers, falling back to
        // width silently corrupts the UV plane (reads trailing Y padding as UV).
        let info = gst_video::VideoInfo::from_caps(&caps)
            .map_err(|e| format!("Failed to parse video info from caps: {}", e))?;
        let y_stride = info.stride()[0] as usize;
        let uv_stride = info.stride()[1] as usize;
        let y_offset = info.offset()[0] as usize;
        let uv_offset = info.offset()[1] as usize;
        let w = width as usize;
        let h = height as usize;

        if y_stride != w || uv_stride != w {
            eprintln!(
                "[GStreamer] padded buffer: stride_y={} stride_uv={} width={}",
                y_stride, uv_stride, w
            );
        }

        let mut y = Vec::with_capacity(w * h);
        let mut uv = Vec::with_capacity(w * h / 2);
        for row in 0..h {
            let src_start = y_offset + row * y_stride;
            y.extend_from_slice(&data[src_start..src_start + w]);
        }
        for row in 0..h / 2 {
            let src_start = uv_offset + row * uv_stride;
            uv.extend_from_slice(&data[src_start..src_start + w]);
        }

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

        let info = gst_video::VideoInfo::from_caps(&caps)
            .map_err(|e| format!("Failed to parse video info from caps: {}", e))?;
        let y_stride = info.stride()[0] as usize;
        let uv_stride = info.stride()[1] as usize;
        let y_offset = info.offset()[0] as usize;
        let uv_offset = info.offset()[1] as usize;
        let w = width as usize;
        let h = height as usize;

        if y_stride != w || uv_stride != w {
            eprintln!(
                "[GStreamer] padded buffer: stride_y={} stride_uv={} width={}",
                y_stride, uv_stride, w
            );
        }

        let y_tight = w * h;
        let uv_tight = w * h / 2;
        if y_buf.len() < y_tight || uv_buf.len() < uv_tight {
            return Err(format!(
                "Output buffer too small: need {}+{} have {}+{}",
                y_tight, uv_tight, y_buf.len(), uv_buf.len()
            ));
        }

        for row in 0..h {
            let src_start = y_offset + row * y_stride;
            let dst_start = row * w;
            y_buf[dst_start..dst_start + w].copy_from_slice(&data[src_start..src_start + w]);
        }
        for row in 0..h / 2 {
            let src_start = uv_offset + row * uv_stride;
            let dst_start = row * w;
            uv_buf[dst_start..dst_start + w].copy_from_slice(&data[src_start..src_start + w]);
        }

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
