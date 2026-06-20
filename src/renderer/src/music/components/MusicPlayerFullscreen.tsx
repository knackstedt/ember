import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Minimize2,
  ChevronDown,
} from "lucide-react";
import { useMusicPlayerStore } from "../../store/musicPlayer.store";
import { useFocusZoneStore } from "../../store/focusZone.store";

function fmt(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

type VisualizerMode = "spectrum" | "waveform" | "particles";

type FullscreenButton = "prev" | "play" | "next" | "exit";

interface MusicPlayerFullscreenProps {
  audioElement: HTMLAudioElement | null;
  onExit: () => void;
}

/* ------------------------------------------------------------------
 * Global Web Audio singleton — AudioContext and MediaElementAudioSourceNode
 * are created once and reused across mount/unmount cycles. Each mount
 * creates a fresh AnalyserNode branch; unmount only disconnects the
 * analyser from destination, leaving the source→analyser link intact.
 * ------------------------------------------------------------------ */
let gAudioCtx: AudioContext | null = null;
let gSource: MediaElementAudioSourceNode | null = null;

function getAudioGraph(audioElement: HTMLAudioElement) {
  if (!gAudioCtx) {
    gAudioCtx = new AudioContext();
  }
  if (!gSource) {
    try {
      gSource = gAudioCtx.createMediaElementSource(audioElement);
    } catch {
      // Already has a source node from a previous mount
    }
  }

  const analyser = gAudioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.85;

  if (gSource) {
    gSource.connect(analyser);
    analyser.connect(gAudioCtx.destination);
  }

  return { ctx: gAudioCtx, analyser, source: gSource };
}

export const MusicPlayerFullscreen: React.FC<MusicPlayerFullscreenProps> = React.memo(({
  audioElement,
  onExit,
}) => {
  const {
    queue,
    currentIndex,
    playing,
    position,
    duration,
    pause,
    resume,
    seek,
    next,
    prev,
  } = useMusicPlayerStore();

  const activeZone = useFocusZoneStore((s) => s.activeZone);

  const [focusedButton, setFocusedButton] = useState<FullscreenButton>("play");
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>("spectrum");
  const [showControls, setShowControls] = useState(true);

  const focusedButtonRef = useRef(focusedButton);
  focusedButtonRef.current = focusedButton;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const track = queue[currentIndex];

  // Global singleton AudioContext and source — safe across mount/unmount cycles
  useEffect(() => {
    if (!audioElement) return;

    const { ctx, analyser } = getAudioGraph(audioElement);
    analyserRef.current = analyser;

    return () => {
      cancelAnimationFrame(animRef.current);
      if (analyserRef.current) {
        // Disconnect analyser from destination only; source→analyser stays intact
        try { analyserRef.current.disconnect(); } catch { /* noop */ }
      }
    };
  }, [audioElement]);

  // Resume AudioContext on user interaction
  useEffect(() => {
    const resume = () => {
      if (gAudioCtx?.state === "suspended") {
        void gAudioCtx.resume();
      }
    };
    window.addEventListener("click", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener("click", resume);
      window.removeEventListener("keydown", resume);
    };
  }, []);

  // Visualizer loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const drawSpectrum = () => {
      animRef.current = requestAnimationFrame(drawSpectrum);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barX = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.7;

        const r = 100 + dataArray[i] * 0.6;
        const g = 50 + dataArray[i] * 0.3;
        const b = 150 + dataArray[i] * 0.4;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;

        const cx = canvas.width / 2;
        const barX2 = cx + (i * barWidth) - (bufferLength * barWidth) / 2;
        ctx.fillRect(barX2, canvas.height - barHeight, barWidth - 1, barHeight);
        barX += barWidth;
      }
    };

    const drawWaveform = () => {
      animRef.current = requestAnimationFrame(drawWaveform);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "var(--color-accent)";
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    const drawParticles = () => {
      animRef.current = requestAnimationFrame(drawParticles);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
      const intensity = avg / 255;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const radius = 80 + intensity * 200;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120, 80, 200, ${0.2 + intensity * 0.3})`;
      ctx.fill();

      for (let i = 0; i < 12; i++) {
        const angle = (Date.now() / 1000 + i * 0.5) % (Math.PI * 2);
        const r = radius + Math.sin(Date.now() / 500 + i) * 20;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        ctx.beginPath();
        ctx.arc(px, py, 3 + intensity * 8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 150, 255, ${0.5 + intensity * 0.5})`;
        ctx.fill();
      }
    };

    cancelAnimationFrame(animRef.current);
    if (visualizerMode === "spectrum") {
      drawSpectrum();
    } else if (visualizerMode === "waveform") {
      drawWaveform();
    } else {
      drawParticles();
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [visualizerMode]);

  // Controller input
  useEffect(() => {
    const handler = (e: Event) => {
      if (activeZone !== "player") return;
      const detail = (e as CustomEvent).detail as { action: string };
      const action = detail?.action;
      if (!action) return;

      const buttons: FullscreenButton[] = ["prev", "play", "next", "exit"];
      const idx = buttons.indexOf(focusedButtonRef.current);

      // Show controls on any input
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 5000);

      switch (action) {
        case "left": {
          if (idx > 0) setFocusedButton(buttons[idx - 1]);
          break;
        }
        case "right": {
          if (idx < buttons.length - 1) setFocusedButton(buttons[idx + 1]);
          break;
        }
        case "up": {
          // Cycle visualizer modes
          setVisualizerMode((prev) =>
            prev === "spectrum" ? "waveform" : prev === "waveform" ? "particles" : "spectrum"
          );
          break;
        }
        case "down": {
          // Also cycle visualizer modes in reverse
          setVisualizerMode((prev) =>
            prev === "spectrum" ? "particles" : prev === "particles" ? "waveform" : "spectrum"
          );
          break;
        }
        case "confirm": {
          const btn = focusedButtonRef.current;
          switch (btn) {
            case "prev": prev(); break;
            case "play": playing ? pause() : resume(); break;
            case "next": next(); break;
            case "exit": onExit(); break;
          }
          break;
        }
        case "cancel": {
          onExit();
          break;
        }
      }
    };

    window.addEventListener("htpc:nav", handler);
    return () => window.removeEventListener("htpc:nav", handler);
  }, [activeZone, playing, prev, pause, resume, next, onExit]);

  // Auto-hide controls
  useEffect(() => {
    if (!showControls) return;
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 8000);
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [showControls]);

  const isFocused = (btn: FullscreenButton) => activeZone === "player" && focusedButton === btn;
  const focusStyle = (btn: FullscreenButton): React.CSSProperties =>
    isFocused(btn)
      ? { outline: "3px solid var(--color-accent)", outlineOffset: "4px", borderRadius: "var(--radius-card)" }
      : {};

  if (!track) return null;

  return (
    <motion.div
      className="fixed inset-0 flex flex-col items-center justify-end"
      style={{ zIndex: 200 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Visualizer canvas background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "var(--color-bg)" }}
      />

      {/* Overlay gradient for readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)",
        }}
      />

      {/* Controls */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-4 pb-8 px-8 w-full max-w-2xl"
        animate={{ opacity: showControls ? 1 : 0, y: showControls ? 0 : 20 }}
        transition={{ duration: 0.3 }}
      >
        {/* Track info */}
        <div className="text-center">
          <div className="text-xl font-bold truncate" style={{ color: "#fff" }} title={track.title}>
            {track.title}
          </div>
          <div className="text-sm truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
            {track.artist} {track.album ? `· ${track.album}` : ""}
          </div>
        </div>

        {/* Progress */}
        <div className="w-full flex items-center gap-3">
          <span className="text-xs tabular-nums" style={{ color: "rgba(255,255,255,0.6)" }}>
            {fmt(position)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.5}
            value={position}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="flex-1 h-1.5 cursor-pointer"
            style={{ accentColor: "var(--color-accent)" }}
          />
          <span className="text-xs tabular-nums" style={{ color: "rgba(255,255,255,0.6)" }}>
            {fmt(duration)}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={prev}
            className="w-12 h-12 flex items-center justify-center rounded-full transition-colors"
            style={{ color: "#fff", background: "rgba(255,255,255,0.1)", ...focusStyle("prev") }}
          >
            <SkipBack size={24} />
          </button>
          <button
            onClick={playing ? pause : resume}
            className="w-16 h-16 flex items-center justify-center rounded-full text-xl font-bold transition-colors"
            style={{ background: "var(--color-accent)", color: "var(--color-bg)", ...focusStyle("play") }}
          >
            {playing ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button
            onClick={next}
            className="w-12 h-12 flex items-center justify-center rounded-full transition-colors"
            style={{ color: "#fff", background: "rgba(255,255,255,0.1)", ...focusStyle("next") }}
          >
            <SkipForward size={24} />
          </button>
          <button
            onClick={onExit}
            className="w-12 h-12 flex items-center justify-center rounded-full transition-colors"
            style={{ color: "#fff", background: "rgba(255,255,255,0.1)", ...focusStyle("exit") }}
          >
            <Minimize2 size={20} />
          </button>
        </div>

        {/* Visualizer mode indicator */}
        <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          <span>Visualizer: {visualizerMode}</span>
          <span>·</span>
          <span>Up/Down to change</span>
        </div>
      </motion.div>
    </motion.div>
  );
});
