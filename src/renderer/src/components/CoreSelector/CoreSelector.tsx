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
        // Filter cores that support this game's extension
        const ext = game.romPath?.split(".").pop()?.toLowerCase() ?? "";
        const compatible = allCores.filter((c) => {
          const exts = c.extensions.split("|").map((e) => e.replace(".", "").toLowerCase());
          return exts.includes(ext) || exts.includes("");
        });
        setCores(compatible.length > 0 ? compatible : allCores);
        // Try to auto-select a detected core
        const detected = await window.htpc.libretro.detectCore(game.romPath ?? "");
        if (detected && !cancelled) {
          setSelected(detected.corePath);
          onSelectCore(detected.corePath);
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
        No libretro cores found. Install RetroArch cores to enable native emulation.
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
      <option value="">Auto-detect core</option>
      {cores.map((core) => (
        <option key={core.path} value={core.path}>
          {core.name} {core.version ? `(${core.version})` : ""}
        </option>
      ))}
    </select>
  );
};
