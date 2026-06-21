import React, { useEffect, useRef, useState } from "react";
import butterchurn from "butterchurn";
import butterchurnPresets from "butterchurn-presets";
import { FLAME_PRESET, FLAME_PRESET_NAME } from "@renderer/music/presets/emberFlame";

interface AudioGraph {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
}

const FFT_SIZE = 2048;
const SMOOTHING = 0.82;

const audioGraphs = new WeakMap<HTMLAudioElement, AudioGraph>();
const audioContexts = new Set<AudioContext>();

function getAudioGraph(audioElement: HTMLAudioElement): AnalyserNode {
  const existing = audioGraphs.get(audioElement);
  if (existing) return existing.analyser;

  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = SMOOTHING;

  const source = ctx.createMediaElementSource(audioElement);
  source.connect(analyser);
  analyser.connect(ctx.destination);

  audioGraphs.set(audioElement, { ctx, source, analyser });
  audioContexts.add(ctx);
  return analyser;
}

// Short descriptions for each Butterchurn preset. Fill these in as desired.
export const PRESET_DESCRIPTIONS: Record<string, string> = {
  [FLAME_PRESET_NAME]: FLAME_PRESET.description,
};

export const DEFAULT_PRESET_NAME = FLAME_PRESET_NAME;

export const PRESETS = [
  ...Object.entries(butterchurnPresets.getPresets()).map(([name, preset]) => ({
    name,
    preset,
    description: PRESET_DESCRIPTIONS[name] ?? "",
  })),
  FLAME_PRESET,
];

export interface MusicVisualizerProps {
  audioElement: HTMLAudioElement | null;
  presetName?: string;
}

export const MusicVisualizer: React.FC<MusicVisualizerProps> = React.memo(({
  audioElement,
  presetName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualizerRef = useRef<ReturnType<typeof butterchurn.createVisualizer> | null>(null);
  const animRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const [activePresetName, setActivePresetName] = useState<string>(
    PRESETS.find((p) => p.name === DEFAULT_PRESET_NAME)?.name ?? PRESETS[0]?.name ?? "",
  );
  const activePresetNameRef = useRef(activePresetName);
  activePresetNameRef.current = activePresetName;

  // Resume audio context on first interaction.
  useEffect(() => {
    const resume = () => {
      for (const ctx of audioContexts) {
        if (ctx.state === "suspended") void ctx.resume();
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

  // Create the audio graph, the Butterchurn visualizer, and load the initial preset
  // before starting the render loop so the first frame is never the blank default.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!audioElement || !canvas) return;

    const analyser = getAudioGraph(audioElement);
    const visualizer = butterchurn.createVisualizer(analyser.context as AudioContext, canvas, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      pixelRatio: window.devicePixelRatio || 1,
      textureRatio: 1,
    });
    visualizerRef.current = visualizer;
    visualizer.connectAudio(analyser);

    const targetName = presetName ?? activePresetNameRef.current;
    const preset = PRESETS.find((p) => p.name === targetName)?.preset ?? PRESETS[0]?.preset;
    if (preset) {
      visualizer.loadPreset(preset, 0.5);
      setActivePresetName(PRESETS.find((p) => p.preset === preset)?.name ?? "");
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width));
      canvas.height = Math.max(1, Math.floor(rect.height));
      visualizer.setRendererSize(canvas.width, canvas.height);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const MIN_FRAME_INTERVAL = 1000 / 60;
    const render = () => {
      animRef.current = requestAnimationFrame(render);
      const now = performance.now();
      if (now - lastFrameTimeRef.current < MIN_FRAME_INTERVAL) return;
      lastFrameTimeRef.current = now;
      visualizer.render();
    };
    render();

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
  }, [audioElement]);

  // Load a new preset when the prop changes.
  useEffect(() => {
    const visualizer = visualizerRef.current;
    if (!visualizer) return;

    const targetName = presetName;
    if (!targetName || targetName === activePresetName) return;

    const preset = PRESETS.find((p) => p.name === targetName)?.preset;
    if (preset) {
      visualizer.loadPreset(preset, 0.5);
      setActivePresetName(targetName);
    }
  }, [presetName, activePresetName]);

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
