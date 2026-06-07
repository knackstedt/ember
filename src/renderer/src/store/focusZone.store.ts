import { create } from "zustand";

export type FocusZone = "tab" | "queue" | "player";

interface FocusZoneState {
  activeZone: FocusZone;
  setZone: (zone: FocusZone) => void;
  clearZone: () => void;
}

export const useFocusZoneStore = create<FocusZoneState>((set) => ({
  activeZone: "tab",
  setZone: (zone) => set({ activeZone: zone }),
  clearZone: () => set({ activeZone: "tab" }),
}));
