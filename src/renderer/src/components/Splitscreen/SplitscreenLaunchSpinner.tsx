import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useSplitscreenStore } from "../../store/splitscreen.store";

export const SplitscreenLaunchSpinner: React.FC = () => {
  const { session, instanceProgress } = useSplitscreenStore();

  if (!session) return null;

  const relevantInstances = session.instances.filter(
    (i) => i.status === "launching" || i.status === "error",
  );

  if (relevantInstances.length === 0) return null;

  const hasLaunching = relevantInstances.some((i) => i.status === "launching");

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 flex items-center justify-center"
        style={{ background: "rgba(0, 0, 0, 0.8)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div
          className="flex flex-col gap-4 p-8 rounded-2xl"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
          }}
        >
          <h2 className="text-lg font-semibold text-center" style={{ color: "var(--text-primary)" }}>
            {hasLaunching ? "Launching Splitscreen Session" : "Splitscreen Launch Failed"}
          </h2>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.min(relevantInstances.length, 2)}, 1fr)`,
            }}
          >
            {relevantInstances.map((inst) => {
              const progress = instanceProgress[inst.slotIndex];
              const game = session.config.instances.find(
                (c) => c.slotIndex === inst.slotIndex,
              )?.game;
              return (
                <div
                  key={inst.slotIndex}
                  className="flex flex-col items-center gap-2 p-4 rounded-[var(--radius-card)]"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                    minWidth: "200px",
                  }}
                >
                  <div className="flex items-center gap-2">
                    {inst.status === "launching" && (
                      <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)" }} />
                    )}
                    <span className="text-sm font-semibold" style={{ color: inst.status === "error" ? "var(--danger)" : "var(--accent)" }}>
                      Player {inst.slotIndex + 1}
                    </span>
                  </div>
                  {game && (
                    <span className="text-xs text-center" style={{ color: "var(--text-primary)" }}>
                      {game.title}
                    </span>
                  )}
                  {progress && inst.status === "launching" && (
                    <span className="text-xs text-center" style={{ color: "var(--text-secondary)" }}>
                      {progress.step}
                      {progress.detail ? ` — ${progress.detail}` : ""}
                    </span>
                  )}
                  {inst.status === "error" && (
                    <span className="text-xs text-center" style={{ color: "var(--danger)" }}>
                      Error: {inst.error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
