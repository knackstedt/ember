import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../../store/settings.store";
import { PathList } from "./shared";

export const LocalDataTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [xdgDefaults, setXdgDefaults] = useState<{
    videosDir: string;
    musicDir: string;
  } | null>(null);

  useEffect(() => {
    window.htpc.app
      .getXdgDefaults()
      .then(setXdgDefaults)
      .catch(() => {});
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
        <PathList
          label="Game Paths"
          paths={settings.gamePaths}
          onChange={(p) => update({ gamePaths: p })}
        />
      </section>
    </div>
  );
};
