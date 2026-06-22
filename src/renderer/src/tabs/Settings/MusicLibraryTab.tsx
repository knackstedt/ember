import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Eye, Play, AlertTriangle, CheckCircle, XCircle, FolderOpen } from "lucide-react";
import { useSettingsStore } from "../../store/settings.store";
import { useToastStore } from "../../store/toast.store";
import { ReorganizeResult } from "../../../../shared/types";

const PATTERNS = [
  { id: "artist/album/track", label: "Artist / Album / Track", example: "Artist Name/Album Name/01 Track Title.mp3" },
  { id: "artist - album/track", label: "Artist - Album / Track", example: "Artist Name - Album Name/01 Track Title.mp3" },
  { id: "genre/artist/album/track", label: "Genre / Artist / Album / Track", example: "Rock/Artist Name/Album Name/01 Track Title.mp3" },
  { id: "year - artist/album/track", label: "Year - Artist / Album / Track", example: "2024 - Artist Name/Album Name/01 Track Title.mp3" },
  { id: "flat", label: "Flat (rename only)", example: "Track Title.mp3" },
  { id: "custom", label: "Custom pattern", example: "Use tokens below" },
];

const TOKENS = [
  "{artist}", "{album}", "{albumArtist}", "{genre}", "{year}", "{trackNumber}", "{title}", "{discNumber}", "{ext}",
];

export const MusicLibraryTab: React.FC = () => {
  const { settings } = useSettingsStore();
  const [pattern, setPattern] = useState("artist/album/track");
  const [customPattern, setCustomPattern] = useState("{artist}/{album}/{trackNumber}{title}{ext}");
  const [preview, setPreview] = useState<ReorganizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [xdgMusicDir, setXdgMusicDir] = useState<string>("");

  useEffect(() => {
    window.htpc.app.getXdgDefaults().then((d) => setXdgMusicDir(d.musicDir));
  }, []);

  const activePattern = pattern === "custom" ? customPattern : pattern;

  async function handlePreview() {
    setLoading(true);
    try {
      const result = await window.htpc.music.reorganizePreview(activePattern);
      setPreview(result);
    } catch (err: any) {
      useToastStore.getState().push({
        type: "error",
        message: `Preview failed: ${err?.message ?? String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleReorganize() {
    if (!preview || preview.moves.length === 0) return;
    setConfirmOpen(false);
    setLoading(true);
    try {
      const result = await window.htpc.music.reorganize(activePattern);
      setPreview(result);
      const successCount = result.moves.length - result.errors.length;
      useToastStore.getState().push({
        type: result.errors.length > 0 ? "warning" : "success",
        message: `Moved ${successCount}/${result.moves.length} files. ${result.errors.length} errors.`,
      });
    } catch (err: any) {
      useToastStore.getState().push({
        type: "error",
        message: `Reorganize failed: ${err?.message ?? String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  const musicPaths = [xdgMusicDir, ...(settings?.musicPaths ?? [])].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Music size={20} style={{ color: "var(--accent)" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Music Library
          </h2>
        </div>

        <div className="flex flex-col gap-3 pl-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Library Paths
            </label>
            {musicPaths.length === 0 && (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                No music paths configured.
              </p>
            )}
            {musicPaths.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                <FolderOpen size={14} />
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Play size={20} style={{ color: "var(--accent)" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Reorganize Files
          </h2>
        </div>

        <div className="flex flex-col gap-3 pl-1">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Move your local music files into a clean folder structure based on metadata.
            This is an explicit opt-in operation and will show a preview before executing.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Folder Pattern
            </label>
            <select
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="text-sm px-3 py-2 rounded"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                outline: "none",
              }}
            >
              {PATTERNS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              Example: {PATTERNS.find((p) => p.id === pattern)?.example}
            </p>
          </div>

          {pattern === "custom" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Custom Pattern
              </label>
              <input
                value={customPattern}
                onChange={(e) => setCustomPattern(e.target.value)}
                placeholder="{artist}/{album}/{trackNumber}{title}{ext}"
                className="text-sm px-3 py-2 rounded"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  outline: "none",
                  fontFamily: "var(--font-mono)",
                }}
              />
              <div className="flex flex-wrap gap-1">
                {TOKENS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setCustomPattern((prev) => prev + t)}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      background: "var(--surface-1)",
                      color: "var(--accent)",
                      border: "1px solid var(--border-default)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <motion.button
              className="px-4 py-2 rounded text-sm flex items-center gap-2"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={handlePreview}
              disabled={loading}
              whileTap={{ scale: 0.96 }}
            >
              <Eye size={16} />
              Preview
            </motion.button>

            <motion.button
              className="px-4 py-2 rounded text-sm flex items-center gap-2"
              style={{
                background: preview && preview.moves.length > 0 ? "var(--accent)" : "var(--surface-1)",
                color: preview && preview.moves.length > 0 ? "var(--surface-base)" : "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={() => {
                if (preview && preview.moves.length > 0) setConfirmOpen(true);
              }}
              disabled={!preview || preview.moves.length === 0 || loading}
              whileTap={{ scale: 0.96 }}
            >
              <Play size={16} />
              Reorganize
            </motion.button>
          </div>

          {loading && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Working…
            </p>
          )}
        </div>
      </section>

      <AnimatePresence>
        {preview && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex flex-col gap-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Eye size={20} style={{ color: "var(--accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Preview
              </h2>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface-1)", color: "var(--text-secondary)" }}>
                {preview.moves.length} moves
              </span>
              {preview.errors.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#ff444420", color: "#ff4444" }}>
                  {preview.errors.length} errors
                </span>
              )}
            </div>

            {preview.moves.length === 0 && (
              <p className="text-sm pl-1" style={{ color: "var(--text-secondary)" }}>
                No files need to be moved.
              </p>
            )}

            {preview.moves.length > 0 && (
              <div
                className="flex flex-col gap-1 max-h-96 overflow-y-auto rounded p-2"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)" }}
              >
                {preview.moves.map((move, i) => (
                  <div
                    key={move.id}
                    className="flex flex-col gap-0.5 text-xs px-2 py-1.5 rounded"
                    style={{
                      background: i % 2 === 0 ? "transparent" : "var(--surface-base)",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      {move.oldPath}
                    </span>
                    <span style={{ color: "var(--accent)" }}>→</span>
                    <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                      {move.newPath}
                    </span>
                    {move.sidecars.length > 0 && (
                      <span style={{ color: "var(--text-secondary)" }}>
                        + {move.sidecars.length} sidecar file{move.sidecars.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {preview.errors.length > 0 && (
              <div className="flex flex-col gap-1">
                {preview.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs" style={{ color: "#ff4444" }}>
                    <XCircle size={14} />
                    {err.id}: {err.error}
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="flex flex-col gap-4 p-6 rounded-lg max-w-md w-full"
              style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} style={{ color: "#ffaa44" }} />
                <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  Confirm Reorganization
                </h3>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                This will move {preview?.moves.length} file{preview && preview.moves.length !== 1 ? "s" : ""} on disk. The current structure will be changed. Continue?
              </p>
              <div className="flex gap-2 justify-end">
                <motion.button
                  className="px-4 py-2 rounded text-sm"
                  style={{
                    background: "var(--surface-1)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                  }}
                  onClick={() => setConfirmOpen(false)}
                  whileTap={{ scale: 0.96 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  className="px-4 py-2 rounded text-sm flex items-center gap-2"
                  style={{
                    background: "var(--accent)",
                    color: "var(--surface-base)",
                  }}
                  onClick={handleReorganize}
                  whileTap={{ scale: 0.96 }}
                >
                  <CheckCircle size={16} />
                  Continue
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
