import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StreamingService, StreamingExtension } from "../../../../shared/types";

interface Props {
  service: StreamingService;
  partition: string;
  extensions: StreamingExtension[];
}

export interface StreamingWebviewHandle {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  getURL: () => string;
}

export const StreamingWebview = forwardRef<StreamingWebviewHandle, Props>(
  ({ service, partition, extensions }, ref) => {
    const webviewRef = useRef<Electron.WebviewTag | null>(null);
    const [showSpinner, setShowSpinner] = useState(true);
    const extensionsAppliedRef = useRef(false);

    useImperativeHandle(ref, () => ({
      goBack: () => webviewRef.current?.goBack(),
      goForward: () => webviewRef.current?.goForward(),
      reload: () => webviewRef.current?.reload(),
      getURL: () => webviewRef.current?.getURL() ?? service.url,
    }));

    // Auto-hide spinner after initial load period
    useEffect(() => {
      const timer = setTimeout(() => setShowSpinner(false), 2500);
      return () => clearTimeout(timer);
    }, []);

    // Load extensions into the partition session when the webview is ready
    useEffect(() => {
      if (extensionsAppliedRef.current) return;
      if (!partition || extensions.length === 0) return;

      const enabled = extensions.filter((e) => e.enabled && e.installPath);
      if (enabled.length === 0) return;

      // Give the webview a moment to initialize its session
      const timer = setTimeout(() => {
        window.htpc.streaming.extensions
          .apply(partition, enabled)
          .then(() => {
            extensionsAppliedRef.current = true;
          })
          .catch((err) => {
            console.error("[StreamingWebview] Failed to apply extensions:", err);
          });
      }, 500);

      return () => clearTimeout(timer);
    }, [partition, extensions]);

    return (
      <div className="flex-1 relative overflow-hidden">
        {/* Loading spinner overlay */}
        <AnimatePresence>
          {showSpinner && (
            <motion.div
              className="absolute inset-0 z-10 flex items-center justify-center"
              style={{ background: "var(--color-surface)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
                style={{
                  borderTopColor: "var(--color-accent)",
                  borderRightColor: "var(--color-accent)",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <webview
          ref={(el) => {
            webviewRef.current = el as any;
          }}
          src={service.url}
          partition={partition}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            display: "flex",
          }}
          allowpopups="false"
          webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
        />
      </div>
    );
  },
);

StreamingWebview.displayName = "StreamingWebview";
