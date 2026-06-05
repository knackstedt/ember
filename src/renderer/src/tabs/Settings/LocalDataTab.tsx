import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../../store/settings.store";
import { PathList } from "./shared";

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

  if (!settings) return null;

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
    </div>
  );
};
