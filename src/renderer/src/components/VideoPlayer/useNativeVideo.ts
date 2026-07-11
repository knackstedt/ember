/**
 * React hook for the native video renderer.
 *
 * Supports both mpv worker (child process) and ffmpeg child-process fallback.
 * Frames are rendered proactively in the preload context; this hook just
 * pumps the RAF loop and manages playback state.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface SubtitleTrack {
  id: number;
  title?: string;
  lang?: string;
  selected?: boolean;
  default?: boolean;
}

export interface AudioTrack {
  id: number;
  title?: string;
  lang?: string;
  selected?: boolean;
  default?: boolean;
}

export interface Chapter {
  index: number;
  title: string;
  timeMs: number;
}

export interface MissingDependencyInfo {
  packageId: string;
  displayName: string;
  description: string;
}

export interface NativeVideoState {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  width: number;
  height: number;
  error: string | null;
  ready: boolean;
  backend?: string;
  missingDependency: MissingDependencyInfo | null;
  subtitleTracks: SubtitleTrack[];
  activeSubtitleId: number | null;
  audioTracks: AudioTrack[];
  activeAudioId: number | null;
  chapters: Chapter[];
  currentChapter: number;
  volume: number;
  muted: boolean;
  speed: number;
}

export interface NativeVideoControls {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  setSpeed(s: number): void;
  selectSubtitleTrack(trackId: number | null): void;
  selectAudioTrack(trackId: number | null): void;
  selectChapter(idx: number): void;
  loadExternalSubtitle(path: string): Promise<void>;
}

function generateId(): string {
  return `nv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stableId(src: string | null): string {
  if (!src) return generateId();
  let h = 0;
  for (let i = 0; i < src.length; i++) {
    h = ((h << 5) - h + src.charCodeAt(i)) | 0;
  }
  return `dec-${Math.abs(h).toString(36)}`;
}

export function shouldUseNativeDecoder(src: string | null): boolean {
  return !!src;
}

function detectMissingDependency(errorMsg: string): MissingDependencyInfo | null {
  const lower = errorMsg.toLowerCase();
  if (
    lower.includes("ffmpeg") && (lower.includes("not installed") || lower.includes("enoent")) ||
    lower.includes("ffprobe") && (lower.includes("not installed") || lower.includes("enoent")) ||
    lower.includes("spawn ffprobe") ||
    lower.includes("spawn ffmpeg")
  ) {
    return {
      packageId: "apt-ffmpeg",
      displayName: "FFmpeg",
      description: "FFmpeg is required for video playback. It provides the ffprobe and ffmpeg tools used to decode and render video files.",
    };
  }
  if (lower.includes("libmpv") || lower.includes("mpv") && (lower.includes("not available") || lower.includes("not found"))) {
    return {
      packageId: "apt-libmpv-dev",
      displayName: "libmpv",
      description: "libmpv is required for the native video decoder. Install it to enable hardware-accelerated video playback with subtitle and multi-track audio support.",
    };
  }
  if (lower.includes("gstreamer") || lower.includes("libavcodec") || lower.includes("libavformat")) {
    return {
      packageId: "apt-gstreamer-libav",
      displayName: "GStreamer libav plugin",
      description: "GStreamer codec plugins are required for decoding certain video formats. Install the GStreamer libav plugin to enable playback.",
    };
  }
  return null;
}

export function useNativeVideo(
  src: string | null,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  resumeProgress?: number,
  retryCount?: number
): { state: NativeVideoState; controls: NativeVideoControls; canvasId: string } {
  const decoderId = stableId(src);
  const canvasId = `native-video-${decoderId}`;

  const rafRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const userPausedRef = useRef(false);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const frameRateRef = useRef(30);
  const pumpGenRef = useRef(0);
  const lastStateUpdateRef = useRef(0);
  const lastFramePresentRef = useRef(0);
  const metadataRef = useRef<{ width: number; height: number; frameRate: number } | null>(null);
  const openedRef = useRef(false);

  const [state, setState] = useState<NativeVideoState>({
    playing: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    width: 0,
    height: 0,
    error: null,
    ready: false,
    missingDependency: null,
    subtitleTracks: [],
    activeSubtitleId: null,
    audioTracks: [],
    activeAudioId: null,
    chapters: [],
    currentChapter: -1,
    volume: 1,
    muted: false,
    speed: 1,
  });

  const updateState = useCallback((patch: Partial<NativeVideoState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Initialize decoder + open file
  useEffect(() => {
    if (!src || !shouldUseNativeDecoder(src)) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    userPausedRef.current = false;

    async function init() {
      if (!src) return;
      try {
        await window.htpc.videoDecoder.create(decoderId);
        if (cancelled) return;

        let resolved = src;
        if (src.startsWith("ember://remote/")) {
          resolved = await window.htpc.videoDecoder.resolveUrl(src);
        } else if (src.startsWith("ember://media/")) {
          resolved = src.slice("ember://media/".length);
        } else if (!src.startsWith("/") && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("file://")) {
          resolved = await window.htpc.videoDecoder.resolveUrl(src);
          if (resolved.startsWith("ember://remote/")) {
            resolved = await window.htpc.videoDecoder.resolveUrl(resolved);
          }
        }
        if (
          resolved &&
          !resolved.startsWith("/") &&
          !resolved.startsWith("http://") &&
          !resolved.startsWith("https://") &&
          !resolved.startsWith("file://") &&
          !resolved.startsWith("ember://")
        ) {
          resolved = await window.htpc.videoDecoder.resolveUrl(resolved);
          if (resolved.startsWith("ember://remote/")) {
            resolved = await window.htpc.videoDecoder.resolveUrl(resolved);
          }
        }

        if (cancelled) return;

        await window.htpc.videoDecoder.open(decoderId, resolved);
        openedRef.current = true;

        const meta = await window.htpc.videoDecoder.getMetadata(decoderId);
        frameRateRef.current = meta.frameRate || 30;
        metadataRef.current = {
          width: meta.width,
          height: meta.height,
          frameRate: meta.frameRate,
        };

        if (cancelled) return;

        window.htpc.videoDecoder.attachCanvas(decoderId, canvasId);
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        window.htpc.videoDecoder.resizeCanvas(decoderId, rect.width, rect.height);

        // Fetch tracks and chapters (mpv only).
        let subtitleTracks: SubtitleTrack[] = [];
        let activeSubtitleId: number | null = null;
        let audioTracks: AudioTrack[] = [];
        let activeAudioId: number | null = null;
        let chapters: Chapter[] = [];
        let currentChapter = -1;
        let volume = 100;
        let muted = false;
        let speed = 1;

        try {
          subtitleTracks = await window.htpc.videoDecoder.listSubtitleTracks(decoderId);
          activeSubtitleId = subtitleTracks.find((t) => t.selected)?.id ?? null;
        } catch { /* ignore */ }

        try {
          audioTracks = await window.htpc.videoDecoder.listAudioTracks(decoderId);
          activeAudioId = audioTracks.find((t) => t.selected)?.id ?? null;
        } catch { /* ignore */ }

        try {
          chapters = await window.htpc.videoDecoder.listChapters(decoderId);
          currentChapter = await window.htpc.videoDecoder.getChapter(decoderId);
        } catch { /* ignore */ }

        try {
          volume = await window.htpc.videoDecoder.getVolume(decoderId);
          muted = await window.htpc.videoDecoder.getMute(decoderId);
          speed = await window.htpc.videoDecoder.getSpeed(decoderId);
        } catch { /* ignore */ }

        // Discover and load external sidecar subtitles.
        try {
          const subPaths = await window.htpc.videoDecoder.resolveSubtitlePaths(resolved);
          for (const subPath of subPaths) {
            await window.htpc.videoDecoder.loadExternalSubtitle(decoderId, subPath);
          }
          subtitleTracks = await window.htpc.videoDecoder.listSubtitleTracks(decoderId);
          activeSubtitleId = subtitleTracks.find((t) => t.selected)?.id ?? null;
        } catch { /* ignore */ }

        updateState({
          duration: meta.durationMs / 1000,
          width: meta.width,
          height: meta.height,
          ready: true,
          error: null,
          subtitleTracks,
          activeSubtitleId,
          audioTracks,
          activeAudioId,
          chapters,
          currentChapter,
          volume: volume / 100,
          muted,
          speed,
        });

        // Resume from saved progress if provided and within reasonable bounds.
        if (
          typeof resumeProgress === "number" &&
          resumeProgress > 0.01 &&
          resumeProgress < 0.95 &&
          meta.durationMs > 0
        ) {
          const resumeMs = Math.floor(resumeProgress * meta.durationMs);
          if (resumeMs > 0) {
            try {
              await window.htpc.videoDecoder.seek(decoderId, resumeMs);
              pausedAtRef.current = resumeMs;
            } catch { /* ignore resume errors */ }
          }
        }

        play();
      } catch (err: any) {
        const msg = err.message || String(err);
        updateState({ error: msg, ready: false, missingDependency: detectMissingDependency(msg) });
      }
    }

    init();

    // Watch for canvas resizes and propagate the new pixel size to mpv.
    let resizeObserver: ResizeObserver | null = null;
    if (canvas) {
      resizeObserver = new ResizeObserver((entries) => {
        if (!openedRef.current) return;
        const entry = entries[0];
        if (!entry) return;
        const rect = entry.contentRect;
        window.htpc.videoDecoder.resizeCanvas(decoderId, rect.width, rect.height);
      });
      resizeObserver.observe(canvas);
    }

    return () => {
      cancelled = true;
      pumpGenRef.current++;
      playingRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      resizeObserver?.disconnect();
      // Only destroy the decoder if we successfully opened it.
      // If cleanup fires between create and open (e.g. due to a re-render
      // race), destroying would prevent init() from completing.
      if (openedRef.current) {
        window.htpc.videoDecoder.destroy(decoderId);
        openedRef.current = false;
      }
    };
  }, [src, decoderId, canvasRef, updateState, retryCount]);

  // Frame pump via requestAnimationFrame.
  const pump = useCallback(() => {
    if (!playingRef.current) return;

    const myGen = pumpGenRef.current;

    try {
      const now = performance.now();
      const frameInterval = 1000 / frameRateRef.current;
      const elapsed = now - lastFramePresentRef.current;

      if (elapsed >= frameInterval) {
        lastFramePresentRef.current = now - (elapsed % frameInterval);
        window.htpc.videoDecoder.renderNextFrame(decoderId);
      }

      // Check for mpv EOF / error events.
      const mpvEvent = window.htpc.videoDecoder.getMpvEvent?.(decoderId);
      if (mpvEvent === "end-file" || mpvEvent === "error") {
        playingRef.current = false;
        updateState({ playing: false });
        return;
      }

      if (now - lastStateUpdateRef.current > 250) {
        lastStateUpdateRef.current = now;
        const decoderTime = window.htpc.videoDecoder.getCurrentTime(decoderId);
        if (typeof decoderTime === "number" && decoderTime > 0) {
          setState((prev) => ({
            ...prev,
            currentTime: Math.min(decoderTime / 1000, prev.duration),
          }));
        } else {
          const elapsedPlay = now - startTimeRef.current;
          const currentTime = (pausedAtRef.current + elapsedPlay) / 1000;
          setState((prev) => ({
            ...prev,
            currentTime: Math.min(currentTime, prev.duration),
          }));
          window.htpc.videoDecoder.setCurrentTime(decoderId, Math.floor(pausedAtRef.current + elapsedPlay));
        }
      }

      if (playingRef.current && myGen === pumpGenRef.current) {
        rafRef.current = requestAnimationFrame(pump);
      }
    } catch (err: any) {
      console.error("[NativeVideo] decode error:", err);
      playingRef.current = false;
      const msg = err.message || String(err);
      updateState({ playing: false, error: msg, missingDependency: detectMissingDependency(msg) });
    }
  }, [decoderId, updateState]);

  const play = useCallback(() => {
    if (playingRef.current) return;
    playingRef.current = true;
    userPausedRef.current = false;
    startTimeRef.current = performance.now();
    lastFramePresentRef.current = performance.now();
    pumpGenRef.current++;
    lastStateUpdateRef.current = 0;
    window.htpc.videoDecoder.resume(decoderId);
    updateState({ playing: true });
    pump();
  }, [pump, updateState, decoderId]);

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    userPausedRef.current = true;
    pausedAtRef.current += performance.now() - startTimeRef.current;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    window.htpc.videoDecoder.setCurrentTime(decoderId, Math.floor(pausedAtRef.current));
    window.htpc.videoDecoder.pause(decoderId);
    updateState({ playing: false });
  }, [updateState, decoderId]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [play, pause]);

  const seek = useCallback(
    async (time: number) => {
      const ms = Math.max(0, Math.floor(time * 1000));
      pausedAtRef.current = ms;
      startTimeRef.current = performance.now();
      lastFramePresentRef.current = performance.now();
      pumpGenRef.current++;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      try {
        await window.htpc.videoDecoder.seek(decoderId, ms);
        updateState({ currentTime: time });
        if (playingRef.current) {
          pump();
        } else {
          await window.htpc.videoDecoder.pause(decoderId);
        }
      } catch (err: any) {
        console.error("[NativeVideo] seek failed:", err);
        updateState({ error: err.message || String(err) });
      }
    },
    [decoderId, updateState, pump]
  );

  const setVolume = useCallback(
    async (v: number) => {
      try {
        await window.htpc.videoDecoder.setVolume(decoderId, v * 100);
        updateState({ volume: v });
      } catch (err: any) {
        console.error("[NativeVideo] setVolume failed:", err);
      }
    },
    [decoderId, updateState]
  );

  const setMuted = useCallback(
    async (m: boolean) => {
      try {
        await window.htpc.videoDecoder.setMute(decoderId, m);
        updateState({ muted: m });
      } catch (err: any) {
        console.error("[NativeVideo] setMute failed:", err);
      }
    },
    [decoderId, updateState]
  );

  const setSpeed = useCallback(
    async (s: number) => {
      try {
        await window.htpc.videoDecoder.setSpeed(decoderId, s);
        updateState({ speed: s });
        if (metadataRef.current) {
          frameRateRef.current = metadataRef.current.frameRate * s;
        }
      } catch (err: any) {
        console.error("[NativeVideo] setSpeed failed:", err);
      }
    },
    [decoderId, updateState]
  );

  const selectSubtitleTrack = useCallback(
    async (trackId: number | null) => {
      try {
        const id = trackId ?? -1;
        await window.htpc.videoDecoder.selectSubtitleTrack(decoderId, id);
        updateState({ activeSubtitleId: trackId });
      } catch (err: any) {
        console.error("[NativeVideo] selectSubtitleTrack failed:", err);
      }
    },
    [decoderId, updateState]
  );

  const selectAudioTrack = useCallback(
    async (trackId: number | null) => {
      try {
        const id = trackId ?? -1;
        await window.htpc.videoDecoder.selectAudioTrack(decoderId, id);
        updateState({ activeAudioId: trackId });
      } catch (err: any) {
        console.error("[NativeVideo] selectAudioTrack failed:", err);
      }
    },
    [decoderId, updateState]
  );

  const selectChapter = useCallback(
    async (idx: number) => {
      try {
        await window.htpc.videoDecoder.setChapter(decoderId, idx);
        // mpv automatically seeks to the chapter start; fetch the new time.
        const timeMs = window.htpc.videoDecoder.getCurrentTime(decoderId);
        if (typeof timeMs === "number") {
          pausedAtRef.current = timeMs;
          updateState({ currentChapter: idx, currentTime: timeMs / 1000 });
        } else {
          updateState({ currentChapter: idx });
        }
      } catch (err: any) {
        console.error("[NativeVideo] selectChapter failed:", err);
      }
    },
    [decoderId, updateState]
  );

  const loadExternalSubtitle = useCallback(
    async (path: string) => {
      try {
        await window.htpc.videoDecoder.loadExternalSubtitle(decoderId, path);
        const tracks = await window.htpc.videoDecoder.listSubtitleTracks(decoderId);
        const active = tracks.find((t) => t.selected);
        updateState({ subtitleTracks: tracks, activeSubtitleId: active ? active.id : null });
      } catch (err: any) {
        console.error("[NativeVideo] loadExternalSubtitle failed:", err);
      }
    },
    [decoderId, updateState]
  );

  return {
    state,
    controls: {
      play,
      pause,
      toggle,
      seek,
      setVolume,
      setMuted,
      setSpeed,
      selectSubtitleTrack,
      selectAudioTrack,
      selectChapter,
      loadExternalSubtitle,
    },
    canvasId,
  };
}
