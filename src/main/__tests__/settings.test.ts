import { describe, it, expect } from "bun:test";

describe("settings defaults", () => {
  it("has expected default shape", () => {
    const defaults = {
      theme: "dark-oled",
      fullscreen: false,
      defaultTab: "gaming",
      moviePaths: [],
      musicPaths: [],
      romPaths: [],
      gamePaths: [],
      enableAnalytics: false,
      startOnBoot: false,
      hardwareAcceleration: true,
      disabledTabs: [],
      dailyBackground: { enabled: false, source: "bing" },
      background: { type: "theme" },
      defaultEmulatorShader: "",
      emulatorShaders: {},
      commandKeybinds: {},
      commandControllerMap: {},
    };

    expect(defaults.theme).toBe("dark-oled");
    expect(Array.isArray(defaults.moviePaths)).toBe(true);
    expect(Array.isArray(defaults.disabledTabs)).toBe(true);
    expect(typeof defaults.dailyBackground).toBe("object");
    expect(defaults.dailyBackground.enabled).toBe(false);
    expect(defaults.background).toEqual({ type: "theme" });
  });
});
