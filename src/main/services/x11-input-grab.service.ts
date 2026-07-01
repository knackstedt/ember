import { BrowserWindow, WebContents } from "electron";
import { createLogger } from "../util/logger";
import { getSettings } from "./settings.service";

const log = createLogger("info");

type X11Client = any;
type X11Display = any;

let x11Module: any = null;
let x11Client: X11Client | null = null;
let x11Display: X11Display | null = null;
let grabWindow: number | null = null;
let overlayWindow: BrowserWindow | null = null;
let keyCodeByKeycode: Map<number, string> = new Map();
let eventHandler: ((ev: any) => void) | null = null;
let toggleOverlayCallback: (() => void) | null = null;

const SHIFT_MOD = 1;
const LOCK_MOD = 2;
const CONTROL_MOD = 4;
const MOD1_MOD = 8;
const MOD4_MOD = 64;

const XK_NAME_OVERRIDES: Record<string, string> = {
  space: "Space",
  Escape: "Escape",
  Tab: "Tab",
  Return: "Enter",
  Enter: "Enter",
  BackSpace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  Page_Up: "PageUp",
  Page_Down: "PageDown",
  Left: "Left",
  Up: "Up",
  Right: "Right",
  Down: "Down",
  Shift_L: "Shift",
  Shift_R: "Shift",
  Control_L: "Control",
  Control_R: "Control",
  Alt_L: "Alt",
  Alt_R: "Alt",
  Meta_L: "Meta",
  Meta_R: "Meta",
  Super_L: "Meta",
  Super_R: "Meta",
  Caps_Lock: "CapsLock",
  Num_Lock: "NumLock",
  Scroll_Lock: "ScrollLock",
  Print: "PrintScreen",
  Pause: "Pause",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
};

export function setToggleOverlayCallback(cb: () => void): void {
  toggleOverlayCallback = cb;
}

async function loadX11Module(): Promise<any> {
  if (x11Module) return x11Module;
  try {
    const ns = await import("x11");
    x11Module = ns.default ?? ns;
    return x11Module;
  } catch (err) {
    log.warn("x11-grab", `failed to load x11 module: ${err}`);
    return null;
  }
}

async function getX11Client(): Promise<{ client: X11Client; display: X11Display } | null> {
  if (x11Client && x11Display) {
    return { client: x11Client, display: x11Display };
  }
  const x11 = await loadX11Module();
  if (!x11) return null;
  return new Promise((resolve, reject) => {
    x11.createClient((err: any, display: X11Display) => {
      if (err) {
        reject(err);
        return;
      }
      x11Client = display.client;
      x11Display = display;
      x11Client.on("error", (err: any) => {
        log.debug("x11-grab", `x11 client error: ${err?.message ?? err}`);
      });
      resolve({ client: x11Client, display });
    });
  });
}

function keysymNameToKeyCode(name: string): string | null {
  if (name.startsWith("XK_")) {
    name = name.slice(3);
  }
  const override = XK_NAME_OVERRIDES[name];
  if (override) return override;
  if (name.length === 1) return name;
  // lowercase single letters, e.g. "a" -> "a", "A" -> "A"
  return null;
}

async function loadKeyboardMapping(client: X11Client, display: X11Display): Promise<void> {
  const x11 = await loadX11Module();
  const min = display.min_keycode ?? 8;
  const max = display.max_keycode ?? 255;
  const count = max - min + 1;
  if (!x11?.keySyms) {
    log.warn("x11-grab", "x11.keySyms not available; keyboard mapping disabled");
    return;
  }
  const nameByKeysym: Map<number, string> = new Map();
  for (const [name, value] of Object.entries(x11.keySyms)) {
    if (value && typeof value === "object" && "code" in value && typeof value.code === "number") {
      nameByKeysym.set(value.code, name);
    }
  }
  return new Promise((resolve, reject) => {
    client.GetKeyboardMapping(min, count, (err: any, result: any) => {
      if (err) {
        reject(err);
        return;
      }
      let keysyms: number[] = [];
      let perKeycode = 1;
      if (Array.isArray(result)) {
        keysyms = result;
        perKeycode = Math.max(1, Math.floor(keysyms.length / count));
      } else if (result && typeof result === "object") {
        keysyms = result.keysyms ?? result.list ?? [];
        perKeycode = result.keysyms_per_keycode ?? Math.max(1, Math.floor(keysyms.length / count));
      }
      keyCodeByKeycode.clear();
      for (let i = 0; i < count; i++) {
        const keycode = min + i;
        const offset = i * perKeycode;
        for (let j = 0; j < perKeycode; j++) {
          const keysym = keysyms[offset + j];
          if (!keysym || keysym === 0) continue;
          const name = nameByKeysym.get(keysym);
          if (name) {
            const keyCode = keysymNameToKeyCode(name);
            if (keyCode) {
              keyCodeByKeycode.set(keycode, keyCode);
              break;
            }
          }
        }
      }
      resolve();
    });
  });
}

function stateToModifiers(state: number): string[] {
  const modifiers: string[] = [];
  if (state & SHIFT_MOD) modifiers.push("Shift");
  if (state & LOCK_MOD) modifiers.push("CapsLock");
  if (state & CONTROL_MOD) modifiers.push("Control");
  if (state & MOD1_MOD) modifiers.push("Alt");
  if (state & MOD4_MOD) modifiers.push("Meta");
  return modifiers;
}

async function resolveOverlayShortcut(): Promise<string | null> {
  try {
    const settings = await getSettings();
    return settings.commandKeybinds?.["gaming.overlay"] ?? "F1";
  } catch (err) {
    log.warn("x11-grab", `failed to read overlay shortcut: ${err}`);
    return "F1";
  }
}

function shortcutMatches(shortcut: string, keyCode: string, modifiers: string[]): boolean {
  const parts = shortcut.split(/\s*\+\s*/).map((p) => p.trim());
  const keyPart = parts.pop() ?? "";
  const expected = new Set(
    parts.map((m) => {
      const lower = m.toLowerCase();
      if (lower === "ctrl" || lower === "control") return "Control";
      if (lower === "alt") return "Alt";
      if (lower === "shift") return "Shift";
      if (lower === "meta" || lower === "super" || lower === "command") return "Meta";
      return m;
    }),
  );
  const actual = new Set(modifiers.filter((m) => m !== "CapsLock"));
  if (keyPart.toLowerCase() !== keyCode.toLowerCase()) return false;
  if (expected.size !== actual.size) return false;
  for (const m of expected) {
    if (!actual.has(m)) return false;
  }
  return true;
}

function forwardKeyEvent(webContents: WebContents, type: "keyDown" | "keyUp", keyCode: string, modifiers: string[]): void {
  try {
    const lowerMods = modifiers.map((m) => m.toLowerCase()) as ("shift" | "control" | "alt" | "meta" | "cmd" | "isAutoRepeat" | "leftButtonDown" | "middleButtonDown" | "rightButtonDown" | "capsLock" | "numLock")[];
    webContents.sendInputEvent({ type, keyCode, modifiers: lowerMods });
  } catch (err) {
    log.warn("x11-grab", `failed to forward key event: ${err}`);
  }
}

function getX11WindowId(win: BrowserWindow): number | null {
  try {
    const handle = win.getNativeWindowHandle();
    if (!handle || handle.length < 4) return null;
    return handle.readUInt32LE(0);
  } catch (err) {
    log.warn("x11-grab", `failed to read native window handle: ${err}`);
    return null;
  }
}

export async function grabOverlayInputs(win: BrowserWindow): Promise<boolean> {
  if (process.platform !== "linux") return false;
  const x11 = await getX11Client();
  if (!x11) return false;
  const { client, display } = x11;
  const wid = getX11WindowId(win);
  if (!wid) {
    log.warn("x11-grab", "could not determine overlay X11 window id");
    return false;
  }
  try {
    await loadKeyboardMapping(client, display);
  } catch (err) {
    log.warn("x11-grab", `failed to load keyboard mapping: ${err}`);
  }
  try {
    client.GrabKeyboard(wid, false, 1, 1, 0);
  } catch (err) {
    log.warn("x11-grab", `failed to grab keyboard: ${err}`);
  }
  try {
    client.SetInputFocus(0, wid, 0);
    log.info("x11-grab", `set input focus to overlay window ${wid}`);
  } catch (err) {
    log.warn("x11-grab", `failed to set input focus: ${err}`);
  }
  grabWindow = wid;
  overlayWindow = win;
  eventHandler = async (ev: any) => {
    try {
      if (!overlayWindow || overlayWindow.isDestroyed() || overlayWindow.webContents.isDestroyed()) return;
      if (ev.name !== "KeyPress" && ev.name !== "KeyRelease") return;
      const keycode = ev.keycode;
      const keyCode = keyCodeByKeycode.get(keycode);
      if (!keyCode) {
        log.debug("x11-grab", `unmapped keycode ${keycode}`);
        return;
      }
      const type = ev.name === "KeyPress" ? "keyDown" : "keyUp";
      const modifiers = stateToModifiers(ev.state ?? 0);
      const shortcut = await resolveOverlayShortcut();
      if (shortcut && shortcutMatches(shortcut, keyCode, modifiers) && type === "keyDown") {
        toggleOverlayCallback?.();
        return;
      }
      forwardKeyEvent(overlayWindow.webContents, type, keyCode, modifiers);
    } catch (err) {
      log.warn("x11-grab", `event handler error: ${err}`);
    }
  };
  client.on("event", eventHandler);
  log.info("x11-grab", `grabbed keyboard for overlay window ${wid}`);
  return true;
}

export async function getWindowGeometryX11(wid: number): Promise<Electron.Rectangle | null> {
  if (process.platform !== "linux") return null;
  const x11 = await getX11Client();
  if (!x11) return null;
  const { client, display } = x11;
  const root = display.screen[0].root;
  return new Promise((resolve) => {
    let settled = false;
    const done = (val: Electron.Rectangle | null) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    try {
      client.TranslateCoordinates(wid, root, 0, 0, (err: any, trans: any) => {
        if (err || !trans) {
          done(null);
          return true;
        }
        try {
          client.GetGeometry(wid, (err2: any, geo: any) => {
            if (err2 || !geo) {
              done(null);
              return true;
            }
            done({
              x: trans.destX,
              y: trans.destY,
              width: geo.width,
              height: geo.height,
            });
            return true;
          });
        } catch {
          done(null);
        }
        return true;
      });
    } catch {
      done(null);
    }
  });
}

export async function isWindowFocusedX11(wid: number): Promise<boolean> {
  if (process.platform !== "linux") return false;
  const x11 = await getX11Client();
  if (!x11) return false;
  const { client } = x11;
  return new Promise((resolve) => {
    let settled = false;
    const done = (val: boolean) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    try {
      client.GetInputFocus((err: any, resp: any) => {
        if (err || !resp) {
          done(false);
          return true;
        }
        const focusWid = resp.focus ?? resp.window ?? resp;
        done(focusWid === wid);
        return true;
      });
    } catch {
      done(false);
    }
  });
}

export async function refocusWindowX11(wid: number): Promise<boolean> {
  if (process.platform !== "linux") return false;
  const x11 = await getX11Client();
  if (!x11) return false;
  const { client } = x11;
  try {
    client.SetInputFocus(0, wid, 0);
    return true;
  } catch (err) {
    log.warn("x11-grab", `failed to refocus window ${wid}: ${err}`);
    return false;
  }
}

export async function ungrabOverlayInputs(): Promise<void> {
  if (process.platform !== "linux") return;
  if (x11Client && grabWindow !== null) {
    try {
      x11Client.UngrabKeyboard(0);
    } catch (err) {
      log.warn("x11-grab", `failed to ungrab keyboard: ${err}`);
    }
    if (eventHandler) {
      x11Client.off("event", eventHandler);
      eventHandler = null;
    }
  }
  grabWindow = null;
  overlayWindow = null;
  log.info("x11-grab", "ungrabbed keyboard");
}
