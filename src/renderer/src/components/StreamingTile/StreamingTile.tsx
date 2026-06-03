import React from "react";
import { motion } from "framer-motion";
import { StreamingService } from "../../../../shared/types";

interface Props {
  services: StreamingService[];
}

export const StreamingTile: React.FC<Props> = ({ services }) => {
  const handleLaunch = (svc: StreamingService) => {
    void window.htpc.streaming.launch(svc);
  };

  return (
    <div className="flex flex-col gap-2 flex-shrink-0">
      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--color-border) transparent",
        }}
      >
        {services.map((svc) => (
          <motion.button
            key={svc.id}
            className="flex-shrink-0 relative flex flex-col justify-between rounded-[var(--radius-card)] overflow-hidden"
            style={{
              width: 160,
              aspectRatio: "16/9",
              background: svc.color,
              boxShadow: "var(--shadow-card)",
            }}
            whileHover={{ scale: 1.05, y: -3 }}
            whileTap={{ scale: 0.97 }}
            title={`Open ${svc.name}`}
            onClick={() => handleLaunch(svc)}
          >
            <span
              className="text-3xl px-3 pt-2.5 leading-none select-none"
              aria-hidden
            >
              {svc.icon}
            </span>
            <span
              className="text-sm font-bold px-3 pb-2.5 text-left leading-tight"
              style={{ color: svc.textColor }}
            >
              {svc.name}
            </span>
          </motion.button>
        ))}
      </div>
      <p
        className="text-xs select-none"
        style={{ color: "var(--color-text-dim)" }}
      >
        Opens in your default browser or desktop app
      </p>
    </div>
  );
};
