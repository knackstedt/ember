import { describe, it, expect } from "bun:test";
import { getDependencyVersions } from "../util/dependencies";

describe("getDependencyVersions", () => {
  it("returns sorted name/version pairs for dependencies", () => {
    const pkg = {
      dependencies: {
        zustand: "^4.5.4",
        framer: "^11.0.0",
        "@scope/lib": "^1.0.0",
      },
    };

    const result = getDependencyVersions(pkg);
    expect(result).toEqual([
      { name: "@scope/lib", version: "^1.0.0" },
      { name: "framer", version: "^11.0.0" },
      { name: "zustand", version: "^4.5.4" },
    ]);
  });

  it("returns an empty array when dependencies are missing", () => {
    expect(getDependencyVersions({})).toEqual([]);
    expect(getDependencyVersions({ version: "1.0.0" })).toEqual([]);
  });
});
