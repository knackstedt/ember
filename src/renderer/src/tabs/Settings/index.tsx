import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Palette,
  HardDrive,
  Radio,
  Gamepad2,
  Plug,
  Package,
  AlertTriangle,
  Settings,
  Keyboard,
} from "lucide-react";
import { AppearanceTab } from "./AppearanceTab";
import { GeneralTab } from "./GeneralTab";
import { LocalDataTab } from "./LocalDataTab";
import { DataFeedTab } from "./DataFeedTab";
import { EmulatorsTab } from "./EmulatorsTab";
import { PluginsTab } from "./PluginsTab";
import { DependenciesTab } from "./DependenciesTab";
import { InputTab } from "./InputTab";
import { DangerZoneTab } from "./DangerZoneTab";

const SUB_TABS = [
  { id: "general", label: "General", Icon: Settings },
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "input", label: "Input", Icon: Keyboard },
  { id: "local-data", label: "Local Data", Icon: HardDrive },
  { id: "data-feed", label: "Data Feed", Icon: Radio },
  { id: "emulators", label: "Emulators", Icon: Gamepad2 },
  { id: "plugins", label: "Plugins", Icon: Plug },
  { id: "dependencies", label: "Dependencies", Icon: Package },
  { id: "danger-zone", label: "Danger Zone", Icon: AlertTriangle },
] as const;

type SubTabId = typeof SUB_TABS[number]["id"];

const TAB_COMPONENTS: Record<SubTabId, React.FC> = {
  general: GeneralTab,
  appearance: AppearanceTab,
  input: InputTab,
  "local-data": LocalDataTab,
  "data-feed": DataFeedTab,
  emulators: EmulatorsTab,
  plugins: PluginsTab,
  dependencies: DependenciesTab,
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

export const SettingsTab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SubTabId>("general");
  const ActiveComponent = TAB_COMPONENTS[activeTab];
  const contentRef = useRef<HTMLDivElement>(null);

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;

  /* Reset content focus when sub-tab changes */
  useEffect(() => {
    setFocusedIndex(-1);
  }, [activeTab]);

  /* Apply / remove controller-focus visual indicator and scroll into view */
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    container.querySelectorAll(".settings-focus").forEach((el) => {
      el.classList.remove("settings-focus");
    });

    if (focusedIndex < 0) return;

    const elements = getFocusableElements(container);
    const el = elements[focusedIndex];
    if (!el) return;

    el.classList.add("settings-focus");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedIndex]);

  const handleNav = useCallback(
    (action: string) => {
      const container = contentRef.current;
      const elements = getFocusableElements(container);
      const currentIdx = focusedIndexRef.current;

      switch (action) {
        case "left": {
          const subIdx = SUB_TABS.findIndex((t) => t.id === activeTab);
          if (subIdx > 0) setActiveTab(SUB_TABS[subIdx - 1].id);
          break;
        }
        case "right": {
          const subIdx = SUB_TABS.findIndex((t) => t.id === activeTab);
          if (subIdx < SUB_TABS.length - 1) setActiveTab(SUB_TABS[subIdx + 1].id);
          break;
        }
        case "up": {
          if (elements.length === 0) break;
          if (currentIdx < 0) {
            // In sub-tab bar, pressing up does nothing
            break;
          }
          if (currentIdx === 0) {
            // Exit content nav, return to sub-tabs
            setFocusedIndex(-1);
          } else {
            setFocusedIndex(currentIdx - 1);
          }
          break;
        }
        case "down": {
          if (elements.length === 0) break;
          if (currentIdx < 0) {
            // Enter content nav at first element
            setFocusedIndex(0);
          } else {
            setFocusedIndex(Math.min(elements.length - 1, currentIdx + 1));
          }
          break;
        }
        case "confirm": {
          if (currentIdx < 0 || !elements[currentIdx]) break;
          const el = elements[currentIdx];
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
          break;
        }
        case "cancel": {
          const activeEl = document.activeElement as HTMLElement | null;
          if (container && activeEl && container.contains(activeEl)) {
            activeEl.blur();
          }
          setFocusedIndex(-1);
          break;
        }
      }
    },
    [activeTab]
  );

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
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        {SUB_TABS.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors"
            style={{
              background:
                activeTab === tab.id
                  ? "var(--color-accent)"
                  : "transparent",
              color:
                activeTab === tab.id
                  ? "var(--color-bg)"
                  : "var(--color-text-dim)",
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
