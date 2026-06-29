import { create } from "zustand";
import {
  SplitscreenConfig,
  SplitscreenSession,
  AudioSink,
  DisplayInfo,
  SplitscreenLayoutType,
  SplitscreenInstanceProgress,
} from "../../../shared/splitscreen-types";

export interface SplitscreenStore {
  config: SplitscreenConfig | null;
  session: SplitscreenSession | null;
  audioSinks: AudioSink[];
  availableLayouts: { type: SplitscreenLayoutType; playerCount: number; label: string }[];
  detectedDisplays: DisplayInfo[];
  configModalOpen: boolean;
  configModalGameId: string | null;
  instanceProgress: Record<number, SplitscreenInstanceProgress | undefined>;

  setConfig: (config: SplitscreenConfig | null) => void;
  setSession: (session: SplitscreenSession | null) => void;
  setAudioSinks: (sinks: AudioSink[]) => void;
  setAvailableLayouts: (layouts: SplitscreenStore["availableLayouts"]) => void;
  setDetectedDisplays: (displays: DisplayInfo[]) => void;
  openConfigModal: (gameId: string) => void;
  closeConfigModal: () => void;
  setInstanceProgress: (progress: SplitscreenInstanceProgress) => void;
  clearInstanceProgress: () => void;

  loadAudioSinks: () => Promise<void>;
  loadDisplays: () => Promise<void>;
  loadLayouts: () => Promise<void>;
  startSession: (config: SplitscreenConfig) => Promise<string>;
  stopSession: () => Promise<void>;
  pauseInstance: (slotIndex: number) => Promise<void>;
  resumeInstance: (slotIndex: number) => Promise<void>;
  stopInstance: (slotIndex: number) => Promise<void>;
  setSinkLabel: (sinkId: string, label: string) => Promise<void>;
  showOverlay: () => Promise<void>;
  hideOverlay: () => Promise<void>;
  focusSlot: (slotIndex: number) => Promise<void>;
  locateDevice: (deviceId: string) => Promise<void>;
}

export const useSplitscreenStore = create<SplitscreenStore>((set, get) => ({
  config: null,
  session: null,
  audioSinks: [],
  availableLayouts: [],
  detectedDisplays: [],
  configModalOpen: false,
  configModalGameId: null,
  instanceProgress: {},

  setConfig: (config) => set({ config }),
  setSession: (session) => set({ session }),
  setAudioSinks: (sinks) => set({ audioSinks: sinks }),
  setAvailableLayouts: (layouts) => set({ availableLayouts: layouts }),
  setDetectedDisplays: (displays) => set({ detectedDisplays: displays }),
  openConfigModal: (gameId) => set({ configModalOpen: true, configModalGameId: gameId }),
  closeConfigModal: () => set({ configModalOpen: false, configModalGameId: null }),
  setInstanceProgress: (progress) =>
    set((state) => ({
      instanceProgress: { ...state.instanceProgress, [progress.slotIndex]: progress },
    })),
  clearInstanceProgress: () => set({ instanceProgress: {} }),

  loadAudioSinks: async () => {
    try {
      const sinks = await window.htpc.splitscreen.getAudioSinks();
      set({ audioSinks: sinks });
    } catch (err) {
      console.error("Failed to load audio sinks:", err);
    }
  },

  loadDisplays: async () => {
    try {
      const displays = await window.htpc.splitscreen.detectDisplays();
      set({ detectedDisplays: displays });
    } catch (err) {
      console.error("Failed to detect displays:", err);
    }
  },

  loadLayouts: async () => {
    try {
      const layouts = await window.htpc.splitscreen.getLayouts();
      set({ availableLayouts: layouts });
    } catch (err) {
      console.error("Failed to load layouts:", err);
    }
  },

  startSession: async (config) => {
    const sessionId = await window.htpc.splitscreen.startSession(config);
    set({ config, configModalOpen: false, instanceProgress: {} });
    return sessionId;
  },

  stopSession: async () => {
    await window.htpc.splitscreen.stopSession();
    set({ session: null, config: null, instanceProgress: {} });
  },

  pauseInstance: async (slotIndex) => {
    await window.htpc.splitscreen.pauseInstance(slotIndex);
  },

  resumeInstance: async (slotIndex) => {
    await window.htpc.splitscreen.resumeInstance(slotIndex);
  },

  stopInstance: async (slotIndex) => {
    await window.htpc.splitscreen.stopInstance(slotIndex);
  },

  setSinkLabel: async (sinkId, label) => {
    await window.htpc.splitscreen.setAudioSinkLabel(sinkId, label);
    // Refresh sinks to show updated labels
    await get().loadAudioSinks();
  },

  showOverlay: async () => {
    await window.htpc.splitscreen.showOverlay();
  },

  hideOverlay: async () => {
    await window.htpc.splitscreen.hideOverlay();
  },

  focusSlot: async (slotIndex) => {
    await window.htpc.splitscreen.focusSlot(slotIndex);
  },

  locateDevice: async (deviceId) => {
    await window.htpc.splitscreen.locateDevice(deviceId);
  },
}));
