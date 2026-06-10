import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, X, AlertTriangle } from "lucide-react";
import { RemoteSource } from "../../../shared/types";

export const CredentialPrompt: React.FC = () => {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<"master-password" | "session-reauth" | null>(null);
  const [password, setPassword] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [sources, setSources] = useState<RemoteSource[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const list = await window.htpc.rclone.list();
        if (cancelled) return;

        const needsMaster = await window.htpc.credentials.needsMasterPassword(list);
        const needsSession = await window.htpc.credentials.needsSessionReauth(list);

        if (needsMaster) {
          setMode("master-password");
          setShow(true);
          setSources(list);
        } else if (needsSession.length > 0) {
          setMode("session-reauth");
          setShow(true);
          setSources(needsSession);
          setCurrentIndex(0);
        }
      } catch (err) {
        console.error("Credential check failed:", err);
      }
    }

    // Check on mount and periodically
    check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleMasterPasswordSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      await window.htpc.credentials.setMasterPassword(password);
      const has = await window.htpc.credentials.hasMasterPassword();
      if (has) {
        setShow(false);
        setPassword("");
      } else {
        setError("Failed to set master password.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSessionReauthSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const source = sources[currentIndex];
      await window.htpc.rclone.add(
        { ...source },
        { user, password: pass },
      );

      if (currentIndex < sources.length - 1) {
        setCurrentIndex((i) => i + 1);
        setUser("");
        setPass("");
      } else {
        setShow(false);
        setUser("");
        setPass("");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  const currentSource = sources[currentIndex];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.8)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-full max-w-md rounded-[var(--radius-card)] flex flex-col gap-4 p-6"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound size={20} style={{ color: "var(--color-accent)" }} />
              <h3 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                {mode === "master-password"
                  ? "Enter Master Password"
                  : `Reconnect to ${currentSource?.name ?? "Remote"}`}
              </h3>
            </div>
            <button
              onClick={() => setShow(false)}
              className="p-1 rounded"
              style={{ color: "var(--color-text-dim)" }}
            >
              <X size={18} />
            </button>
          </div>

          {mode === "master-password" && (
            <>
              <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
                You have remote sources encrypted with a master password. Please enter it to
                decrypt your credentials for this session.
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                  Master Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleMasterPasswordSubmit();
                  }}
                  className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  autoFocus
                />
              </label>
            </>
          )}

          {mode === "session-reauth" && currentSource && (
            <>
              <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
                This source is configured for session-only credentials. Please re-enter your
                authentication details.
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                  Username
                </span>
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
                  Password
                </span>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSessionReauthSubmit();
                  }}
                  className="px-3 py-2 rounded-[var(--radius-card)] text-sm bg-transparent"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                />
              </label>
              {sources.length > 1 && (
                <div className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                  Source {currentIndex + 1} of {sources.length}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm p-2 rounded" style={{ background: "#3a1515", color: "#ff9999" }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <motion.button
              className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium"
              style={{
                background: "var(--color-surface)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              onClick={() => setShow(false)}
              whileTap={{ scale: 0.96 }}
              disabled={loading}
            >
              Skip
            </motion.button>
            <motion.button
              className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
              }}
              onClick={mode === "master-password" ? handleMasterPasswordSubmit : handleSessionReauthSubmit}
              whileTap={{ scale: 0.96 }}
              disabled={loading || (mode === "master-password" ? !password.trim() : false)}
            >
              {loading ? "Verifying…" : "Continue"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
