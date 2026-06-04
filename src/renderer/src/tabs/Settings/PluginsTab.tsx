import React from "react";
import { motion } from "framer-motion";

export const PluginsTab: React.FC = () => {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Plugins
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Drop TypeScript files or folders into{" "}
          <code
            className="px-1.5 py-0.5 rounded text-xs"
            style={{
              background: "var(--color-surface-raised)",
              fontFamily: "var(--font-mono)",
            }}
          >
            ~/.config/htpc/plugins/
          </code>
        </p>
        <motion.button
          className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-1.5"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={() => window.htpc.plugins.reload()}
          whileTap={{ scale: 0.96 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
          </svg>
          Reload Plugins
        </motion.button>
      </section>
    </div>
  );
};
