import { useEffect, useRef, useState } from "react";
import { useInputStore } from "../store/input.store";
import { VirtualCursor, CursorStyle } from "../components/VirtualCursor/VirtualCursor";

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
 *
 * Returns the <VirtualCursor> element to render.
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

  // Live position updated every frame by the rAF loop — NOT React state
  const posRef = useRef({ x: 0, y: 0 });

  const [visible, setVisible] = useState(false);
  const [hoverStyle, setHoverStyle] = useState<CursorStyle>("default");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const webview = webviewRef.current;
    if (!webview) return;

    const AXIS_THRESHOLD = 0.15;
    const SCROLL_THRESHOLD = 0.15;
    const MOUSE_SPEED = 4;
    const SCROLL_SPEED = 10;
    const WIGGLE_EXPAND_MS = 2000;
    const WIGGLE_SAMPLE_COUNT = 6;
    const WIGGLE_ANGLE_THRESHOLD = 1.8;
    const CURSOR_FADE_DELAY_MS = 60_000;
    const CURSOR_CHECK_INTERVAL_MS = 150;

    // Apply circular deadzone and rescale so outer edge is still full speed
    const applyDeadzone = (x: number, y: number, threshold: number): [number, number] => {
      const mag = Math.sqrt(x * x + y * y);
      if (mag < threshold) return [0, 0];
      const scale = (mag - threshold) / (1 - threshold) / mag;
      return [x * scale, y * scale];
    };

    let animationFrameId: number;
    let lastInputTime = Date.now();
    let wiggleEndTime = 0;
    const wiggleSamples: { dx: number; dy: number }[] = [];
    let lastCursorCheck = 0;
    let currentCursorKey: CursorStyle = "default";
    let pendingCursorKey: CursorStyle = "default";
    let pendingCursorCount = 0;
    const CURSOR_STABLE_COUNT = 3; // must be same for this many checks before switching

    // Init cursor to center of webview
    try {
      const bounds = webview.getBoundingClientRect();
      posRef.current = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
    } catch {}

    const sendMouseEvent = (type: string, x: number, y: number, button?: string) => {
      try {
        // Convert screen coordinates to webview-relative
        const bounds = webview.getBoundingClientRect();
        const relX = x - bounds.left;
        const relY = y - bounds.top;
        webview.sendInputEvent({
          type: type as any,
          x: Math.round(relX),
          y: Math.round(relY),
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

    const poll = () => {
      // Hide cursor when webview not visible (AnimatePresence)
      try {
        const bounds = webview.getBoundingClientRect();
        if (bounds.width === 0 && bounds.height === 0) {
          setVisible(false);
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

          // ---- Wiggle detection ----
          wiggleSamples.push({ dx: rightX, dy: rightY });
          if (wiggleSamples.length > WIGGLE_SAMPLE_COUNT) {
            wiggleSamples.shift();
          }
          if (wiggleSamples.length >= 3) {
            let totalAngle = 0;
            for (let i = 1; i < wiggleSamples.length; i++) {
              const a = wiggleSamples[i - 1];
              const b = wiggleSamples[i];
              const dot = a.dx * b.dx + a.dy * b.dy;
              const magA = Math.sqrt(a.dx * a.dx + a.dy * a.dy);
              const magB = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
              if (magA > 0.001 && magB > 0.001) {
                const cosTheta = dot / (magA * magB);
                totalAngle += Math.acos(Math.max(-1, Math.min(1, cosTheta)));
              }
            }
            if (totalAngle > WIGGLE_ANGLE_THRESHOLD) {
              wiggleEndTime = Date.now() + WIGGLE_EXPAND_MS;
            }
          }

          // Update posRef directly — no React re-render
          posRef.current.x += rightX * MOUSE_SPEED;
          posRef.current.y += rightY * MOUSE_SPEED;

          // Clamp to webview bounds
          try {
            const bounds = webview.getBoundingClientRect();
            posRef.current.x = Math.max(bounds.left, Math.min(bounds.right, posRef.current.x));
            posRef.current.y = Math.max(bounds.top, Math.min(bounds.bottom, posRef.current.y));
          } catch {}

          sendMouseEvent("mouseMove", posRef.current.x, posRef.current.y);

          setExpanded(Date.now() < wiggleEndTime);
        } else {
          wiggleSamples.length = 0;
          setExpanded(Date.now() < wiggleEndTime);
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

        const check = (name: string) => {
          const pressed = buttons[name] ?? false;
          const wasPressed = prev[name] ?? false;
          prev[name] = pressed;
          return pressed && !wasPressed;
        };

        if (check("south")) {
          anyInput = true;
          sendMouseEvent("mouseDown", posRef.current.x, posRef.current.y, "left");
          setTimeout(() => sendMouseEvent("mouseUp", posRef.current.x, posRef.current.y, "left"), 80);
        }
        if (check("east")) {
          anyInput = true;
          onBack?.();
        }
        if (check("west")) {
          anyInput = true;
          sendMouseEvent("mouseDown", posRef.current.x, posRef.current.y, "right");
          setTimeout(() => sendMouseEvent("mouseUp", posRef.current.x, posRef.current.y, "right"), 80);
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
          sendMouseEvent("mouseDown", posRef.current.x, posRef.current.y, "right");
          setTimeout(() => sendMouseEvent("mouseUp", posRef.current.x, posRef.current.y, "right"), 80);
        }
        if (check("right_trigger")) {
          anyInput = true;
          sendMouseEvent("mouseDown", posRef.current.x, posRef.current.y, "left");
          setTimeout(() => sendMouseEvent("mouseUp", posRef.current.x, posRef.current.y, "left"), 80);
        }
        if (check("dpad_up")) sendKey("ArrowUp");
        if (check("dpad_down")) sendKey("ArrowDown");
        if (check("dpad_left")) sendKey("ArrowLeft");
        if (check("dpad_right")) sendKey("ArrowRight");
      }

      // Fade logic
      if (anyInput) {
        lastInputTime = Date.now();
        setVisible(true);
      } else if (Date.now() - lastInputTime > CURSOR_FADE_DELAY_MS) {
        setVisible(false);
      }

      // ---- Detect cursor style under virtual cursor ----
      const now = Date.now();
      if (now - lastCursorCheck > CURSOR_CHECK_INTERVAL_MS) {
        lastCursorCheck = now;
        try {
          const bounds = webview.getBoundingClientRect();
          const relX = Math.round(posRef.current.x - bounds.left);
          const relY = Math.round(posRef.current.y - bounds.top);
          webview.executeJavaScript(
            `(() => {
              const el = document.elementFromPoint(${relX}, ${relY});
              if (!el) return "default";
              const style = window.getComputedStyle(el).cursor;
              return style || "default";
            })()`
          ).then((result: string) => {
            const key = (CURSOR_MAP[result] ? result : "default") as CursorStyle;
            if (key === pendingCursorKey) {
              pendingCursorCount++;
              if (pendingCursorCount >= CURSOR_STABLE_COUNT && key !== currentCursorKey) {
                currentCursorKey = key;
                setHoverStyle(key);
              }
            } else {
              pendingCursorKey = key;
              pendingCursorCount = 1;
            }
          }).catch(() => {});
        } catch {}
      }

      animationFrameId = requestAnimationFrame(poll);
    };

    animationFrameId = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [enabled, webviewRef, onBack, onForward]);

  return (
    <VirtualCursor
      posRef={posRef}
      visible={visible}
      hoverStyle={hoverStyle}
      expanded={expanded}
    />
  );
}

const CURSOR_MAP: Record<string, boolean> = {
  default: true,
  pointer: true,
  text: true,
  "vertical-text": true,
  grab: true,
  grabbing: true,
  "col-resize": true,
  "row-resize": true,
  wait: true,
  progress: true,
};
