import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useJsnesPlayerStore } from "../../store/jsnesPlayer.store";
import { Browser } from "jsnes";

export const JsnesPlayer: React.FC = () => {
  const { open, romPath, title, close } = useJsnesPlayerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const browserRef = useRef<Browser | null>(null);

  useEffect(() => {
    if (!open || !containerRef.current || !romPath) return;

    let cancelled = false;
    const container = containerRef.current;

    window.htpc.files.read(romPath).then((data) => {
      if (cancelled || !data) return;

      try {
        const browser = new Browser({
          container,
          romData: null,
          onError: (err) => {
            console.error("[JsnesPlayer] Emulator error:", err);
          },
        });
        browserRef.current = browser;

        // jsnes Browser.loadROM expects string but NES.loadROM accepts more;
        // convert Uint8Array to binary string for compatibility
        const bytes = new Uint8Array(data);
        let binaryString = "";
        for (let i = 0; i < bytes.length; i++) {
          binaryString += String.fromCharCode(bytes[i]);
        }
        browser.loadROM(binaryString);
      } catch (err) {
        console.error("[JsnesPlayer] Failed to start emulator:", err);
      }
    });

    return () => {
      cancelled = true;
      if (browserRef.current) {
        try {
          browserRef.current.destroy();
        } catch {
          /* ignore */
        }
        browserRef.current = null;
      }
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [open, romPath]);

  // Keyboard: only allow Escape to close (jsnes Browser handles its own keys)
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
