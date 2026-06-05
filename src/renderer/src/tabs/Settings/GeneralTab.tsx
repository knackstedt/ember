import React from "react";
import { motion } from "framer-motion";
import { useSettingsStore } from "../../store/settings.store";
import { Toggle } from "./shared";
import { Monitor, Power, RotateCcw, Zap } from "lucide-react";

export const GeneralTab: React.FC = () => {
  const { settings, update } = useSettingsStore();

  if (!settings) return null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Power size={20} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Startup & Power
          </h2>
        </div>
        <div className="flex flex-col gap-3 pl-1">
          <Toggle
            label="Start on Boot"
            description="Automatically launch HTPC when your system starts"
            value={settings.startOnBoot}
            onChange={(v) => update({ startOnBoot: v })}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Monitor size={20} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Performance
          </h2>
        </div>
        <div className="flex flex-col gap-3 pl-1">
          <Toggle
            label="Hardware Acceleration"
            description="Use GPU acceleration for smoother UI rendering (requires restart)"
            value={settings.hardwareAcceleration}
            onChange={(v) => update({ hardwareAcceleration: v })}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <RotateCcw size={20} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Application Data
          </h2>
        </div>
        <div className="flex flex-col gap-3 pl-1">
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Manage application settings and cached data.
          </p>
          <motion.button
            className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
            onClick={async () => {
              await window.htpc.app.restart();
            }}
            whileTap={{ scale: 0.96 }}
          >
            <Zap size={16} />
            Restart Application
          </motion.button>
        </div>
      </section>
    </div>
  );
};
