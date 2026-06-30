import { useEffect, useRef } from "react";
import { useInputStore } from "../store/input.store";
import { useSettingsStore } from "../store/settings.store";
import { ControllerBrowserSettings } from "@shared/types";
import { getCursorManager, DeviceCursor } from "./browserControllerManager";
import { CursorStyle } from "../components/VirtualCursor/VirtualCursor";
import { findInputElement, useControllerOskStore } from "../store/controllerOsk.store";

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
    const BASE_MOUSE_SPEED = 8; // pixels/frame at 60fps when mouseSpeed = 1.0
    const BASE_SCROLL_SPEED = 10; // pixels/frame at 60fps
    const TRIGGER_THRESHOLD = 0.3; // triggers are normalised 0..1
    const WIGGLE_EXPAND_MS = 2000;
    const WIGGLE_SAMPLE_COUNT = 6;
    const WIGGLE_ANGLE_THRESHOLD = 1.8;
    const CURSOR_FADE_DELAY_MS = 60_000;
    const CURSOR_CHECK_INTERVAL_MS = 150;
    let lastPollTime = 0;

    const applyDeadzone = (x: number, y: number, threshold: number): [number, number] => {
      const mag = Math.sqrt(x * x + y * y);
      if (mag < threshold) return [0, 0];
      const scale = (mag - threshold) / (1 - threshold) / mag;
      return [x * scale, y * scale];
    };

    // Axis values from evdev are now normalised in the main process.
    // Gamepad API fallback also returns normalised -1..1 values.
    // We only need to apply deadzone here.

    interface DeviceState {
      posRef: { current: { x: number; y: number } };
      clickRef: { current: number };
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
      const ltAxis = axes.left_trigger ?? 0;
      const rtAxis = axes.right_trigger ?? 0;
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
        const lastInputTime = saved?.lastInputTime ?? 0;
        state = {
          posRef,
          clickRef: { current: 0 },
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

    const isInsideOSK = (el: Element | null): boolean => {
      while (el) {
        if (el.getAttribute?.("data-controller-osk") === "true") return true;
        el = el.parentElement;
      }
      return false;
    };

    const sendMouseEvent = (type: string, x: number, y: number, button?: string, deviceId?: string) => {
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

        // Webview input detection: after a click, check if an input inside the webview got focused
        if (deviceId && type === "mouseUp" && button === "left") {
          const oskStore = useControllerOskStore.getState();
          const wasOpen = oskStore.isOpen(deviceId);

          // Small delay so the webview can process the click and update activeElement
          setTimeout(() => {
            try {
              webview.executeJavaScript(`
                (() => {
                  const el = document.activeElement;
                  if (!el) return null;
                  if (el.tagName === 'INPUT') {
                    const t = el.type;
                    if (['text','number','password','email','url','search','tel'].includes(t)) {
                      return { tag: 'INPUT', type: t, value: el.value, placeholder: el.placeholder || '' };
                    }
                  }
                  if (el.tagName === 'TEXTAREA') {
                    return { tag: 'TEXTAREA', type: 'text', value: el.value, placeholder: el.placeholder || '' };
                  }
                  if (el.isContentEditable) {
                    return { tag: 'DIV', type: 'text', value: el.textContent || '', placeholder: '' };
                  }
                  return null;
                })()
              `).then((result: any) => {
                if (!result) {
                  if (wasOpen) oskStore.close(deviceId);
                  return;
                }
                if (wasOpen) {
                  const session = oskStore.getSession(deviceId)!;
                  // Only switch if it's a different input
                  const sameInput = result.value === session.value && result.type === session.inputType;
                  if (!sameInput) {
                    oskStore.close(deviceId);
                    oskStore.open(deviceId, webview as unknown as HTMLElement, result.value, result.type, result.placeholder, true);
                  } else {
                    oskStore.close(deviceId);
                  }
                } else {
                  // Store webview reference; actual input is inside webview
                  oskStore.open(deviceId, webview as unknown as HTMLElement, result.value, result.type, result.placeholder, true);
                }
              }).catch(() => {
                if (wasOpen) oskStore.close(deviceId);
              });
            } catch {
              if (wasOpen) oskStore.close(deviceId);
            }
          }, 50);
        }
        return;
      }

      // Main mode: dispatch real DOM events to the element under the cursor
      try {
        const target = document.elementFromPoint(x, y);
        if (!target) return;

        // Check for input element on left mouseUp before dispatching click
        if (deviceId && type === "mouseUp" && button === "left") {
          const oskStore = useControllerOskStore.getState();

          // If OSK already open for this device, close it on click-away
          if (oskStore.isOpen(deviceId)) {
            // Don't close if the click is inside the keyboard itself
            if (isInsideOSK(target)) {
              // Continue with normal click dispatch so keyboard buttons work
            } else {
              const inputEl = findInputElement(target);
              const session = oskStore.getSession(deviceId)!;
              if (inputEl && inputEl !== session.targetElement) {
                // Switch to new input
                oskStore.close(deviceId);
                inputEl.focus();
                const initial =
                  inputEl instanceof HTMLInputElement || inputEl instanceof HTMLTextAreaElement
                    ? inputEl.value
                    : inputEl.textContent ?? "";
                oskStore.open(deviceId, inputEl, initial, inputEl instanceof HTMLInputElement ? inputEl.type : "text");
              } else if (!inputEl) {
                // Clicked outside input, close OSK but still dispatch click
                oskStore.close(deviceId);
              } else {
                // Clicked same input, just close OSK and let click through
                oskStore.close(deviceId);
              }
            }
            // Continue with normal click dispatch below
          } else {
            const inputEl = findInputElement(target);
            if (inputEl) {
              inputEl.focus();
              const initial =
                inputEl instanceof HTMLInputElement || inputEl instanceof HTMLTextAreaElement
                  ? inputEl.value
                  : inputEl.textContent ?? "";
              oskStore.open(
                deviceId,
                inputEl,
                initial,
                inputEl instanceof HTMLInputElement ? inputEl.type : "text",
                inputEl instanceof HTMLInputElement ? inputEl.placeholder : undefined,
              );
              return; // Suppress normal click
            }
          }
        }

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

    const getMainSnapTarget = (x: number, y: number, distance: number, selectors: string[]): { x: number; y: number } | null => {
      let best: { x: number; y: number; dist: number } | null = null;
      for (const sel of selectors) {
        try {
          for (const el of document.querySelectorAll(sel)) {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const d = Math.hypot(cx - x, cy - y);
            if (d <= distance && (!best || d < best.dist)) {
              best = { x: cx, y: cy, dist: d };
            }
          }
        } catch {
          // ignore invalid selectors
        }
      }
      return best ? { x: best.x, y: best.y } : null;
    };

    const getWebviewSnapTarget = async (
      webview: Electron.WebviewTag,
      x: number,
      y: number,
      distance: number,
      selectors: string[],
    ): Promise<{ x: number; y: number } | null> => {
      const bounds = webview.getBoundingClientRect();
      const relX = Math.round(x - bounds.left);
      const relY = Math.round(y - bounds.top);
      try {
        const result = await webview.executeJavaScript(`(() => {
          const selectors = ${JSON.stringify(selectors)};
          const x = ${relX}, y = ${relY}, distance = ${distance};
          let best = null;
          let bestDist = Infinity;
          for (const sel of selectors) {
            try {
              for (const el of document.querySelectorAll(sel)) {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const d = Math.hypot(cx - x, cy - y);
                if (d <= distance && d < bestDist) {
                  bestDist = d;
                  best = { x: cx, y: cy };
                }
              }
            } catch (e) {}
          }
          return best;
        })()`);
        if (!result) return null;
        return { x: result.x + bounds.left, y: result.y + bounds.top };
      } catch {
        return null;
      }
    };

    const snapCursor = async (
      x: number,
      y: number,
      webview: Electron.WebviewTag | null,
      settings: ControllerBrowserSettings,
    ): Promise<{ x: number; y: number } | null> => {
      if (!settings.snapToElement) return null;
      const distance = settings.snapDistance ?? 50;
      const selectors = settings.snapSelectors ?? ["button", "a", "input", "textarea", "select", "[role='button']"];
      if (!webview) {
        return getMainSnapTarget(x, y, distance, selectors);
      }
      return getWebviewSnapTarget(webview, x, y, distance, selectors);
    };

    const updateManager = () => {
      const activeIds = Array.from(deviceMap.keys());
      const newCursors: DeviceCursor[] = activeIds.map((id, idx) => {
        const dev = deviceMap.get(id)!;
        return {
          deviceId: instancePrefix + id,
          posRef: dev.posRef,
          clickRef: dev.clickRef,
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
      const now = performance.now();
      const dt = lastPollTime ? Math.min((now - lastPollTime) / 1000, 0.05) : 1 / 60;
      lastPollTime = now;

      const mouseSpeed = useSettingsStore.getState().settings?.controllerBrowser?.mouseSpeed ?? 0.5;
      const mouseSpeedPx = BASE_MOUSE_SPEED * mouseSpeed * 60 * dt;
      const scrollSpeedPx = BASE_SCROLL_SPEED * 60 * dt;

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

        const oskOpen = useControllerOskStore.getState().isOpen(deviceId);

        const rawRightX = axes.right_x ?? 0;
        const rawRightY = axes.right_y ?? 0;
        const [rightX, rightY] = applyDeadzone(rawRightX, rawRightY, AXIS_THRESHOLD);

        // Cursor movement always works (even when OSK is open)
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

          dev.posRef.current.x += rightX * mouseSpeedPx;
          dev.posRef.current.y += rightY * mouseSpeedPx;
          const clamped = clampToWindow(dev.posRef.current.x, dev.posRef.current.y);
          dev.posRef.current.x = clamped.x;
          dev.posRef.current.y = clamped.y;

          sendMouseEvent("mouseMove", dev.posRef.current.x, dev.posRef.current.y);
          dev.expanded = Date.now() < dev.wiggleEndTime;
        } else {
          dev.wiggleSamples.length = 0;
          dev.expanded = Date.now() < dev.wiggleEndTime;
        }

        const rawLeftX = axes.left_x ?? 0;
        const rawLeftY = axes.left_y ?? 0;
        const [leftX, leftY] = applyDeadzone(rawLeftX, rawLeftY, SCROLL_THRESHOLD);

        // Block scroll when OSK is open (left stick is used for OSK nav instead)
        if (!oskOpen && (leftX !== 0 || leftY !== 0)) {
          anyInput = true;
          if (webviewUnderCursor) {
            try {
              webviewUnderCursor.executeJavaScript(`window.scrollBy(${leftX * scrollSpeedPx}, ${leftY * scrollSpeedPx})`);
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

        const scheduleMouseUp = (x: number, y: number, button: string, devId: string) => {
          const t = setTimeout(() => {
            pendingTimeouts.delete(t);
            sendMouseEvent("mouseUp", x, y, button, devId);
          }, 80);
          pendingTimeouts.add(t);
        };

        const performLeftClick = async (deviceId: string, dev: DeviceState, webview: Electron.WebviewTag | null) => {
          const settings = useSettingsStore.getState().settings?.controllerBrowser;
          let x = dev.posRef.current.x;
          let y = dev.posRef.current.y;
          if (settings?.snapToElement) {
            const snapped = await snapCursor(x, y, webview, settings);
            if (snapped) {
              x = snapped.x;
              y = snapped.y;
              const clamped = clampToWindow(x, y);
              x = clamped.x;
              y = clamped.y;
              dev.posRef.current.x = x;
              dev.posRef.current.y = y;
              sendMouseEvent("mouseMove", x, y);
            }
          }
          dev.clickRef.current = (dev.clickRef.current || 0) + 1;
          sendMouseEvent("mouseDown", x, y, "left", deviceId);
          scheduleMouseUp(x, y, "left", deviceId);
        };

        // When evdev devices are present, button actions are already handled
        // by the evdev path in App.tsx. Skip synthetic mouse/keyboard events
        // to avoid double-firing UI actions.
        // Always allow left-click (south) so virtual cursor can click-away from OSK.
        if (!evdevActive) {
          if (check("south")) {
            anyInput = true;
            performLeftClick(deviceId, dev, webviewUnderCursor);
          }
          if (!oskOpen) {
            if (check("east")) {
              anyInput = true;
              if (webviewUnderCursor && webviewUnderCursor.canGoBack && webviewUnderCursor.canGoBack()) {
                webviewUnderCursor.goBack();
              }
            }
            if (check("west")) {
              anyInput = true;
              dev.clickRef.current = (dev.clickRef.current || 0) + 1;
              sendMouseEvent("mouseDown", dev.posRef.current.x, dev.posRef.current.y, "right", deviceId);
              scheduleMouseUp(dev.posRef.current.x, dev.posRef.current.y, "right", deviceId);
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
        }

        const ltAxis = axes.left_trigger ?? 0;
        const rtAxis = axes.right_trigger ?? 0;
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

        // RT = left click, always allow (click-away from OSK)
        if (rtPressed && !wasRtPressed) {
          anyInput = true;
          performLeftClick(deviceId, dev, webviewUnderCursor);
        }

        if (!oskOpen) {
          if (ltPressed && !wasLtPressed) {
            anyInput = true;
            dev.clickRef.current = (dev.clickRef.current || 0) + 1;
            sendMouseEvent("mouseDown", dev.posRef.current.x, dev.posRef.current.y, "right", deviceId);
            scheduleMouseUp(dev.posRef.current.x, dev.posRef.current.y, "right", deviceId);
          }

          if (check("dpad_up")) sendKey("ArrowUp", dev.posRef.current.x, dev.posRef.current.y);
          if (check("dpad_down")) sendKey("ArrowDown", dev.posRef.current.x, dev.posRef.current.y);
          if (check("dpad_left")) sendKey("ArrowLeft", dev.posRef.current.x, dev.posRef.current.y);
          if (check("dpad_right")) sendKey("ArrowRight", dev.posRef.current.x, dev.posRef.current.y);
        }

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
  }, [enabled, evdevActive]);
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
