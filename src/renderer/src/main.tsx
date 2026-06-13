import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { useFlashPlayerStore } from "./store/flashPlayer.store";
import { useJsnesPlayerStore } from "./store/jsnesPlayer.store";
import { usePluginPlayerStore } from "./store/pluginPlayer.store";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";

// Expose stores on window for debugging and automated validation
(window as any).useFlashPlayerStore = useFlashPlayerStore;
(window as any).useJsnesPlayerStore = useJsnesPlayerStore;
(window as any).usePluginPlayerStore = usePluginPlayerStore;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
