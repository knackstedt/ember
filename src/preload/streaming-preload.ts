import { ipcRenderer } from "electron";

document.addEventListener("ember:frontpage", (event) => {
  const detail = (event as CustomEvent).detail;
  if (detail && Array.isArray(detail.items) && detail.serviceId) {
    ipcRenderer.send("streaming:frontpage:report", detail.serviceId, detail.items);
  }
});

window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ember:frontpage") {
    const { serviceId, items } = event.data;
    if (serviceId && Array.isArray(items)) {
      ipcRenderer.send("streaming:frontpage:report", serviceId, items);
    }
  }
});

// ---------------------------------------------------------------------------
// Media key injection — allows the main process to send play/pause/next/prev
// commands to the webview content (for services without deep API integration)
// ---------------------------------------------------------------------------

function dispatchMediaKey(key: string, code: string) {
  // Try MediaSession API first (works on modern sites like YouTube Music, Spotify web)
  try {
    const ms = navigator.mediaSession;
    if (ms) {
      switch (key) {
        case "MediaPlayPause":
          if (ms.playbackState === "playing") {
            ms.playbackState = "paused";
          } else {
            ms.playbackState = "playing";
          }
          // Also try action handlers if available
          (ms as any).play?.();
          (ms as any).pause?.();
          break;
        case "MediaTrackNext":
          (ms as any).nexttrack?.();
          break;
        case "MediaTrackPrevious":
          (ms as any).previoustrack?.();
          break;
      }
    }
  } catch {
    // ignore
  }

  // Dispatch standard keyboard events
  const keyEventInit: KeyboardEventInit = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
  };

  document.dispatchEvent(new KeyboardEvent("keydown", keyEventInit));
  document.dispatchEvent(new KeyboardEvent("keyup", keyEventInit));

  // Fallback: spacebar for play/pause
  if (key === "MediaPlayPause") {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        code: "Space",
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    document.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: " ",
        code: "Space",
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  }
}

ipcRenderer.on("streaming:mediaKeys", (_event, action: "play" | "pause" | "next" | "previous") => {
  switch (action) {
    case "play":
      dispatchMediaKey("MediaPlayPause", "MediaPlayPause");
      break;
    case "pause":
      dispatchMediaKey("MediaPlayPause", "MediaPlayPause");
      break;
    case "next":
      dispatchMediaKey("MediaTrackNext", "MediaTrackNext");
      break;
    case "previous":
      dispatchMediaKey("MediaTrackPrevious", "MediaTrackPrevious");
      break;
  }
});
