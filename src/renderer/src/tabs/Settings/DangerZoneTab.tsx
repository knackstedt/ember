import React, { useEffect, useMemo, useState } from "react";
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
  ShieldAlert,
  Gamepad2,
  Film,
  Music,
  FolderOpen,
  Check,
  X,
  Monitor,
} from "lucide-react";
import { Game, Movie, MusicTrack } from "../../../../shared/types";

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
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
      </div>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
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
              style={{ color: "var(--text-secondary)" }}
            >
              {confirmText}
            </span>
            <div className="flex gap-2">
              <motion.button
                className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                style={{
                  background: destructive ? "#e05252" : "var(--accent)",
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
                  background: "var(--surface-0)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
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
                      "color-mix(in srgb, var(--accent) 15%, transparent)",
                    color: "var(--accent)",
                    border:
                      "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
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

type CorruptType = "game" | "movie" | "music";

interface CorruptedEntry {
  id: string;
  type: CorruptType;
  title: string;
  path: string;
}

const TYPE_ICONS: Record<CorruptType, React.ElementType> = {
  game: Gamepad2,
  movie: Film,
  music: Music,
};

const TYPE_LABELS: Record<CorruptType, string> = {
  game: "Game",
  movie: "Movie",
  music: "Music",
};

const POLICY_OPTIONS: { value: "warn" | "hide" | "delete"; label: string }[] = [
  { value: "warn", label: "Warn" },
  { value: "hide", label: "Hide" },
  { value: "delete", label: "Delete" },
];

function CorruptedItemCard({
  entry,
  onOpenLocation,
}: {
  entry: CorruptedEntry;
  onOpenLocation: (entry: CorruptedEntry) => void;
}) {
  const Icon = TYPE_ICONS[entry.type];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="flex flex-col gap-2 p-3 rounded-[var(--radius-card)]"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="p-2 rounded-lg shrink-0"
          style={{ background: "var(--surface-1)" }}
        >
          <Icon size={18} style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{
              background: "#ff444420",
              color: "#ff4444",
            }}
          >
            {TYPE_LABELS[entry.type]}
          </span>
          <p
            className="font-medium text-sm truncate mt-1"
            style={{ color: "var(--text-primary)" }}
            title={entry.title}
          >
            {entry.title}
          </p>
          {entry.path && (
            <p
              className="text-xs truncate"
              style={{ color: "var(--text-secondary)" }}
              title={entry.path}
            >
              {entry.path}
            </p>
          )}
        </div>
      </div>
      {entry.path && (
        <motion.button
          className="self-start flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-card)] text-xs"
          style={{
            background: "var(--surface-1)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
          }}
          onClick={() => onOpenLocation(entry)}
          whileTap={{ scale: 0.96 }}
        >
          <FolderOpen size={14} />
          Open file location
        </motion.button>
      )}
    </motion.div>
  );
}

export const DangerZoneTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [compressing, setCompressing] = useState(false);
  const [clearingMissing, setClearingMissing] = useState(false);
  const [removingDesktopEntries, setRemovingDesktopEntries] = useState(false);
  const [corruptEntries, setCorruptEntries] = useState<CorruptedEntry[]>([]);
  const [corruptLoading, setCorruptLoading] = useState(true);
  const [corruptDeleting, setCorruptDeleting] = useState(false);
  const [corruptConfirming, setCorruptConfirming] = useState(false);

  const policy = settings?.corruptedFilesPolicy ?? "warn";

  if (!settings) return null;

  const loadCorrupt = async () => {
    setCorruptLoading(true);
    try {
      const { games, movies, music } = await window.htpc.db.listCorrupt();
      const next: CorruptedEntry[] = [
        ...games.map((g: Game) => ({
          id: g.id,
          type: "game" as CorruptType,
          title: g.title,
          path: g.compressedRomPath || g.romPath || g.execPath || "",
        })),
        ...movies.map((m: Movie) => ({
          id: m.id,
          type: "movie" as CorruptType,
          title: m.title,
          path: m.filePath,
        })),
        ...music.map((t: MusicTrack) => ({
          id: t.id,
          type: "music" as CorruptType,
          title: t.title,
          path: t.filePath,
        })),
      ];
      setCorruptEntries(next);
    } catch (err) {
      useToastStore.getState().push({
        type: "error",
        message: `Failed to load corrupted entries: ${String(err)}`,
      });
    } finally {
      setCorruptLoading(false);
    }
  };

  useEffect(() => {
    loadCorrupt();
  }, []);

  const corruptCounts = useMemo(() => {
    return {
      games: corruptEntries.filter((e) => e.type === "game").length,
      movies: corruptEntries.filter((e) => e.type === "movie").length,
      music: corruptEntries.filter((e) => e.type === "music").length,
    };
  }, [corruptEntries]);

  const handleOpenCorruptLocation = async (entry: CorruptedEntry) => {
    if (!entry.path) return;
    try {
      await window.htpc.shell.showItemInFolder(entry.path);
    } catch (err) {
      useToastStore.getState().push({
        type: "error",
        message: `Failed to open location: ${String(err)}`,
      });
    }
  };

  const handleDeleteAllCorrupt = async () => {
    setCorruptDeleting(true);
    try {
      const result = await window.htpc.db.deleteCorrupt();
      useToastStore.getState().push({
        type: "success",
        message: `Deleted ${result.games} games, ${result.movies} movies, ${result.music} tracks marked as corrupt.`,
      });
      useGamesStore.getState().load();
      useMoviesStore.getState().load();
      useMusicStore.getState().load();
      setCorruptEntries([]);
      setCorruptConfirming(false);
    } catch (err) {
      useToastStore.getState().push({
        type: "error",
        message: `Failed to delete corrupted entries: ${String(err)}`,
      });
    } finally {
      setCorruptDeleting(false);
    }
  };

  const handleRemoveAllDesktopEntries = async () => {
    setRemovingDesktopEntries(true);
    try {
      const result = await window.htpc.games.desktopEntry.removeAll();
      useToastStore.getState().push({
        type: "success",
        message: `Removed ${result.count} desktop entries and launch scripts.`,
      });
    } catch (err) {
      useToastStore.getState().push({
        type: "error",
        message: `Failed to remove desktop entries: ${String(err)}`,
      });
    } finally {
      setRemovingDesktopEntries(false);
    }
  };

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
          <Archive size={20} style={{ color: "var(--accent)" }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            ROM Compression
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Compress ROM files to emulator-compatible formats to save disk space.
          Original files are always preserved.
        </p>

        <DangerAction
          icon={<Archive size={16} style={{ color: "var(--accent)" }} />}
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
          <Ghost size={20} style={{ color: "var(--accent)" }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Missing Items
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
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
          <ShieldAlert size={20} style={{ color: "#ff4444" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Corrupted Files
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Manage library entries whose files were detected as corrupt or malformed.
        </p>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Corrupted files policy
          </h3>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Choose how the app handles newly detected corrupt files.
          </p>
          <div className="flex flex-wrap gap-2">
            {POLICY_OPTIONS.map((option) => {
              const active = policy === option.value;
              return (
                <motion.button
                  key={option.value}
                  className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
                  style={{
                    background: active
                      ? "var(--accent)"
                      : "var(--surface-1)",
                    color: active ? "var(--surface-base)" : "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                  }}
                  onClick={() => update({ corruptedFilesPolicy: option.value })}
                  whileTap={{ scale: 0.96 }}
                >
                  {option.label}
                </motion.button>
              );
            })}
          </div>
          {policy === "delete" && (
            <div
              className="flex items-start gap-2 p-3 rounded-[var(--radius-card)] text-sm"
              style={{
                background: "#ff444420",
                border: "1px solid #ff444430",
                color: "#ff4444",
              }}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                Experimental: the "Delete" policy will automatically remove corrupted
                library entries when they are detected. This is a destructive action
                and cannot be undone.
              </span>
            </div>
          )}
          {policy === "hide" && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Corrupted entries will be hidden from the main library views but remain
              visible in this list.
            </p>
          )}
          {policy === "warn" && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Corrupted entries will be flagged and listed here for manual review.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>
              {corruptCounts.games} games
            </span>
            <span style={{ color: "var(--border-default)" }}>•</span>
            <span style={{ color: "var(--text-secondary)" }}>
              {corruptCounts.movies} movies
            </span>
            <span style={{ color: "var(--border-default)" }}>•</span>
            <span style={{ color: "var(--text-secondary)" }}>
              {corruptCounts.music} music tracks
            </span>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-card)] text-sm"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={loadCorrupt}
              whileTap={{ scale: 0.96 }}
            >
              <RefreshCw size={14} />
              Refresh
            </motion.button>
            <AnimatePresence mode="wait">
              {corruptConfirming ? (
                <motion.div
                  key="confirm"
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                >
                  <motion.button
                    className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{ background: "#e05252", color: "#fff" }}
                    onClick={handleDeleteAllCorrupt}
                    whileTap={{ scale: 0.96 }}
                    disabled={corruptDeleting}
                  >
                    {corruptDeleting ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    Confirm
                  </motion.button>
                  <motion.button
                    className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-card)] text-sm"
                    style={{
                      background: "var(--surface-0)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-default)",
                    }}
                    onClick={() => setCorruptConfirming(false)}
                    whileTap={{ scale: 0.96 }}
                    disabled={corruptDeleting}
                  >
                    <X size={14} />
                    Cancel
                  </motion.button>
                </motion.div>
              ) : (
                <motion.button
                  key="delete"
                  className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-card)] text-sm"
                  style={{
                    background: "#ff444420",
                    color: "#ff4444",
                    border: "1px solid #ff444430",
                  }}
                  onClick={() => setCorruptConfirming(true)}
                  whileTap={{ scale: 0.96 }}
                  disabled={corruptEntries.length === 0}
                >
                  <Trash2 size={14} />
                  Delete all
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {corruptConfirming && (
          <div
            className="p-3 rounded-[var(--radius-card)] text-sm"
            style={{
              background: "#ff444420",
              border: "1px solid #ff444430",
              color: "#ff4444",
            }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                Permanently delete all {corruptEntries.length} corrupted library entries?
                This cannot be undone.
              </span>
            </div>
          </div>
        )}

        {corruptLoading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{
                borderColor: "var(--accent)",
                borderTopColor: "transparent",
              }}
            />
          </div>
        ) : corruptEntries.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 py-12 rounded-[var(--radius-card)]"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
            }}
          >
            <AlertTriangle size={32} style={{ color: "var(--accent)" }} />
            <p style={{ color: "var(--text-secondary)" }}>
              No corrupted entries found.
            </p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
            data-nav-orientation="grid"
            data-nav-columns="3"
          >
            <AnimatePresence>
              {corruptEntries.map((entry) => (
                <CorruptedItemCard
                  key={`${entry.type}:${entry.id}`}
                  entry={entry}
                  onOpenLocation={handleOpenCorruptLocation}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={20} style={{ color: "#ff4444" }} />
          <h2 className="text-lg font-semibold" style={{ color: "#ff6666" }}>
            Danger Zone
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          These actions are destructive and cannot be undone. Please proceed
          with caution.
        </p>

        <DangerAction
          icon={<Monitor size={16} style={{ color: "#ff4444" }} />}
          label="Delete All .desktop Entries"
          description="Removes all Ember-created .desktop files and launch scripts from your system. This only affects entries created by Ember."
          buttonText="Delete .desktop Entries"
          buttonIcon={<Trash2 size={14} />}
          confirmText="Remove all Ember-created .desktop entries?"
          destructive
          loading={removingDesktopEntries}
          onConfirm={handleRemoveAllDesktopEntries}
        />

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
