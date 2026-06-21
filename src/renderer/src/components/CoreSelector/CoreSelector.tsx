import React, { useEffect, useState } from "react";
import { Game } from "../../../../shared/types";

interface CoreInfo {
  id: number;
  name: string;
  version: string;
  extensions: string;
  needFullpath: boolean;
  path: string;
}

interface CoreSelectorProps {
  game: Game;
  onSelectCore: (corePath: string) => void;
}

export const CoreSelector: React.FC<CoreSelectorProps> = ({ game, onSelectCore }) => {
  const [cores, setCores] = useState<CoreInfo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const allCores = await window.htpc.libretro.listCores();
        if (cancelled) return;

        // Use detectAllCores to get all compatible cores sorted by priority (best first)
        const detectedCores = await window.htpc.libretro.detectAllCores(game.romPath ?? "");
        if (detectedCores.length > 0) {
          const compatible = detectedCores.map((d) => {
            const core = allCores.find((c) => c.path === d.corePath);
            return core ?? { id: -1, name: d.coreName, version: "", extensions: d.extensions.join("|"), needFullpath: false, path: d.corePath };
          });
          setCores(compatible);
          // Pre-select the best (first) core
          const best = compatible[0];
          if (best && !cancelled) {
            setSelected(best.path);
            onSelectCore(best.path);
          }
        } else {
          // Fallback: show all cores if none are extension-compatible
          setCores(allCores);
        }
      } catch (err) {
        console.error("[CoreSelector] failed to load cores:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [game.romPath, onSelectCore]);

  if (loading) {
    return (
      <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
        Scanning for cores...
      </div>
    );
  }

  if (cores.length === 0) {
    return (
      <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>
        No libretro cores found. Install libretro cores to enable native emulation.
      </div>
    );
  }

  return (
    <select
      value={selected}
      onChange={(e) => {
        const path = e.target.value;
        setSelected(path);
        onSelectCore(path);
      }}
      className="w-full text-sm px-2 py-1.5 rounded"
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text)",
        outline: "none",
      }}
    >
      {cores.map((core, index) => (
        <option key={core.path} value={core.path}>
          {core.name} {core.version ? `(${core.version})` : ""} {index === 0 ? "— Recommended" : ""}
        </option>
      ))}
    </select>
  );
};
