import { describe, it, expect } from "bun:test";

// Re-create the private helper for testing
function escapeId(id: string): string {
  if (!/^[a-zA-Z0-9_\-:.]+$/.test(id)) {
    throw new Error(`Invalid record ID: ${id}`);
  }
  return id;
}

describe("escapeId", () => {
  it("allows valid record IDs", () => {
    expect(escapeId("steam_123")).toBe("steam_123");
    expect(escapeId("game:abc")).toBe("game:abc");
    expect(escapeId("my-id_2.0")).toBe("my-id_2.0");
  });

  it("rejects IDs with angle brackets", () => {
    expect(() => escapeId("game<123>")).toThrow("Invalid record ID");
  });

  it("rejects IDs with backticks", () => {
    expect(() => escapeId("game`123`")).toThrow("Invalid record ID");
  });

  it("rejects IDs with spaces", () => {
    expect(() => escapeId("game 123")).toThrow("Invalid record ID");
  });

  it("rejects empty IDs", () => {
    expect(() => escapeId("")).toThrow("Invalid record ID");
  });
});
