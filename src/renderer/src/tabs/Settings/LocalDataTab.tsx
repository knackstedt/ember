import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useSettingsStore } from "../../store/settings.store";
import { PathList, Toggle } from "./shared";
import {
  SCAN_SOURCE_LABELS,
  ScanSourceId,
} from "../../../../shared/scan-sources";

export const LocalDataTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [xdgDefaults, setXdgDefaults] = useState<{
    videosDir: string;
    musicDir: string;
    roms: string[];
    steam: string[];
    heroic: string[];
    lutris: string[];
    desktop: string[];
    retroarch: string[];
    bottles: string[];
    itch: string[];
    kodi: string[];
    jellyfin: string[];
    plex: string[];
    mounts: string[];
  } | null>(null);
  const [sourceCounts, setSourceCounts] = useState<Record<ScanSourceId, number>>({
    steam: 0,
    heroic: 0,
    lutris: 0,
    desktop: 0,
    dolphin: 0,
    rom: 0,
    flash: 0,
    v86: 0,
    windows: 0,
    itch: 0,
  });
  const [clearing, setClearing] = useState<Record<ScanSourceId, boolean>>({
    steam: false,
    heroic: false,
    lutris: false,
    desktop: false,
    dolphin: false,
    rom: false,
    flash: false,
    v86: false,
    windows: false,
    itch: false,
  });

  useEffect(() => {
    window.htpc.app
      .getXdgDefaults()
      .then((data) => {
        console.log("Received xdgDefaults:", data);
        setXdgDefaults(data);
      })
      .catch((err) => {
        console.error("Failed to get xdgDefaults:", err);
      });
  }, []);

  const loadSourceCounts = async () => {
    const disabled = settings?.disabledScanSources ?? [];
    const next: Record<ScanSourceId, number> = { ...sourceCounts };
    await Promise.all(
      disabled.map(async (source) => {
        try {
          next[source] = await window.htpc.games.countBySource(source);
        } catch (err) {
          console.error(`Failed to count games for ${source}:`, err);
          next[source] = 0;
        }
      })
    );
    setSourceCounts(next);
  };

  useEffect(() => {
    if (!settings) return;
    void loadSourceCounts();
  }, [settings?.disabledScanSources?.join(",")]);

  const toggleSource = (source: ScanSourceId, enabled: boolean) => {
    const current = new Set(settings?.disabledScanSources ?? []);
    if (enabled) {
      current.delete(source);
    } else {
      current.add(source);
    }
    update({ disabledScanSources: Array.from(current) as ScanSourceId[] });
  };

  const handleClearSource = async (source: ScanSourceId) => {
    setClearing((prev) => ({ ...prev, [source]: true }));
    try {
      const count = await window.htpc.games.deleteBySource(source);
      setSourceCounts((prev) => ({ ...prev, [source]: 0 }));
      alert(`Cleared ${count} games from ${SCAN_SOURCE_LABELS[source]}.`);
    } catch (err) {
      console.error(`Failed to clear games for ${source}:`, err);
      alert(`Failed to clear games from ${SCAN_SOURCE_LABELS[source]}.`);
    } finally {
      setClearing((prev) => ({ ...prev, [source]: false }));
    }
  };

  if (!settings) return null;

  const allSources = Object.keys(SCAN_SOURCE_LABELS) as ScanSourceId[];
  const disabledSet = new Set(settings.disabledScanSources ?? []);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Media Directories
        </h2>
        <PathList
          label="Movie Paths"
          paths={settings.moviePaths}
          onChange={(p) => update({ moviePaths: p })}
          placeholder={xdgDefaults?.videosDir}
          hint={xdgDefaults?.videosDir}
        />
        <PathList
          label="Music Paths"
          paths={settings.musicPaths}
          onChange={(p) => update({ musicPaths: p })}
          placeholder={xdgDefaults?.musicDir}
          hint={xdgDefaults?.musicDir}
        />
        <PathList
          label="ROM Paths"
          paths={settings.romPaths}
          onChange={(p) => update({ romPaths: p })}
        />
        {xdgDefaults?.roms && xdgDefaults.roms.length > 0 && (
          <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            <strong className="block mb-1">Default ROM directories</strong>
            {xdgDefaults.roms.join(", ")}
          </div>
        )}
        {xdgDefaults?.retroarch && xdgDefaults.retroarch.length > 0 && (
          <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            <strong className="block mb-1">RetroArch</strong>
            {xdgDefaults.retroarch.join(", ")}
          </div>
        )}
        <PathList
          label="Game Paths"
          paths={settings.gamePaths}
          onChange={(p) => update({ gamePaths: p })}
        />
        {xdgDefaults && (
          <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            <strong className="block mb-1">Auto-discovered game sources</strong>
            <div className="flex flex-col gap-2 mt-2">
              {xdgDefaults.steam.length > 0 && (
                <div>
                  <strong className="block">Steam</strong>
                  {xdgDefaults.steam.join(", ")}
                </div>
              )}
              {xdgDefaults.heroic.length > 0 && (
                <div>
                  <strong className="block">Heroic</strong>
                  {xdgDefaults.heroic.join(", ")}
                </div>
              )}
              {xdgDefaults.lutris.length > 0 && (
                <div>
                  <strong className="block">Lutris</strong>
                  {xdgDefaults.lutris.join(", ")}
                </div>
              )}
              {xdgDefaults.desktop.length > 0 && (
                <div>
                  <strong className="block">Desktop</strong>
                  {xdgDefaults.desktop.join(", ")}
                </div>
              )}
              {xdgDefaults.bottles.length > 0 && (
                <div>
                  <strong className="block">Bottles</strong>
                  {xdgDefaults.bottles.join(", ")}
                </div>
              )}
              {xdgDefaults.itch.length > 0 && (
                <div>
                  <strong className="block">Itch.io</strong>
                  {xdgDefaults.itch.join(", ")}
                </div>
              )}
            </div>
          </div>
        )}
        {xdgDefaults && (
          <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            <strong className="block mb-1">Media Servers</strong>
            <div className="flex flex-col gap-2 mt-2">
              {xdgDefaults.kodi.length > 0 && (
                <div>
                  <strong className="block">Kodi</strong>
                  {xdgDefaults.kodi.join(", ")}
                </div>
              )}
              {xdgDefaults.jellyfin.length > 0 && (
                <div>
                  <strong className="block">Jellyfin</strong>
                  {xdgDefaults.jellyfin.join(", ")}
                </div>
              )}
              {xdgDefaults.plex.length > 0 && (
                <div>
                  <strong className="block">Plex</strong>
                  {xdgDefaults.plex.join(", ")}
                </div>
              )}
            </div>
          </div>
        )}
        {xdgDefaults?.mounts && xdgDefaults.mounts.length > 0 && (
          <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            <strong className="block mb-1">Mounts</strong>
            {xdgDefaults.mounts.join(", ")}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Scan Sources
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Disable sources you don't want to include in game scans. Disabling a source leaves existing games in the library until you clear them.
        </p>
        <div className="flex flex-col gap-3 pl-1">
          {allSources.map((source) => {
            const enabled = !disabledSet.has(source);
            const count = sourceCounts[source];
            return (
              <div key={source} className="flex flex-col gap-1">
                <Toggle
                  label={SCAN_SOURCE_LABELS[source]}
                  value={enabled}
                  onChange={(v) => toggleSource(source, v)}
                />
                {!enabled && count > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                      {count} game{count === 1 ? "" : "s"} previously scanned
                    </span>
                    <motion.button
                      className="px-3 py-1.5 rounded-[var(--radius-card)] text-xs font-medium flex items-center gap-1.5 flex-shrink-0"
                      style={{
                        background: "#ff444420",
                        color: "#ff4444",
                        border: "1px solid #ff444430",
                      }}
                      onClick={() => handleClearSource(source)}
                      whileTap={{ scale: 0.96 }}
                      disabled={clearing[source]}
                    >
                      {clearing[source] ? (
                        <span>Clearing…</span>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          Clear {count} game{count === 1 ? "" : "s"}
                        </>
                      )}
                    </motion.button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
