import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { usePluginPlayerStore } from "../../store/pluginPlayer.store";

export const PluginPlayer: React.FC = () => {
  const { open, url, title, close } = usePluginPlayerStore();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open || !url) return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    iframe.src = url;

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      if (e.data?.type === "plugin-close") {
        close();
      }
    };
    window.addEventListener("message", onMessage);

    setTimeout(() => iframe.focus(), 100);

    return () => {
      window.removeEventListener("message", onMessage);
      iframe.remove();
    };
  }, [open, url, close]);

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
