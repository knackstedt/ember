import React, { useState } from "react";
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

export const SettingsTab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SubTabId>("general");
  const ActiveComponent = TAB_COMPONENTS[activeTab];

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
      <div className="flex-1 overflow-y-auto gpu-scroll">
        <div className="max-w-5xl mx-auto p-6">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
};
