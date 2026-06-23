import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, Check, X, Loader, AlertTriangle } from "lucide-react";
import { useToastStore, Toast, ToastType } from "../../store/toast.store";

const TYPE_META: Record<ToastType, { icon: React.ReactNode; accent: string }> = {
  info: { icon: <Info size={16} />, accent: "var(--accent)" },
  success: { icon: <Check size={16} />, accent: "#22c55e" },
  warning: { icon: <AlertTriangle size={16} />, accent: "#f59e0b" },
  error: { icon: <X size={16} />, accent: "#ef4444" },
  progress: { icon: <Loader size={16} />, accent: "var(--accent)" },
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
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <span
        className="mt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center"
        style={{ color: meta.accent }}
      >
        {meta.icon}
      </span>

      <p
        className="flex-1 text-sm leading-snug break-words"
        style={{ color: "var(--text-primary)" }}
      >
        {toast.message}
      </p>

      <button
        onClick={() => dismiss(toast.id)}
        className="flex-shrink-0 ml-1 transition-opacity"
        style={{ color: "var(--text-secondary)", opacity: 0.5 }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.opacity = "1")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.opacity = "0.5")
        }
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>

      {/* Progress bar */}
      {toast.type === "progress" && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ background: "var(--border-default)" }}
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
  const toasts = useToastStore((s) => s.toasts).filter((t) => t.type !== "progress");

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
