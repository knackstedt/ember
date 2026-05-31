import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToastStore, Toast, ToastType } from "../../store/toast.store";

const TYPE_META: Record<ToastType, { icon: string; accent: string }> = {
  info: { icon: "ℹ", accent: "var(--color-accent)" },
  success: { icon: "✓", accent: "#22c55e" },
  error: { icon: "✕", accent: "#ef4444" },
  progress: { icon: "⋯", accent: "var(--color-accent)" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const meta = TYPE_META[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 48, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, scale: 0.94 }}
      transition={{ type: "spring", damping: 26, stiffness: 340 }}
      className="relative flex items-start gap-3 rounded-xl px-4 py-3 overflow-hidden"
      style={{
        minWidth: 280,
        maxWidth: 360,
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <span
        className="mt-0.5 flex-shrink-0 text-base leading-none"
        style={{ color: meta.accent }}
      >
        {meta.icon}
      </span>

      <p
        className="flex-1 text-sm leading-snug break-words"
        style={{ color: "var(--color-text)" }}
      >
        {toast.message}
      </p>

      <button
        onClick={() => dismiss(toast.id)}
        className="flex-shrink-0 ml-1 text-xs leading-none transition-opacity"
        style={{ color: "var(--color-text-dim)", opacity: 0.5 }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.opacity = "1")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.opacity = "0.5")
        }
        aria-label="Dismiss"
      >
        ✕
      </button>

      {/* Progress bar */}
      {toast.type === "progress" && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ background: "var(--color-border)" }}
        >
          <motion.div
            className="h-full"
            style={{ background: meta.accent }}
            initial={{ width: "0%" }}
            animate={{
              width: `${Math.min(100, Math.max(0, toast.progress ?? 0))}%`,
            }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        </div>
      )}

      {/* Accent left border */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl"
        style={{ background: meta.accent }}
      />
    </motion.div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
