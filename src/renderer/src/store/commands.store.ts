import { create } from "zustand";
import { CommandDefinition, COMMAND_DEFINITIONS } from "../../../shared/commands";

interface CommandsState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  visibleCommands: CommandDefinition[];
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  moveSelection: (delta: number) => void;
  setVisibleCommands: (commands: CommandDefinition[]) => void;
}

function matchesQuery(cmd: CommandDefinition, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const haystack = `${cmd.label} ${cmd.description ?? ""} ${cmd.category}`.toLowerCase();
  const compressed = haystack.replace(/\s+/g, "");
  return terms.every((t) => haystack.includes(t) || compressed.includes(t.replace(/\s+/g, "")));
}

export const useCommandsStore = create<CommandsState>((set, get) => ({
  isOpen: false,
  query: "",
  selectedIndex: 0,
  visibleCommands: COMMAND_DEFINITIONS,

  open: () => {
    set({ isOpen: true, query: "", selectedIndex: 0 });
    // Focus the palette input on next tick
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>("[data-command-palette-input]");
      input?.focus();
    });
  },

  close: () => set({ isOpen: false, query: "", selectedIndex: 0 }),

  toggle: () => {
    const next = !get().isOpen;
    set({ isOpen: next, query: "", selectedIndex: 0 });
    if (next) {
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLInputElement>("[data-command-palette-input]");
        input?.focus();
      });
    }
  },

  setQuery: (query) => {
    const visible = COMMAND_DEFINITIONS.filter((c) => matchesQuery(c, query));
    set({ query, visibleCommands: visible, selectedIndex: 0 });
  },

  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),

  moveSelection: (delta) => {
    const { selectedIndex, visibleCommands } = get();
    const count = visibleCommands.length;
    if (count === 0) return;
    set({ selectedIndex: (selectedIndex + delta + count) % count });
  },

  setVisibleCommands: (visibleCommands) => set({ visibleCommands, selectedIndex: 0 }),
}));
