import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Palette,
  HardDrive,
  Gamepad2,
  Plug,
  Package,
  AlertTriangle,
  Settings,
  Keyboard,
  Monitor,
  Music,
  Info,
  Layers,
  Volume2,
} from "lucide-react";
import { AppearanceTab } from "./AppearanceTab";
import { GeneralTab } from "./GeneralTab";
import { SourcesTab } from "./SourcesTab";
import { EmulatorsTab } from "./EmulatorsTab";
import { PluginsTab } from "./PluginsTab";
import { DependenciesTab } from "./DependenciesTab";
import { InputTab } from "./InputTab";
import { DangerZoneTab } from "./DangerZoneTab";
import { SystemInfoTab } from "./SystemInfoTab";
import { MusicLibraryTab } from "./MusicLibraryTab";
import { AboutTab } from "./AboutTab";
import { OverlayTab } from "./OverlayTab";
import { AudioTab } from "./AudioTab";

const SUB_TABS = [
  { id: "general", label: "General", Icon: Settings },
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "input", label: "Input", Icon: Keyboard },
  { id: "sources", label: "Sources", Icon: HardDrive },
  { id: "music-library", label: "Music Library", Icon: Music },
  { id: "emulators", label: "Emulators", Icon: Gamepad2 },
  { id: "plugins", label: "Plugins", Icon: Plug },
  { id: "dependencies", label: "Dependencies", Icon: Package },
  { id: "overlay", label: "Overlay", Icon: Layers },
  { id: "audio", label: "Audio", Icon: Volume2 },
  { id: "system-info", label: "System Info", Icon: Monitor },
  { id: "about", label: "About", Icon: Info },
  { id: "danger-zone", label: "Danger Zone", Icon: AlertTriangle },
] as const;

type SubTabId = typeof SUB_TABS[number]["id"];

const TAB_COMPONENTS: Record<SubTabId, React.FC> = {
  general: GeneralTab,
  appearance: AppearanceTab,
  input: InputTab,
  sources: SourcesTab,
  "music-library": MusicLibraryTab,
  emulators: EmulatorsTab,
  plugins: PluginsTab,
  dependencies: DependenciesTab,
  overlay: OverlayTab,
  audio: AudioTab,
  "system-info": SystemInfoTab,
  about: AboutTab,
  "danger-zone": DangerZoneTab,
};

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([data-nav-exclude]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    )
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function getGroups(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>("section"));
}

function getFocusableInGroup(group: HTMLElement | null): HTMLElement[] {
  if (!group) return [];
  return Array.from(
    group.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([data-nav-exclude]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    )
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

export const SettingsTab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SubTabId>("general");
  const [focusedSubTab, setFocusedSubTab] = useState<SubTabId>("general");
  const ActiveComponent = TAB_COMPONENTS[activeTab];
  const contentRef = useRef<HTMLDivElement>(null);

  /* ── Navigation state ──
     groupIndex = -1  => focus is in sub-tab bar
     groupIndex >= 0, itemIndex = -1  => a group is focused (group-level nav)
     groupIndex >= 0, itemIndex >= 0  => navigating inside a group
   */
  const [groupIndex, setGroupIndex] = useState(-1);
  const [itemIndex, setItemIndex] = useState(-1);

  const groupIndexRef = useRef(groupIndex);
  const itemIndexRef = useRef(itemIndex);
  groupIndexRef.current = groupIndex;
  itemIndexRef.current = itemIndex;

  /* Keep focused sub-tab in sync with active when changed externally */
  useEffect(() => {
    setFocusedSubTab(activeTab);
  }, [activeTab]);

  /* Reset focus when sub-tab changes */
  useEffect(() => {
    setGroupIndex(-1);
    setItemIndex(-1);
  }, [activeTab]);

  /* Apply / remove visual focus indicators */
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    container.querySelectorAll(".settings-group-focus").forEach((el) => {
      el.classList.remove("settings-group-focus");
    });
    container.querySelectorAll(".settings-focus").forEach((el) => {
      el.classList.remove("settings-focus");
    });

    const groups = getGroups(container);

    if (groupIndex >= 0 && itemIndex < 0) {
      /* Group is focused but not entered */
      const g = groups[groupIndex];
      if (g) {
        g.classList.add("settings-group-focus");
        g.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return;
    }

    if (groupIndex >= 0 && itemIndex >= 0) {
      const items = getFocusableInGroup(groups[groupIndex]);
      const el = items[itemIndex];
      if (el) {
        el.classList.add("settings-focus");
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [groupIndex, itemIndex]);

  const handleNav = useCallback(
    (action: string) => {
      const container = contentRef.current;
      const groups = getGroups(container);
      const gIdx = groupIndexRef.current;
      const iIdx = itemIndexRef.current;

      switch (action) {
        case "left": {
          if (gIdx >= 0 && iIdx >= 0) {
            const orientation = groups[gIdx].dataset.navOrientation;
            if (orientation === "horizontal") {
              /* Horizontal group: Left moves to previous item */
              if (iIdx === 0) {
                setItemIndex(-1);
              } else {
                setItemIndex(iIdx - 1);
              }
            } else if (orientation === "grid") {
              /* Grid group: Left moves to previous column or exits */
              const cols = parseInt(groups[gIdx].dataset.navColumns ?? "1", 10);
              const col = iIdx % cols;
              if (col === 0) {
                setItemIndex(-1);
              } else {
                setItemIndex(iIdx - 1);
              }
            } else {
              /* Vertical group: Left exits back to group level */
              setItemIndex(-1);
            }
          } else if (gIdx >= 0 && iIdx < 0) {
            /* At group level: Left goes back to sub-tabs */
            setGroupIndex(-1);
          } else {
            /* In sub-tabs: Left moves focus to previous sub-tab */
            const subIdx = SUB_TABS.findIndex((t) => t.id === focusedSubTab);
            if (subIdx > 0) setFocusedSubTab(SUB_TABS[subIdx - 1].id);
          }
          break;
        }
        case "right": {
          if (gIdx >= 0 && iIdx < 0) {
            /* At group level: Right enters the group */
            const items = getFocusableInGroup(groups[gIdx]);
            if (items.length > 0) setItemIndex(0);
          } else if (gIdx >= 0 && iIdx >= 0) {
            const items = getFocusableInGroup(groups[gIdx]);
            const orientation = groups[gIdx].dataset.navOrientation;
            if (orientation === "horizontal") {
              /* Horizontal group: Right moves to next item */
              if (iIdx >= items.length - 1) {
                setItemIndex(-1);
              } else {
                setItemIndex(iIdx + 1);
              }
            } else if (orientation === "grid") {
              /* Grid group: Right moves to next column or exits */
              const cols = parseInt(groups[gIdx].dataset.navColumns ?? "1", 10);
              const col = iIdx % cols;
              if (col >= cols - 1 || iIdx >= items.length - 1) {
                setItemIndex(-1);
              } else {
                setItemIndex(iIdx + 1);
              }
            } else {
              /* Vertical group: Right activates the focused item */
              const el = items[iIdx];
              if (el) activateElement(el);
            }
          } else {
            /* In sub-tabs: Right moves focus to next sub-tab */
            const subIdx = SUB_TABS.findIndex((t) => t.id === focusedSubTab);
            if (subIdx < SUB_TABS.length - 1) setFocusedSubTab(SUB_TABS[subIdx + 1].id);
          }
          break;
        }
        case "up": {
          if (gIdx < 0) {
            /* In sub-tabs: Up does nothing */
            break;
          }
          if (iIdx < 0) {
            /* At group level: Up moves to previous group or exits to sub-tabs */
            if (gIdx === 0) {
              setGroupIndex(-1);
            } else {
              setGroupIndex(gIdx - 1);
            }
          } else {
            /* Inside a group: Up moves to previous item or exits to group level */
            const items = getFocusableInGroup(groups[gIdx]);
            const orientation = groups[gIdx].dataset.navOrientation;
            if (orientation === "horizontal") {
              setItemIndex(-1);
            } else if (orientation === "grid") {
              /* Grid group: Up moves to previous row or exits */
              const cols = parseInt(groups[gIdx].dataset.navColumns ?? "1", 10);
              const row = Math.floor(iIdx / cols);
              if (row === 0) {
                setItemIndex(-1);
              } else {
                setItemIndex(iIdx - cols);
              }
            } else if (iIdx === 0) {
              setItemIndex(-1);
            } else {
              setItemIndex(iIdx - 1);
            }
          }
          break;
        }
        case "down": {
          if (gIdx < 0) {
            /* In sub-tabs: Down enters first group */
            if (groups.length > 0) setGroupIndex(0);
          } else if (iIdx < 0) {
            /* At group level: Down moves to next group */
            if (gIdx < groups.length - 1) {
              setGroupIndex(gIdx + 1);
            }
          } else {
            /* Inside a group: Down moves to next item or exits to group level */
            const items = getFocusableInGroup(groups[gIdx]);
            const orientation = groups[gIdx].dataset.navOrientation;
            if (orientation === "horizontal") {
              setItemIndex(-1);
            } else if (orientation === "grid") {
              /* Grid group: Down moves to next row or exits */
              const cols = parseInt(groups[gIdx].dataset.navColumns ?? "1", 10);
              const nextIndex = iIdx + cols;
              if (nextIndex >= items.length) {
                setItemIndex(-1);
              } else {
                setItemIndex(nextIndex);
              }
            } else if (iIdx >= items.length - 1) {
              setItemIndex(-1);
            } else {
              setItemIndex(iIdx + 1);
            }
          }
          break;
        }
        case "confirm": {
          if (gIdx < 0) {
            /* In sub-tabs: confirm activates the focused sub-tab */
            setActiveTab(focusedSubTab);
            break;
          }
          if (iIdx < 0) {
            /* At group level: confirm enters the group */
            const items = getFocusableInGroup(groups[gIdx]);
            if (items.length > 0) setItemIndex(0);
          } else {
            /* Inside a group: confirm activates the item */
            const items = getFocusableInGroup(groups[gIdx]);
            const el = items[iIdx];
            if (el) activateElement(el);
          }
          break;
        }
        case "cancel": {
          const activeEl = document.activeElement as HTMLElement | null;
          if (container && activeEl && container.contains(activeEl)) {
            activeEl.blur();
          }
          if (iIdx >= 0) {
            setItemIndex(-1);
          } else if (gIdx >= 0) {
            setGroupIndex(-1);
          }
          break;
        }
      }
    },
    [activeTab, focusedSubTab]
  );

  function activateElement(el: HTMLElement) {
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") {
      el.focus();
      if (tag === "input") {
        const inputEl = el as HTMLInputElement;
        if (
          inputEl.type === "text" ||
          inputEl.type === "password" ||
          inputEl.type === "number"
        ) {
          inputEl.select();
        }
      }
    } else {
      el.click();
    }
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string };
      if (detail?.action) handleNav(detail.action);
    };
    window.addEventListener("htpc:nav", handler);
    return () => window.removeEventListener("htpc:nav", handler);
  }, [handleNav]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tab navigation */}
      <div
        className="flex-shrink-0 flex gap-1 p-2 overflow-x-auto"
        style={{
          borderBottom: "1px solid var(--border-default)",
          background: "var(--surface-0)",
        }}
      >
        {SUB_TABS.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setFocusedSubTab(tab.id);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${groupIndex === -1 && focusedSubTab === tab.id ? "settings-subtab-focus" : ""}`}
            style={{
              background:
                activeTab === tab.id
                  ? "var(--accent)"
                  : "transparent",
              color:
                activeTab === tab.id
                  ? "var(--surface-base)"
                  : "var(--text-secondary)",
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
            whileTap={{ scale: 0.96 }}
          >
            <tab.Icon size={16} />
            <span>{tab.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Tab content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto gpu-scroll">
        <div className="max-w-5xl mx-auto p-6">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
};
