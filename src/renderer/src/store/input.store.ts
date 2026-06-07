import { create } from "zustand";
import {
  ControllerDevice,
  NormalizedInputEvent,
  InputSource,
} from "../../../shared/types";

export interface LiveControllerState {
  buttons: Record<string, boolean>;
  axes: Record<string, number>;
  lastUpdated: number;
}

interface InputState {
  devices: ControllerDevice[];
  lastSource: InputSource;
  lastEvent: NormalizedInputEvent | null;
  liveStates: Record<string, LiveControllerState>;
  controllersTabLocked: boolean;
  controllersTabUnlockProgress: number;
  addDevice: (device: ControllerDevice) => void;
  removeDevice: (id: string) => void;
  setLastEvent: (event: NormalizedInputEvent) => void;
  updateLiveState: (deviceId: string, event: NormalizedInputEvent) => void;
  setControllersTabLocked: (locked: boolean) => void;
  setControllersTabUnlockProgress: (progress: number) => void;
}

export const useInputStore = create<InputState>((set) => ({
  devices: [],
  lastSource: "keyboard",
  lastEvent: null,
  liveStates: {},
  controllersTabLocked: true,
  controllersTabUnlockProgress: 0,

  addDevice: (device) =>
    set((s) => ({
      devices: s.devices.some((d) => d.id === device.id)
        ? s.devices
        : [...s.devices, device],
    })),

  removeDevice: (id) =>
    set((s) => ({
      devices: s.devices.filter((d) => d.id !== id),
      liveStates: Object.fromEntries(
        Object.entries(s.liveStates).filter(([k]) => k !== id),
      ),
    })),

  setLastEvent: (event) => set({ lastEvent: event, lastSource: event.source }),

  updateLiveState: (deviceId, event) =>
    set((s) => {
      const existing = s.liveStates[deviceId] ?? {
        buttons: {},
        axes: {},
        lastUpdated: Date.now(),
      };
      const next: LiveControllerState = {
        buttons: { ...existing.buttons },
        axes: { ...existing.axes },
        lastUpdated: Date.now(),
      };
      if (event.type === "button_press") {
        if (event.action) next.buttons[event.action] = true;
      } else if (event.type === "button_release") {
        if (event.action) next.buttons[event.action] = false;
      } else if (event.type === "axis" && event.axis !== undefined) {
        next.axes[event.axis] = event.value ?? 0;
      }
      return {
        liveStates: { ...s.liveStates, [deviceId]: next },
      };
    }),

  setControllersTabLocked: (locked) =>
    set({ controllersTabLocked: locked }),

  setControllersTabUnlockProgress: (progress) =>
    set({ controllersTabUnlockProgress: progress }),
}));
