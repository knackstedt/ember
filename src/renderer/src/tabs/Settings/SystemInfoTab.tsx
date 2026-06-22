import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Cpu,
  HardDrive,
  Monitor,
  Terminal,
  Layers,
  Film,
  Package,
  Info,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
} from "lucide-react";

interface DiagnosticsData {
  app: { name: string; version: string; installMechanism: string };
  runtime: { electron: string; node: string; chrome: string; v8: string };
  dependencies: { name: string; version: string }[];
  os: { platform: string; release: string; arch: string; hostname: string; type: string };
  cpu: { model: string; cores: number; speed: number };
  memory: { total: number; free: number };
  displays: { id: number; resolution: string; scaleFactor: number; rotation: number; internal: boolean; primary: boolean }[];
  gpu: any;
  videoDecoders: { name: string; available: boolean; path?: string }[];
  libmpvVersion: string;
  hwaccels: string[];
  ffmpegCodecs?: string[];
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

/** Best-effort fallback names for common PCI device IDs. */
function pciDeviceName(vendorId: number, deviceId: number): string | undefined {
  const key = `${vendorId.toString(16).padStart(4, "0")}:${deviceId.toString(16).padStart(4, "0")}`;
  const common: Record<string, string> = {
    "10de:2204": "NVIDIA GeForce RTX 3090",
    "10de:2206": "NVIDIA GeForce RTX 3090 Ti",
    "10de:2208": "NVIDIA RTX A6000",
    "10de:2484": "NVIDIA GeForce RTX 3070",
    "10de:2486": "NVIDIA GeForce RTX 3070 Ti",
    "10de:2488": "NVIDIA GeForce RTX 3070 Ti Laptop",
    "10de:2503": "NVIDIA GeForce RTX 3060",
    "10de:2684": "NVIDIA GeForce RTX 4090",
    "10de:2704": "NVIDIA GeForce RTX 4090 Laptop",
    "10de:2782": "NVIDIA GeForce RTX 4080",
    "10de:2786": "NVIDIA GeForce RTX 4080 Laptop",
    "10de:2803": "NVIDIA GeForce RTX 4070 Ti",
    "10de:2878": "NVIDIA GeForce RTX 4070",
    "10de:28a0": "NVIDIA GeForce RTX 4060 Ti",
    "10de:28a1": "NVIDIA GeForce RTX 4060",
    "8086:5912": "Intel HD Graphics 630",
    "8086:3e9b": "Intel UHD Graphics 630",
    "8086:9bc5": "Intel UHD Graphics 630",
    "8086:a780": "Intel UHD Graphics 770",
    "8086:4680": "Intel UHD Graphics 770",
    "8086:7d55": "Intel Arc Graphics",
    "1002:73bf": "AMD Radeon RX 6900 XT",
    "1002:73c5": "AMD Radeon RX 6800",
    "1002:73df": "AMD Radeon RX 6800 XT",
    "1002:73ff": "AMD Radeon RX 6700 XT",
    "1002:744c": "AMD Radeon RX 7900 XTX",
    "1002:744b": "AMD Radeon RX 7900 XT",
    "1002:7550": "AMD Radeon RX 7600",
    "1002:13c0": "AMD Granite Ridge [Radeon Graphics]",
    "1002:15bf": "AMD Phoenix [Radeon 780M / 760M / 740M]",
    "1002:15c8": "AMD Phoenix [Radeon 740M]",
    "1002:163f": "AMD Rembrandt [Radeon 660M]",
    "1002:164d": "AMD Rembrandt [Radeon 680M]",
    "1002:1681": "AMD Rembrandt [Radeon Graphics]",
    "1002:1435": "AMD Raphael [Radeon 610M]",
    "1002:164e": "AMD Yellow Carp [Radeon Graphics]",
  };
  return common[key];
}

function isGenericGpuName(name: string): boolean {
  return /^\s*(device|unknown|unidentified)\s*$/i.test(name);
}

function getGpuModel(dev: any): string {
  if (dev.deviceString && dev.deviceString.length > 1 && !isGenericGpuName(dev.deviceString)) {
    return dev.deviceString;
  }
  if (dev.deviceDesc && dev.deviceDesc.length > 1 && !isGenericGpuName(dev.deviceDesc)) {
    return dev.deviceDesc;
  }
  const fallback = dev.vendorId && dev.deviceId
    ? pciDeviceName(dev.vendorId, dev.deviceId)
    : undefined;
  if (fallback) return fallback;
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

function KeyValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm py-1 border-b border-dashed" style={{ borderColor: "var(--border-default)" }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="font-mono text-right" style={{ color: "var(--text-primary)" }}>
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
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <XCircle size={32} style={{ color: "var(--error-fg)" }} />
        <p style={{ color: "var(--text-secondary)" }}>Failed to load diagnostics.</p>
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
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            System Information
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Hardware specs, runtime versions, and installed components.
          </p>
        </div>
        <motion.button
          onClick={handleCopy}
          whileTap={{ scale: 0.96 }}
          className="flex items-center gap-2 px-3 py-2 rounded text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
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
          <KeyValueRow label="Install Mechanism" value={data.app.installMechanism} />
        </SectionCard>

        <SectionCard icon={Terminal} title="Runtime">
          <KeyValueRow label="Electron" value={data.runtime.electron} />
          <KeyValueRow label="Node.js" value={data.runtime.node} />
          <KeyValueRow label="Chrome" value={data.runtime.chrome} />
          <KeyValueRow label="V8" value={data.runtime.v8} />
        </SectionCard>
      </div>

      {/* Dependencies */}
      <SectionCard icon={Package} title="Dependencies">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
          {data.dependencies.map((dep) => (
            <KeyValueRow key={dep.name} label={dep.name} value={dep.version} />
          ))}
        </div>
      </SectionCard>

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
              style={{ background: "var(--surface-1)" }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${memoryPercent}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{
                  background:
                    memoryPercent > 80
                      ? "var(--error-fg)"
                      : memoryPercent > 60
                      ? "var(--warning-fg)"
                      : "var(--accent)",
                }}
              />
            </div>
            <p className="text-xs mt-1 text-right" style={{ color: "var(--text-secondary)" }}>
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
              style={{ background: "var(--surface-1)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {display.resolution}
                </span>
                {display.primary && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--accent-dim, rgba(59,130,246,0.15))",
                      color: "var(--accent)",
                    }}
                  >
                    Primary
                  </span>
                )}
                {display.internal && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Internal
                  </span>
                )}
              </div>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
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
                  style={{ background: "var(--surface-1)" }}
                >
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {getGpuModel(dev)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
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
            <div key={decoder.name} className="flex items-center justify-between p-2 rounded" style={{ background: "var(--surface-1)" }}>
              <div className="flex items-center gap-2">
                {decoder.available ? (
                  <CheckCircle2 size={16} style={{ color: "var(--success-fg)" }} />
                ) : (
                  <XCircle size={16} style={{ color: "var(--error-fg)" }} />
                )}
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {decoder.name}
                </span>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: decoder.available ? "var(--success-bg, rgba(34,197,94,0.15))" : "var(--error-bg, rgba(239,68,68,0.15))",
                  color: decoder.available ? "var(--success-fg)" : "var(--error-fg)",
                }}
              >
                {decoder.available ? "Available" : "Not Found"}
              </span>
            </div>
          ))}
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            The libmpv backend supports hardware acceleration (VA-API, NVDEC, etc.) for virtually all video codecs.
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
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              >
                {accel}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* libmpv */}
      {data.libmpvVersion && (
        <SectionCard icon={Film} title="libmpv">
          <div className="flex flex-wrap gap-1.5">
            <span
              className="text-xs px-2 py-1 rounded font-mono"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              {data.libmpvVersion}
            </span>
          </div>
        </SectionCard>
      )}
    </div>
  );
};
