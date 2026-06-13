import { useEffect, useRef } from "react";
import { useInputStore } from "../store/input.store";
import { ControllerDevice, ControllerType, TabId } from "../../../shared/types";

/**
 * Fallback gamepad input using the browser Gamepad API.
 * Polls navigator.getGamepads() and dispatches htpc:nav / htpc:contextmenu
 * events so controllers work even when the evdev path lacks permissions.
 *
 * Also registers synthetic ControllerDevice entries in the input store so
 * controllers show up in the Controllers tab when evdev is unavailable.
 */

/** Parse vendor/product from Linux-style gamepad IDs like "045e-02d1-..." */
function parseGamepadId(id: string): { name: string; vendorId: number; productId: number } {
  const match = id.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-(.*)$/);
  if (match) {
    return {
      vendorId: parseInt(match[1], 16),
      productId: parseInt(match[2], 16),
      name: match[3].trim(),
    };
  }
  return { name: id, vendorId: 0, productId: 0 };
}

function detectTypeFromGamepad(id: string, name: string, vendorId: number): ControllerType {
  const n = name.toLowerCase();
  if (n.includes("xbox") || vendorId === 0x045e || n.includes("xinput") || /\bx360\b/.test(n)) return "xbox";
  if (vendorId === 0x054c) {
    if (n.includes("dualsense") || /ps5|playstation 5/.test(n)) return "ps5";
    if (n.includes("dualshock 4") || /ps4|playstation 4/.test(n)) return "ps4";
    if (n.includes("dualshock 3") || /ps3|playstation 3/.test(n)) return "ps3";
    return "ps4";
  }
  if (n.includes("dualsense")) return "ps5";
  if (n.includes("dualshock") || n.includes("dual shock")) return "ps4";
  if (n.includes("nintendo") || n.includes("switch") || n.includes("pro controller")) return "gamecube";
  if (n.includes("wiimote") || n.includes("wii remote")) return "wiimote";
  // Generic gamepads with Xbox-style standard mapping are common; default to xbox
  // so the Xbox diagram (the most complete one) is shown.
  if (n.includes("gamepad") || n.includes("controller")) return "xbox";
  return "generic";
}

const BTN_ACTIONS: Record<number, string> = {
  0: "confirm",   // A / south
  1: "cancel",    // B / east
  2: "contextmenu", // X / west
  3: "menu",      // Y / north
  8: "commands",  // Select / View
  9: "tabnext",   // Start / Menu
  12: "up",       // D-pad up
  13: "down",      // D-pad down
  14: "left",      // D-pad left
  15: "right",     // D-pad right
};

const LONG_PRESS_DURATION = 800;

function dispatchNav(action: string) {
  if (action === "contextmenu") {
    window.dispatchEvent(
      new CustomEvent("htpc:contextmenu", { detail: { source: "gamepad" } }),
    );
    return;
  }
  if (action === "commands") {
    import("../store/commands.store").then((m) => {
      m.useCommandsStore.getState().open();
    });
    return;
  }
  if (action === "tabnext") {
    window.dispatchEvent(new CustomEvent("htpc:tab-next"));
    return;
  }
  window.dispatchEvent(new CustomEvent("htpc:nav", { detail: { action } }));
}

export function useGamepadApi(enabled: boolean, activeTab: TabId) {
  const prevStateRef = useRef<Record<string, {
    buttons: (boolean | undefined)[];
    axes: number[];
  }>>({});
  const timersRef = useRef<Record<string, number>>({});
  const cooldownRef = useRef<Record<string, number>>({});
  const longPressTimersRef = useRef<Record<number, number>>({});
  const lockedRef = useRef(true);
  const activeTabRef = useRef<TabId>(activeTab);
  activeTabRef.current = activeTab;
  /** Map from combined gamepad id (gp.id + gp.index) to deviceId */
  const registeredDevicesRef = useRef<Map<string, string>>(new Map());
  const unlockTimerRef = useRef<number | null>(null);
  const unlockIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = useInputStore.subscribe((state) => {
      lockedRef.current = state.controllersTabLocked;
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const AXIS_THRESHOLD = 0.5;
    const COOLDOWN_MS = 200;

    function getAxisAction(axisIndex: number, value: number): string | null {
      if (Math.abs(value) < AXIS_THRESHOLD) return null;
      if (axisIndex === 0) return value > 0 ? "right" : "left";
      if (axisIndex === 1) return value > 0 ? "down" : "up";
      return null;
    }

    function canDispatch(key: string): boolean {
      const now = Date.now();
      const last = cooldownRef.current[key] ?? 0;
      if (now - last < COOLDOWN_MS) return false;
      cooldownRef.current[key] = now;
      return true;
    }

    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const seen = new Set<string>();

      for (const gp of gamepads) {
        if (!gp) continue;
        const id = gp.id + gp.index;
        seen.add(id);

        // Register synthetic ControllerDevice so it appears in the Controllers tab
        if (!registeredDevicesRef.current.has(id)) {
          const deviceId = `gamepad-${gp.index}`;
          registeredDevicesRef.current.set(id, deviceId);
          const { name, vendorId, productId } = parseGamepadId(gp.id);
          const device: ControllerDevice = {
            id: deviceId,
            name: name || gp.id,
            type: detectTypeFromGamepad(gp.id, name, vendorId),
            vendorId,
            productId,
            axisCount: gp.axes.length,
            buttonCount: gp.buttons.length,
          };
          useInputStore.getState().addDevice(device);
        }

        const prev = prevStateRef.current[id] ?? { buttons: [], axes: [] };
        const nextButtons: (boolean | undefined)[] = [];
        const nextAxes: number[] = [...gp.axes];

        // Build live state for the Controllers tab readout
        const deviceId = registeredDevicesRef.current.get(id)!;
        const liveButtons: Record<string, boolean> = {};
        const liveAxes: Record<string, number> = {};
        const gamepadBtnToAction: Record<number, string> = {
          0: "south",
          1: "east",
          2: "west",
          3: "north",
          4: "left_bumper",
          5: "right_bumper",
          6: "left_trigger",
          7: "right_trigger",
          8: "select",
          9: "start",
          10: "left_thumb",
          11: "right_thumb",
          12: "dpad_up",
          13: "dpad_down",
          14: "dpad_left",
          15: "dpad_right",
          16: "home",
        };
        let liveChanged = false;
        const onControllersTab = activeTabRef.current === "controllers";
        for (let i = 0; i < gp.buttons.length; i++) {
          const pressed = gp.buttons[i]?.pressed ?? false;
          nextButtons[i] = pressed;
          const action = gamepadBtnToAction[i] ?? `btn_${i}`;
          liveButtons[action] = pressed;
          if (pressed !== (prev.buttons[i] ?? false)) {
            liveChanged = true;
            if (onControllersTab) {
              useInputStore.getState().recordRawInput(deviceId, {
                source: "gamepad",
                deviceId,
                deviceName: gp.id,
                type: pressed ? "button_press" : "button_release",
                rawCode: i,
                timestamp: Date.now(),
              });
            }
          }
        }
        for (let i = 0; i < gp.axes.length; i++) {
          let val = gp.axes[i] ?? 0;
          const axisName = i === 0 ? "left_x" : i === 1 ? "left_y" : i === 2 ? "right_x" : i === 3 ? "right_y" : `axis_${i}`;
          // Apply deadzone so stick drift near center is reported as 0
          if (!axisName.includes("trigger") && Math.abs(val) < 0.08) {
            val = 0;
          }
          nextAxes[i] = val;
          liveAxes[axisName] = val;
          if (val !== (prev.axes[i] ?? 0)) {
            liveChanged = true;
            if (onControllersTab) {
              useInputStore.getState().recordRawInput(deviceId, {
                source: "gamepad",
                deviceId,
                deviceName: gp.id,
                type: "axis",
                axis: axisName,
                value: val,
                rawCode: i,
                timestamp: Date.now(),
              });
            }
          }
        }
        if (liveChanged) {
          const existing = useInputStore.getState().liveStates[deviceId];
          useInputStore.setState({
            liveStates: {
              ...useInputStore.getState().liveStates,
              [deviceId]: {
                buttons: { ...(existing?.buttons ?? {}), ...liveButtons },
                axes: { ...(existing?.axes ?? {}), ...liveAxes },
                lastUpdated: Date.now(),
              },
            },
          });
        }

        // Controllers tab lock / unlock logic (mirrors App.tsx evdev path)
        if (onControllersTab && lockedRef.current) {
          for (let i = 0; i < gp.buttons.length; i++) {
            const pressed = gp.buttons[i]?.pressed;
            if (i === 2) {
              // west / X / Square button
              if (pressed && !prev.buttons[i]) {
                if (!unlockTimerRef.current) {
                  const startTime = Date.now();
                  unlockIntervalRef.current = window.setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / 5000, 1);
                    useInputStore.getState().setControllersTabUnlockProgress(progress);
                    if (progress >= 1) {
                      useInputStore.getState().setControllersTabLocked(false);
                      if (unlockTimerRef.current) {
                        clearTimeout(unlockTimerRef.current);
                        unlockTimerRef.current = null;
                      }
                      if (unlockIntervalRef.current) {
                        clearInterval(unlockIntervalRef.current);
                        unlockIntervalRef.current = null;
                      }
                    }
                  }, 50);
                  unlockTimerRef.current = window.setTimeout(() => {}, 5000);
                }
              } else if (!pressed && prev.buttons[i]) {
                if (unlockTimerRef.current) {
                  clearTimeout(unlockTimerRef.current);
                  unlockTimerRef.current = null;
                }
                if (unlockIntervalRef.current) {
                  clearInterval(unlockIntervalRef.current);
                  unlockIntervalRef.current = null;
                }
                useInputStore.getState().setControllersTabUnlockProgress(0);
              }
            }
          }
          // Suppress all controller navigation while locked on the Controllers tab
          continue;
        }

        for (let i = 0; i < gp.buttons.length; i++) {
          const pressed = gp.buttons[i]?.pressed;

          if (pressed && !prev.buttons[i]) {
            // Button pressed
            if (i === 4) {
              window.dispatchEvent(new CustomEvent("htpc:tab-prev"));
              continue;
            }
            if (i === 5) {
              window.dispatchEvent(new CustomEvent("htpc:tab-next"));
              continue;
            }
            if (i === 0) {
              // Confirm button: dispatch immediately and start long-press timer
              dispatchNav("confirm");
              const timer = window.setTimeout(() => {
                delete longPressTimersRef.current[i];
                window.dispatchEvent(
                  new CustomEvent("htpc:contextmenu", { detail: { source: "gamepad" } }),
                );
              }, LONG_PRESS_DURATION);
              longPressTimersRef.current[i] = timer;
              continue;
            }
            const action = BTN_ACTIONS[i];
            if (action) {
              dispatchNav(action);
            }
          } else if (!pressed && prev.buttons[i]) {
            // Button released: cancel any long-press timer
            const timer = longPressTimersRef.current[i];
            if (timer) {
              clearTimeout(timer);
              delete longPressTimersRef.current[i];
            }
          }
        }

        // Axes (left stick) + D-pad repeat via axes
        for (let i = 0; i < gp.axes.length; i++) {
          const val = gp.axes[i];
          const prevAction = getAxisAction(i, prev.axes[i] ?? 0);
          const nextAction = getAxisAction(i, val);
          const cooldownKey = `${id}:axis:${i}`;
          if (nextAction && nextAction !== prevAction && canDispatch(cooldownKey)) {
            dispatchNav(nextAction);
            const repeatKey = `${id}:repeat:${i}`;
            const repeat = () => {
              if (canDispatch(cooldownKey)) {
                dispatchNav(nextAction);
              }
              timersRef.current[repeatKey] = window.setTimeout(repeat, 180);
            };
            timersRef.current[repeatKey] = window.setTimeout(repeat, 500);
          }
          if (!nextAction && prevAction) {
            const repeatKey = `${id}:repeat:${i}`;
            const t = timersRef.current[repeatKey];
            if (t) {
              clearTimeout(t);
              delete timersRef.current[repeatKey];
            }
          }
        }

        prevStateRef.current[id] = { buttons: nextButtons, axes: nextAxes };
      }

      // Remove disconnected gamepads from the device list
      for (const [rid, deviceId] of registeredDevicesRef.current) {
        if (!seen.has(rid)) {
          registeredDevicesRef.current.delete(rid);
          useInputStore.getState().removeDevice(deviceId);
          delete prevStateRef.current[rid];
        }
      }
    };

    const interval = window.setInterval(poll, 16); // ~60fps
    return () => {
      clearInterval(interval);
      Object.values(timersRef.current).forEach(clearTimeout);
      Object.values(longPressTimersRef.current).forEach(clearTimeout);
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      if (unlockIntervalRef.current) clearInterval(unlockIntervalRef.current);
      timersRef.current = {};
      cooldownRef.current = {};
      longPressTimersRef.current = {};
      unlockTimerRef.current = null;
      unlockIntervalRef.current = null;
      // Unregister all synthetic devices on cleanup
      for (const [, deviceId] of registeredDevicesRef.current) {
        useInputStore.getState().removeDevice(deviceId);
      }
      registeredDevicesRef.current.clear();
      prevStateRef.current = {};
    };
  }, [enabled]);
}
