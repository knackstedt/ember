import { create } from "zustand";

export interface OskSession {
  deviceId: string;
  /** For main renderer inputs: the actual element. For webviews: the webview tag. */
  targetElement: HTMLElement;
  value: string;
  inputType: string;
  label?: string;
  /** True when the input is inside a webview (not a real DOM element) */
  isWebview?: boolean;
}

interface ControllerOskState {
  sessions: Record<string, OskSession>;
  open: (
    deviceId: string,
    element: HTMLElement,
    initialValue: string,
    inputType: string,
    label?: string,
    isWebview?: boolean,
  ) => void;
  close: (deviceId: string) => void;
  closeAll: () => void;
  updateValue: (deviceId: string, value: string) => void;
  getSession: (deviceId: string) => OskSession | undefined;
  isOpen: (deviceId: string) => boolean;
  /** Whether any controller currently has an OSK open */
  hasAnyOpen: () => boolean;
}

export const useControllerOskStore = create<ControllerOskState>((set, get) => ({
  sessions: {},

  open: (deviceId, element, initialValue, inputType, label, isWebview) =>
    set((s) => ({
      sessions: {
        ...s.sessions,
        [deviceId]: {
          deviceId,
          targetElement: element,
          value: initialValue,
          inputType,
          label,
          isWebview,
        },
      },
    })),

  close: (deviceId) =>
    set((s) => {
      const { [deviceId]: _, ...rest } = s.sessions;
      return { sessions: rest };
    }),

  closeAll: () => set({ sessions: {} }),

  updateValue: (deviceId, value) =>
    set((s) => {
      const session = s.sessions[deviceId];
      if (!session) return {};
      return {
        sessions: {
          ...s.sessions,
          [deviceId]: { ...session, value },
        },
      };
    }),

  getSession: (deviceId) => get().sessions[deviceId],

  isOpen: (deviceId) => !!get().sessions[deviceId],

  hasAnyOpen: () => Object.keys(get().sessions).length > 0,
}));

/** Find an input-like element at or above the given element */
export function findInputElement(el: Element | null): HTMLElement | null {
  while (el) {
    if (el instanceof HTMLInputElement) {
      const type = el.type;
      if (
        type === "text" ||
        type === "number" ||
        type === "password" ||
        type === "email" ||
        type === "url" ||
        type === "search" ||
        type === "tel"
      ) {
        return el;
      }
    }
    if (el instanceof HTMLTextAreaElement) return el;
    if ((el as HTMLElement).isContentEditable) return el as HTMLElement;
    el = el.parentElement;
  }
  return null;
}

/** Update the DOM element's value and fire input events.
 *  Uses native value setter to work with React controlled inputs. */
export function updateInputElementValue(el: HTMLElement, value: string): void {
  if (el instanceof HTMLInputElement) {
    // Use native setter so React's value tracker sees the change
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el instanceof HTMLTextAreaElement) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/** Return a display string for the given value and input type */
export function maskValue(value: string, inputType: string): string {
  if (inputType === "password") {
    return "\u2022".repeat(value.length) || "_";
  }
  return value || "_";
}
