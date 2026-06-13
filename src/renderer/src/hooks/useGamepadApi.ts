import { useEffect, useRef } from "react";
import {
  ControllerDevice,
  ControllerType,
  TabId,
} from "../../../shared/types";
import {
  postGamepadState,
  getControllerWorker,
} from "./useControllerWorker";

/**
 * Gamepad API fallback — polls navigator.getGamepads() and forwards state
 * snapshots to the controller worker, which processes them and sends state
 * updates back to the renderer.
 *
 * Navigation, lock/unlock, and store updates are all handled by the worker
 * and the central event dispatch loop (App.tsx / useBrowserControllerNav).
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
  if (n.includes("gamepad") || n.includes("controller")) return "xbox";
  return "generic";
}

const GAMEPAD_BTN_TO_ACTION: Record<number, string> = {
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

export function useGamepadApi(enabled: boolean, _activeTab: TabId) {
  const prevStateRef = useRef<Record<string, {
    buttons: Record<string, boolean>;
    axes: number[];
  }>>({});
  /** Map from combined gamepad id (gp.id + gp.index) to deviceId */
  const registeredDevicesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!enabled) return;

    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const seen = new Set<string>();

      for (const gp of gamepads) {
        if (!gp) continue;
        const id = gp.id + gp.index;
        seen.add(id);

        // Register synthetic ControllerDevice via worker
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
          const worker = getControllerWorker();
          if (worker) {
            worker.postMessage({
              type: "connect",
              controllerIdx: 8 + gp.index, // offset gamepad API indices to avoid collision with evdev (0-7)
              deviceId,
              name: device.name,
              deviceType: device.type,
            });
          }
        }

        const deviceId = registeredDevicesRef.current.get(id)!;
        const prev = prevStateRef.current[id] ?? { buttons: {}, axes: [] };
        const nextButtons: Record<string, boolean> = {};
        const nextAxes: number[] = [];

        for (let i = 0; i < gp.buttons.length; i++) {
          const pressed = gp.buttons[i]?.pressed ?? false;
          const action = GAMEPAD_BTN_TO_ACTION[i] ?? `btn_${i}`;
          nextButtons[action] = pressed;
        }

        for (let i = 0; i < gp.axes.length; i++) {
          let val = gp.axes[i] ?? 0;
          // Apply deadzone so stick drift near center is reported as 0
          if (i < 4 && Math.abs(val) < 0.08) {
            val = 0;
          }
          nextAxes[i] = val;
        }

        // Only post to worker when state actually changes
        const buttonsChanged = Object.entries(nextButtons).some(
          ([k, v]) => prev.buttons[k] !== v,
        );
        const axesChanged = nextAxes.some((v, i) => (prev.axes[i] ?? 0) !== v);

        if (buttonsChanged || axesChanged) {
          postGamepadState(8 + gp.index, nextAxes, nextButtons);
        }

        prevStateRef.current[id] = { buttons: nextButtons, axes: nextAxes };
      }

      // Remove disconnected gamepads
      for (const [rid, deviceId] of registeredDevicesRef.current) {
        if (!seen.has(rid)) {
          registeredDevicesRef.current.delete(rid);
          delete prevStateRef.current[rid];
          const worker = getControllerWorker();
          if (worker) {
            worker.postMessage({
              type: "disconnect",
              controllerIdx: 8 + parseInt(deviceId.replace("gamepad-", ""), 10),
            });
          }
        }
      }
    };

    const interval = window.setInterval(poll, 16); // ~60fps
    return () => {
      clearInterval(interval);
      for (const [, deviceId] of registeredDevicesRef.current) {
        const worker = getControllerWorker();
        if (worker) {
          worker.postMessage({
            type: "disconnect",
            controllerIdx: 8 + parseInt(deviceId.replace("gamepad-", ""), 10),
          });
        }
      }
      registeredDevicesRef.current.clear();
      prevStateRef.current = {};
    };
  }, [enabled]);
}
