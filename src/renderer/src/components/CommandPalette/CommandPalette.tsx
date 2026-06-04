import React, { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCommandsStore } from "../../store/commands.store";
import { useSettingsStore } from "../../store/settings.store";
import { CommandDefinition, CommandCategory } from "../../../../shared/commands";

const CATEGORY_ORDER: CommandCategory[] = [
  "global", "navigation", "gaming", "movies", "music",
  "tv", "player", "visual", "settings",
];

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  global: "Global", navigation: "Navigation", gaming: "Gaming",
  movies: "Movies", music: "Music", tv: "TV Shows",
  player: "Player", visual: "Visual", settings: "Settings",
};

function groupByCategory(commands: CommandDefinition[]): [CommandCategory, CommandDefinition[]][] {
  const map = new Map<CommandCategory, CommandDefinition[]>();
  for (const cmd of commands) {
    const list = map.get(cmd.category) ?? [];
    list.push(cmd);
    map.set(cmd.category, list);
  }
  const result: [CommandCategory, CommandDefinition[]][] = [];
  for (const cat of CATEGORY_ORDER) {
    const list = map.get(cat);
    if (list?.length) result.push([cat, list]);
  }
  return result;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ backgroundColor: "transparent", color: "var(--color-accent)", fontWeight: 700 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/* ─── Memoized row so only the selected row re-renders ─── */
const CommandRow = React.memo<{
  cmd: CommandDefinition;
  query: string;
  isSelected: boolean;
  shortcut: string | undefined;
  onClick: () => void;
  onMouseEnter: () => void;
  scrollRef: (el: HTMLButtonElement | null) => void;
}>(({ cmd, query, isSelected, shortcut, onClick, onMouseEnter, scrollRef }) => (
  <button
    ref={scrollRef}
    onClick={onClick}
    onMouseEnter={onMouseEnter}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      padding: "8px 16px",
      textAlign: "left",
      border: "none",
      borderLeft: isSelected ? "3px solid var(--color-accent)" : "3px solid transparent",
      background: isSelected ? "var(--color-surface-raised)" : "transparent",
      color: "var(--color-text)",
      cursor: "pointer",
      fontSize: 14,
      fontFamily: "inherit",
      borderRadius: 0,
      transition: "background 0.05s",
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontWeight: 500 }}>{highlightMatch(cmd.label, query)}</span>
      {cmd.description && (
        <span style={{ fontSize: 12, color: "var(--color-text-dim)" }}>
          {cmd.description}
        </span>
      )}
    </div>
    {shortcut && (
      <kbd
        style={{
          fontSize: 11,
          padding: "2px 6px",
          borderRadius: 4,
          backgroundColor: isSelected ? "rgba(255,255,255,0.2)" : "var(--color-surface-raised)",
          border: `1px solid ${isSelected ? "rgba(255,255,255,0.3)" : "var(--color-border)"}`,
          color: isSelected ? "rgba(255,255,255,0.9)" : "var(--color-text-dim)",
          fontFamily: "monospace",
          flexShrink: 0,
          marginLeft: 8,
        }}
      >
        {shortcut}
      </kbd>
    )}
  </button>
));
CommandRow.displayName = "CommandRow";

export const CommandPalette: React.FC<{
  onExecute: (cmd: CommandDefinition) => void;
}> = ({ onExecute }) => {
  /* ── subscribe to only what we need ── */
  const isOpen = useCommandsStore((s) => s.isOpen);
  const query = useCommandsStore((s) => s.query);
  const selectedIndex = useCommandsStore((s) => s.selectedIndex);
  const visibleCommands = useCommandsStore((s) => s.visibleCommands);
  const setQuery = useCommandsStore((s) => s.setQuery);
  const moveSelection = useCommandsStore((s) => s.moveSelection);
  const setSelectedIndex = useCommandsStore((s) => s.setSelectedIndex);
  const close = useCommandsStore((s) => s.close);

  const customKeybinds = useSettingsStore((s) => s.settings?.commandKeybinds ?? {});

  /* ── local input state (no store round-trip per keystroke) ── */
  const [inputValue, setInputValue] = useState(query);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingQueryRef = useRef(query);

  /* keep local input in sync when palette opens from outside */
  useEffect(() => {
    if (isOpen) {
      setInputValue(query);
      pendingQueryRef.current = query;
    }
  }, [isOpen, query]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    pendingQueryRef.current = value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(value);
    }, 40); // 40 ms debounce — imperceptible but batches keystrokes
  }, [setQuery]);

  /* ── stable data ── */
  const grouped = useMemo(() => groupByCategory(visibleCommands), [visibleCommands]);

  const flatList = useMemo(() => {
    const out: { cmd: CommandDefinition; flatIndex: number }[] = [];
    let idx = 0;
    for (const [, cmds] of grouped) {
      for (const cmd of cmds) {
        out.push({ cmd, flatIndex: idx });
        idx++;
      }
    }
    return out;
  }, [grouped]);

  const selectedItem = flatList[selectedIndex];

  /* ── imperative scroll (no useEffect) ── */
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastSelectedRef = useRef<number>(-1);

  const setItemRef = useCallback((el: HTMLButtonElement | null, flatIndex: number) => {
    if (flatIndex === selectedIndex && el && scrollContainerRef.current) {
      if (lastSelectedRef.current !== selectedIndex) {
        lastSelectedRef.current = selectedIndex;
        const container = scrollContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offsetTop = elRect.top - containerRect.top + container.scrollTop;
        if (offsetTop < container.scrollTop) {
          container.scrollTop = offsetTop;
        } else if (offsetTop + elRect.height > container.scrollTop + containerRect.height) {
          container.scrollTop = offsetTop + elRect.height - containerRect.height;
        }
      }
    }
  }, [selectedIndex]);

  /* ── keyboard handlers ── */
  const handleExecute = useCallback(
    (cmd: CommandDefinition) => {
      close();
      onExecute(cmd);
    },
    [close, onExecute],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopImmediatePropagation();
        moveSelection(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        moveSelection(-1);
      } else if (e.key === "Enter" && selectedItem) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleExecute(selectedItem.cmd);
      }
    };
    window.addEventListener("keydown", handler);

    /* Controller "cancel" (east / B / ○) also closes the palette */
    const navHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string };
      if (detail?.action === "cancel") {
        close();
      }
    };
    window.addEventListener("htpc:nav", navHandler);

    /* Belt-and-suspenders: also close on the custom escape event */
    const escapeHandler = () => close();
    window.addEventListener("htpc:escape", escapeHandler);

    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("htpc:nav", navHandler);
      window.removeEventListener("htpc:escape", escapeHandler);
    };
  }, [isOpen, selectedItem, close, moveSelection, handleExecute]);

  /* ── close on click outside ── */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (scrollContainerRef.current && !scrollContainerRef.current.contains(target)) {
        close();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  let flatIdx = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "15vh",
            backgroundColor: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            style={{
              width: "min(640px, 90vw)",
              maxHeight: "60vh",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "var(--color-surface-overlay)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
              overflow: "hidden",
            }}
          >
            {/* Header / Search */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18, color: "var(--color-text-dim)" }}>{"/"}</span>
              <input
                data-command-palette-input
                type="text"
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="Type a command..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--color-text)",
                  fontSize: 15,
                  fontFamily: "inherit",
                }}
                autoFocus
              />
              {selectedItem && (
                <span className="text-xs" style={{ color: "var(--color-text-dim)", flexShrink: 0 }}>
                  {selectedIndex + 1} / {visibleCommands.length}
                </span>
              )}
            </div>

            {/* Command list */}
            <div
              ref={scrollContainerRef}
              style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}
            >
              {visibleCommands.length === 0 && (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--color-text-dim)",
                    fontSize: 14,
                  }}
                >
                  No commands found
                </div>
              )}
              {grouped.map(([category, cmds]) => (
                <div key={category}>
                  <div
                    style={{
                      padding: "6px 16px 2px",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--color-text-dim)",
                    }}
                  >
                    {CATEGORY_LABELS[category]}
                  </div>
                  {cmds.map((cmd) => {
                    const isSelected = flatIdx === selectedIndex;
                    const myIdx = flatIdx++;
                    return (
                      <CommandRow
                        key={cmd.id}
                        cmd={cmd}
                        query={query}
                        isSelected={isSelected}
                        shortcut={customKeybinds[cmd.id] ?? cmd.defaultShortcut}
                        onClick={() => handleExecute(cmd)}
                        onMouseEnter={() => setSelectedIndex(myIdx)}
                        scrollRef={(el) => setItemRef(el, myIdx)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer hints */}
            <div
              style={{
                padding: "6px 16px",
                borderTop: "1px solid var(--color-border)",
                fontSize: 11,
                color: "var(--color-text-dim)",
                display: "flex",
                gap: 12,
              }}
            >
              <span>Enter to run</span>
              <span>Esc to close</span>
              <span style={{ marginLeft: "auto" }}>{visibleCommands.length} commands</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
