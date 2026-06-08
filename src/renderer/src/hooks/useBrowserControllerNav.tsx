import { useEffect, useRef } from "react";
import { useInputStore } from "../store/input.store";
import { getCursorManager, DeviceCursor } from "./browserControllerManager";
import { CursorStyle } from "../components/VirtualCursor/VirtualCursor";

interface UseBrowserControllerNavOptions {
  webviewRef?: React.RefObject<Electron.WebviewTag | null>;
  enabled?: boolean;
  onBack?: () => void;
  onForward?: () => void;
}

export function useBrowserControllerNav({
  webviewRef,
  enabled = true,
  onBack,
  onForward,
}: UseBrowserControllerNavOptions) {
  const getLiveStates = useRef(() => useInputStore.getState().liveStates).current;
  const prevButtonsRef = useRef<Record<string, Record<string, boolean>>>({});
  const manager = useRef(getCursorManager()).current;

  useEffect(() => {
    if (!enabled) {
      // Clean up any cursors we created when disabled
      const remaining = manager.cursors.filter((c) => !c.deviceId.startsWith("bcn-"));
      if (remaining.length !== manager.cursors.length) {
        manager.setCursors(remaining);
      }
      return;
    }

    const webview = webviewRef?.current;

    const AXIS_THRESHOLD = 0.15;
    const SCROLL_THRESHOLD = 0.15;
    const MOUSE_SPEED = 4;
    const SCROLL_SPEED = 10;
    const TRIGGER_THRESHOLD = 700 / 32767;
    const WIGGLE_EXPAND_MS = 2000;
    const WIGGLE_SAMPLE_COUNT = 6;
    const WIGGLE_ANGLE_THRESHOLD = 1.8;
    const CURSOR_FADE_DELAY_MS = 60_000;
    const CURSOR_CHECK_INTERVAL_MS = 150;

    const applyDeadzone = (x: number, y: number, threshold: number): [number, number] => {
      const mag = Math.sqrt(x * x + y * y);
      if (mag < threshold) return [0, 0];
      const scale = (mag - threshold) / (1 - threshold) / mag;
      return [x * scale, y * scale];
    };

    interface DeviceState {
      posRef: { current: { x: number; y: number } };
      prevButtons: Record<string, boolean>;
      prevTriggers: Record<string, boolean>;
      wiggleSamples: { dx: number; dy: number }[];
      wiggleEndTime: number;
      lastInputTime: number;
      lastCursorCheck: number;
      currentCursorKey: CursorStyle;
      pendingCursorKey: CursorStyle;
      pendingCursorCount: number;
      visible: boolean;
      hoverStyle: CursorStyle;
      expanded: boolean;
    }

    const deviceMap = new Map<string, DeviceState>();
    let knownDeviceIds: string[] = [];
    let animationFrameId: number;
    const instancePrefix = `bcn-${Date.now()}-${Math.random().toString(36).slice(2)}-`;

    const ensureDevice = (deviceId: string): DeviceState => {
      let state = deviceMap.get(deviceId);
      if (!state) {
        const posRef = { current: { x: 0, y: 0 } };
        state = {
          posRef,
          prevButtons: {},
          prevTriggers: {},
          wiggleSamples: [],
          wiggleEndTime: 0,
          lastInputTime: Date.now(),
          lastCursorCheck: 0,
          currentCursorKey: "default",
          pendingCursorKey: "default",
          pendingCursorCount: 0,
          visible: false,
          hoverStyle: "default",
          expanded: false,
        };
        deviceMap.set(deviceId, state);
      }
      return state;
    };

    const sendMouseEvent = (type: string, x: number, y: number, button?: string) => {
      if (webview) {
        try {
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
        return;
      }

      // Main mode: dispatch real DOM events to the element under the cursor
      try {
        const target = document.elementFromPoint(x, y);
        if (!target) return;
        const ev = new MouseEvent(type === "mouseDown" ? "mousedown" : type === "mouseUp" ? "mouseup" : "mousemove", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: button === "left" ? 0 : button === "right" ? 2 : 0,
          buttons: button === "left" ? 1 : button === "right" ? 2 : 0,
        });
        target.dispatchEvent(ev);

        // For left click, also dispatch click
        if (type === "mouseUp" && button === "left") {
          const clickEv = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: 1,
          });
          target.dispatchEvent(clickEv);
        }
        // For right click, also dispatch contextmenu
        if (type === "mouseUp" && button === "right") {
          const ctxEv = new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 2,
            buttons: 2,
          });
          target.dispatchEvent(ctxEv);
        }
      } catch {}
    };

    const sendKey = (keyCode: string, modifiers?: string[]) => {
      if (webview) {
        try {
          webview.sendInputEvent({ type: "keyDown", keyCode, modifiers: modifiers as any });
          setTimeout(() => {
            try {
              webview.sendInputEvent({ type: "keyUp", keyCode, modifiers: modifiers as any });
            } catch {}
          }, 50);
        } catch {}
        return;
      }

      // Main mode: dispatch real DOM keyboard events
      try {
        const shift = modifiers?.includes("shift") ?? false;
        const keyMap: Record<string, string> = {
          ArrowUp: "ArrowUp", ArrowDown: "ArrowDown",
          ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight",
          Tab: "Tab",
        };
        const key = keyMap[keyCode] ?? keyCode;
        const evInit: KeyboardEventInit = {
          bubbles: true,
          cancelable: true,
          key,
          code: key,
          shiftKey: shift,
        };
        const target = document.activeElement ?? document.body;
        target.dispatchEvent(new KeyboardEvent("keydown", evInit));
        setTimeout(() => {
          target.dispatchEvent(new KeyboardEvent("keyup", evInit));
        }, 50);
      } catch {}
    };

    const clampToWindow = (x: number, y: number) => ({
      x: Math.max(0, Math.min(window.innerWidth, x)),
      y: Math.max(0, Math.min(window.innerHeight, y)),
    });

    const clampToWebview = (x: number, y: number) => {
      if (!webview) return clampToWindow(x, y);
      try {
        const bounds = webview.getBoundingClientRect();
        return {
          x: Math.max(bounds.left, Math.min(bounds.right, x)),
          y: Math.max(bounds.top, Math.min(bounds.bottom, y)),
        };
      } catch {
        return clampToWindow(x, y);
      }
    };

    const updateManager = () => {
      const activeIds = Array.from(deviceMap.keys());
      const newCursors: DeviceCursor[] = activeIds.map((id, idx) => {
        const dev = deviceMap.get(id)!;
        return {
          deviceId: instancePrefix + id,
          posRef: dev.posRef,
          hue: [22, 210, 140, 280, 45, 330, 180, 0][idx % 8],
          visible: dev.visible,
          hoverStyle: dev.hoverStyle,
          expanded: dev.expanded,
        };
      });
      // Merge with cursors from other instances
      const otherCursors = manager.cursors.filter((c) => !c.deviceId.startsWith(instancePrefix));
      manager.setCursors([...otherCursors, ...newCursors]);
    };

    const poll = () => {
      const liveStates = getLiveStates();
      const activeIds = Object.keys(liveStates);

      for (const id of knownDeviceIds) {
        if (!activeIds.includes(id)) {
          deviceMap.delete(id);
        }
      }
      knownDeviceIds = activeIds;

      let anyDeviceHadInput = false;

      for (let i = 0; i < activeIds.length; i++) {
        const deviceId = activeIds[i];
        const state = liveStates[deviceId];
        if (!state) continue;

        const dev = ensureDevice(deviceId);
        const axes = state.axes;
        let anyInput = false;

        const rawRightX = (axes.right_x ?? 0) / 32767;
        const rawRightY = (axes.right_y ?? 0) / 32767;
        const [rightX, rightY] = applyDeadzone(rawRightX, rawRightY, AXIS_THRESHOLD);

        if (rightX !== 0 || rightY !== 0) {
          anyInput = true;

          dev.wiggleSamples.push({ dx: rightX, dy: rightY });
          if (dev.wiggleSamples.length > WIGGLE_SAMPLE_COUNT) dev.wiggleSamples.shift();
          if (dev.wiggleSamples.length >= 3) {
            let totalAngle = 0;
            for (let j = 1; j < dev.wiggleSamples.length; j++) {
              const a = dev.wiggleSamples[j - 1];
              const b = dev.wiggleSamples[j];
              const dot = a.dx * b.dx + a.dy * b.dy;
              const magA = Math.sqrt(a.dx * a.dx + a.dy * a.dy);
              const magB = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
              if (magA > 0.001 && magB > 0.001) {
                totalAngle += Math.acos(Math.max(-1, Math.min(1, dot / (magA * magB))));
              }
            }
            if (totalAngle > WIGGLE_ANGLE_THRESHOLD) {
              dev.wiggleEndTime = Date.now() + WIGGLE_EXPAND_MS;
            }
          }

          dev.posRef.current.x += rightX * MOUSE_SPEED;
          dev.posRef.current.y += rightY * MOUSE_SPEED;
          const clamped = clampToWebview(dev.posRef.current.x, dev.posRef.current.y);
          dev.posRef.current.x = clamped.x;
          dev.posRef.current.y = clamped.y;

          sendMouseEvent("mouseMove", dev.posRef.current.x, dev.posRef.current.y);
          dev.expanded = Date.now() < dev.wiggleEndTime;
        } else {
          dev.wiggleSamples.length = 0;
          dev.expanded = Date.now() < dev.wiggleEndTime;
        }

        const rawLeftX = (axes.left_x ?? 0) / 32767;
        const rawLeftY = (axes.left_y ?? 0) / 32767;
        const [leftX, leftY] = applyDeadzone(rawLeftX, rawLeftY, SCROLL_THRESHOLD);

        if (leftX !== 0 || leftY !== 0) {
          anyInput = true;
          if (webview) {
            try {
              webview.executeJavaScript(`window.scrollBy(${leftX * SCROLL_SPEED}, ${leftY * SCROLL_SPEED})`);
            } catch {}
          }
        }

        const buttons = state.buttons;
        const prev = dev.prevButtons;

        const check = (name: string) => {
          const pressed = buttons[name] ?? false;
          const wasPressed = prev[name] ?? false;
          prev[name] = pressed;
          return pressed && !wasPressed;
        };

        if (check("south")) {
          anyInput = true;
          sendMouseEvent("mouseDown", dev.posRef.current.x, dev.posRef.current.y, "left");
          setTimeout(() => sendMouseEvent("mouseUp", dev.posRef.current.x, dev.posRef.current.y, "left"), 80);
        }
        if (check("east")) {
          anyInput = true;
          onBack?.();
        }
        if (check("west")) {
          anyInput = true;
          sendMouseEvent("mouseDown", dev.posRef.current.x, dev.posRef.current.y, "right");
          setTimeout(() => sendMouseEvent("mouseUp", dev.posRef.current.x, dev.posRef.current.y, "right"), 80);
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

        const ltAxis = (axes.left_trigger ?? 0) / 32767;
        const rtAxis = (axes.right_trigger ?? 0) / 32767;
        const ltBtn = buttons["left_trigger_btn"] ?? false;
        const rtBtn = buttons["right_trigger_btn"] ?? false;
        const ltBtnFallback = buttons["left_trigger"] ?? false;
        const rtBtnFallback = buttons["right_trigger"] ?? false;

        const ltPressed = ltAxis > TRIGGER_THRESHOLD || ltBtn || ltBtnFallback;
        const rtPressed = rtAxis > TRIGGER_THRESHOLD || rtBtn || rtBtnFallback;
        const wasLtPressed = dev.prevTriggers["left"] ?? false;
        const wasRtPressed = dev.prevTriggers["right"] ?? false;

        dev.prevTriggers["left"] = ltPressed;
        dev.prevTriggers["right"] = rtPressed;

        if (ltPressed && !wasLtPressed) {
          anyInput = true;
          sendMouseEvent("mouseDown", dev.posRef.current.x, dev.posRef.current.y, "right");
          setTimeout(() => sendMouseEvent("mouseUp", dev.posRef.current.x, dev.posRef.current.y, "right"), 80);
        }
        if (rtPressed && !wasRtPressed) {
          anyInput = true;
          sendMouseEvent("mouseDown", dev.posRef.current.x, dev.posRef.current.y, "left");
          setTimeout(() => sendMouseEvent("mouseUp", dev.posRef.current.x, dev.posRef.current.y, "left"), 80);
        }

        if (check("dpad_up")) sendKey("ArrowUp");
        if (check("dpad_down")) sendKey("ArrowDown");
        if (check("dpad_left")) sendKey("ArrowLeft");
        if (check("dpad_right")) sendKey("ArrowRight");

        if (anyInput) {
          dev.lastInputTime = Date.now();
          dev.visible = true;
          anyDeviceHadInput = true;
        } else if (Date.now() - dev.lastInputTime > CURSOR_FADE_DELAY_MS) {
          dev.visible = false;
        }

        if (webview) {
          const now = Date.now();
          if (now - dev.lastCursorCheck > CURSOR_CHECK_INTERVAL_MS) {
            dev.lastCursorCheck = now;
            try {
              const bounds = webview.getBoundingClientRect();
              const relX = Math.round(dev.posRef.current.x - bounds.left);
              const relY = Math.round(dev.posRef.current.y - bounds.top);
              webview.executeJavaScript(
                `(() => {
                  const el = document.elementFromPoint(${relX}, ${relY});
                  if (!el) return "default";
                  const style = window.getComputedStyle(el).cursor;
                  return style || "default";
                })()`
              ).then((result: string) => {
                const key = (CURSOR_MAP[result] ? result : "default") as CursorStyle;
                if (key === dev.pendingCursorKey) {
                  dev.pendingCursorCount++;
                  if (dev.pendingCursorCount >= 3 && key !== dev.currentCursorKey) {
                    dev.currentCursorKey = key;
                    dev.hoverStyle = key;
                  }
                } else {
                  dev.pendingCursorKey = key;
                  dev.pendingCursorCount = 1;
                }
              }).catch(() => {});
            } catch {}
          }
        }
      }

      if (anyDeviceHadInput || knownDeviceIds.length > 0) {
        updateManager();
      }

      animationFrameId = requestAnimationFrame(poll);
    };

    animationFrameId = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(animationFrameId);
      deviceMap.clear();
      const remaining = manager.cursors.filter((c) => !c.deviceId.startsWith(instancePrefix));
      manager.setCursors(remaining);
    };
  }, [enabled, webviewRef, onBack, onForward]);
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
