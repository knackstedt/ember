import { create } from "zustand";
import {
  ControllerDevice,
  NormalizedInputEvent,
  InputSource,
} from "../../../shared/types";

interface InputState {
  devices: ControllerDevice[];
  lastSource: InputSource;
  lastEvent: NormalizedInputEvent | null;
  addDevice: (device: ControllerDevice) => void;
  removeDevice: (id: string) => void;
  setLastEvent: (event: NormalizedInputEvent) => void;
}

export const useInputStore = create<InputState>((set) => ({
  devices: [],
  lastSource: "keyboard",
  lastEvent: null,

  addDevice: (device) =>
    set((s) => ({
      devices: s.devices.some((d) => d.id === device.id)
        ? s.devices
        : [...s.devices, device],
    })),

  removeDevice: (id) =>
    set((s) => ({ devices: s.devices.filter((d) => d.id !== id) })),

  setLastEvent: (event) => set({ lastEvent: event, lastSource: event.source }),
}));
