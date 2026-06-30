import React, { useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, Square, Search, ChevronRight } from "lucide-react";
import { useSplitscreenStore } from "../../store/splitscreen.store";

export const SplitscreenOverlay: React.FC = () => {
  const { session, pauseInstance, resumeInstance, stopInstance, focusSlot, locateDevice } =
    useSplitscreenStore();
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null);

  if (!session) return null;

  const activeSlot = focusedSlot ?? session.activeOverlaySlot ?? 0;
  const activeInstance = session.instances.find((i) => i.slotIndex === activeSlot);
  const activeGame = session.config.instances.find((c) => c.slotIndex === activeSlot)?.game;

  return (
    <div className="flex h-full">
      {/* Player sidebar */}
      <div
        className="flex flex-col gap-1 p-2 border-r"
        style={{
          borderColor: "var(--border-default)",
          minWidth: "180px",
        }}
      >
        <h3 className="text-xs font-semibold mb-2 px-2" style={{ color: "var(--text-secondary)" }}>
          Players
        </h3>
        {session.instances.map((inst) => {
          const game = session.config.instances.find((c) => c.slotIndex === inst.slotIndex)?.game;
          return (
            <motion.button
              key={inst.slotIndex}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                background: activeSlot === inst.slotIndex ? "var(--accent)" : "transparent",
                color: activeSlot === inst.slotIndex ? "var(--surface-base)" : "var(--text-primary)",
              }}
              onClick={() => {
                setFocusedSlot(inst.slotIndex);
                focusSlot(inst.slotIndex);
              }}
              whileTap={{ scale: 0.96 }}
            >
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className="font-semibold">P{inst.slotIndex + 1}</span>
                {game && (
                  <span
                    className="text-xs truncate"
                    style={{
                      color: activeSlot === inst.slotIndex ? "var(--surface-base)" : "var(--text-secondary)",
                    }}
                  >
                    {game.title}
                  </span>
                )}
              </div>
              {inst.paused && (
                <Pause
                  size={12}
                  style={{
                    color: activeSlot === inst.slotIndex ? "var(--surface-base)" : "var(--text-secondary)",
                  }}
                />
              )}
              {inst.status === "running" && !inst.paused && (
                <ChevronRight
                  size={12}
                  style={{
                    color: activeSlot === inst.slotIndex ? "var(--surface-base)" : "var(--text-secondary)",
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Focused player panel */}
      <div className="flex-1 flex flex-col gap-4 p-4">
        {activeInstance && activeGame && (
          <>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Player {activeSlot + 1}: {activeGame.title}
              </h2>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: activeInstance.status === "running" ? "var(--accent)" : "var(--surface-1)",
                  color: activeInstance.status === "running" ? "var(--surface-base)" : "var(--text-secondary)",
                }}
              >
                {activeInstance.status}
              </span>
            </div>

            {activeInstance.error && (
              <div
                className="p-3 rounded text-sm"
                style={{
                  background: "var(--danger)",
                  color: "white",
                }}
              >
                {activeInstance.error}
              </div>
            )}

            {/* Player controls */}
            <div className="flex flex-wrap gap-2">
              {activeInstance.paused ? (
                <motion.button
                  className="px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
                  style={{
                    background: "var(--accent)",
                    color: "var(--surface-base)",
                  }}
                  onClick={() => resumeInstance(activeSlot)}
                  whileTap={{ scale: 0.96 }}
                >
                  <Play size={14} /> Resume
                </motion.button>
              ) : (
                <motion.button
                  className="px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
                  style={{
                    background: "var(--surface-1)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                  }}
                  onClick={() => pauseInstance(activeSlot)}
                  whileTap={{ scale: 0.96 }}
                >
                  <Pause size={14} /> Pause
                </motion.button>
              )}

              <motion.button
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
                onClick={() => stopInstance(activeSlot)}
                whileTap={{ scale: 0.96 }}
              >
                <Square size={14} /> Stop
              </motion.button>

              <motion.button
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
                onClick={() => {
                  const mapping = session.config.deviceMappings.find(
                    (m) => m.slotIndex === activeSlot,
                  );
                  if (mapping) locateDevice(mapping.deviceId);
                }}
                whileTap={{ scale: 0.96 }}
              >
                <Search size={14} /> Locate Controller
              </motion.button>
            </div>

            {/* Instance info */}
            <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              {activeInstance.pid !== null && <div>PID: {activeInstance.pid}</div>}
              {activeInstance.windowId !== null && <div>Window ID: {activeInstance.windowId}</div>}
              {activeInstance.browserWindowId !== null && <div>Window: {activeInstance.browserWindowId}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
