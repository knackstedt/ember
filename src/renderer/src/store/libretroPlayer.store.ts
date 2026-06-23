import { create } from "zustand";
import { GamePlatform } from "../../../shared/types";

export interface DetectedCore {
  platform: string;
  corePath: string;
  coreName: string;
  extensions: string[];
}

export interface CoreInfo {
  id: number;
  name: string;
  version: string;
  extensions: string;
  need_fullpath: boolean;
  path: string;
}

interface LibretroPlayerState {
  open: boolean;
  romPath: string;
  title: string;
  platform: GamePlatform;
  shader: string | undefined;
  gameId: string;
  coreId: number | null;
  detectedCore: DetectedCore | null;
  availableCores: CoreInfo[];
  selectedCorePath: string | null;
  avInfo: {
    fps: number;
    sampleRate: number;
    baseWidth: number;
    baseHeight: number;
    maxWidth: number;
    maxHeight: number;
    aspectRatio: number;
  } | null;
  isRunning: boolean;
  isLoading: boolean;
  error: string | null;
  // Actions
  launch: (opts: {
    romPath: string;
    title: string;
    platform: GamePlatform;
    gameId: string;
    shader?: string;
    corePath?: string;
  }) => Promise<void>;
  close: () => Promise<void>;
  reset: () => Promise<void>;
  setShader: (shader: string | undefined) => void;
  setSelectedCore: (corePath: string) => void;
  loadCores: () => Promise<void>;
  setError: (error: string | null) => void;
}

export const useLibretroPlayerStore = create<LibretroPlayerState>((set, get) => ({
  open: false,
  romPath: "",
  title: "",
  platform: "unknown",
  shader: undefined,
  gameId: "",
  coreId: null,
  detectedCore: null,
  availableCores: [],
  selectedCorePath: null,
  avInfo: null,
  isRunning: false,
  isLoading: false,
  error: null,

  async launch(opts) {
    const state = get();
    if (state.isLoading) return;

    set({ isLoading: true, error: null });

    try {
      // If a specific core is selected, use it. Otherwise auto-detect.
      let corePath = opts.corePath || state.selectedCorePath;
      let detected: DetectedCore | null = null;

      if (!corePath) {
        const allDetected = await window.htpc.libretro.detectAllCores(opts.romPath);
        if (allDetected.length > 0) {
          detected = allDetected[0];
          corePath = detected.corePath;
        }
      }

      if (!corePath) {
        set({ error: "No compatible libretro core found for this ROM. Install libretro cores or select one manually.", isLoading: false });
        return;
      }

      // Unload any existing core first.
      // unloadAll() stops runners, unloads cores, and clears the vector.
      // Do NOT call unload(coreId) before it — that would double-deinit.
      await window.htpc.libretro.unloadAll();

      const coreInfo = await window.htpc.libretro.loadCore(corePath);
      await window.htpc.libretro.loadGame(coreInfo.id, opts.romPath);
      await window.htpc.libretro.start(coreInfo.id);

      const avInfo = await window.htpc.libretro.getAvInfo(coreInfo.id);

      set({
        open: true,
        romPath: opts.romPath,
        title: opts.title,
        platform: opts.platform,
        shader: opts.shader,
        gameId: opts.gameId,
        coreId: coreInfo.id,
        detectedCore: detected,
        avInfo: avInfo ?? null,
        isRunning: true,
        isLoading: false,
      });
      window.htpc.games.playTime.start(opts.gameId).catch(() => {});
    } catch (err: any) {
      console.error("[libretro] launch error:", err);
      set({ error: String(err?.message ?? err), isLoading: false });
    }
  },

  async close() {
    const state = get();
    // Hide the player immediately so the render loop stops and we don't
    // hammer the worker with getFrame() calls while it's being torn down.
    set({ open: false, isRunning: false });

    if (state.coreId !== null) {
      try {
        // unloadAll() stops runners, unloads cores, and clears the vector.
        // Do NOT call stop() or unload() before it — that would double-deinit.
        await window.htpc.libretro.unloadAll();
      } catch (err) {
        console.error("[libretro] close error:", err);
      }
    }
    if (state.gameId) {
      window.htpc.games.playTime.stop(state.gameId).catch(() => {});
    }
    set({
      romPath: "",
      title: "",
      platform: "unknown",
      shader: undefined,
      gameId: "",
      coreId: null,
      detectedCore: null,
      avInfo: null,
      isLoading: false,
      error: null,
    });
  },

  async reset() {
    const state = get();
    if (state.coreId !== null) {
      await window.htpc.libretro.reset(state.coreId);
    }
  },

  setShader(shader) {
    set({ shader });
  },

  setSelectedCore(corePath) {
    set({ selectedCorePath: corePath });
  },

  async loadCores() {
    try {
      const cores = await window.htpc.libretro.listCores();
      set({ availableCores: cores });
    } catch (err) {
      console.error("[libretro] failed to load cores:", err);
    }
  },

  setError(error) {
    set({ error });
  },
}));
