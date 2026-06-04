import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { useFlashPlayerStore } from "./store/flashPlayer.store";
import { useJsnesPlayerStore } from "./store/jsnesPlayer.store";
import { useEmulatorjsPlayerStore } from "./store/emulatorjsPlayer.store";
import { useV86PlayerStore } from "./store/v86Player.store";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";

// Expose stores on window for debugging and automated validation
(window as any).useFlashPlayerStore = useFlashPlayerStore;
(window as any).useJsnesPlayerStore = useJsnesPlayerStore;
(window as any).useEmulatorjsPlayerStore = useEmulatorjsPlayerStore;
(window as any).useV86PlayerStore = useV86PlayerStore;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
