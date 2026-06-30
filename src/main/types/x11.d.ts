declare module "x11" {
  export interface X11Display {
    client: X11Client;
    min_keycode?: number;
    max_keycode?: number;
    screen: unknown;
  }

  export interface X11Client {
    on(event: string, listener: (err: any) => void): void;
    GetKeyboardMapping(min: number, count: number, callback: (err: any, result: any) => void): void;
    GrabKey(
      keycode: number,
      modifiers: number,
      windowId: number,
      ownerEvents: boolean,
      pointerMode: number,
      keyboardMode: number,
    ): void;
    UngrabKey(keycode: number, modifiers: number, windowId: number): void;
    intToFloatAtoms: Record<string, number>;
  }

  export interface X11Namespace {
    createClient(callback: (err: any, display: X11Display) => void): void;
    keySyms?: Record<string, { code?: number }>;
    // Event masks
    eventMask: {
      KeyPress: number;
      KeyRelease: number;
    };
    // Key grab modes
    grabMode: {
      Async: number;
      Sync: number;
    };
    // Modifier masks
    keyButMask: {
      Shift: number;
      Control: number;
      Mod1: number;
      Mod2: number;
      Mod3: number;
      Mod4: number;
      Mod5: number;
    };
  }

  const x11: X11Namespace;
  export default x11;
}
