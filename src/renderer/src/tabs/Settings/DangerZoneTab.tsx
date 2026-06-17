import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../store/settings.store";
import { useToastStore } from "../../store/toast.store";
import { useGamesStore } from "../../store/games.store";
import { useMoviesStore, useMusicStore } from "../../store/media.store";
import {
  AlertTriangle,
  Trash2,
  RefreshCw,
  Archive,
  Ghost,
} from "lucide-react";

interface DangerActionProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  buttonText: string;
  buttonIcon: React.ReactNode;
  confirmText: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

const DangerAction: React.FC<DangerActionProps> = ({
  icon,
  label,
  description,
  buttonText,
  buttonIcon,
  confirmText,
  destructive = true,
  loading = false,
  onConfirm,
}) => {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-[var(--radius-card)]"
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="font-medium" style={{ color: "var(--color-text)" }}>
          {label}
        </span>
      </div>
      <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
        {description}
      </p>
      <AnimatePresence mode="wait">
        {confirming ? (
          <motion.div
            key="confirm"
            className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
          >
            <span
              className="text-sm"
              style={{ color: "var(--color-text-dim)" }}
            >
              {confirmText}
            </span>
            <div className="flex gap-2">
              <motion.button
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  background: destructive ? "#e05252" : "var(--color-accent)",
                  color: "#fff",
                }}
                onClick={async () => {
                  await onConfirm();
                  setConfirming(false);
                }}
                whileTap={{ scale: 0.96 }}
              >
                {loading ? (
                  <RefreshCw size={14} className="animate-spin inline mr-1" />
                ) : null}
                Confirm
              </motion.button>
              <motion.button
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onClick={() => setConfirming(false)}
                whileTap={{ scale: 0.96 }}
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="action"
            className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm flex items-center gap-2"
            style={
              destructive
                ? {
                    background: "#ff444420",
                    color: "#ff4444",
                    border: "1px solid #ff444430",
                  }
                : {
                    background:
                      "color-mix(in srgb, var(--color-accent) 15%, transparent)",
                    color: "var(--color-accent)",
                    border:
                      "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)",
                  }
            }
            onClick={() => setConfirming(true)}
            whileTap={{ scale: 0.96 }}
          >
            {buttonIcon}
            {buttonText}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export const DangerZoneTab: React.FC = () => {
  const { settings } = useSettingsStore();
  const [compressing, setCompressing] = useState(false);
  const [clearingMissing, setClearingMissing] = useState(false);

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

  const handleClearMissing = async () => {
    setClearingMissing(true);
    try {
      const result = await window.htpc.db.deleteMissing();
      useToastStore.getState().push({
        type: "success",
        message: `Deleted ${result.games} games, ${result.movies} movies, ${result.music} tracks marked as missing.`,
      });
      useGamesStore.getState().load();
      useMoviesStore.getState().load();
      useMusicStore.getState().load();
    } catch (err) {
      useToastStore.getState().push({
        type: "error",
        message: `Failed to clear missing items: ${String(err)}`,
      });
    } finally {
      setClearingMissing(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Archive size={20} style={{ color: "var(--color-accent)" }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            ROM Compression
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Compress ROM files to emulator-compatible formats to save disk space.
          Original files are always preserved.
        </p>

        <DangerAction
          icon={<Archive size={16} style={{ color: "var(--color-accent)" }} />}
          label="Auto Compress All ROMs"
          description="Compresses all ROM files to their optimal emulator-compatible format (.chd, .rvz, .7z, etc.). Original files are kept intact."
          buttonText="Compress All ROMs"
          buttonIcon={<Archive size={14} />}
          confirmText="Start compression? This may take a while."
          destructive={false}
          loading={compressing}
          onConfirm={handleCompressAll}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Ghost size={20} style={{ color: "var(--color-accent)" }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Missing Items
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Manage library entries whose files could not be found during the last
          scan.
        </p>

        <DangerAction
          icon={<Ghost size={16} style={{ color: "#ff4444" }} />}
          label="Clear Missing Items"
          description="Removes all library entries marked as Missing from the database. This only affects items whose files could not be found during the last scan."
          buttonText="Clear Missing Items"
          buttonIcon={<Ghost size={14} />}
          confirmText="Permanently delete all missing entries?"
          destructive
          loading={clearingMissing}
          onConfirm={handleClearMissing}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={20} style={{ color: "#ff4444" }} />
          <h2 className="text-lg font-semibold" style={{ color: "#ff6666" }}>
            Danger Zone
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          These actions are destructive and cannot be undone. Please proceed
          with caution.
        </p>

        <DangerAction
          icon={<Trash2 size={16} style={{ color: "#ff4444" }} />}
          label="Clear Library Data"
          description="Removes all scanned games, movies, music, and TV shows from the database. Your settings and file paths will be preserved."
          buttonText="Clear Game Data"
          buttonIcon={<Trash2 size={14} />}
          confirmText="Permanently delete all scanned data?"
          destructive
          onConfirm={async () => {
            await window.htpc.db.clear();
            await window.htpc.app.restart();
          }}
        />

        <DangerAction
          icon={<RefreshCw size={16} style={{ color: "#ff4444" }} />}
          label="Factory Reset"
          description="Resets all configuration, keybinds, controller mappings, collections, and library data. Your actual game and media files will not be touched."
          buttonText="Clear All Data"
          buttonIcon={<RefreshCw size={14} />}
          confirmText="Reset everything to factory defaults?"
          destructive
          onConfirm={async () => {
            await window.htpc.db.clearAll();
            await window.htpc.app.restart();
          }}
        />
      </section>
    </div>
  );
};
