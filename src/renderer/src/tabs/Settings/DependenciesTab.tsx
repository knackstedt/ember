import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ManagedPackage,
  PackageOperationProgress,
} from "../../../../shared/types";
import { FlameLoader } from "../../components/FlameLoader";

export const DependenciesTab: React.FC = () => {
  const [packages, setPackages] = useState<ManagedPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [packageSearch, setPackageSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | "core" | "emulator" | "dependency" | "media-codec" | "other"
  >("all");
  const [showAptPassword, setShowAptPassword] = useState(false);
  const [aptPassword, setAptPasswordInput] = useState("");
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  const [operationProgress, setOperationProgress] = useState<
    Map<string, PackageOperationProgress>
  >(new Map());

  /* Lock body scroll when password modal is open */
  useEffect(() => {
    if (showAptPassword) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [showAptPassword]);

  // Load packages on mount
  useEffect(() => {
    loadPackages();
  }, []);

  // Subscribe to package operation progress
  useEffect(() => {
    const unsubscribe = window.htpc.packages.onProgress((progress) => {
      setOperationProgress((prev) => {
        const next = new Map(prev);
        next.set(progress.packageId, progress);
        return next;
      });
      // Auto-refresh package list when an operation completes successfully
      if (progress.status === "success" || progress.status === "error") {
        setTimeout(() => loadPackages(), 500);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const loadPackages = async () => {
    setLoading(true);
    try {
      const pkgs = await window.htpc.packages.list();
      setPackages(pkgs);
    } catch (err) {
      console.error("Failed to load packages:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInstallPackage = async (pkg: ManagedPackage) => {
    if (pkg.manager === "apt" && !pkg.isInstalled) {
      setPendingPackageId(pkg.id);
      setShowAptPassword(true);
      setAptPasswordInput("");
    } else {
      await performInstall(pkg.id);
    }
  };

  const performInstall = async (packageId: string) => {
    try {
      await window.htpc.packages.install(packageId);
      await loadPackages();
    } catch (err) {
      console.error("Failed to install package:", err);
    }
  };

  const handleAptPasswordSubmit = async () => {
    if (aptPassword.trim()) {
      await window.htpc.packages.setAptPassword(aptPassword);
      setShowAptPassword(false);
      setAptPasswordInput("");
      if (pendingPackageId) {
        const id = pendingPackageId;
        const pkg = packages.find((p) => p.id === id);
        setPendingPackageId(null);
        if (pkg?.isInstalled) {
          await performUninstall(id);
        } else {
          await performInstall(id);
        }
      }
    }
  };

  const handleUninstallPackage = async (pkg: ManagedPackage) => {
    if (pkg.manager === "apt" && pkg.isInstalled) {
      setPendingPackageId(pkg.id);
      setShowAptPassword(true);
      setAptPasswordInput("");
    } else {
      await performUninstall(pkg.id);
    }
  };

  const performUninstall = async (packageId: string) => {
    try {
      await window.htpc.packages.uninstall(packageId);
      await loadPackages();
    } catch (err) {
      console.error("Failed to uninstall package:", err);
    }
  };

  const handleTogglePin = async (pkg: ManagedPackage) => {
    setPackages((prev) =>
      prev.map((p) =>
        p.id === pkg.id ? { ...p, isPinned: !p.isPinned } : p
      )
    );
  };

  const handleToggleAutoUpdate = async (pkg: ManagedPackage) => {
    setPackages((prev) =>
      prev.map((p) =>
        p.id === pkg.id ? { ...p, autoUpdate: !p.autoUpdate } : p
      )
    );
  };

  const filteredPackages = packages.filter((pkg) => {
    const matchesCategory =
      selectedCategory === "all" || pkg.category === selectedCategory;
    const matchesSearch =
      pkg.name.toLowerCase().includes(packageSearch.toLowerCase()) ||
      pkg.displayName.toLowerCase().includes(packageSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Dependencies & Cores
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Install, uninstall, and manage Libretro cores, emulators, and system
          dependencies.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search packages..."
              value={packageSearch}
              onChange={(e) => setPackageSearch(e.target.value)}
              className="flex-1 px-3 py-2 rounded text-sm"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                outline: "none",
              }}
            />
          </div>

          <div className="flex gap-1 flex-wrap">
            {[
              { id: "all", label: "All" },
              { id: "core", label: "Libretro Cores" },
              { id: "emulator", label: "Emulators" },
              { id: "dependency", label: "Dependencies" },
              { id: "media-codec", label: "Media Codecs" },
              { id: "other", label: "Other" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id as any)}
                className="px-3 py-1.5 rounded text-sm transition-colors"
                style={{
                  background:
                    selectedCategory === tab.id
                      ? "var(--accent)"
                      : "var(--surface-1)",
                  color:
                    selectedCategory === tab.id
                      ? "var(--surface-base)"
                      : "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <motion.button
              className="px-3 py-2 rounded text-sm flex items-center gap-1.5"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={loadPackages}
              whileTap={{ scale: 0.96 }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
              Refresh
            </motion.button>
          </div>

          <div
            className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto rounded p-2"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-default)",
            }}
          >
            <AnimatePresence mode="wait">
              {loading && packages.length === 0 ? (
                <motion.div
                  key="loader"
                  className="flex items-center justify-center py-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <FlameLoader width={120} height={200} />
                </motion.div>
              ) : filteredPackages.length === 0 ? (
                <motion.p
                  key="empty"
                  className="text-sm text-center py-4"
                  style={{ color: "var(--text-secondary)" }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  No packages found matching your search.
                </motion.p>
              ) : (
                <motion.div
                  key="list"
                  className="flex flex-col gap-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  {filteredPackages.map((pkg) => {
                    const progress = operationProgress.get(pkg.id);
                    const isOp =
                      progress &&
                      progress.status !== "success" &&
                      progress.status !== "error";

                    return (
                      <div
                        key={pkg.id}
                        className="flex flex-col gap-2 p-3 rounded"
                        style={{
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-default)",
                        }}
                      >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {pkg.displayName}
                          </div>
                          <div
                            className="text-xs"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {pkg.name} · {pkg.category} · {pkg.manager}
                            {pkg.version && ` · v${pkg.version}`}
                          </div>
                          {pkg.description && (
                            <div
                              className="text-xs mt-1"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {pkg.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="p-1.5 rounded"
                            disabled={isOp}
                            style={{
                              background: pkg.isPinned
                                ? "var(--accent)20"
                                : "var(--surface-0)",
                              color: pkg.isPinned
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                              border: "1px solid var(--border-default)",
                              opacity: isOp ? 0.5 : 1,
                              cursor: isOp ? "not-allowed" : "pointer",
                            }}
                            onClick={() => !isOp && handleTogglePin(pkg)}
                            title={pkg.isPinned ? "Unpin" : "Pin"}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="12" y1="17" x2="12" y2="22" />
                              <path d="M5 17h14v-5a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v5z" />
                              <path d="M12 9V2l-2 2" />
                            </svg>
                          </button>
                          <button
                            className="p-1.5 rounded"
                            disabled={isOp}
                            style={{
                              background: pkg.autoUpdate
                                ? "var(--accent)20"
                                : "var(--surface-0)",
                              color: pkg.autoUpdate
                                ? "var(--accent)"
                                : "var(--text-secondary)",
                              border: "1px solid var(--border-default)",
                              opacity: isOp ? 0.5 : 1,
                              cursor: isOp ? "not-allowed" : "pointer",
                            }}
                            onClick={() => !isOp && handleToggleAutoUpdate(pkg)}
                            title={
                              pkg.autoUpdate
                                ? "Disable auto-update"
                                : "Enable auto-update"
                            }
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                            </svg>
                          </button>
                          {pkg.isInstalled ? (
                            <motion.button
                              className="px-3 py-1.5 rounded text-xs font-medium"
                              style={{
                                background: "#ff444415",
                                color: "#ff4444",
                                border: "1px solid #ff444430",
                                opacity: isOp ? 0.5 : 1,
                                cursor: isOp ? "not-allowed" : "pointer",
                              }}
                              onClick={() =>
                                !isOp && handleUninstallPackage(pkg)
                              }
                              whileTap={{ scale: isOp ? 1 : 0.96 }}
                            >
                              {isOp ? "Removing..." : "Uninstall"}
                            </motion.button>
                          ) : (
                            <motion.button
                              className="px-3 py-1.5 rounded text-xs font-medium"
                              style={{
                                background: "var(--accent)15",
                                color: "var(--accent)",
                                border: "1px solid var(--accent)40",
                                opacity: isOp ? 0.5 : 1,
                                cursor: isOp ? "not-allowed" : "pointer",
                              }}
                              onClick={() =>
                                !isOp && handleInstallPackage(pkg)
                              }
                              whileTap={{ scale: isOp ? 1 : 0.96 }}
                            >
                              {isOp ? "Installing..." : "Install"}
                            </motion.button>
                          )}
                        </div>
                      </div>
                      {progress && progress.status !== "success" && (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {progress.message}
                            </span>
                            {progress.percent !== undefined && (
                              <span
                                className="text-xs"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {progress.percent}%
                              </span>
                            )}
                          </div>
                          {progress.percent !== undefined && (
                            <div
                              className="h-1 rounded"
                              style={{
                                background: "var(--surface-0)",
                                border: "1px solid var(--border-default)",
                              }}
                            >
                              <div
                                className="h-full rounded transition-all"
                                style={{
                                  width: `${progress.percent}%`,
                                  background:
                                    progress.status === "error"
                                      ? "#ff4444"
                                      : "var(--accent)",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* APT Password Modal */}
      <AnimatePresence>
        {showAptPassword && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{
              background: "rgba(0, 0, 0, 0.7)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAptPassword(false)}
          >
            <motion.div
              className="p-6 rounded-lg max-w-md w-full"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
              }}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                className="text-lg font-semibold mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                APT Password Required
              </h3>
              <p
                className="text-sm mb-4"
                style={{ color: "var(--text-secondary)" }}
              >
                Installing system packages requires sudo privileges. Enter your
                password to continue.
              </p>
              <input
                type="password"
                value={aptPassword}
                onChange={(e) => setAptPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAptPasswordSubmit();
                }}
                placeholder="Enter password..."
                className="w-full px-3 py-2 rounded text-sm mb-4"
                style={{
                  background: "var(--surface-0)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  outline: "none",
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <motion.button
                  className="px-4 py-2 rounded text-sm"
                  style={{
                    background: "var(--surface-0)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                  }}
                  onClick={() => setShowAptPassword(false)}
                  whileTap={{ scale: 0.96 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  className="px-4 py-2 rounded text-sm"
                  style={{
                    background: "var(--accent)",
                    color: "var(--surface-base)",
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
    </div>
  );
};
