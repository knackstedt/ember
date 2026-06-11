import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Cpu,
  HardDrive,
  Monitor,
  Terminal,
  Layers,
  Film,
  Info,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
} from "lucide-react";

interface DiagnosticsData {
  app: { name: string; version: string };
  runtime: { electron: string; node: string; chrome: string; v8: string };
  os: { platform: string; release: string; arch: string; hostname: string; type: string };
  cpu: { model: string; cores: number; speed: number };
  memory: { total: number; free: number };
  displays: { id: number; resolution: string; scaleFactor: number; rotation: number; internal: boolean; primary: boolean }[];
  gpu: any;
  videoDecoders: { name: string; available: boolean; path?: string }[];
  ffmpegCodecs: string[];
  hwaccels: string[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function vendorIdToName(vendorId: string | number): string {
  const id = typeof vendorId === "string" ? parseInt(vendorId, 16) : vendorId;
  switch (id) {
    case 0x10de: return "NVIDIA";
    case 0x1002: return "AMD";
    case 0x1022: return "AMD";
    case 0x8086: return "Intel";
    case 0x15ad: return "VMware";
    case 0x1ab8: return "Parallels";
    case 0x80ee: return "VirtualBox";
    default: return `Vendor 0x${id.toString(16).padStart(4, "0")}`;
  }
}

function getGpuVendor(dev: any): string {
  if (dev.vendorString && dev.vendorString.length > 1) return dev.vendorString;
  if (dev.vendorId) return vendorIdToName(dev.vendorId);
  return "Unknown";
}

function getGpuModel(dev: any): string {
  if (dev.deviceString && dev.deviceString.length > 1) return dev.deviceString;
  if (dev.deviceDesc && dev.deviceDesc.length > 1) return dev.deviceDesc;
  return `GPU ${dev.deviceId ? "0x" + dev.deviceId.toString(16).padStart(4, "0") : ""}`;
}

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
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <Icon size={18} style={{ color: "var(--color-accent)" }} />
        <h3 className="font-semibold" style={{ color: "var(--color-text)" }}>
          {title}
        </h3>
      </div>
      {children}
    </motion.section>
  );
}

function KeyValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm py-1 border-b border-dashed" style={{ borderColor: "var(--color-border)" }}>
      <span style={{ color: "var(--color-text-dim)" }}>{label}</span>
      <span className="font-mono text-right" style={{ color: "var(--color-text)" }}>
        {value}
      </span>
    </div>
  );
}

export const SystemInfoTab: React.FC = () => {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.htpc.system.getDiagnostics().then((d) => {
      setData(d);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load diagnostics:", err);
      setLoading(false);
    });
  }, []);

  const handleCopy = () => {
    if (!data) return;
    const text = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <XCircle size={32} style={{ color: "var(--color-danger)" }} />
        <p style={{ color: "var(--color-text-dim)" }}>Failed to load diagnostics.</p>
      </div>
    );
  }

  const usedMemory = data.memory.total - data.memory.free;
  const memoryPercent = Math.round((usedMemory / data.memory.total) * 100);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            System Information
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Hardware specs, runtime versions, and installed components.
          </p>
        </div>
        <motion.button
          onClick={handleCopy}
          whileTap={{ scale: 0.96 }}
          className="flex items-center gap-2 px-3 py-2 rounded text-sm"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy JSON"}
        </motion.button>
      </div>

      {/* App & Runtime */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard icon={Info} title="Application">
          <KeyValueRow label="Name" value={data.app.name} />
          <KeyValueRow label="Version" value={data.app.version} />
        </SectionCard>

        <SectionCard icon={Terminal} title="Runtime">
          <KeyValueRow label="Electron" value={data.runtime.electron} />
          <KeyValueRow label="Node.js" value={data.runtime.node} />
          <KeyValueRow label="Chrome" value={data.runtime.chrome} />
          <KeyValueRow label="V8" value={data.runtime.v8} />
        </SectionCard>
      </div>

      {/* OS & CPU */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard icon={HardDrive} title="Operating System">
          <KeyValueRow label="Platform" value={`${data.os.platform} ${data.os.release}`} />
          <KeyValueRow label="Architecture" value={data.os.arch} />
          <KeyValueRow label="Hostname" value={data.os.hostname} />
          <KeyValueRow label="Type" value={data.os.type} />
        </SectionCard>

        <SectionCard icon={Cpu} title="Processor">
          <KeyValueRow label="Model" value={data.cpu.model} />
          <KeyValueRow label="Cores" value={data.cpu.cores} />
          <KeyValueRow label="Speed" value={`${data.cpu.speed} MHz`} />
        </SectionCard>
      </div>

      {/* Memory */}
      <SectionCard icon={Layers} title="Memory">
        <div className="flex flex-col gap-2">
          <KeyValueRow label="Total" value={formatBytes(data.memory.total)} />
          <KeyValueRow label="Free" value={formatBytes(data.memory.free)} />
          <KeyValueRow label="Used" value={formatBytes(usedMemory)} />
          <div className="mt-1">
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: "var(--color-surface-raised)" }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${memoryPercent}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{
                  background:
                    memoryPercent > 80
                      ? "var(--color-danger)"
                      : memoryPercent > 60
                      ? "var(--color-warning)"
                      : "var(--color-accent)",
                }}
              />
            </div>
            <p className="text-xs mt-1 text-right" style={{ color: "var(--color-text-dim)" }}>
              {memoryPercent}% used
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Displays */}
      <SectionCard icon={Monitor} title="Displays">
        <div className="flex flex-col gap-2">
          {data.displays.map((display) => (
            <div
              key={display.id}
              className="flex flex-col gap-1 p-2 rounded"
              style={{ background: "var(--color-surface-raised)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {display.resolution}
                </span>
                {display.primary && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--color-accent-bg, rgba(59,130,246,0.15))",
                      color: "var(--color-accent)",
                    }}
                  >
                    Primary
                  </span>
                )}
                {display.internal && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--color-surface-raised)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-dim)",
                    }}
                  >
                    Internal
                  </span>
                )}
              </div>
              <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                Scale: {display.scaleFactor}x &middot; Rotation: {display.rotation}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* GPU */}
      {data.gpu && (
        <SectionCard icon={Monitor} title="Graphics">
          {data.gpu.gpuDevice?.length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.gpu.gpuDevice.map((dev: any, i: number) => (
                <div
                  key={i}
                  className="flex flex-col gap-1 p-2 rounded"
                  style={{ background: "var(--color-surface-raised)" }}
                >
                  <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    {getGpuModel(dev)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                    {getGpuVendor(dev)}
                    {dev.deviceId ? ` · Device ID: 0x${dev.deviceId.toString(16).padStart(4, "0")}` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <KeyValueRow label="Renderer" value={data.gpu.auxAttributes?.glRenderer || "Unknown"} />
          )}
        </SectionCard>
      )}

      {/* Video Decoders */}
      <SectionCard icon={Film} title="Video Decoders">
        <div className="flex flex-col gap-2">
          {data.videoDecoders.map((decoder) => (
            <div key={decoder.name} className="flex items-center justify-between p-2 rounded" style={{ background: "var(--color-surface-raised)" }}>
              <div className="flex items-center gap-2">
                {decoder.available ? (
                  <CheckCircle2 size={16} style={{ color: "var(--color-success)" }} />
                ) : (
                  <XCircle size={16} style={{ color: "var(--color-danger)" }} />
                )}
                <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {decoder.name}
                </span>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: decoder.available ? "var(--color-success-bg, rgba(34,197,94,0.15))" : "var(--color-danger-bg, rgba(239,68,68,0.15))",
                  color: decoder.available ? "var(--color-success)" : "var(--color-danger)",
                }}
              >
                {decoder.available ? "Available" : "Not Found"}
              </span>
            </div>
          ))}
          <p className="text-xs mt-1" style={{ color: "var(--color-text-dim)" }}>
            The FFmpeg backend supports NVDEC hardware acceleration for H.264, HEVC, AV1, VP8, VP9, MPEG2, and MPEG4 on NVIDIA GPUs.
          </p>
        </div>
      </SectionCard>

      {/* Hardware Acceleration */}
      {data.hwaccels.length > 0 && (
        <SectionCard icon={Cpu} title="Hardware Acceleration">
          <div className="flex flex-wrap gap-1.5">
            {data.hwaccels.map((accel) => (
              <span
                key={accel}
                className="text-xs px-2 py-1 rounded"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                {accel}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* FFmpeg Codecs */}
      {data.ffmpegCodecs.length > 0 && (
        <SectionCard icon={Film} title="FFmpeg Codecs">
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {Array.from(new Set(data.ffmpegCodecs)).slice(0, 200).map((codec) => (
              <span
                key={codec}
                className="text-xs px-2 py-1 rounded font-mono"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-dim)",
                }}
              >
                {codec}
              </span>
            ))}
            {data.ffmpegCodecs.length > 200 && (
              <span className="text-xs px-2 py-1 rounded" style={{ color: "var(--color-text-dim)" }}>
                +{data.ffmpegCodecs.length - 200} more
              </span>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
};
