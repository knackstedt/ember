import { useEffect, useRef } from "react";
import { useInputStore } from "../store/input.store";

interface UseBrowserControllerNavOptions {
  webviewRef: React.RefObject<Electron.WebviewTag | null>;
  enabled?: boolean;
  onBack?: () => void;
  onForward?: () => void;
}

/**
 * Browser controller navigation.
 * Reads from the input store (same source as the Controllers tab)
 * so axis mapping is guaranteed consistent.
 */
export function useBrowserControllerNav({
  webviewRef,
  enabled = true,
  onBack,
  onForward,
}: UseBrowserControllerNavOptions) {
  // Use getState to avoid re-subscribing on every input store update
  const getLiveStates = useRef(() => useInputStore.getState().liveStates).current;
  const prevButtonsRef = useRef<Record<string, boolean>>({});
  const cursorElementRef = useRef<HTMLDivElement | null>(null);
  const cursorPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) return;

    const webview = webviewRef.current;
    if (!webview) return;

    const AXIS_THRESHOLD = 0.15;  // ~5000 raw units deadzone
    const SCROLL_THRESHOLD = 0.15;
    const MOUSE_SPEED = 4;
    const SCROLL_SPEED = 10;

    // Apply circular deadzone and rescale so outer edge is still full speed
    const applyDeadzone = (x: number, y: number, threshold: number): [number, number] => {
      const mag = Math.sqrt(x * x + y * y);
      if (mag < threshold) return [0, 0];
      const scale = (mag - threshold) / (1 - threshold) / mag;
      return [x * scale, y * scale];
    };

    let animationFrameId: number;

    // Virtual cursor element
    const cursor = document.createElement("div");
    cursor.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      background: rgba(255, 255, 255, 0.9);
      border: 2px solid rgba(0, 0, 0, 0.8);
      border-radius: 50%;
      pointer-events: none;
      z-index: 999999;
      transform: translate(-50%, -50%);
      transition: opacity 0.15s ease;
      opacity: 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(cursor);
    cursorElementRef.current = cursor;

    const updateCursorVisual = () => {
      try {
        const bounds = webview.getBoundingClientRect();
        cursor.style.left = `${bounds.left + cursorPosRef.current.x}px`;
        cursor.style.top = `${bounds.top + cursorPosRef.current.y}px`;
      } catch {}
    };

    const sendMouseEvent = (type: string, x: number, y: number, button?: string) => {
      try {
        webview.sendInputEvent({
          type: type as any,
          x: Math.round(x),
          y: Math.round(y),
          button: button as any,
          clickCount: 1,
        });
      } catch {}
    };

    const sendKey = (keyCode: string, modifiers?: string[]) => {
      try {
        webview.sendInputEvent({ type: "keyDown", keyCode, modifiers: modifiers as any });
        setTimeout(() => {
          try {
            webview.sendInputEvent({ type: "keyUp", keyCode, modifiers: modifiers as any });
          } catch {}
        }, 50);
      } catch {}
    };

    // Init cursor to center
    try {
      const bounds = webview.getBoundingClientRect();
      cursorPosRef.current = { x: bounds.width / 2, y: bounds.height / 2 };
      updateCursorVisual();
    } catch {}

    const poll = () => {
      // Hide cursor when webview not visible (AnimatePresence)
      try {
        const bounds = webview.getBoundingClientRect();
        if (bounds.width === 0 && bounds.height === 0) {
          cursor.style.opacity = "0";
          animationFrameId = requestAnimationFrame(poll);
          return;
        }
      } catch {
        animationFrameId = requestAnimationFrame(poll);
        return;
      }

      let anyInput = false;

      for (const state of Object.values(getLiveStates())) {
        if (!state) continue;
        const axes = state.axes;

        // ---- Right stick: mouse movement ----
        const rawRightX = (axes.right_x ?? 0) / 32767;
        const rawRightY = (axes.right_y ?? 0) / 32767;
        const [rightX, rightY] = applyDeadzone(rawRightX, rawRightY, AXIS_THRESHOLD);

        if (rightX !== 0 || rightY !== 0) {
          anyInput = true;
          try {
            const bounds = webview.getBoundingClientRect();
            cursorPosRef.current.x = Math.max(0, Math.min(bounds.width, cursorPosRef.current.x + rightX * MOUSE_SPEED));
            cursorPosRef.current.y = Math.max(0, Math.min(bounds.height, cursorPosRef.current.y + rightY * MOUSE_SPEED));
            updateCursorVisual();
            sendMouseEvent("mouseMove", cursorPosRef.current.x, cursorPosRef.current.y);
          } catch {}
        }

        // ---- Left stick: scrolling ----
        const rawLeftX = (axes.left_x ?? 0) / 32767;
        const rawLeftY = (axes.left_y ?? 0) / 32767;
        const [leftX, leftY] = applyDeadzone(rawLeftX, rawLeftY, SCROLL_THRESHOLD);

        if (leftX !== 0 || leftY !== 0) {
          anyInput = true;
          try {
            webview.executeJavaScript(`window.scrollBy(${leftX * SCROLL_SPEED}, ${leftY * SCROLL_SPEED})`);
          } catch {}
        }

        // ---- Buttons ----
        const buttons = state.buttons;
        const prev = prevButtonsRef.current;

        // Standard button action names from useGamepadApi.ts
        const check = (name: string) => {
          const pressed = buttons[name] ?? false;
          const wasPressed = prev[name] ?? false;
          prev[name] = pressed;
          return pressed && !wasPressed;
        };

        if (check("south")) {
          anyInput = true;
          sendMouseEvent("mouseDown", cursorPosRef.current.x, cursorPosRef.current.y, "left");
          setTimeout(() => sendMouseEvent("mouseUp", cursorPosRef.current.x, cursorPosRef.current.y, "left"), 80);
        }
        if (check("east")) {
          anyInput = true;
          onBack?.();
        }
        if (check("west")) {
          anyInput = true;
          sendMouseEvent("mouseDown", cursorPosRef.current.x, cursorPosRef.current.y, "right");
          setTimeout(() => sendMouseEvent("mouseUp", cursorPosRef.current.x, cursorPosRef.current.y, "right"), 80);
        }
        if (check("north")) {
          anyInput = true;
          onForward?.();
        }
        if (check("left_bumper")) {
          anyInput = true;
          sendKey("Tab", ["shift"]);
        }
        if (check("right_bumper")) {
          anyInput = true;
          sendKey("Tab");
        }
        if (check("left_trigger")) {
          anyInput = true;
          sendMouseEvent("mouseDown", cursorPosRef.current.x, cursorPosRef.current.y, "right");
          setTimeout(() => sendMouseEvent("mouseUp", cursorPosRef.current.x, cursorPosRef.current.y, "right"), 80);
        }
        if (check("right_trigger")) {
          anyInput = true;
          sendMouseEvent("mouseDown", cursorPosRef.current.x, cursorPosRef.current.y, "left");
          setTimeout(() => sendMouseEvent("mouseUp", cursorPosRef.current.x, cursorPosRef.current.y, "left"), 80);
        }
        if (check("dpad_up")) sendKey("ArrowUp");
        if (check("dpad_down")) sendKey("ArrowDown");
        if (check("dpad_left")) sendKey("ArrowLeft");
        if (check("dpad_right")) sendKey("ArrowRight");
      }

      cursor.style.opacity = anyInput ? "1" : "0";
      animationFrameId = requestAnimationFrame(poll);
    };

    animationFrameId = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (cursorElementRef.current) {
        document.body.removeChild(cursorElementRef.current);
        cursorElementRef.current = null;
      }
    };
  }, [enabled, webviewRef, onBack, onForward]);
}
