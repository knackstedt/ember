import React from "react";
import { Globe, Settings } from "lucide-react";

export const WebviewWidget: React.FC<{
  title?: string;
  config?: Record<string, unknown>;
}> = ({ title, config }) => {
  const url = (config?.url as string) || "";

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-sm opacity-40">
        <Settings size={24} />
        <span>No URL configured</span>
        <span className="text-[10px] opacity-50">Open Edit Layout and click the settings icon</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <webview
        src={url}
        className="w-full h-full"
        style={{ border: "none" }}
        partition="persist:widget"
      />
    </div>
  );
};
