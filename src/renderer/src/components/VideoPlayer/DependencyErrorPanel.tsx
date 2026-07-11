import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, AlertCircle, CheckCircle, RefreshCw, X } from "lucide-react";
import { MissingDependencyInfo } from "./useNativeVideo";
import { PackageOperationProgress } from "../../../../shared/types";

interface DependencyErrorPanelProps {
  dependency: MissingDependencyInfo;
  errorMessage: string;
  onRetry: () => void;
  onClose: () => void;
}

export const DependencyErrorPanel: React.FC<DependencyErrorPanelProps> = ({
  dependency,
  errorMessage,
  onRetry,
  onClose,
}) => {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [progress, setProgress] = useState<PackageOperationProgress | null>(null);
  const [showAptPassword, setShowAptPassword] = useState(false);
  const [aptPassword, setAptPassword] = useState("");
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = window.htpc.packages.onProgress((prog) => {
      if (prog.packageId === dependency.packageId) {
        setProgress(prog);
        if (prog.status === "success") {
          setInstalling(false);
          setInstalled(true);
        } else if (prog.status === "error") {
          setInstalling(false);
          setInstallError(prog.message || "Installation failed");
        }
      }
    });
    return () => {
      unsubscribe();
    };
  }, [dependency.packageId]);

  const performInstall = useCallback(async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      const result = await window.htpc.packages.install(dependency.packageId);
      if (!result) {
        setInstalling(false);
        setInstallError("Package not found in registry.");
      }
    } catch (err: any) {
      setInstalling(false);
      setInstallError(err.message || String(err));
    }
  }, [dependency.packageId]);

  const handleInstallClick = useCallback(() => {
    const pkgManager = dependency.packageId.startsWith("apt-") ? "apt" : "";
    if (pkgManager === "apt") {
      setShowAptPassword(true);
    } else {
      performInstall();
    }
  }, [dependency.packageId, performInstall]);

  const handleAptPasswordSubmit = useCallback(async () => {
    if (!aptPassword.trim()) return;
    try {
      await window.htpc.packages.setAptPassword(aptPassword);
      setShowAptPassword(false);
      setAptPassword("");
      performInstall();
    } catch (err: any) {
      setInstallError(err.message || String(err));
      setShowAptPassword(false);
    }
  }, [aptPassword, performInstall]);

  const progressPct = progress?.percent;
  const progressMsg = progress?.message;
  const isOp = installing && progress?.status !== "success" && progress?.status !== "error";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.85)",
        zIndex: 10,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          background: "var(--surface-1, #1a1a2e)",
          border: "1px solid var(--border-default, #333)",
          borderRadius: 12,
          padding: "28px 32px",
          maxWidth: 460,
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--accent, #e8743b)20",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {installed ? (
                <CheckCircle size={22} style={{ color: "var(--accent, #e8743b)" }} />
              ) : (
                <AlertCircle size={22} style={{ color: "var(--accent, #e8743b)" }} />
              )}
            </div>
            <div>
              <h3
                className="text-base font-semibold"
                style={{ color: "var(--text-primary, #fff)" }}
              >
                {installed ? "Dependency Installed" : "Missing Dependency"}
              </h3>
              <p
                className="text-xs"
                style={{ color: "var(--text-secondary, #888)" }}
              >
                {dependency.displayName} is required for video playback
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors flex-shrink-0"
            style={{ color: "var(--text-secondary, #888)" }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Description */}
        <p
          className="text-sm"
          style={{ color: "var(--text-secondary, #aaa)", lineHeight: 1.5 }}
        >
          {dependency.description}
        </p>

        {/* Technical error detail (collapsible-looking) */}
        <div
          style={{
            background: "var(--surface-0, #111)",
            border: "1px solid var(--border-default, #222)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <p
            className="text-xs"
            style={{
              color: "var(--text-secondary, #666)",
              fontFamily: "monospace",
              wordBreak: "break-word",
              margin: 0,
            }}
          >
            {errorMessage}
          </p>
        </div>

        {/* Install error */}
        {installError && (
          <div
            style={{
              background: "#ff444415",
              border: "1px solid #ff444430",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <p
              className="text-xs"
              style={{ color: "#ff4444", margin: 0 }}
            >
              {installError}
            </p>
          </div>
        )}

        {/* Progress bar */}
        <AnimatePresence>
          {isOp && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-xs"
                  style={{ color: "var(--text-secondary, #888)" }}
                >
                  {progressMsg || "Installing..."}
                </span>
                {progressPct !== undefined && (
                  <span
                    className="text-xs tabular-nums"
                    style={{ color: "var(--text-secondary, #888)" }}
                  >
                    {progressPct}%
                  </span>
                )}
              </div>
              {progressPct !== undefined && (
                <div
                  className="h-1.5 rounded"
                  style={{
                    background: "var(--surface-0, #111)",
                    border: "1px solid var(--border-default, #222)",
                  }}
                >
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${progressPct}%`,
                      background: "var(--accent, #e8743b)",
                    }}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-1">
          {installed ? (
            <motion.button
              className="px-4 py-2 rounded text-sm font-medium flex items-center gap-2"
              style={{
                background: "var(--accent, #e8743b)",
                color: "var(--surface-base, #000)",
                border: "none",
                cursor: "pointer",
              }}
              onClick={onRetry}
              whileTap={{ scale: 0.96 }}
            >
              <RefreshCw size={15} />
              Retry Playback
            </motion.button>
          ) : (
            <motion.button
              className="px-4 py-2 rounded text-sm font-medium flex items-center gap-2"
              style={{
                background: "var(--accent, #e8743b)",
                color: "var(--surface-base, #000)",
                border: "1px solid var(--accent, #e8743b)",
                opacity: isOp ? 0.6 : 1,
                cursor: isOp ? "not-allowed" : "pointer",
              }}
              onClick={() => !isOp && handleInstallClick()}
              disabled={isOp}
              whileTap={{ scale: isOp ? 1 : 0.96 }}
            >
              <Package size={15} />
              {isOp ? "Installing..." : `Install ${dependency.displayName}`}
            </motion.button>
          )}
          <button
            className="px-4 py-2 rounded text-sm"
            style={{
              background: "var(--surface-0, #111)",
              color: "var(--text-primary, #fff)",
              border: "1px solid var(--border-default, #333)",
              cursor: "pointer",
            }}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* APT Password Modal */}
        <AnimatePresence>
          {showAptPassword && (
            <motion.div
              className="fixed inset-0 flex items-center justify-center z-50"
              style={{ background: "rgba(0, 0, 0, 0.7)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAptPassword(false)}
            >
              <motion.div
                className="p-6 rounded-lg max-w-md w-full"
                style={{
                  background: "var(--surface-1, #1a1a2e)",
                  border: "1px solid var(--border-default, #333)",
                }}
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3
                  className="text-lg font-semibold mb-4"
                  style={{ color: "var(--text-primary, #fff)" }}
                >
                  APT Password Required
                </h3>
                <p
                  className="text-sm mb-4"
                  style={{ color: "var(--text-secondary, #888)" }}
                >
                  Installing system packages requires sudo privileges. Enter your
                  password to continue.
                </p>
                <input
                  type="password"
                  value={aptPassword}
                  onChange={(e) => setAptPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAptPasswordSubmit();
                  }}
                  placeholder="Enter password..."
                  className="w-full px-3 py-2 rounded text-sm mb-4"
                  style={{
                    background: "var(--surface-0, #111)",
                    color: "var(--text-primary, #fff)",
                    border: "1px solid var(--border-default, #333)",
                    outline: "none",
                  }}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <motion.button
                    className="px-4 py-2 rounded text-sm"
                    style={{
                      background: "var(--surface-0, #111)",
                      color: "var(--text-primary, #fff)",
                      border: "1px solid var(--border-default, #333)",
                    }}
                    onClick={() => setShowAptPassword(false)}
                    whileTap={{ scale: 0.96 }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    className="px-4 py-2 rounded text-sm"
                    style={{
                      background: "var(--accent, #e8743b)",
                      color: "var(--surface-base, #000)",
                    }}
                    onClick={handleAptPasswordSubmit}
                    whileTap={{ scale: 0.96 }}
                  >
                    Continue
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
