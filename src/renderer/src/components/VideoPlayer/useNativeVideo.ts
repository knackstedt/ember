/**
 * React hook for the native libmpv video renderer.
 *
 * Decode and WebGL rendering happen entirely in the preload context
 * so no frame data crosses the Electron context bridge.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface NativeVideoState {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  width: number;
  height: number;
  error: string | null;
  ready: boolean;
}

export interface NativeVideoControls {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  setVolume(v: number): void;
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
  if (!src) return false;
  const lower = src.toLowerCase();
  const unsupportedExts = [".mkv", ".avi", ".wmv", ".ts", ".m2ts", ".vob", ".iso", ".mpeg", ".mpg"];
  if (unsupportedExts.some((ext) => lower.endsWith(ext))) return true;
  if (lower.includes("x265") || lower.includes("hevc") || lower.includes("h265")) return true;
  return false;
}

export function useNativeVideo(
  src: string | null,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): { state: NativeVideoState; controls: NativeVideoControls; canvasId: string } {
  const decoderId = stableId(src);
  const canvasId = `native-video-${decoderId}`;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const userPausedRef = useRef(false);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const frameRateRef = useRef(30);
  const pumpGenRef = useRef(0);
  const lastStateUpdateRef = useRef(0);
  const metadataRef = useRef<{ width: number; height: number; frameRate: number } | null>(null);

  const [state, setState] = useState<NativeVideoState>({
    playing: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    width: 0,
    height: 0,
    error: null,
    ready: false,
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
      try {
        window.htpc.videoDecoder.create(decoderId);

        let resolved = src;
        if (src.startsWith("ember://remote/")) {
          resolved = await window.htpc.videoDecoder.resolveUrl(src);
        } else if (src.startsWith("ember://media/")) {
          resolved = src.slice("ember://media/".length);
        } else if (!src.startsWith("/") && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("file://")) {
          // Bare filename / relative path — ask main process to resolve it
          // against the movie database (may return absolute path or ember://remote/).
          resolved = await window.htpc.videoDecoder.resolveUrl(src);
          // If the DB lookup returned an ember://remote/ URL, resolve it to HTTP.
          if (resolved.startsWith("ember://remote/")) {
            resolved = await window.htpc.videoDecoder.resolveUrl(resolved);
          }
        }
        // If we still have a bare filename (not absolute, not URL),
        // ask the main process to look it up in the movie DB.
        // This handles stale local entries that should redirect to a NAS.
        if (
          resolved &&
          !resolved.startsWith("/") &&
          !resolved.startsWith("http://") &&
          !resolved.startsWith("https://") &&
          !resolved.startsWith("file://") &&
          !resolved.startsWith("ember://")
        ) {
          resolved = await window.htpc.videoDecoder.resolveUrl(resolved);
          // If the DB lookup returned an ember://remote/ URL, resolve it to HTTP.
          if (resolved.startsWith("ember://remote/")) {
            resolved = await window.htpc.videoDecoder.resolveUrl(resolved);
          }
        }

        await window.htpc.videoDecoder.open(decoderId, resolved);

        const meta = window.htpc.videoDecoder.getMetadata(decoderId);
        frameRateRef.current = meta.frameRate || 30;
        metadataRef.current = {
          width: meta.width,
          height: meta.height,
          frameRate: meta.frameRate,
        };

        if (cancelled) return;

        window.htpc.videoDecoder.attachCanvas(decoderId, canvasId);
        // Resize WebGL viewport to the canvas's DISPLAY size so letterboxing
        // math uses the same aspect ratio the user actually sees.
        const rect = canvas.getBoundingClientRect();
        window.htpc.videoDecoder.resizeCanvas(decoderId, rect.width, rect.height);

        updateState({
          duration: meta.durationMs / 1000,
          width: meta.width,
          height: meta.height,
          ready: true,
          error: null,
        });

        // Auto-start playback — mpv is already decoding, so start the
        // frame pump immediately so the canvas renders frames.
        play();
      } catch (err: any) {
        console.error("[NativeVideo] init failed:", err);
        updateState({ error: err.message || String(err), ready: false });
      }
    }

    init();

    return () => {
      cancelled = true;
      pumpGenRef.current++;
      playingRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.htpc.videoDecoder.destroy(decoderId);
    };
  }, [src, decoderId, canvasRef, updateState]);

  // Frame pump timed to the video frame-rate instead of RAF.
  // This prevents bursts when multiple frames have accumulated.
  const pump = useCallback(() => {
    if (!playingRef.current) return;

    const myGen = pumpGenRef.current;

    try {
      const frame = window.htpc.videoDecoder.renderNextFrame(decoderId);
      if (!frame) {
        playingRef.current = false;
        updateState({ playing: false });
        return;
      }

      const now = performance.now();
      if (now - lastStateUpdateRef.current > 250) {
        lastStateUpdateRef.current = now;
        const elapsed = now - startTimeRef.current;
        const currentTime = (pausedAtRef.current + elapsed) / 1000;
        setState((prev) => ({
          ...prev,
          currentTime: Math.min(currentTime, prev.duration),
        }));
      }

      if (playingRef.current && myGen === pumpGenRef.current) {
        const interval = 1000 / frameRateRef.current;
        timerRef.current = setTimeout(pump, interval);
      }
    } catch (err: any) {
      console.error("[NativeVideo] decode error:", err);
      playingRef.current = false;
      updateState({ playing: false, error: err.message || String(err) });
    }
  }, [decoderId, updateState]);

  const play = useCallback(() => {
    if (playingRef.current) return;
    playingRef.current = true;
    userPausedRef.current = false;
    startTimeRef.current = performance.now();
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
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
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
      pumpGenRef.current++;
      try {
        window.htpc.videoDecoder.seek(decoderId, ms);
        window.htpc.videoDecoder.renderNextFrame(decoderId);
        if (!playingRef.current) {
          window.htpc.videoDecoder.pause(decoderId);
        }
      } catch (err: any) {
        console.error("[NativeVideo] seek failed:", err);
        updateState({ error: err.message || String(err) });
      }
    },
    [decoderId, updateState]
  );

  const setVolume = useCallback(
    (v: number) => {
      // libmpv audio is handled natively; volume can be set via mpv property
      // if we expose it. For now, no-op.
      console.log("[NativeVideo] setVolume not yet implemented:", v);
    },
    []
  );

  return {
    state,
    controls: { play, pause, toggle, seek, setVolume },
    canvasId,
  };
}
