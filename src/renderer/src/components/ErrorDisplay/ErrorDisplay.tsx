import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RotateCw } from "lucide-react";

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  message,
  onRetry,
  retryLabel = "Retry",
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-4 p-6"
      style={{
        color: "var(--color-text-dim)",
        minHeight: 200,
      }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={20} style={{ color: "#ff6b6b" }} />
        <span className="text-sm">{message}</span>
      </div>
      {onRetry && (
        <motion.button
          className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium flex items-center gap-2"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={onRetry}
          whileTap={{ scale: 0.96 }}
        >
          <RotateCw size={14} />
          {retryLabel}
        </motion.button>
      )}
    </motion.div>
  );
};
