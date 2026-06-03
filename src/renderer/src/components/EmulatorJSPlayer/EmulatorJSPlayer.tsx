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
  const { open, romPath, title, platform, shader, close } = useEmulatorjsPlayerStore();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open || !romPath) return;

    let cancelled = false;
    let ready = false;
    let romData: Uint8Array | null = null;

    const iframe = iframeRef.current;
    if (!iframe) return;

    const core = platformToCore(platform);

    const sendRom = () => {
      iframe.contentWindow?.postMessage(
        { type: "ejs-rom", data: romData, core, shader },
        "*",
      );
    };

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      if (e.data?.type === "ejs-close") {
        close();
      } else if (e.data?.type === "ejs-ready") {
        ready = true;
        if (romData) sendRom();
      }
    };
    window.addEventListener("message", onMessage);

    const load = async () => {
      const data = await window.htpc.files.read(romPath);
      if (cancelled || !data || !iframe.contentWindow) return;

      romData = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      if (ready) sendRom();
    };

    load();

    iframe.srcdoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/emulatorjs/emulator.css">
  <style>
    body { margin: 0; background: #000; overflow: hidden; }
    #emulator { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="emulator"></div>
  <script>
    window.EJS_player = "#emulator";
    window.EJS_pathtodata = "/emulatorjs/";
    window.EJS_startOnLoaded = true;
    window.EJS_gameID = ${JSON.stringify(romPath)};
    ${shader ? `window.EJS_Shader = ${JSON.stringify(shader)};` : ""}

    window.addEventListener("keydown", function(e) {
      if (e.code === "Escape") {
        window.parent.postMessage({ type: "ejs-close" }, "*");
      }
    });

    window.addEventListener("message", function(e) {
      if (e.data.type === "ejs-rom") {
        window.EJS_core = e.data.core;
        const blob = new Blob([e.data.data], { type: "application/octet-stream" });
        window.EJS_gameUrl = URL.createObjectURL(blob);
        var script = document.createElement("script");
        script.src = "/emulatorjs/loader.js";
        document.head.appendChild(script);
      }
    });

    window.parent.postMessage({ type: "ejs-ready" }, "*");
  </script>
</body>
</html>`;

    // Focus the iframe so keyboard and gamepad events reach EmulatorJS
    setTimeout(() => iframe.focus(), 100);

    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      // Removing the iframe destroys the entire EmulatorJS execution context,
      // including Web Audio contexts, animation frames, and WASM instances.
      iframe.remove();
    };
  }, [open, romPath, platform, shader, close]);

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
      <iframe
        ref={iframeRef}
        style={{ width: "100%", height: "100%", border: "none" }}
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-downloads"
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
