import { useEffect, useRef } from "react";

/**
 * Fallback gamepad input using the browser Gamepad API.
 * Polls navigator.getGamepads() and dispatches htpc:nav / htpc:contextmenu
 * events so controllers work even when the evdev path lacks permissions.
 */

const BTN_ACTIONS: Record<number, string> = {
  0: "confirm",   // A / south
  1: "cancel",    // B / east
  2: "contextmenu", // X / west
  12: "up",      // D-pad up
  13: "down",     // D-pad down
  14: "left",     // D-pad left
  15: "right",    // D-pad right
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
  window.dispatchEvent(new CustomEvent("htpc:nav", { detail: { action } }));
}

export function useGamepadApi(enabled: boolean) {
  const prevStateRef = useRef<Record<string, {
    buttons: (boolean | undefined)[];
    axes: number[];
  }>>({});
  const timersRef = useRef<Record<string, number>>({});
  const cooldownRef = useRef<Record<string, number>>({});
  const longPressTimersRef = useRef<Record<number, number>>({});

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
      for (const gp of gamepads) {
        if (!gp) continue;
        const id = gp.id + gp.index;
        const prev = prevStateRef.current[id] ?? { buttons: [], axes: [] };
        const nextButtons: (boolean | undefined)[] = [];
        const nextAxes: number[] = [...gp.axes];

        for (let i = 0; i < gp.buttons.length; i++) {
          const pressed = gp.buttons[i]?.pressed;
          nextButtons[i] = pressed;

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
    };

    const interval = window.setInterval(poll, 16); // ~60fps
    return () => {
      clearInterval(interval);
      Object.values(timersRef.current).forEach(clearTimeout);
      Object.values(longPressTimersRef.current).forEach(clearTimeout);
      timersRef.current = {};
      cooldownRef.current = {};
      longPressTimersRef.current = {};
    };
  }, [enabled]);
}
