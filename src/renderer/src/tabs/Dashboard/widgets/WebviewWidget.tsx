import React, { useEffect, useRef } from "react";
import { Settings } from "lucide-react";
import { normalizeWebUrl } from "../../../../../shared/path-utils";

export const WebviewWidget: React.FC<{
  title?: string;
  config?: Record<string, unknown>;
  editMode?: boolean;
  onConfigChange?: (patch: Record<string, unknown>) => void;
}> = ({ title, config, editMode, onConfigChange }) => {
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const savedUrlRef = useRef<string>("");
  const editModeRef = useRef(editMode);
  const onConfigChangeRef = useRef(onConfigChange);

  editModeRef.current = editMode;
  onConfigChangeRef.current = onConfigChange;

  // Sync the webview src when the configured URL is changed externally.
  useEffect(() => {
    const configUrl = normalizeWebUrl((config?.url as string) || "");
    if (configUrl && configUrl !== savedUrlRef.current) {
      savedUrlRef.current = configUrl;
      const wv = webviewRef.current;
      if (wv) {
        wv.src = configUrl;
      }
    }
  }, [config?.url]);

  // Persist the current URL whenever the webview navigates while in edit mode.
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const handleNavigate = () => {
      try {
        const url = wv.getURL();
        if (url && url !== savedUrlRef.current && editModeRef.current) {
          savedUrlRef.current = url;
          onConfigChangeRef.current?.({ url });
        }
      } catch {
        // Ignore cross-origin or destroyed webview errors.
      }
    };

    wv.addEventListener("did-navigate", handleNavigate);
    wv.addEventListener("did-navigate-in-page", handleNavigate);

    return () => {
      wv.removeEventListener("did-navigate", handleNavigate);
      wv.removeEventListener("did-navigate-in-page", handleNavigate);
    };
  }, []);

  const url = (config?.url as string) || "";

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-0 gap-1.5 text-sm opacity-40">
        <Settings size={20} />
        <span className="text-xs">No URL configured</span>
        <span className="text-[12px] opacity-50">Open Edit Layout and click the settings icon</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <webview
        ref={(el) => {
          webviewRef.current = el as any;
        }}
        className="w-full h-full"
        style={{ border: "none" }}
        partition="persist:widget"
      />
    </div>
  );
};
