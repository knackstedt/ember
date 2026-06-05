import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../store/settings.store";
import { useToastStore } from "../../store/toast.store";
import { AlertTriangle, Trash2, RefreshCw, Archive } from "lucide-react";

export const DangerZoneTab: React.FC = () => {
  const { settings } = useSettingsStore();
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [compressing, setCompressing] = useState(false);

  if (!settings) return null;

  const handleCompressAll = async () => {
    setCompressing(true);
    const toastId = useToastStore.getState().push({
      type: "progress",
      message: "Compressing ROMs...",
      progress: 0,
    });

    try {
      const result = await window.htpc.games.compressAll();
      if (result.success > 0) {
        useToastStore.getState().update(toastId, {
          type: "success",
          message: `Compressed ${result.success} ROMs. ${result.failed} failed, ${result.skipped} skipped.`,
        });
      } else if (result.failed > 0) {
        useToastStore.getState().update(toastId, {
          type: "error",
          message: `Failed to compress ${result.failed} ROMs. ${result.skipped} skipped.`,
        });
      } else {
        useToastStore.getState().update(toastId, {
          type: "info",
          message: `No ROMs to compress. ${result.skipped} skipped.`,
        });
      }
    } catch (err) {
      useToastStore.getState().update(toastId, {
        type: "error",
        message: `Compression failed: ${String(err)}`,
      });
    } finally {
      setCompressing(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Archive size={20} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            ROM Compression
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Compress ROM files to emulator-compatible formats to save disk space.
          Original files are always preserved.
        </p>

        <div className="flex flex-col gap-3 p-4 rounded-[var(--radius-card)]" style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-2 mb-1">
            <Archive size={16} style={{ color: "var(--color-accent)" }} />
            <span className="font-medium" style={{ color: "var(--color-text)" }}>Auto Compress All ROMs</span>
          </div>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Compresses all ROM files to their optimal emulator-compatible format
            (.chd, .rvz, .7z, etc.). Original files are kept intact.
          </p>
          <motion.button
            className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
            style={{
              background: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
              color: "var(--color-accent)",
              border: "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)",
              opacity: compressing ? 0.6 : 1,
            }}
            onClick={handleCompressAll}
            disabled={compressing}
            whileTap={{ scale: compressing ? 1 : 0.96 }}
          >
            {compressing ? <RefreshCw size={14} className="animate-spin" /> : <Archive size={14} />}
            {compressing ? "Compressing..." : "Compress All ROMs"}
          </motion.button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={20} style={{ color: "#ff4444" }} />
          <h2 className="text-lg font-semibold" style={{ color: "#ff6666" }}>
            Danger Zone
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          These actions are destructive and cannot be undone. Please proceed with caution.
        </p>

        <div className="flex flex-col gap-3 p-4 rounded-[var(--radius-card)]" style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-2 mb-1">
            <Trash2 size={16} style={{ color: "#ff4444" }} />
            <span className="font-medium" style={{ color: "var(--color-text)" }}>Clear Library Data</span>
          </div>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Removes all scanned games, movies, music, and TV shows from the
            database. Your settings and file paths will be preserved.
          </p>
          <AnimatePresence mode="wait">
            {clearConfirm ? (
              <motion.div
                key="clear-confirm"
                className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
              >
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  Permanently delete all scanned data?
                </span>
                <div className="flex gap-2">
                  <motion.button
                    className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "#e05252",
                      color: "#fff",
                    }}
                    onClick={async () => {
                      await window.htpc.db.clear();
                      await window.htpc.app.restart();
                    }}
                    whileTap={{ scale: 0.96 }}
                  >
                    Confirm
                  </motion.button>
                  <motion.button
                    className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      border: "1px solid var(--color-border)",
                    }}
                    onClick={() => setClearConfirm(false)}
                    whileTap={{ scale: 0.96 }}
                  >
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="clear"
                className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
                style={{
                  background: "#ff444420",
                  color: "#ff4444",
                  border: "1px solid #ff444430",
                }}
                onClick={() => setClearConfirm(true)}
                whileTap={{ scale: 0.96 }}
              >
                <Trash2 size={14} />
                Clear Game Data
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-3 p-4 rounded-[var(--radius-card)]" style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw size={16} style={{ color: "#ff4444" }} />
            <span className="font-medium" style={{ color: "var(--color-text)" }}>Factory Reset</span>
          </div>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Resets all configuration, keybinds, controller mappings, collections,
            and library data. Your actual game and media files will not be touched.
          </p>
          <AnimatePresence mode="wait">
            {clearAllConfirm ? (
              <motion.div
                key="clear-all-confirm"
                className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
              >
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  Reset everything to factory defaults?
                </span>
                <div className="flex gap-2">
                  <motion.button
                    className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "#e05252",
                      color: "#fff",
                    }}
                    onClick={async () => {
                      await window.htpc.db.clearAll();
                      await window.htpc.app.restart();
                    }}
                    whileTap={{ scale: 0.96 }}
                  >
                    Confirm
                  </motion.button>
                  <motion.button
                    className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      border: "1px solid var(--color-border)",
                    }}
                    onClick={() => setClearAllConfirm(false)}
                    whileTap={{ scale: 0.96 }}
                  >
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="clear-all"
                className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
                style={{
                  background: "#ff444420",
                  color: "#ff4444",
                  border: "1px solid #ff444430",
                }}
                onClick={() => setClearAllConfirm(true)}
                whileTap={{ scale: 0.96 }}
              >
                <RefreshCw size={14} />
                Clear All Data
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
};
