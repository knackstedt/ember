import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useEmulatorjsPlayerStore } from "../../store/emulatorjsPlayer.store";
import { GamePlatform } from "../../../../shared/types";

function platformToCore(platform: GamePlatform): string {
  switch (platform) {
    case "nes":
      return "nes";
    case "snes":
      return "snes";
    case "gb":
      return "gb";
    case "gba":
      return "gba";
    default:
      return "nes";
  }
}

export const EmulatorJSPlayer: React.FC = () => {
  const { open, romPath, title, platform, close } = useEmulatorjsPlayerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const initedRef = useRef(false);
  const romUrlRef = useRef("");

  useEffect(() => {
    if (!open || !containerRef.current || !romPath || initedRef.current) return;

    let cancelled = false;
    const container = containerRef.current;

    window.htpc.files.read(romPath).then((data) => {
      if (cancelled || !data) return;

      const blob = new Blob([data], { type: "application/octet-stream" });
      romUrlRef.current = URL.createObjectURL(blob);
      const core = platformToCore(platform);

      // Set EmulatorJS globals
      (window as any).EJS_player = "#emulatorjs-container";
      (window as any).EJS_core = core;
      (window as any).EJS_gameUrl = romUrlRef.current;
      (window as any).EJS_pathtodata = "/emulatorjs/";
      (window as any).EJS_startOnLoaded = true;
      (window as any).EJS_gameID = romPath;

      // Inject loader script
      const script = document.createElement("script");
      script.id = "emulatorjs-loader";
      script.src = "/emulatorjs/loader.js";
      script.async = true;
      document.head.appendChild(script);
      initedRef.current = true;
    });

    return () => {
      cancelled = true;
      initedRef.current = false;

      // Stop the running emulator instance
      const ejs = (window as any).EJS_emulator;
      if (ejs) {
        try {
          // Stop the retroarch main loop
          if (ejs.gameManager && typeof ejs.gameManager.toggleMainLoop === "function") {
            ejs.gameManager.toggleMainLoop(0);
          }
          // Pause the Emscripten module main loop
          if (ejs.Module && typeof ejs.Module.pauseMainLoop === "function") {
            ejs.Module.pauseMainLoop();
          }
          // Close the Web Audio context to kill audio output
          const al = ejs.Module?.AL;
          if (al?.currentCtx?.audioCtx) {
            al.currentCtx.audioCtx.close();
          }
          // Disconnect any dangling gain nodes
          if (al?.currentCtx?.sources) {
            for (const src of Object.values(al.currentCtx.sources)) {
              try { (src as any).gain?.disconnect(); } catch {}
            }
          }
          // Clear internal emulator timeouts
          if (ejs.resetTimeout) clearTimeout(ejs.resetTimeout);
          if (ejs.msgTimeout) clearTimeout(ejs.msgTimeout);
        } catch {}
      }

      // Remove ALL EmulatorJS injected scripts (loader + dynamically loaded)
      document.querySelectorAll("script").forEach((s) => {
        if (s.src.includes("/emulatorjs/")) s.remove();
      });
      // Remove injected stylesheets
      document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
        if ((l as HTMLLinkElement).href.includes("/emulatorjs/")) l.remove();
      });

      // Clean up globals
      delete (window as any).EJS_player;
      delete (window as any).EJS_core;
      delete (window as any).EJS_gameUrl;
      delete (window as any).EJS_pathtodata;
      delete (window as any).EJS_startOnLoaded;
      delete (window as any).EJS_emulator;
      delete (window as any).EJS_gameManager;
      delete (window as any).EJS_gameID;
      delete (window as any).EJS_adBlocked;

      if (container) {
        container.innerHTML = "";
      }

      if (romUrlRef.current) {
        URL.revokeObjectURL(romUrlRef.current);
        romUrlRef.current = "";
      }
    };
  }, [open, romPath, platform]);

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
        id="emulatorjs-container"
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
