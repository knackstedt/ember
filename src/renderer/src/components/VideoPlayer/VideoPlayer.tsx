import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  VolumeX,
  Volume1,
  Volume2,
  Maximize,
  X,
} from "lucide-react";
import { useVideoPlayerStore } from "../../store/videoPlayer.store";
import { useInputStore } from "../../store/input.store";
import { useSettingsStore } from "../../store/settings.store";
import { shouldClearProgress } from "../../../../shared/progress";
import { useMoviesStore } from "../../store/media.store";
import { useNativeVideo, shouldUseNativeDecoder } from "./useNativeVideo";

const INACTIVITY_MS = 3000;
const PROGRESS_SAVE_INTERVAL_MS = 180000; // 3 minutes

function fmt(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function deriveSubtitleUrls(videoSrc: string): string[] {
  if (videoSrc.startsWith("ember://remote/")) {
    const base = videoSrc.replace(/\.[^.]+$/, "");
    return [`${base}.vtt`, `${base}.srt`];
  }
  const base = videoSrc.replace(/^file:\/\//, "").replace(/^ember:\/\/media\/?/, "").replace(/\.[^.]+$/, "");
  return [`ember://media/${base}.vtt`, `ember://media/${base}.srt`];
}

export const VideoPlayer: React.FC = () => {
  const { src, title, movieId, watchProgress, close } = useVideoPlayerStore();
  const updateMovieProgress = useMoviesStore((s) => s.updateProgress);
  const lastEvent = useInputStore((s) => s.lastEvent);

  const videoRef = useRef<HTMLVideoElement>(null);
  const nativeCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasResumed = useRef(false);
  const lastProgressRef = useRef<{ movieId: string; pct: number } | null>(null);

  const useNative = !!src && shouldUseNativeDecoder(src);
  const native = useNativeVideo(src, nativeCanvasRef, watchProgress ?? undefined);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [subtitleTracks, setSubtitleTracks] = useState<TextTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<number>(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seeking, setSeeking] = useState(false);

  // Unified state from either backend
  const isPlaying = useNative ? native.state.playing : playing;
  const currentTimeDisplay = useNative ? native.state.currentTime : currentTime;
  const durationDisplay = useNative ? native.state.duration : duration;
  const errorDisplay = useNative ? native.state.error : null;

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      if (!seeking) setControlsVisible(false);
    }, INACTIVITY_MS);
  }, [seeking]);

  useEffect(() => {
    showControls();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  // Standard <video> element event handlers
  useEffect(() => {
    if (useNative) return;
    const v = videoRef.current;
    if (!v) return;
    const onPlay = (): void => setPlaying(true);
    const onPause = (): void => setPlaying(false);
    const onTime = (): void => {
      setCurrentTime(v.currentTime);
      if (v.buffered.length > 0)
        setBuffered(v.buffered.end(v.buffered.length - 1));
      if (movieId && v.duration > 0 && isFinite(v.duration)) {
        lastProgressRef.current = {
          movieId,
          pct: v.currentTime / v.duration,
        };
      }
    };
    const onDuration = (): void => {
      const dur = isFinite(v.duration) ? v.duration : 0;
      setDuration(dur);
      if (!hasResumed.current && movieId && watchProgress != null && dur > 0) {
        const target = watchProgress * dur;
        if (target > 0 && target < dur - 1) {
          v.currentTime = target;
        }
        hasResumed.current = true;
      }
    };
    const onTracksChange = (): void => {
      const tracks = Array.from(v.textTracks);
      setSubtitleTracks(tracks);
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDuration);
    v.textTracks.addEventListener("change", onTracksChange);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDuration);
      v.textTracks.removeEventListener("change", onTracksChange);
    };
  }, [src, movieId, watchProgress, useNative]);

  useEffect(() => {
    const onFs = (): void => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Load persisted volume from settings when a video opens.
  useEffect(() => {
    if (!src) return;
    const saved = useSettingsStore.getState().settings?.volume ?? 1;
    setVolumeState(saved);
    setMuted(saved === 0);
    if (!useNative) {
      const v = videoRef.current;
      if (v) {
        v.volume = saved;
        v.muted = saved === 0;
      }
    }
    // For native, the volume will be applied once the decoder init completes
    // (see the native state sync effect below).
  }, [src, useNative]);

  // Standard video src setup
  useEffect(() => {
    if (!src || useNative) return;
    hasResumed.current = false;
    const v = videoRef.current;
    if (!v) return;

    const onCanPlay = (): void => {
      v.play().catch((err: Error) => {
        if (err.name !== "AbortError") {
          console.error("Video play failed:", err.name, err.message);
        }
      });
    };
    const onError = (): void => {
      const videoErr = v.error;
      console.error(
        "Video error:",
        videoErr?.code ?? "unknown",
        videoErr?.message ?? "no message",
      );
    };
    v.addEventListener("canplay", onCanPlay, { once: true });
    v.addEventListener("error", onError);
    v.src = src;

    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setPlaying(false);
    setActiveSubtitle(-1);

    if (progressSaveTimer.current) clearInterval(progressSaveTimer.current);
    progressSaveTimer.current = setInterval(() => {
      if (movieId && v.duration > 0 && isFinite(v.duration)) {
        const pct = v.currentTime / v.duration;
        lastProgressRef.current = { movieId, pct };
        void window.htpc.movies.setProgress(movieId, pct);
        updateMovieProgress(movieId, pct);
      }
    }, PROGRESS_SAVE_INTERVAL_MS);

    const onBeforeUnload = (): void => {
      const last = lastProgressRef.current;
      if (last?.movieId && window.htpc.movies.setProgressSync) {
        window.htpc.movies.setProgressSync(last.movieId, last.pct);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const removeSaveStateListener = window.htpc.onSaveState?.(() => {
      const last = lastProgressRef.current;
      if (last?.movieId) {
        void window.htpc.movies.setProgress(last.movieId, last.pct);
      }
    });

    return () => {
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("error", onError);
      window.removeEventListener("beforeunload", onBeforeUnload);
      removeSaveStateListener?.();
      if (progressSaveTimer.current) clearInterval(progressSaveTimer.current);
      // Stop and fully release the media element so that if the next video
      // uses the native decoder (useNative = true) the HTML5 pipeline doesn't
      // keep running in the background — producing a second audio track and
      // holding Chromium media buffers in memory.
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, [src, movieId, updateMovieProgress, useNative]);

  // When switching to native decoder mode make sure the HTML5 <video> element
  // is fully stopped, even if the standard-video cleanup hasn't run yet
  // (e.g. src went from a non-native file directly to a native file in a
  // single store update without going through null).
  useEffect(() => {
    if (!useNative) return;
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.removeAttribute("src");
    v.load();
  }, [useNative]);

  // Sync native decoder volume/mute to local UI state so the controls
  // reflect reality (especially on first open / config change).
  useEffect(() => {
    if (!useNative) return;
    setVolumeState(native.state.volume);
    setMuted(native.state.muted);
  }, [useNative, native.state.volume, native.state.muted]);

  // Apply persisted volume to native decoder once it finishes init.
  useEffect(() => {
    if (!useNative || !native.state.ready) return;
    const saved = useSettingsStore.getState().settings?.volume ?? 1;
    if (Math.abs(saved - native.state.volume) > 0.01) {
      native.controls.setVolume(saved);
    }
    if (saved === 0 && !native.state.muted) {
      native.controls.setMuted(true);
    }
  }, [useNative, native.state.ready]);

  // Native video progress save (best-effort)
  useEffect(() => {
    if (!useNative || !src) return;
    if (progressSaveTimer.current) clearInterval(progressSaveTimer.current);
    progressSaveTimer.current = setInterval(() => {
      if (movieId && native.state.duration > 0) {
        const pct = native.state.currentTime / native.state.duration;
        lastProgressRef.current = { movieId, pct };
        void window.htpc.movies.setProgress(movieId, pct);
        updateMovieProgress(movieId, pct);
      }
    }, PROGRESS_SAVE_INTERVAL_MS);

    const onBeforeUnload = (): void => {
      const last = lastProgressRef.current;
      if (last?.movieId && window.htpc.movies.setProgressSync) {
        window.htpc.movies.setProgressSync(last.movieId, last.pct);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const removeSaveStateListener = window.htpc.onSaveState?.(() => {
      const last = lastProgressRef.current;
      if (last?.movieId) {
        void window.htpc.movies.setProgress(last.movieId, last.pct);
      }
    });

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      removeSaveStateListener?.();
      if (progressSaveTimer.current) clearInterval(progressSaveTimer.current);
    };
  }, [src, movieId, updateMovieProgress, useNative, native.state.duration, native.state.currentTime]);

  const handleClose = useCallback(async () => {
    // Native decoder cleanup is handled by useNativeVideo's useEffect return.
    if (movieId) {
      let current = 0;
      let dur = 0;
      if (useNative) {
        current = native.state.currentTime;
        dur = native.state.duration;
      } else {
        const v = videoRef.current;
        if (v && v.duration > 0 && isFinite(v.duration)) {
          current = v.currentTime;
          dur = v.duration;
        }
      }
      if (dur > 0) {
        if (shouldClearProgress(current, dur)) {
          await window.htpc.movies.setProgress(movieId, null);
          updateMovieProgress(movieId, null);
        } else {
          const pct = current / dur;
          await window.htpc.movies.setProgress(movieId, pct);
          updateMovieProgress(movieId, pct);
        }
      }
    }
    close();
  }, [movieId, close, updateMovieProgress, useNative, native.state.currentTime, native.state.duration, native.controls]);

  useEffect(() => {
    if (!lastEvent || !src) return;
    const { type, action } = lastEvent;
    if (type !== "button_press") return;
    showControls();
    if (action === "south") {
      if (useNative) native.controls.toggle();
      else {
        const v = videoRef.current;
        if (v) playing ? v.pause() : void v.play();
      }
    } else if (action === "east") {
      handleClose();
    } else if (action === "dpad_left") {
      const target = Math.max(0, currentTimeDisplay - 10);
      if (useNative) native.controls.seek(target);
      else {
        const v = videoRef.current;
        if (v) v.currentTime = target;
      }
    } else if (action === "dpad_right") {
      const target = Math.min(durationDisplay || 0, currentTimeDisplay + 10);
      if (useNative) native.controls.seek(target);
      else {
        const v = videoRef.current;
        if (v) v.currentTime = target;
      }
    } else if (action === "dpad_up") {
      if (!useNative) {
        const v = videoRef.current;
        if (v) {
          const newVol = Math.min(1, v.volume + 0.1);
          v.volume = newVol;
          setVolumeState(newVol);
        }
      }
    } else if (action === "dpad_down") {
      if (!useNative) {
        const v = videoRef.current;
        if (v) {
          const newVol = Math.max(0, v.volume - 0.1);
          v.volume = newVol;
          setVolumeState(newVol);
        }
      }
    }
  }, [lastEvent, src, useNative, native.controls, playing, currentTimeDisplay, durationDisplay, showControls, handleClose]);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent): void => {
      showControls();
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (useNative) native.controls.toggle();
        else {
          const v = videoRef.current;
          if (v) playing ? v.pause() : void v.play();
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const target = Math.max(0, currentTimeDisplay - 10);
        if (useNative) native.controls.seek(target);
        else {
          const v = videoRef.current;
          if (v) v.currentTime = target;
        }
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        const target = Math.min(durationDisplay || 0, currentTimeDisplay + 10);
        if (useNative) native.controls.seek(target);
        else {
          const v = videoRef.current;
          if (v) v.currentTime = target;
        }
      } else if (e.code === "Escape") {
        handleClose();
      } else if (e.code === "KeyM" && !useNative) {
        const v = videoRef.current;
        if (v) {
          v.muted = !v.muted;
          setMuted(v.muted);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, playing, handleClose, showControls, useNative, native.controls, currentTimeDisplay, durationDisplay]);

  const togglePlay = (): void => {
    if (useNative) {
      native.controls.toggle();
    } else {
      const v = videoRef.current;
      if (!v) return;
      playing ? v.pause() : void v.play();
    }
  };

  const persistVolume = useCallback((vol: number, isMuted: boolean) => {
    const effective = isMuted ? 0 : vol;
    void useSettingsStore.getState().update({ volume: effective });
  }, []);

  const toggleMute = (): void => {
    if (useNative) {
      const next = !native.state.muted;
      native.controls.setMuted(next);
      setMuted(next);
      persistVolume(native.state.volume, next);
    } else {
      const v = videoRef.current;
      if (!v) return;
      v.muted = !v.muted;
      setMuted(v.muted);
      persistVolume(v.volume, v.muted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = parseFloat(e.target.value);
    if (useNative) {
      native.controls.setVolume(val);
      setVolumeState(val);
      if (val > 0 && native.state.muted) {
        native.controls.setMuted(false);
        setMuted(false);
      }
      persistVolume(val, val === 0);
    } else {
      const v = videoRef.current;
      if (!v) return;
      v.volume = val;
      setVolumeState(val);
      if (val > 0 && v.muted) {
        v.muted = false;
        setMuted(false);
      }
      persistVolume(val, val === 0);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = parseFloat(e.target.value);
    if (useNative) {
      native.controls.seek(val);
    } else {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = val;
      setCurrentTime(v.currentTime);
    }
  };

  const handleSubtitleChange = (idx: number): void => {
    if (useNative) {
      const track = native.state.subtitleTracks[idx];
      if (track) {
        native.controls.selectSubtitleTrack(track.id);
      } else {
        native.controls.selectSubtitleTrack(null);
      }
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    Array.from(v.textTracks).forEach((t, i) => {
      t.mode = i === idx ? "showing" : "hidden";
    });
    setActiveSubtitle(idx);
  };

  const handleAudioChange = (id: number): void => {
    if (useNative) {
      native.controls.selectAudioTrack(id >= 0 ? id : null);
    }
  };

  const handleChapterChange = (idx: number): void => {
    if (useNative) {
      native.controls.selectChapter(idx);
    }
  };

  const handleSpeedChange = (speed: number): void => {
    if (useNative) {
      native.controls.setSpeed(speed);
    }
  };

  const toggleFullscreen = (): void => {
    if (!document.fullscreenElement) {
      void containerRef.current?.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  const subtitleUrls = src ? deriveSubtitleUrls(src) : [];

  if (!src) return null;

  const bufferedPct = durationDisplay > 0 ? (buffered / durationDisplay) * 100 : 0;
  const currentPct = durationDisplay > 0 ? (currentTimeDisplay / durationDisplay) * 100 : 0;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "#000",
        cursor: controlsVisible ? "default" : "none",
      }}
      onMouseMove={showControls}
      onMouseDown={showControls}
    >
      {useNative ? (
        <canvas
          ref={nativeCanvasRef}
          id={native.canvasId}
          style={{ width: "100%", height: "100%", display: "block" }}
          onClick={togglePlay}
        />
      ) : (
        <video
          ref={videoRef}
          style={{ width: "100%", height: "100%", display: "block" }}
          crossOrigin="anonymous"
          onClick={togglePlay}
        >
          {subtitleUrls.map((url, i) => (
            <track key={url} kind="subtitles" src={url} default={i === 0} />
          ))}
        </video>
      )}

      {errorDisplay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
          }}
        >
          <div
            className="text-sm"
            style={{
              color: "#ff5555",
              background: "rgba(0,0,0,0.8)",
              padding: "12px 20px",
              borderRadius: 8,
              maxWidth: "80%",
              textAlign: "center",
            }}
          >
            {errorDisplay}
          </div>
        </div>
      )}

      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            key="controls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background:
                "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)",
              padding: "0 20px 16px",
            }}
            onMouseEnter={() => {
              if (inactivityTimer.current)
                clearTimeout(inactivityTimer.current);
            }}
            onMouseLeave={showControls}
          >
            {/* Title */}
            <div
              className="text-sm font-medium mb-3 truncate"
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              {title}
              {useNative && native.state.backend && (
                <span
                  className="ml-2 text-xs"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  ({native.state.backend})
                </span>
              )}
            </div>

            {/* Seek bar */}
            <div className="relative mb-3" style={{ height: 4 }}>
              {!useNative && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    height: "100%",
                    width: `${bufferedPct}%`,
                    background: "rgba(255,255,255,0.25)",
                    borderRadius: 2,
                    pointerEvents: "none",
                  }}
                />
              )}
              <input
                type="range"
                min={0}
                max={durationDisplay || 100}
                step={0.5}
                value={currentTimeDisplay}
                onMouseDown={() => setSeeking(true)}
                onMouseUp={() => {
                  setSeeking(false);
                  showControls();
                }}
                onChange={handleSeekChange}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  margin: 0,
                  padding: 0,
                  opacity: 0,
                  cursor: "pointer",
                  zIndex: 2,
                }}
                aria-label="Seek"
              />
              {/* Filled track */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: `${currentPct}%`,
                  background: "var(--accent, #fff)",
                  borderRadius: 2,
                  pointerEvents: "none",
                }}
              />
              {/* Track bg */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 2,
                  zIndex: -1,
                }}
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-3">
              {/* Back/close */}
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/20 transition-colors text-base"
                style={{ color: "#fff", flexShrink: 0 }}
                aria-label="Close player"
                title="Close (Esc)"
              >
                <X size={16} />
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="w-9 h-9 flex items-center justify-center rounded-full transition-colors font-bold"
                style={{
                  background: "var(--accent, rgba(255,255,255,0.9))",
                  color: "#000",
                  flexShrink: 0,
                }}
                aria-label={isPlaying ? "Pause" : "Play"}
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>

              {/* Time display */}
              <span
                className="text-xs tabular-nums flex-shrink-0"
                style={{ color: "rgba(255,255,255,0.8)" }}
              >
                {fmt(currentTimeDisplay)} / {fmt(durationDisplay)}
              </span>

              <div className="flex-1" />

              {/* Subtitle selector */}
              {useNative ? (
                native.state.subtitleTracks.length > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className="text-xs"
                      style={{ color: "rgba(255,255,255,0.6)" }}
                    >
                      CC
                    </span>
                    <select
                      value={native.state.activeSubtitleId ?? -1}
                      onChange={(e) => {
                        const id = parseInt(e.target.value);
                        native.controls.selectSubtitleTrack(id >= 0 ? id : null);
                      }}
                      className="text-xs rounded px-1 py-0.5"
                      style={{
                        background: "rgba(0,0,0,0.7)",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.3)",
                        maxWidth: 100,
                      }}
                      aria-label="Subtitle track"
                    >
                      <option value={-1}>Off</option>
                      {native.state.subtitleTracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title || t.lang || `Track ${t.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              ) : (
                subtitleTracks.length > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className="text-xs"
                      style={{ color: "rgba(255,255,255,0.6)" }}
                    >
                      CC
                    </span>
                    <select
                      value={activeSubtitle}
                      onChange={(e) =>
                        handleSubtitleChange(parseInt(e.target.value))
                      }
                      className="text-xs rounded px-1 py-0.5"
                      style={{
                        background: "rgba(0,0,0,0.7)",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.3)",
                        maxWidth: 100,
                      }}
                      aria-label="Subtitle track"
                    >
                      <option value={-1}>Off</option>
                      {subtitleTracks.map((t, i) => (
                        <option key={i} value={i}>
                          {t.label || t.language || `Track ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              )}

              {/* Audio track selector */}
              {useNative && native.state.audioTracks.length > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    Audio
                  </span>
                  <select
                    value={native.state.activeAudioId ?? -1}
                    onChange={(e) =>
                      handleAudioChange(parseInt(e.target.value))
                    }
                    className="text-xs rounded px-1 py-0.5"
                    style={{
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.3)",
                      maxWidth: 120,
                    }}
                    aria-label="Audio track"
                  >
                    {native.state.audioTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title || t.lang || `Track ${t.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Chapter selector */}
              {useNative && native.state.chapters.length > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    Chapter
                  </span>
                  <select
                    value={native.state.currentChapter}
                    onChange={(e) =>
                      handleChapterChange(parseInt(e.target.value))
                    }
                    className="text-xs rounded px-1 py-0.5"
                    style={{
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.3)",
                      maxWidth: 120,
                    }}
                    aria-label="Chapter"
                  >
                    {native.state.chapters.map((c) => (
                      <option key={c.index} value={c.index}>
                        {c.title || `Chapter ${c.index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Speed control */}
              {useNative && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    Speed
                  </span>
                  <select
                    value={native.state.speed}
                    onChange={(e) =>
                      handleSpeedChange(parseFloat(e.target.value))
                    }
                    className="text-xs rounded px-1 py-0.5"
                    style={{
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.3)",
                      maxWidth: 80,
                    }}
                    aria-label="Playback speed"
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                  </select>
                </div>
              )}

              {/* Volume */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={toggleMute}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/20 transition-colors text-sm"
                  style={{ color: "#fff" }}
                  aria-label={muted ? "Unmute" : "Mute"}
                  title="Mute (M)"
                >
                  {muted || volume === 0 ? <VolumeX size={16} /> : volume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 cursor-pointer"
                  style={{ accentColor: "var(--accent, #fff)" }}
                  aria-label="Volume"
                />
              </div>

              {/* Fullscreen toggle */}
              <button
                onClick={toggleFullscreen}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/20 transition-colors text-base"
                style={{ color: "#fff", flexShrink: 0 }}
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                <Maximize size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
