import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Info,
  Copyright,
  ExternalLink,
  Heart,
  RefreshCw,
  Download,
  RotateCcw,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useSettingsStore } from "../../store/settings.store";
import type { UpdateCheckFrequency } from "../../../../shared/types";

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-3 rounded-lg p-4"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-center gap-2">
        <Icon size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
      </div>
      {children}
    </motion.section>
  );
}

interface UpdaterState {
  status: string;
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  error?: string;
  lastChecked?: number;
  downloadSpeed?: number;
}

const FREQ_LABELS: Record<UpdateCheckFrequency, string> = {
  day: "Every day",
  week: "Every week",
  off: "Off",
};

const BUNDLED_DEPENDENCIES = [
  { name: "Electron", license: "MIT", url: "https://github.com/electron/electron" },
  { name: "React", license: "MIT", url: "https://github.com/facebook/react" },
  { name: "React DOM", license: "MIT", url: "https://github.com/facebook/react" },
  { name: "Framer Motion", license: "MIT", url: "https://github.com/framer/motion" },
  { name: "Tailwind CSS", license: "MIT", url: "https://github.com/tailwindlabs/tailwindcss" },
  { name: "Zustand", license: "MIT", url: "https://github.com/pmndrs/zustand" },
  { name: "esbuild", license: "MIT", url: "https://github.com/evanw/esbuild" },
  { name: "source-map", license: "BSD-3-Clause", url: "https://github.com/mozilla/source-map" },
  { name: "Lucide React", license: "ISC", url: "https://github.com/lucide-icons/lucide" },
  { name: "Simple Icons", license: "CC0-1.0", url: "https://github.com/simple-icons/simple-icons" },
  { name: "Virtua", license: "MIT", url: "https://github.com/inokawa/virtua" },
  { name: "React Grid Layout", license: "MIT", url: "https://github.com/react-grid-layout/react-grid-layout" },
  { name: "Butterchurn", license: "MIT", url: "https://github.com/jberg/butterchurn" },
  { name: "Butterchurn Presets", license: "MIT", url: "https://github.com/jberg/butterchurn-presets" },
  { name: "Ruffle", license: "MIT / Apache-2.0", url: "https://github.com/ruffle-rs/ruffle" },
  { name: "SurrealDB", license: "BUSL-1.1", url: "https://github.com/surrealdb/surrealdb" },
  { name: "@surrealdb/node", license: "BUSL-1.1", url: "https://github.com/surrealdb/surrealdb.node" },
  { name: "@xenova/transformers", license: "Apache-2.0", url: "https://github.com/xenova/transformers.js" },
  { name: "jsnes", license: "MIT", url: "https://github.com/bfirsh/jsnes" },
  { name: "music-metadata", license: "MIT", url: "https://github.com/Borewit/music-metadata" },
  { name: "node-id3", license: "MIT", url: "https://github.com/Zazama/node-id3" },
  { name: "node-stream-zip", license: "MIT", url: "https://github.com/antelle/node-stream-zip" },
  { name: "multicast-dns", license: "MIT", url: "https://github.com/mafintosh/multicast-dns" },
  { name: "castv2", license: "MIT", url: "https://github.com/thibauts/node-castv2" },
  { name: "Matrix Animation", license: "MIT", url: "https://github.com/knackstedt/matrix-animation" },
];

const SYSTEM_DEPENDENCIES = [
  { name: "FFmpeg", license: "LGPL/GPL", url: "https://ffmpeg.org", note: "must be installed on the system" },
  { name: "GStreamer", license: "LGPL", url: "https://gstreamer.freedesktop.org", note: "must be installed on the system" },
  { name: "libmpv", license: "LGPL", url: "https://mpv.io", note: "must be installed on the system" },
  { name: "libretro", license: "Various", url: "https://www.libretro.com", note: "cores installed separately" },
  { name: "rclone", license: "MIT", url: "https://rclone.org", note: "must be installed on the system" },
];

export const AboutTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [updaterState, setUpdaterState] = useState<UpdaterState | null>(null);
  const [releases, setReleases] = useState<Array<{ tag_name: string; name: string }>>([]);
  const [showPinDropdown, setShowPinDropdown] = useState(false);
  const [showFreqDropdown, setShowFreqDropdown] = useState(false);

  useEffect(() => {
    let unsubState: (() => void) | undefined;
    let unsubProgress: (() => void) | undefined;

    window.htpc.updater.getState().then((s) => setUpdaterState(s));

    unsubState = window.htpc.updater.onState((s) => setUpdaterState(s));
    unsubProgress = window.htpc.updater.onProgress((p) => {
      setUpdaterState((prev) =>
        prev ? { ...prev, progress: p.percent, downloadSpeed: p.speed } : prev,
      );
    });

    return () => {
      unsubState?.();
      unsubProgress?.();
    };
  }, []);

  const loadReleases = useCallback(async () => {
    try {
      const list = await window.htpc.updater.releases();
      setReleases(list.map((r) => ({ tag_name: r.tag_name, name: r.name })));
    } catch {
      setReleases([]);
    }
  }, []);

  const handleCheck = async () => {
    await window.htpc.updater.check();
  };

  const handleDownload = async () => {
    await window.htpc.updater.download();
  };

  const handleInstall = async () => {
    await window.htpc.updater.install();
  };

  const handleRollback = async () => {
    await window.htpc.updater.rollback();
  };

  const handlePin = async (tag: string) => {
    setShowPinDropdown(false);
    await window.htpc.updater.pin(tag);
  };

  const status = updaterState?.status ?? "idle";
  const currentVersion = updaterState?.currentVersion ?? "—";
  const availableVersion = updaterState?.availableVersion;
  const progress = updaterState?.progress ?? 0;

  const freq = settings?.updateCheckFrequency ?? "week";
  const autoDownload = settings?.updateAutoDownload ?? true;
  const autoInstall = settings?.updateAutoInstall ?? false;
  const pinned = settings?.updatePinnedVersion;

  const setFreq = (v: UpdateCheckFrequency) => {
    update({ updateCheckFrequency: v });
    window.htpc.updater.schedule();
  };

  const setAutoDownload = (v: boolean) => update({ updateAutoDownload: v });
  const setAutoInstall = (v: boolean) => update({ updateAutoInstall: v });

  const isBusy =
    status === "checking" || status === "downloading" || status === "installing";

  return (
    <div className="flex flex-col gap-6">
      {/* Application Info & Updater */}
      <SectionCard icon={Info} title="Ember">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Ember is a Home Theater PC application built for the living room.
            It brings together local media, game emulation, and streaming into a single unified interface.
          </p>

          {/* Version & Status */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Current version
              </span>
              <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                {currentVersion}
              </span>
              {status === "available" && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Update available: {availableVersion}
                </span>
              )}
              {status === "downloaded" && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Ready to install: {availableVersion}
                </span>
              )}
              {status === "rollback" && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--warning-fg)", color: "#fff" }}
                >
                  Rolling back…
                </span>
              )}
              {status === "error" && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: "#ff6b6b", color: "#fff" }}
                >
                  <AlertCircle size={12} />
                  Error
                </span>
              )}
            </div>

            {/* Progress bar */}
            {(status === "downloading" || status === "installing") && (
              <div className="flex flex-col gap-1">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border-default)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "var(--accent)", width: `${progress}%` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span>
                    {status === "downloading" ? "Downloading" : "Installing"}… {progress}%
                  </span>
                  {updaterState?.downloadSpeed && (
                    <span>{(updaterState.downloadSpeed / 1024 / 1024).toFixed(1)} MB/s</span>
                  )}
                </div>
              </div>
            )}

            {updaterState?.error && (
              <p className="text-xs" style={{ color: "#ff6b6b" }}>
                {updaterState.error}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCheck}
              disabled={isBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {status === "checking" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Check for updates
            </button>

            {status === "available" && (
              <button
                onClick={handleDownload}
                disabled={isBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm disabled:opacity-50"
                style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              >
                <Download size={14} />
                Download {availableVersion}
              </button>
            )}

            {status === "downloaded" && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                <Check size={14} />
                Install & Restart
              </button>
            )}

            <button
              onClick={handleRollback}
              disabled={isBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm disabled:opacity-50"
              style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            >
              <RotateCcw size={14} />
              Rollback
            </button>
          </div>

          {/* Update settings */}
          <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: "var(--border-default)" }}>
            {/* Check frequency */}
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                Auto check for updates
              </span>
              <div className="relative">
                <button
                  onClick={() => {
                    setShowPinDropdown(false);
                    setShowFreqDropdown((v) => !v);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded text-sm"
                  style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                >
                  {FREQ_LABELS[freq]}
                  <ChevronDown size={14} />
                </button>
                {showFreqDropdown && (
                  <div className="absolute right-0 mt-1 rounded-md overflow-hidden shadow-lg z-10 min-w-[140px]"
                    style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)" }}
                  >
                    {(["day", "week", "off"] as UpdateCheckFrequency[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setFreq(f);
                          setShowFreqDropdown(false);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {FREQ_LABELS[f]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Auto download */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                Auto download updates
              </span>
              <input
                type="checkbox"
                checked={autoDownload}
                onChange={(e) => setAutoDownload(e.target.checked)}
                className="w-4 h-4 accent-current"
                style={{ accentColor: "var(--accent)" }}
              />
            </label>

            {/* Auto install */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                Auto install updates
              </span>
              <input
                type="checkbox"
                checked={autoInstall}
                onChange={(e) => setAutoInstall(e.target.checked)}
                className="w-4 h-4 accent-current"
                style={{ accentColor: "var(--accent)" }}
              />
            </label>

            {/* Pin version */}
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                Pin version
              </span>
              <div className="relative">
                <button
                  onClick={() => {
                    setShowFreqDropdown(false);
                    if (releases.length === 0) loadReleases();
                    setShowPinDropdown((v) => !v);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded text-sm min-w-[140px] justify-between"
                  style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                >
                  <span className="truncate">{pinned ?? "Latest"}</span>
                  <ChevronDown size={14} />
                </button>
                {showPinDropdown && (
                  <div className="absolute right-0 mt-1 rounded-md overflow-hidden shadow-lg z-10 max-h-48 overflow-y-auto min-w-[200px]"
                    style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)" }}
                  >
                    <button
                      onClick={() => {
                        update({ updatePinnedVersion: undefined });
                        setShowPinDropdown(false);
                      }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:opacity-80"
                      style={{ color: pinned ? "var(--text-secondary)" : "var(--accent)" }}
                    >
                      Latest (no pin)
                    </button>
                    {releases.map((r) => (
                      <button
                        key={r.tag_name}
                        onClick={() => handlePin(r.tag_name)}
                        className="block w-full text-left px-3 py-1.5 text-sm hover:opacity-80"
                        style={{ color: pinned === r.tag_name ? "var(--accent)" : "var(--text-primary)" }}
                      >
                        {r.tag_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {pinned && (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Pinned to {pinned}. Ember will only auto-update to this version.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <a
              href="https://getember.tv"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm"
              style={{ color: "var(--accent)" }}
            >
              <ExternalLink size={14} />
              getember.tv
            </a>
            <a
              href="https://github.com/knackstedt/ember"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm"
              style={{ color: "var(--accent)" }}
            >
              <ExternalLink size={14} />
              github.com/knackstedt/ember
            </a>
          </div>
        </div>
      </SectionCard>

      {/* Trademark Disclaimer */}
      <SectionCard icon={Copyright} title="Trademarks & Copyright">
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            All product names, logos, brand identifiers, and icons displayed within Ember are the
            property of their respective copyright holders. This includes but is not limited to:
          </p>
          <ul className="list-disc list-inside text-sm" style={{ color: "var(--text-secondary)" }}>
            <li>Game console and platform logos (Nintendo, Sony PlayStation, Microsoft Xbox, Sega, etc.)</li>
            <li>Game titles and their associated artwork</li>
            <li>Media company and streaming service logos</li>
            <li>Icons from the Simple Icons and Lucide icon libraries</li>
          </ul>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Use of these marks does not imply any affiliation with or endorsement by their respective owners.
            Ember is an independent project and is not sponsored, authorized, or affiliated with any of the
            aforementioned companies or organizations.
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Users are responsible for obtaining their own legally owned copies of games, firmware, and BIOS
            files required for emulation. Ember does not distribute copyrighted material.
          </p>
        </div>
      </SectionCard>

      {/* Open Source Dependencies */}
      <SectionCard icon={Heart} title="Open Source Dependencies">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Ember is built on top of many excellent open-source projects. We are grateful to the
            communities and individuals who make this possible.
          </p>

          {/* Bundled */}
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Bundled with Ember
            </h4>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              These libraries are shipped with the application.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {BUNDLED_DEPENDENCIES.map((dep: typeof BUNDLED_DEPENDENCIES[number]) => (
                <div
                  key={dep.name}
                  className="flex justify-between items-center text-sm py-1 border-b border-dashed"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <a
                    href={dep.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {dep.name}
                    <ExternalLink size={12} style={{ color: "var(--text-secondary)" }} />
                  </a>
                  <span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                    {dep.license}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* System / Runtime */}
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              System Runtime Dependencies
            </h4>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              These are installed on your system's package manager and Ember links to them dynamically at runtime. Ember provides installation helpers for them in the Dependencies tab.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {SYSTEM_DEPENDENCIES.map((dep: typeof SYSTEM_DEPENDENCIES[number]) => (
                <div
                  key={dep.name}
                  className="flex justify-between items-center text-sm py-1 border-b border-dashed"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <a
                    href={dep.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {dep.name}
                    <ExternalLink size={12} style={{ color: "var(--text-secondary)" }} />
                  </a>
                  <span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                    {dep.license}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Warranty Disclaimer */}
      <SectionCard icon={Info} title="Disclaimer">
        <div className="flex flex-col gap-2">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Ember is provided &quot;as is&quot;, without warranty of any kind, express or implied, including
            but not limited to the warranties of merchantability, fitness for a particular purpose,
            and noninfringement. In no event shall the authors or copyright holders be liable for any
            claim, damages, or other liability, whether in an action of contract, tort, or otherwise,
            arising from, out of, or in connection with the software or the use or other dealings
            in the software.
          </p>
        </div>
      </SectionCard>
    </div>
  );
};
