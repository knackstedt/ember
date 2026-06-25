import React from "react";
import ReactDOM from "react-dom/client";
import { OverlayApp } from "./OverlayApp";
import "@fontsource/mukta-vaani";
import "../styles/globals.css";

// Polyfill process for libraries that check process.env.NODE_ENV
if (typeof window !== "undefined" && !(window as any).process) {
  (window as any).process = { env: {} };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
