import { create } from "zustand";
import { useToastStore } from "./toast.store";

export interface LaunchProgressStep {
  step: string;
  detail?: string;
  timestamp: number;
}

interface GameLaunchState {
  launchingMap: Record<string, string>;
  launchingIds: string[];
  progressMap: Record<string, LaunchProgressStep[]>;
  failedId: string | null;
  failedMessage: string | null;
  setLaunching: (id: string, title?: string) => void;
  setProgress: (id: string, step: string, detail?: string) => void;
  setStarted: (id: string) => void;
  setStopped: (id: string) => void;
  setFailed: (id: string, message?: string | null) => void;
  clearFailed: () => void;
  clear: () => void;
}

export const useGameLaunchStore = create<GameLaunchState>((set, get) => ({
  launchingMap: {},
  launchingIds: [],
  progressMap: {},
  failedId: null,
  failedMessage: null,

  setLaunching: (id, title) => {
    set((s) => {
      const map = { ...s.launchingMap, [id]: title || "Unknown game" };
      return {
        launchingMap: map,
        launchingIds: Object.keys(map),
        progressMap: { ...s.progressMap, [id]: [] },
        failedId: null,
        failedMessage: null,
      };
    });
  },

  setProgress: (id, step, detail) => {
    set((s) => {
      const existing = s.progressMap[id] ?? [];
      // Replace the last step if it has the same step name (updates detail, e.g. elapsed time)
      const updated = existing.length > 0 && existing[existing.length - 1].step === step
        ? [...existing.slice(0, -1), { step, detail, timestamp: Date.now() }]
        : [...existing, { step, detail, timestamp: Date.now() }];
      return { progressMap: { ...s.progressMap, [id]: updated } };
    });
  },

  setStarted: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.launchingMap;
      const { [id]: __, ...progressRest } = s.progressMap;
      return {
        launchingMap: rest,
        launchingIds: Object.keys(rest),
        progressMap: progressRest,
      };
    });
  },

  setStopped: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.launchingMap;
      const { [id]: __, ...progressRest } = s.progressMap;
      return {
        launchingMap: rest,
        launchingIds: Object.keys(rest),
        progressMap: progressRest,
      };
    });
  },

  setFailed: (id, message) => {
    set((s) => {
      const { [id]: _, ...rest } = s.launchingMap;
      const { [id]: __, ...progressRest } = s.progressMap;
      const next: Partial<GameLaunchState> = {
        launchingMap: rest,
        launchingIds: Object.keys(rest),
        progressMap: progressRest,
      };
      if (message) {
        next.failedId = id;
        next.failedMessage = message;
      }
      return next;
    });
    if (message) {
      useToastStore.getState().push({ type: "error", message });
    }
  },

  clearFailed: () => {
    set({ failedId: null, failedMessage: null });
  },

  clear: () => {
    set({ launchingMap: {}, launchingIds: [], progressMap: {}, failedId: null, failedMessage: null });
  },
}));
