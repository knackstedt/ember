import { create } from "zustand";

interface ContextMenuState {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
}));
