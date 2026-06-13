import React, { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { useControllerOskStore, updateInputElementValue, maskValue } from "../../store/controllerOsk.store";
import { OnScreenKeyboard } from "../OnScreenKeyboard/OnScreenKeyboard";
import { getDeviceHue } from "../VirtualCursor/VirtualCursor";

export const ControllerOSKOverlay: React.FC = () => {
  const sessions = useControllerOskStore((s) => Object.values(s.sessions));
  const { close, closeAll, updateValue } = useControllerOskStore.getState();
  const hasAnyOpen = sessions.length > 0;
  const containerRef = useRef<HTMLDivElement>(null);

  // Global click-away: close OSK when clicking outside any keyboard.
  // Catches both real mouse clicks and virtual cursor clicks (they dispatch
  // real click events on the target element).
  useEffect(() => {
    if (!hasAnyOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // If the click is inside the OSK container (keyboard or its children), ignore
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }
      closeAll();
    };

    // Capture phase so we catch clicks before they reach their targets
    window.addEventListener("click", handler, true);
    return () => window.removeEventListener("click", handler, true);
  }, [hasAnyOpen]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] pointer-events-none"
      style={{ display: hasAnyOpen ? "flex" : "none", flexDirection: "column-reverse" }}
    >
      {/* Click-away backdrop: fills the screen above the keyboards */}
      {hasAnyOpen && (
        <div
          className="absolute inset-0 pointer-events-auto"
          style={{ background: "transparent" }}
          onClick={() => closeAll()}
        />
      )}

      {/* Keyboards stack at the bottom, above the backdrop */}
      <div
        className="relative z-[1] flex flex-col-reverse gap-1 p-2 pointer-events-none"
        style={{ alignItems: "stretch" }}
      >
        <AnimatePresence>
          {sessions.map((session, idx) => {
            const hue = getDeviceHue(idx);

            const handleChange = (val: string) => {
              updateValue(session.deviceId, val);
              if (session.isWebview) {
                // Update the focused input inside the webview via JS injection
                try {
                  const wv = session.targetElement as any as Electron.WebviewTag;
                  const js = `
                    (() => {
                      const el = document.activeElement;
                      if (!el) return false;
                      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        el.value = ${JSON.stringify(val)};
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                      }
                      if (el.isContentEditable) {
                        el.textContent = ${JSON.stringify(val)};
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        return true;
                      }
                      return false;
                    })()
                  `;
                  wv.executeJavaScript(js).catch(() => {});
                } catch {}
              } else {
                updateInputElementValue(session.targetElement, val);
              }
            };

            const handleSubmit = (val: string) => {
              handleChange(val);
              close(session.deviceId);
            };

            return (
              <OnScreenKeyboard
                key={session.deviceId}
                deviceId={session.deviceId}
                value={session.value}
                inputType={session.inputType}
                label={session.label}
                hue={hue}
                onChange={handleChange}
                onClose={() => close(session.deviceId)}
                onSubmit={handleSubmit}
                maskValue={maskValue}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
