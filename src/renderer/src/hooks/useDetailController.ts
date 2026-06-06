import { useEffect } from "react";

export interface UseDetailControllerOptions {
  enabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Listens to htpc:nav events when a detail panel is open and handles
 * confirm (A / south) to launch and cancel (B / east) to close.
 */
export function useDetailController({
  enabled,
  onConfirm,
  onCancel,
}: UseDetailControllerOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string };
      if (detail?.action === "confirm") {
        onConfirm();
      } else if (detail?.action === "cancel") {
        onCancel();
      }
    };

    window.addEventListener("htpc:nav", handler);
    return () => window.removeEventListener("htpc:nav", handler);
  }, [enabled, onConfirm, onCancel]);
}
