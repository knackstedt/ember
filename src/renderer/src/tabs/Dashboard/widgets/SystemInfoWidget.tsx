import React, { useEffect, useState } from "react";
import { Cpu, HardDrive, Monitor, MemoryStick } from "lucide-react";

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

  useEffect(() => {
    window.htpc.system.getDiagnostics().then((d: SystemDiagnostics) => setInfo(d));
  }, []);

  const memTotal = info?.memory ? (info.memory.total / 1024 / 1024 / 1024).toFixed(1) : "--";
  const memFree = info?.memory ? (info.memory.free / 1024 / 1024 / 1024).toFixed(1) : "--";

  return (
    <div className="flex flex-col h-full gap-2 overflow-hidden">
      {title && (
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-60 uppercase tracking-wider">
          <Monitor size={12} />
          {title}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 text-sm overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu size={12} className="opacity-50 flex-shrink-0" />
          <span className="truncate text-xs">{info?.cpu?.model ?? "Loading…"}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <MemoryStick size={12} className="opacity-50 flex-shrink-0" />
          <span className="text-xs">{memFree} / {memTotal} GB</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <HardDrive size={12} className="opacity-50 flex-shrink-0" />
          <span className="truncate text-xs">
            {info?.os?.platform} {info?.os?.release} ({info?.os?.arch})
          </span>
        </div>
        {info?.app?.version && (
          <div className="flex items-center gap-2 min-w-0">
            <Monitor size={12} className="opacity-50 flex-shrink-0" />
            <span className="text-xs">Ember v{info.app.version}</span>
          </div>
        )}
      </div>
    </div>
  );
};
