/**
 * React hook for the native dual-backend video decoder.
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
  backend: string;
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
  // Use a hash of src so the same video always gets the same decoder id
  let h = 0;
  for (let i = 0; i < src.length; i++) {
    h = ((h << 5) - h + src.charCodeAt(i)) | 0;
  }
  return `dec-${Math.abs(h).toString(36)}`;
}

function shouldUseNativeDecoder(src: string | null): boolean {
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
): { state: NativeVideoState; controls: NativeVideoControls } {
  const decoderId = stableId(src);
  const canvasId = `native-video-${decoderId}`;

  const pumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const userPausedRef = useRef(false);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const frameRateRef = useRef(30);
  const frameCountRef = useRef(0);
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
    backend: "",
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
        // 1. Create decoder in preload
        window.htpc.videoDecoder.create(decoderId);

        // 2. Resolve ember://remote/ URLs via main process IPC, then open.
        let resolved = src;
        if (src.startsWith("ember://remote/")) {
          resolved = await window.htpc.videoDecoder.resolveUrl(src);
        } else if (src.startsWith("ember://media/")) {
          resolved = src.slice("ember://media/".length);
        }
        console.log("[NativeVideo] src:", src, "resolved:", resolved);
        const backend = window.htpc.videoDecoder.open(decoderId, resolved);

        // 3. Get metadata
        const meta = window.htpc.videoDecoder.getMetadata(decoderId);
        frameRateRef.current = meta.frameRate || 30;
        metadataRef.current = {
          width: meta.width,
          height: meta.height,
          frameRate: meta.frameRate,
        };

        if (cancelled) return;

        // 4. Attach WebGL renderer in preload (direct DOM access)
        window.htpc.videoDecoder.attachCanvas(decoderId, canvasId);
        window.htpc.videoDecoder.resizeCanvas(decoderId, meta.width, meta.height);
        // Apply the correct YCbCr→RGB matrix and PAR from the actual caps.
        window.htpc.videoDecoder.setColorimetry(
          decoderId,
          meta.colorimetry ?? "bt709",
          meta.parN ?? 1,
          meta.parD ?? 1,
        );

        updateState({
          duration: meta.durationMs / 1000,
          width: meta.width,
          height: meta.height,
          backend,
          ready: true,
          error: null,
        });
      } catch (err: any) {
        console.error("[NativeVideo] init failed:", err);
        updateState({ error: err.message || String(err), ready: false });
      }
    }

    init();

    return () => {
      cancelled = true;
      pumpGenRef.current++;
      if (pumpTimerRef.current) {
        clearTimeout(pumpTimerRef.current);
        pumpTimerRef.current = null;
      }
      window.htpc.videoDecoder.destroy(decoderId);
    };
  }, [src, decoderId, canvasRef, updateState]);

  // Async frame pump using setTimeout so blocking NAPI decode doesn't
  // stall the browser's compositor inside requestAnimationFrame.
  const pump = useCallback(async () => {
    if (!playingRef.current) return;

    const myGen = pumpGenRef.current;

    try {
      const frame = window.htpc.videoDecoder.renderNextFrame(decoderId);
      if (!frame) {
        playingRef.current = false;
        updateState({ playing: false });
        return;
      }

      // Update current time estimate (throttled to 4Hz to avoid React re-renders
      // and GC pressure from frequent state updates on every frame).
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

      // GStreamer sync=true blocks pull_sample until the next frame's PTS,
      // so we just queue the next pump immediately. It will sleep inside
      // renderNextFrame for the correct inter-frame interval.
      if (playingRef.current && myGen === pumpGenRef.current) {
        pumpTimerRef.current = window.setTimeout(pump, 0);
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
    frameCountRef.current = 0;
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
    if (pumpTimerRef.current) {
      clearTimeout(pumpTimerRef.current);
      pumpTimerRef.current = null;
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
      frameCountRef.current = 0;
      pumpGenRef.current++;
      try {
        window.htpc.videoDecoder.seek(decoderId, ms);
        // Render one frame at the new position so the thumbnail updates.
        // The Rust backend uses pull_preroll() for this call and then
        // restores the correct pipeline state (Paused/Playing) automatically.
        window.htpc.videoDecoder.renderNextFrame(decoderId);
        // Belt-and-suspenders: if the user was paused, re-assert pause so
        // a race in the native layer can never leave audio running silently.
        if (!playingRef.current) {
          window.htpc.videoDecoder.pause(decoderId);
        }
        updateState({ currentTime: time });
      } catch (err: any) {
        console.error("[NativeVideo] seek failed:", err);
        updateState({ error: err.message || String(err) });
      }
    },
    [decoderId, updateState]
  );

  const setVolume = useCallback((v: number) => {
    console.log("[NativeVideo] volume set to", v, "(audio not yet implemented)");
  }, []);

  // Auto-play when ready (but not if user explicitly paused)
  useEffect(() => {
    if (state.ready && !state.playing && !state.error && src && !userPausedRef.current) {
      play();
    }
  }, [state.ready, state.playing, state.error, src, play]);

  // Resize canvas when container size changes (fullscreen, window resize)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        window.htpc.videoDecoder.resizeCanvas(decoderId, width, height);
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvasRef, decoderId]);

  const destroy = useCallback(() => {
    playingRef.current = false;
    pumpGenRef.current++;
    if (pumpTimerRef.current) {
      clearTimeout(pumpTimerRef.current);
      pumpTimerRef.current = null;
    }
    window.htpc.videoDecoder.destroy(decoderId);
  }, [decoderId]);

  return {
    state,
    controls: { play, pause, toggle, seek, setVolume, destroy },
    canvasId,
  };
}

export { shouldUseNativeDecoder };
