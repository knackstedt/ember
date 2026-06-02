import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useV86PlayerStore } from "../../store/v86Player.store";

interface V86BufferImage {
  buffer: ArrayBuffer;
}

interface V86UrlImage {
  url: string;
}

type V86Image = V86BufferImage | V86UrlImage;

interface V86Config {
  screen_container: HTMLElement;
  bios: V86UrlImage;
  vga_bios: V86UrlImage;
  fda?: V86Image;
  fdb?: V86Image;
  cdrom?: V86Image;
  hda?: V86Image;
  autostart: boolean;
  wasm_path?: string;
  memory_size?: number;
}

declare global {
  interface Window {
    V86?: new (config: V86Config) => {
      stop: () => void;
      destroy: () => void;
      add_listener(event: string, handler: (...args: unknown[]) => void): void;
    };
  }
}

function extnameFromPath(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx).toLowerCase() : "";
}

/** Common floppy image sizes in bytes */
const FLOPPY_SIZES = new Set([
  368640,   // 360 KB
  737280,   // 720 KB
  1228800,  // 1.2 MB
  1474560,  // 1.44 MB
  2949120,  // 2.88 MB
]);

function isFloppyImage(size: number): boolean {
  return FLOPPY_SIZES.has(size);
}

export const V86Player: React.FC = () => {
  const { open, romPath, title, close } = useV86PlayerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const emulatorRef = useRef<InstanceType<typeof window.V86> | null>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    if (!open || !containerRef.current || !romPath || scriptLoadedRef.current) return;

    let cancelled = false;
    const container = containerRef.current;

    const initEmulator = async () => {
      try {
        const data = await window.htpc.files.read(romPath);
        if (cancelled || !data) {
          console.warn("[V86Player] No data read from", romPath);
          return;
        }

        const buffer = data.slice().buffer;
        const size = buffer.byteLength;
        const ext = extnameFromPath(romPath);

        console.log(`[V86Player] Loading ${romPath} (${size} bytes, ext=${ext})`);

        const diskImage: V86BufferImage = { buffer };

        const config: V86Config = {
          screen_container: container,
          bios: { url: "/v86/bios/seabios.bin" },
          vga_bios: { url: "/v86/bios/vgabios.bin" },
          autostart: true,
          wasm_path: "/v86/build/v86.wasm",
          memory_size: 64 * 1024 * 1024,
        };

        if (ext === ".iso") {
          config.cdrom = diskImage;
          console.log("[V86Player] Mounted as CDROM");
        } else if (ext === ".flp" || ext === ".vfd" || ext === ".ima") {
          config.fda = diskImage;
          console.log("[V86Player] Mounted as floppy (fda)");
        } else if (ext === ".img") {
          if (isFloppyImage(size)) {
            config.fda = diskImage;
            console.log("[V86Player] Mounted as floppy (fda) — detected floppy size");
          } else {
            config.hda = diskImage;
            console.log("[V86Player] Mounted as hard disk (hda) — non-floppy size");
          }
        } else {
          // Unknown extension — default to floppy
          config.fda = diskImage;
          console.log("[V86Player] Mounted as floppy (fda) — unknown extension");
        }

        if (!window.V86) {
          console.error("[V86Player] V86 not available");
          return;
        }

        const emulator = new window.V86(config);
        emulatorRef.current = emulator;

        emulator.add_listener("emulator-ready", () => {
          console.log("[V86Player] Emulator ready");
        });
        emulator.add_listener("download-error", (ev: unknown) => {
          console.error("[V86Player] Download error:", ev);
        });
      } catch (err) {
        console.error("[V86Player] Failed to start emulator:", err);
      }
    };

    if (window.V86) {
      void initEmulator();
    } else {
      const script = document.createElement("script");
      script.id = "v86-script";
      script.src = "/v86/build/libv86.js";
      script.onload = () => {
        scriptLoadedRef.current = true;
        void initEmulator();
      };
      script.onerror = () => {
        console.error("[V86Player] Failed to load v86 script");
      };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (emulatorRef.current) {
        try {
          emulatorRef.current.stop();
          emulatorRef.current.destroy();
        } catch {
          /* ignore */
        }
        emulatorRef.current = null;
      }
      if (container) {
        container.innerHTML = "";
      }
      const script = document.getElementById("v86-script");
      if (script) script.remove();
      scriptLoadedRef.current = false;
    };
  }, [open, romPath]);

  // Keyboard: only allow Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />

      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)",
          zIndex: 2,
        }}
      >
        <span
          className="text-sm font-medium truncate"
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          {title}
        </span>
        <button
          onClick={close}
          className="px-3 py-1.5 rounded text-xs font-medium hover:bg-white/20 transition-colors"
          style={{ color: "#fff", background: "rgba(255,255,255,0.1)" }}
        >
          Close
        </button>
      </div>
    </motion.div>
  );
};
