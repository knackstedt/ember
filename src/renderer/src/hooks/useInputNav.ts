import { useEffect } from "react";
import { useInputStore } from "../store/input.store";
import { NormalizedInputEvent } from "../../../shared/types";
import { subscribeControllerEvents } from "./useControllerWorker";

type NavAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "cancel"
  | "menu";

const ACTION_MAP: Record<string, NavAction> = {
  south: "confirm",
  east: "cancel",
  start: "menu",
  dpad_up: "up",
  dpad_down: "down",
  dpad_left: "left",
  dpad_right: "right",
  up: "up",
  down: "down",
  left: "left",
  right: "right",
  enter: "confirm",
  escape: "cancel",
};

export function useInputNav(
  handler: (action: NavAction, event: NormalizedInputEvent) => void,
): void {
  useEffect(() => {
    const unsub = subscribeControllerEvents((ev) => {
      useInputStore.getState().setLastEvent(ev);

      if (ev.type !== "button_press" && ev.type !== "key_down") return;
      const action = ev.action ? ACTION_MAP[ev.action] : undefined;
      if (action) handler(action, ev);
    });
    return () => { unsub(); };
  }, [handler]);
}
