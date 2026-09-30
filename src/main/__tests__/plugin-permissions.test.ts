import { describe, it, expect } from "bun:test";
import { permissionFor, makeRequireShim } from "../plugins/plugin.worker";

const manifest = { id: "test-plugin", entryPoint: "index.js" };

describe("permissionFor", () => {
  it("maps fs variants to filesystem", () => {
    expect(permissionFor("fs")).toBe("filesystem");
    expect(permissionFor("fs/promises")).toBe("filesystem");
    expect(permissionFor("node:fs")).toBe("filesystem");
  });

  it("maps network modules", () => {
    expect(permissionFor("net")).toBe("network");
    expect(permissionFor("node:https")).toBe("network");
  });

  it("maps subprocess modules", () => {
    expect(permissionFor("child_process")).toBe("subprocess");
    expect(permissionFor("worker_threads")).toBe("subprocess");
  });

  it("maps system modules", () => {
    expect(permissionFor("os")).toBe("system");
    expect(permissionFor("node:process")).toBe("system");
  });

  it("returns null for always-allowed and unknown modules", () => {
    expect(permissionFor("path")).toBeNull();
    expect(permissionFor("lodash")).toBeNull();
  });
});

describe("makeRequireShim", () => {
  it("denies electron unconditionally", () => {
    const req = makeRequireShim({ ...manifest, permissions: ["filesystem", "network", "subprocess", "system"] });
    expect(() => req("electron")).toThrow(/not available/);
  });

  it("allows always-whitelisted modules without permissions", () => {
    const req = makeRequireShim(manifest);
    expect(req("path")).toBe(require("path"));
    expect(req("node:crypto")).toBe(require("crypto"));
  });

  it("denies fs without the filesystem permission", () => {
    const req = makeRequireShim(manifest);
    expect(() => req("fs")).toThrow(/permission 'filesystem'/);
    expect(() => req("node:fs/promises")).toThrow(/permission 'filesystem'/);
  });

  it("allows fs with the filesystem permission", () => {
    const req = makeRequireShim({ ...manifest, permissions: ["filesystem"] });
    expect(req("fs")).toBe(require("fs"));
  });

  it("denies child_process without subprocess permission", () => {
    const req = makeRequireShim(manifest);
    expect(() => req("child_process")).toThrow(/subprocess/);
  });

  it("denies unknown/non-builtin modules", () => {
    const req = makeRequireShim(manifest);
    expect(() => req("express")).toThrow(/not allowed/);
  });
});
