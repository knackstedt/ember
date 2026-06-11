use crate::decoder::VideoDecoderBackend;
use gstreamer as gst;
use gstreamer_app as gst_app;
use gstreamer::prelude::{Cast, ElementExt, ElementExtManual, GstBinExt, GstBinExtManual, GstObjectExt, ObjectExt, PadExt, PluginFeatureExtManual};

pub struct GstreamerDecoder {
    pipeline: gst::Pipeline,
    appsink: gst_app::AppSink,
    bus: gst::Bus,
    native_width: u32,
    native_height: u32,
    duration_ms: i64,
    frame_rate: f64,
    needs_preroll: bool,
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

        // Build a decodebin pipeline that feeds into an appsink in NV12 format.
        // NV12 avoids CPU RGBA conversion; YUV→RGB is done in the WebGL shader.
        let pipeline_str = format!(
            "uridecodebin uri={uri} ! \
             videoconvert ! \
             video/x-raw,format=NV12 ! \
             appsink name=sink caps=video/x-raw,format=NV12",
        );

        let pipeline = gst::parse::launch(&pipeline_str)
            .map_err(|e| format!("Failed to create pipeline: {}", e))?
            .downcast::<gst::Pipeline>()
            .map_err(|_| "Pipeline is not a gst::Pipeline".to_string())?;

        let appsink = pipeline
            .by_name("sink")
            .ok_or("appsink not found in pipeline")?
            .downcast::<gst_app::AppSink>()
            .map_err(|_| "Element is not an AppSink".to_string())?;

        appsink.set_property("drop", false);
        appsink.set_property("max-buffers", 0u32);
        appsink.set_property("emit-signals", true);
        appsink.set_property("sync", true);

        let bus = pipeline.bus().ok_or("Pipeline has no bus")?;

        pipeline
            .set_state(gst::State::Paused)
            .map_err(|e| format!("Failed to pause pipeline: {}", e))?;

        // Wait for state change and caps negotiation so we can read video metadata.
        let timeout = gst::ClockTime::from_seconds(10);
        let (success, state, _) = pipeline.state(timeout);
        if success != Ok(gst::StateChangeSuccess::Success) {
            pipeline.set_state(gst::State::Null).ok();
            return Err(format!(
                "Pipeline failed to reach PAUSED state (got {:?})",
                state
            ));
        }

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

        // Extract caps to determine native resolution and frame rate.
        let (native_width, native_height, frame_rate, duration_ms) = {
            let sink_pad = appsink
                .static_pad("sink")
                .ok_or("appsink has no sink pad")?;
            let caps = sink_pad
                .current_caps()
                .ok_or("No negotiated caps yet")?;
            let s = caps.structure(0).ok_or("Empty caps")?;

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

            (width, height, fps, dur)
        };

        if native_width == 0 || native_height == 0 {
            pipeline.set_state(gst::State::Null).ok();
            return Err("Failed to negotiate video caps".to_string());
        }

        Ok(Self {
            pipeline,
            appsink,
            bus,
            native_width,
            native_height,
            duration_ms,
            frame_rate,
            needs_preroll: true,
        })
    }

    fn decode_frame_nv12(&mut self) -> Result<Option<(Vec<u8>, Vec<u8>)>, String> {
        if self.needs_preroll {
            self.pipeline
                .set_state(gst::State::Playing)
                .map_err(|e| format!("Failed to play pipeline: {}", e))?;
            self.needs_preroll = false;
        }

        let t0 = std::time::Instant::now();
        let sample = match self.appsink.pull_sample() {
            Ok(s) => s,
            Err(_) => return Ok(None), // EOS or other error -> end of stream
        };
        let t_pull = t0.elapsed().as_millis();

        let buffer = sample.buffer().ok_or("Sample has no buffer")?;
        let caps = sample.caps().ok_or("Sample has no caps")?;
        let s = caps.structure(0).ok_or("Empty caps")?;
        let width = s.get::<i32>("width").unwrap_or(self.native_width as i32) as u32;
        let height = s.get::<i32>("height").unwrap_or(self.native_height as i32) as u32;

        eprintln!("[video-decoder] pull_sample took {} ms | caps: {} | size: {}x{}",
            t_pull, caps, width, height);

        let t1 = std::time::Instant::now();
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
        let t_copy = t1.elapsed().as_millis();

        eprintln!("[video-decoder] buffer copy took {} ms | y={}B uv={}B", t_copy, y.len(), uv.len());

        Ok(Some((y, uv)))
    }

    fn seek(&mut self, timestamp_ms: i64) -> Result<(), String> {
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
        self.needs_preroll = true;
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

    fn close(&mut self) {
        self.pipeline.set_state(gst::State::Null).ok();
    }
}
