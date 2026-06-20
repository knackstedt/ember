import React, { useEffect, useState } from "react";
import { Cpu, HardDrive, Monitor, MemoryStick, Activity } from "lucide-react";
import { ProgressBar } from "./ProgressBar";

interface SystemDiagnostics {
  os?: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
  };
  cpu?: {
    model: string;
    cores: number;
  };
  memory?: {
    total: number;
    free: number;
  };
  electron?: {
    version: string;
  };
  app?: {
    version: string;
  };
}

export const SystemInfoWidget: React.FC<{ title?: string }> = ({ title }) => {
  const [info, setInfo] = useState<SystemDiagnostics | null>(null);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    window.htpc.system.getDiagnostics().then((d: SystemDiagnostics) => setInfo(d));
    const t = setInterval(() => setUptime((u) => u + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const memTotal = info?.memory ? info.memory.total / 1024 / 1024 / 1024 : 0;
  const memFree = info?.memory ? info.memory.free / 1024 / 1024 / 1024 : 0;
  const memUsed = memTotal - memFree;
  const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

  const fmtUptime = () => {
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m`;
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1 text-[10px] font-medium opacity-50 uppercase tracking-wider">
          <Monitor size={10} />
          {title}
        </div>
      )}

      <div className="flex-1 flex flex-col gap-1.5 text-xs overflow-hidden min-h-0">
        <div className="flex items-start gap-1.5">
          <div className="p-1 rounded-lg flex-shrink-0" style={{ background: "var(--color-surface-raised)" }}>
            <Cpu size={12} style={{ color: "var(--color-accent)" }} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0">
            <span className="truncate font-medium opacity-90 text-[11px]">{info?.cpu?.model ?? "Loading…"}</span>
            <span className="opacity-40 text-[10px]">{info?.cpu?.cores ?? "--"} cores</span>
          </div>
        </div>

        <div className="flex items-start gap-1.5">
          <div className="p-1 rounded-lg flex-shrink-0" style={{ background: "var(--color-surface-raised)" }}>
            <MemoryStick size={12} style={{ color: "var(--color-accent)" }} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <ProgressBar value={memUsed} max={memTotal || 1} label="Memory" valueLabel={`${memUsed.toFixed(1)} / ${memTotal.toFixed(1)} GB`} height={3} />
          </div>
        </div>

        <div className="flex items-start gap-1.5">
          <div className="p-1 rounded-lg flex-shrink-0" style={{ background: "var(--color-surface-raised)" }}>
            <HardDrive size={12} style={{ color: "var(--color-accent)" }} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0">
            <span className="truncate opacity-90 text-[11px] capitalize">{info?.os?.platform} {info?.os?.release}</span>
            <span className="opacity-40 text-[10px]">{info?.os?.arch ?? "--"}</span>
          </div>
        </div>

        <div className="flex items-start gap-1.5">
          <div className="p-1 rounded-lg flex-shrink-0" style={{ background: "var(--color-surface-raised)" }}>
            <Activity size={12} style={{ color: "var(--color-accent)" }} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0">
            <span className="opacity-90 text-[11px]">Uptime: {fmtUptime()}</span>
            {info?.app?.version && (
              <span className="opacity-40 text-[10px]">Ember v{info.app.version}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
