use crate::decoder::VideoDecoderBackend;

// ffmpeg-next's scaling::Context contains a raw *mut SwsContext which is
// not Send.  We wrap it so the FfmpegDecoder can still be Send.
struct SendableScaler(ffmpeg_next::software::scaling::Context);
unsafe impl Send for SendableScaler {}

pub struct FfmpegDecoder {
    input: ffmpeg_next::format::context::Input,
    stream_index: usize,
    decoder: ffmpeg_next::codec::decoder::Video,
    scaler: Option<SendableScaler>,
    hw_enabled: bool,
    native_width: u32,
    native_height: u32,
    duration_ms: i64,
    frame_rate: f64,
    scaler_dst_width: u32,
    scaler_dst_height: u32,
}

impl VideoDecoderBackend for FfmpegDecoder {
    fn open(path: &str) -> Result<Self, String> {
        ffmpeg_next::init().map_err(|e| format!("FFmpeg init failed: {}", e))?;

        let input = ffmpeg_next::format::input(&path)
            .map_err(|e| format!("Failed to open {}: {}", path, e))?;

        let stream = input
            .streams()
            .best(ffmpeg_next::media::Type::Video)
            .ok_or_else(|| "No video stream found".to_string())?;

        let stream_index = stream.index();
        let parameters = stream.parameters();
        let codec_id = parameters.id();

        // Try NVDEC hardware decoder first, fall back to software.
        let hw_decoder_name = hw_decoder_name_for_codec(codec_id);
        let (decoder, hw_enabled) = if let Some(hw_name) = hw_decoder_name {
            open_hw_decoder(&parameters, &hw_name)
        } else {
            None
        }
        .map(|d| (d, true))
        .unwrap_or_else(|| {
            let decoder = ffmpeg_next::codec::context::Context::from_parameters(parameters)
                .expect("valid params")
                .decoder()
                .video()
                .expect("video decoder");
            (decoder, false)
        });

        let native_width = decoder.width();
        let native_height = decoder.height();

        let duration_ms = input.duration() as i64 / 1000; // AV_TIME_BASE = 1_000_000
        let frame_rate = stream.rate().0 as f64 / stream.rate().1 as f64;

        Ok(Self {
            input,
            stream_index,
            decoder,
            scaler: None,
            hw_enabled,
            native_width,
            native_height,
            duration_ms,
            frame_rate,
            scaler_dst_width: 0,
            scaler_dst_height: 0,
        })
    }

    fn decode_frame_nv12(&mut self) -> Result<Option<(Vec<u8>, Vec<u8>)>, String> {
        let dst_width = self.native_width;
        let dst_height = self.native_height;

        if self.scaler.is_none() || self.scaler_dst_width != dst_width || self.scaler_dst_height != dst_height {
            self.scaler = Some(
                SendableScaler(
                    ffmpeg_next::software::scaling::Context::get(
                        self.decoder.format(),
                        self.native_width,
                        self.native_height,
                        ffmpeg_next::format::Pixel::NV12,
                        dst_width,
                        dst_height,
                        ffmpeg_next::software::scaling::Flags::FAST_BILINEAR,
                    )
                    .map_err(|e| format!("Scaler creation failed: {}", e))?
                ),
            );
            self.scaler_dst_width = dst_width;
            self.scaler_dst_height = dst_height;
        }

        let scaler = &mut self.scaler.as_mut().unwrap().0;

        loop {
            match self.input.packets().next() {
                Some((stream, packet)) => {
                    if stream.index() != self.stream_index {
                        continue;
                    }
                    self.decoder.send_packet(&packet)
                        .map_err(|e| format!("Send packet failed: {}", e))?;

                    let mut frame = ffmpeg_next::frame::Video::empty();
                    match self.decoder.receive_frame(&mut frame) {
                        Ok(()) => {
                            let mut nv12 = ffmpeg_next::frame::Video::empty();
                            nv12.set_format(ffmpeg_next::format::Pixel::NV12);
                            nv12.set_width(dst_width);
                            nv12.set_height(dst_height);

                            scaler.run(&frame, &mut nv12)
                                .map_err(|e| format!("Scale failed: {}", e))?;

                            let y_stride = nv12.stride(0);
                            let uv_stride = nv12.stride(1);
                            let y_data = nv12.data(0);
                            let uv_data = nv12.data(1);

                            let y_size = y_stride * dst_height as usize;
                            let uv_size = uv_stride * dst_height as usize / 2;

                            let y = y_data[..y_size].to_vec();
                            let uv = uv_data[..uv_size].to_vec();

                            return Ok(Some((y, uv)));
                        }
                        Err(ffmpeg_next::Error::Eof) => return Ok(None),
                        Err(ffmpeg_next::Error::Other { errno }) if errno == 11 => {
                            // EAGAIN, need more packets
                            continue;
                        }
                        Err(e) => return Err(format!("Receive frame failed: {}", e)),
                    }
                }
                None => return Ok(None),
            }
        }
    }

    fn seek(&mut self, timestamp_ms: i64) -> Result<(), String> {
        let ts = timestamp_ms * 1000; // convert to FFmpeg time_base units (microseconds)
        self.input.seek(ts, ts..)
            .map_err(|e| format!("Seek failed: {}", e))?;
        self.scaler = None;
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
        if self.hw_enabled {
            "ffmpeg-nvdec"
        } else {
            "ffmpeg"
        }
    }

    fn close(&mut self) {
        // Resources dropped automatically.
    }
}

// ---------------------------------------------------------------------------
//  Hardware acceleration helpers
// ---------------------------------------------------------------------------

fn hw_decoder_name_for_codec(codec_id: ffmpeg_next::codec::Id) -> Option<&'static str> {
    match codec_id {
        ffmpeg_next::codec::Id::H264 => Some("h264_cuvid"),
        ffmpeg_next::codec::Id::HEVC => Some("hevc_cuvid"),
        ffmpeg_next::codec::Id::AV1 => Some("av1_cuvid"),
        ffmpeg_next::codec::Id::MPEG2VIDEO => Some("mpeg2_cuvid"),
        ffmpeg_next::codec::Id::MPEG4 => Some("mpeg4_cuvid"),
        ffmpeg_next::codec::Id::VP8 => Some("vp8_cuvid"),
        ffmpeg_next::codec::Id::VP9 => Some("vp9_cuvid"),
        _ => None,
    }
}

fn open_hw_decoder(
    parameters: &ffmpeg_next::codec::Parameters,
    hw_name: &str,
) -> Option<ffmpeg_next::codec::decoder::Video> {
    let hw_codec = ffmpeg_next::codec::decoder::find_by_name(hw_name)?;
    if !hw_codec.is_decoder() {
        return None;
    }

    let context = ffmpeg_next::codec::context::Context::from_parameters(parameters.clone()).ok()?;
    let decoder = context.decoder();
    let opened = decoder.open_as(hw_codec).ok()?;
    let video = opened.video().ok()?;
    Some(video)
}
