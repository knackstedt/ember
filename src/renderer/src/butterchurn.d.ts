declare module "butterchurn" {
  export interface VisualizerOptions {
    width: number;
    height: number;
    pixelRatio?: number;
    textureRatio?: number;
    meshWidth?: number;
    meshHeight?: number;
  }

  export interface Visualizer {
    connectAudio: (node: AnalyserNode) => void;
    loadPreset: (preset: object, blendTime: number) => void;
    launchSongTitleAnim?: (title: string) => void;
    render: () => void;
    setRendererSize: (width: number, height: number) => void;
  }

  function createVisualizer(
    audioContext: AudioContext,
    canvas: HTMLCanvasElement,
    opts: VisualizerOptions,
  ): Visualizer;

  export default { createVisualizer };
}

declare module "butterchurn-presets" {
  function getPresets(): Record<string, object>;
  export default { getPresets };
}
