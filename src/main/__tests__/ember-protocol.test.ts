import { describe, expect, it } from "bun:test";
import { resolveEmberLocalPath } from "../util/ember-protocol";

const ctx = { userData: "/home/u/.config/ember", home: "/home/u" };

describe("resolveEmberLocalPath", () => {
  it("denies media URLs without the //<abs> form (relative after slice)", () => {
    // ember://media/roms/game.nes → pathname "/roms/..." → slice(1) is
    // relative, which must be rejected rather than resolved against cwd.
    const r = resolveEmberLocalPath(
      { hostname: "media", pathname: "/roms/game.nes" },
      ctx,
    );
    expect(r.scope).toBe("denied");
    expect(r.status).toBe(400);
  });

  it("handles double-slash media URLs", () => {
    const r = resolveEmberLocalPath(
      { hostname: "media", pathname: "//roms/game.nes" },
      ctx,
    );
    // "//roms" decodes to "/roms" after slice(1)
    expect(r.scope).toBe("media");
    expect(r.filePath).toBe("/roms/game.nes");
  });

  it("denies media requests that decode to a relative path", () => {
    const r = resolveEmberLocalPath(
      { hostname: "media", pathname: "not-absolute" },
      ctx,
    );
    expect(r.scope).toBe("denied");
    expect(r.status).toBe(400);
  });

  it("roots covers/thumbnails inside userData", () => {
    const r = resolveEmberLocalPath(
      { hostname: "covers", pathname: "/games/abc.jpg" },
      ctx,
    );
    expect(r.scope).toBe("userdata");
    expect(r.filePath).toBe("/home/u/.config/ember/covers/games/abc.jpg");
  });

  it("denies traversal outside userData", () => {
    const r = resolveEmberLocalPath(
      { hostname: "thumbnails", pathname: "/../../etc/passwd" },
      ctx,
    );
    expect(r.scope).toBe("denied");
    expect(r.status).toBe(403);
  });

  it("denies percent-encoded traversal outside userData", () => {
    const r = resolveEmberLocalPath(
      { hostname: "covers", pathname: "/%2e%2e/%2e%2e/etc/passwd" },
      ctx,
    );
    expect(r.scope).toBe("denied");
  });

  it("roots plugin assets inside the plugin's assets dir", () => {
    const r = resolveEmberLocalPath(
      { hostname: "plugin", pathname: "/myplugin/lib/ruffle.js" },
      ctx,
    );
    expect(r.scope).toBe("plugin");
    expect(r.pluginId).toBe("myplugin");
    expect(r.filePath).toBe(
      "/home/u/.config/htpc/plugins/myplugin/assets/lib/ruffle.js",
    );
  });

  it("denies plugin asset traversal", () => {
    const r = resolveEmberLocalPath(
      { hostname: "plugin", pathname: "/myplugin/../../secrets.txt" },
      ctx,
    );
    expect(r.scope).toBe("denied");
  });

  it("denies malformed percent-encoding", () => {
    const r = resolveEmberLocalPath(
      { hostname: "plugin", pathname: "/myplugin/%zz" },
      ctx,
    );
    expect(r.scope).toBe("denied");
  });
});
