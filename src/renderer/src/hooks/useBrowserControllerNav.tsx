import { useEffect, useRef } from "react";
import { useInputStore } from "../store/input.store";
import { getCursorManager, DeviceCursor } from "./browserControllerManager";
import { CursorStyle } from "../components/VirtualCursor/VirtualCursor";

interface UseBrowserControllerNavOptions {
  enabled?: boolean;
  /** When true, evdev devices are present and button actions are already
   *  handled by the evdev path. This hook should only manage cursor movement
   *  and scrolling to avoid double-firing UI actions. */
  evdevActive?: boolean;
}

export function useBrowserControllerNav({
  enabled = true,
  evdevActive = false,
}: UseBrowserControllerNavOptions) {
  const getLiveStates = useRef(() => useInputStore.getState().liveStates).current;
  const manager = useRef(getCursorManager()).current;

  useEffect(() => {
    if (!enabled) {
      const remaining = manager.cursors.filter((c) => !c.deviceId.startsWith("bcn-"));
      if (remaining.length !== manager.cursors.length) {
        manager.setCursors(remaining);
      }
      return;
    }

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

    /** Normalise raw axis values to signed-16 range or -1..1.
     *  Drivers report different ranges; detect from magnitude. */
    function normStick(value: number): number {
      if (Math.abs(value) <= 1) return value;          // already normalised
      if (value >= 0 && value <= 255) return (value - 128) / 128; // raw 0..255
      return value / 32767;                             // signed-16
    }
    function normTrigger(value: number): number {
      if (value >= 0 && value <= 1) return value;       // already normalised
      if (value >= 0 && value <= 255) return value / 255; // raw 0..255
      return value / 32767;                              // signed-16
    }

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
    const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

    const getDefaultPos = () => ({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const seedButtons = (liveStates: Record<string, any>, deviceId: string): Record<string, boolean> => {
      const btns = liveStates[deviceId]?.buttons;
      return btns ? { ...btns } : {};
    };

    const seedTriggers = (liveStates: Record<string, any>, deviceId: string): Record<string, boolean> => {
      const axes = liveStates[deviceId]?.axes;
      const buttons = liveStates[deviceId]?.buttons;
      if (!axes || !buttons) return {};
      const ltAxis = normTrigger(axes.left_trigger ?? 0);
      const rtAxis = normTrigger(axes.right_trigger ?? 0);
      const ltBtn = buttons["left_trigger_btn"] ?? false;
      const rtBtn = buttons["right_trigger_btn"] ?? false;
      const ltBtnFallback = buttons["left_trigger"] ?? false;
      const rtBtnFallback = buttons["right_trigger"] ?? false;
      return {
        left: ltAxis > TRIGGER_THRESHOLD || ltBtn || ltBtnFallback,
        right: rtAxis > TRIGGER_THRESHOLD || rtBtn || rtBtnFallback,
      };
    };

    const findWebviewAt = (x: number, y: number): Electron.WebviewTag | null => {
      const webviews = document.querySelectorAll("webview");
      for (const wv of webviews) {
        const rect = wv.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return wv as Electron.WebviewTag;
        }
      }
      return null;
    };

    const ensureDevice = (deviceId: string, liveStates: Record<string, any>): DeviceState => {
      let state = deviceMap.get(deviceId);
      if (!state) {
        const saved = manager.lastPositions.get(deviceId);
        const posRef = { current: saved ? { x: saved.x, y: saved.y } : getDefaultPos() };
        const lastInputTime = saved?.lastInputTime ?? Date.now();
        state = {
          posRef,
          prevButtons: seedButtons(liveStates, deviceId),
          prevTriggers: seedTriggers(liveStates, deviceId),
          wiggleSamples: [],
          wiggleEndTime: 0,
          lastInputTime,
          lastCursorCheck: 0,
          currentCursorKey: "default",
          pendingCursorKey: "default",
          pendingCursorCount: 0,
          visible: Date.now() - lastInputTime <= CURSOR_FADE_DELAY_MS,
          hoverStyle: "default",
          expanded: false,
        };
        deviceMap.set(deviceId, state);
      }
      return state;
    };

    const sendMouseEvent = (type: string, x: number, y: number, button?: string) => {
      const webview = findWebviewAt(x, y);
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

        // For left click, invoke native .click() on the nearest clickable
        // ancestor so React onClick handlers fire reliably when the virtual
        // cursor is hovering over a child element (e.g. an icon inside a button).
        if (type === "mouseUp" && button === "left") {
          let el: Element | null = target;
          while (el) {
            if (el.tagName === "BUTTON" || el.tagName === "A" || (el as HTMLElement).onclick != null) {
              (el as HTMLElement).click();
              break;
            }
            el = el.parentElement;
          }
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

    const sendKey = (keyCode: string, x: number, y: number, modifiers?: string[]) => {
      // Only send keys to webview if cursor is inside one
      const webview = findWebviewAt(x, y);
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
          const dev = deviceMap.get(id);
          if (dev) {
            manager.lastPositions.set(id, { ...dev.posRef.current, lastInputTime: dev.lastInputTime });
          }
          deviceMap.delete(id);
        }
      }
      knownDeviceIds = activeIds;

      let anyDeviceHadInput = false;

      let managerNeedsUpdate = false;

      for (let i = 0; i < activeIds.length; i++) {
        const deviceId = activeIds[i];
        const state = liveStates[deviceId];
        if (!state) continue;

        const dev = ensureDevice(deviceId, liveStates);
        const axes = state.axes;
        let anyInput = false;
        const prevVisible = dev.visible;

        // Cache webview under this device's cursor for the entire frame
        const webviewUnderCursor = findWebviewAt(dev.posRef.current.x, dev.posRef.current.y);

        const rawRightX = normStick(axes.right_x ?? 0);
        const rawRightY = normStick(axes.right_y ?? 0);
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
          const clamped = clampToWindow(dev.posRef.current.x, dev.posRef.current.y);
          dev.posRef.current.x = clamped.x;
          dev.posRef.current.y = clamped.y;

          sendMouseEvent("mouseMove", dev.posRef.current.x, dev.posRef.current.y);
          dev.expanded = Date.now() < dev.wiggleEndTime;
        } else {
          dev.wiggleSamples.length = 0;
          dev.expanded = Date.now() < dev.wiggleEndTime;
        }

        const rawLeftX = normStick(axes.left_x ?? 0);
        const rawLeftY = normStick(axes.left_y ?? 0);
        const [leftX, leftY] = applyDeadzone(rawLeftX, rawLeftY, SCROLL_THRESHOLD);

        if (leftX !== 0 || leftY !== 0) {
          anyInput = true;
          if (webviewUnderCursor) {
            try {
              webviewUnderCursor.executeJavaScript(`window.scrollBy(${leftX * SCROLL_SPEED}, ${leftY * SCROLL_SPEED})`);
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

        const scheduleMouseUp = (x: number, y: number, button: string) => {
          const t = setTimeout(() => {
            pendingTimeouts.delete(t);
            sendMouseEvent("mouseUp", x, y, button);
          }, 80);
          pendingTimeouts.add(t);
        };

        // When evdev devices are present, button actions are already handled
        // by the evdev path in App.tsx. Skip synthetic mouse/keyboard events
        // to avoid double-firing UI actions.
        if (!evdevActive) {
          if (check("south")) {
            anyInput = true;
            sendMouseEvent("mouseDown", dev.posRef.current.x, dev.posRef.current.y, "left");
            scheduleMouseUp(dev.posRef.current.x, dev.posRef.current.y, "left");
          }
          if (check("east")) {
            anyInput = true;
            if (webviewUnderCursor && webviewUnderCursor.canGoBack && webviewUnderCursor.canGoBack()) {
              webviewUnderCursor.goBack();
            }
          }
          if (check("west")) {
            anyInput = true;
            sendMouseEvent("mouseDown", dev.posRef.current.x, dev.posRef.current.y, "right");
            scheduleMouseUp(dev.posRef.current.x, dev.posRef.current.y, "right");
          }
          if (check("north")) {
            anyInput = true;
            if (webviewUnderCursor && webviewUnderCursor.canGoForward && webviewUnderCursor.canGoForward()) {
              webviewUnderCursor.goForward();
            }
          }
          // Only send Tab keys for bumpers when cursor is inside a webview.
          // In main mode the app already handles bumper tab switching
          // directly via evdev / useGamepadApi to avoid double-firing.
          if (webviewUnderCursor) {
            if (check("left_bumper")) {
              anyInput = true;
              sendKey("Tab", dev.posRef.current.x, dev.posRef.current.y, ["shift"]);
            }
            if (check("right_bumper")) {
              anyInput = true;
              sendKey("Tab", dev.posRef.current.x, dev.posRef.current.y);
            }
          }
        }

        const ltAxis = normTrigger(axes.left_trigger ?? 0);
        const rtAxis = normTrigger(axes.right_trigger ?? 0);
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
          scheduleMouseUp(dev.posRef.current.x, dev.posRef.current.y, "right");
        }
        if (rtPressed && !wasRtPressed) {
          anyInput = true;
          sendMouseEvent("mouseDown", dev.posRef.current.x, dev.posRef.current.y, "left");
          scheduleMouseUp(dev.posRef.current.x, dev.posRef.current.y, "left");
        }

        if (check("dpad_up")) sendKey("ArrowUp", dev.posRef.current.x, dev.posRef.current.y);
        if (check("dpad_down")) sendKey("ArrowDown", dev.posRef.current.x, dev.posRef.current.y);
        if (check("dpad_left")) sendKey("ArrowLeft", dev.posRef.current.x, dev.posRef.current.y);
        if (check("dpad_right")) sendKey("ArrowRight", dev.posRef.current.x, dev.posRef.current.y);

        if (anyInput) {
          dev.lastInputTime = Date.now();
          dev.visible = true;
          anyDeviceHadInput = true;
        } else if (Date.now() - dev.lastInputTime > CURSOR_FADE_DELAY_MS) {
          dev.visible = false;
        }

        // Notify React only when visibility changes or device list changes
        if (dev.visible !== prevVisible) {
          managerNeedsUpdate = true;
        }

        if (webviewUnderCursor) {
          const now = Date.now();
          if (now - dev.lastCursorCheck > CURSOR_CHECK_INTERVAL_MS) {
            dev.lastCursorCheck = now;
            try {
              const bounds = webviewUnderCursor.getBoundingClientRect();
              const relX = Math.round(dev.posRef.current.x - bounds.left);
              const relY = Math.round(dev.posRef.current.y - bounds.top);
              webviewUnderCursor.executeJavaScript(
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

      // Only rebuild the cursor manager/React state when devices are added/removed
      // or visibility changes. Positions/hover/expanded are read via refs in the
      // canvas rAF loop and do not need React re-renders.
      if (managerNeedsUpdate || knownDeviceIds.length !== manager.cursors.filter(c => c.deviceId.startsWith(instancePrefix)).length) {
        updateManager();
      }

      animationFrameId = requestAnimationFrame(poll);
    };

    animationFrameId = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(animationFrameId);
      for (const t of pendingTimeouts) {
        clearTimeout(t);
      }
      pendingTimeouts.clear();
      for (const [id, dev] of deviceMap) {
        manager.lastPositions.set(id, { ...dev.posRef.current, lastInputTime: dev.lastInputTime });
      }
      deviceMap.clear();
      const remaining = manager.cursors.filter((c) => !c.deviceId.startsWith(instancePrefix));
      manager.setCursors(remaining);
    };
  }, [enabled]);
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
