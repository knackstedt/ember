/**
 * bun test preloader: provides a DOM (happy-dom) plus the browser/electron
 * globals that renderer code touches at import or mount time.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ width: 1280, height: 800 });

// happy-dom lacks ResizeObserver — components size themselves off it.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}

// React 18: required for `act` outside of jest-dom environments.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal stand-in for the electron preload API (`window.htpc`). Tests extend
// this per-suite as needed (e.g. games.loadThumbnail).
(window as unknown as { htpc: unknown }).htpc = {
  devtools: {
    isOpen: async () => false,
    onChange: () => () => {},
  },
  games: {
    loadThumbnail: async () => null,
    regenerateThumbnail: async () => null,
    setCustomCover: async () => null,
    favorite: async () => {},
    emulatorConfig: { get: async () => ({}), set: async () => {} },
  },
  libretro: {
    detectCore: async () => "mock-core",
  },
};
