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

export interface RawInputDiscovery {
  buttons: Record<number, string>; // rawCode -> action name (or btn_N)
  axes: Record<number, { min: number; max: number; name: string }>;
}

interface InputState {
  devices: ControllerDevice[];
  lastSource: InputSource;
  lastEvent: NormalizedInputEvent | null;
  liveStates: Record<string, LiveControllerState>;
  rawDiscoveries: Record<string, RawInputDiscovery>;
  controllersTabLocked: boolean;
  controllersTabUnlockProgress: number;
  addDevice: (device: ControllerDevice) => void;
  removeDevice: (id: string) => void;
  setLastEvent: (event: NormalizedInputEvent) => void;
  updateLiveState: (deviceId: string, event: NormalizedInputEvent) => void;
  recordRawInput: (deviceId: string, event: NormalizedInputEvent) => void;
  clearRawDiscovery: (deviceId: string) => void;
  setControllersTabLocked: (locked: boolean) => void;
  setControllersTabUnlockProgress: (progress: number) => void;
}

export const useInputStore = create<InputState>((set) => ({
  devices: [],
  lastSource: "keyboard",
  lastEvent: null,
  liveStates: {},
  rawDiscoveries: {},
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
      rawDiscoveries: Object.fromEntries(
        Object.entries(s.rawDiscoveries).filter(([k]) => k !== id),
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

  recordRawInput: (deviceId, event) =>
    set((s) => {
      const existing = s.rawDiscoveries[deviceId] ?? {
        buttons: {},
        axes: {},
      };
      if (event.type === "button_press" && event.rawCode !== undefined) {
        const name = event.action ?? `btn_${event.rawCode}`;
        return {
          rawDiscoveries: {
            ...s.rawDiscoveries,
            [deviceId]: {
              ...existing,
              buttons: { ...existing.buttons, [event.rawCode]: name },
            },
          },
        };
      }
      if (
        event.type === "axis" &&
        event.rawCode !== undefined &&
        event.value !== undefined
      ) {
        const name = event.axis ?? `abs_${event.rawCode}`;
        const cur = existing.axes[event.rawCode] ?? {
          min: event.value,
          max: event.value,
          name,
        };
        return {
          rawDiscoveries: {
            ...s.rawDiscoveries,
            [deviceId]: {
              ...existing,
              axes: {
                ...existing.axes,
                [event.rawCode]: {
                  min: Math.min(cur.min, event.value),
                  max: Math.max(cur.max, event.value),
                  name,
                },
              },
            },
          },
        };
      }
      return {};
    }),

  clearRawDiscovery: (deviceId) =>
    set((s) => ({
      rawDiscoveries: Object.fromEntries(
        Object.entries(s.rawDiscoveries).filter(([k]) => k !== deviceId),
      ),
    })),

  setControllersTabLocked: (locked) =>
    set({ controllersTabLocked: locked }),

  setControllersTabUnlockProgress: (progress) =>
    set({ controllersTabUnlockProgress: progress }),
}));
