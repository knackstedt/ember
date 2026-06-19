import { create } from "zustand";
import { useToastStore } from "./toast.store";

interface GameLaunchState {
  launchingMap: Record<string, string>;
  launchingIds: string[];
  failedId: string | null;
  failedMessage: string | null;
  setLaunching: (id: string, title?: string) => void;
  setStarted: (id: string) => void;
  setStopped: (id: string) => void;
  setFailed: (id: string, message?: string | null) => void;
  clearFailed: () => void;
  clear: () => void;
}

export const useGameLaunchStore = create<GameLaunchState>((set, get) => ({
  launchingMap: {},
  launchingIds: [],
  failedId: null,
  failedMessage: null,

  setLaunching: (id, title) => {
    set((s) => {
      const map = { ...s.launchingMap, [id]: title || "Unknown game" };
      return {
        launchingMap: map,
        launchingIds: Object.keys(map),
        failedId: null,
        failedMessage: null,
      };
    });
  },

  setStarted: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.launchingMap;
      return {
        launchingMap: rest,
        launchingIds: Object.keys(rest),
      };
    });
  },

  setStopped: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.launchingMap;
      return {
        launchingMap: rest,
        launchingIds: Object.keys(rest),
      };
    });
  },

  setFailed: (id, message) => {
    set((s) => {
      const { [id]: _, ...rest } = s.launchingMap;
      const next: Partial<GameLaunchState> = {
        launchingMap: rest,
        launchingIds: Object.keys(rest),
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
    set({ launchingMap: {}, launchingIds: [], failedId: null, failedMessage: null });
  },
}));
