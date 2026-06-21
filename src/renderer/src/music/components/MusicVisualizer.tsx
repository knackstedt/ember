import React, { useEffect, useRef } from "react";

type VisualizerMode = "spectrum" | "waveform" | "particles";

interface MusicVisualizerProps {
  audioElement: HTMLAudioElement | null;
  mode?: VisualizerMode;
}

let gAudioCtx: AudioContext | null = null;
let gSource: MediaElementAudioSourceNode | null = null;
let gAnalyser: AnalyserNode | null = null;

function getAudioGraph(audioElement: HTMLAudioElement) {
  if (!gAudioCtx) {
    gAudioCtx = new AudioContext();
  }
  if (!gAnalyser) {
    gAnalyser = gAudioCtx.createAnalyser();
    gAnalyser.fftSize = 256;
    gAnalyser.smoothingTimeConstant = 0.85;
    gAnalyser.connect(gAudioCtx.destination);
  }
  if (!gSource) {
    try {
      gSource = gAudioCtx.createMediaElementSource(audioElement);
      gSource.connect(gAnalyser);
    } catch {
      // Already has a source node from a previous mount
    }
  }
  return gAnalyser;
}

export const MusicVisualizer: React.FC<MusicVisualizerProps> = React.memo(({
  audioElement,
  mode = "spectrum",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!audioElement) return;

    const analyser = getAudioGraph(audioElement);
    analyserRef.current = analyser;

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [audioElement]);

  useEffect(() => {
    const resume = () => {
      if (gAudioCtx?.state === "suspended") {
        void gAudioCtx.resume();
      }
    };
    window.addEventListener("click", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    window.addEventListener("htpc:nav", resume, { once: true });
    return () => {
      window.removeEventListener("click", resume);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("htpc:nav", resume);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const drawSpectrum = () => {
      animRef.current = requestAnimationFrame(drawSpectrum);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      const cx = canvas.width / 2;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.7;
        const r = 100 + dataArray[i] * 0.6;
        const g = 50 + dataArray[i] * 0.3;
        const b = 150 + dataArray[i] * 0.4;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
        const barX2 = cx + i * barWidth - (bufferLength * barWidth) / 2;
        ctx.fillRect(barX2, canvas.height - barHeight, barWidth - 1, barHeight);
      }
    };

    const drawWaveform = () => {
      animRef.current = requestAnimationFrame(drawWaveform);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      const accent = getComputedStyle(canvas).getPropertyValue("--color-accent").trim() || "#fff";
      ctx.strokeStyle = accent;
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
    if (mode === "spectrum") {
      drawSpectrum();
    } else if (mode === "waveform") {
      drawWaveform();
    } else {
      drawParticles();
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
  }, [mode]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "var(--color-bg)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)",
        }}
      />
    </div>
  );
});
