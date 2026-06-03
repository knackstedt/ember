import { describe, it, expect } from "bun:test";

// Re-create the private helper for testing
function parseCommand(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  let justClosedQuote = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (!inQuotes && (ch === '"' || ch === "'")) {
      inQuotes = true;
      quoteChar = ch;
      justClosedQuote = false;
    } else if (inQuotes && ch === quoteChar) {
      inQuotes = false;
      quoteChar = "";
      justClosedQuote = true;
    } else if (!inQuotes && /\s/.test(ch)) {
      if (current.length > 0 || justClosedQuote) {
        args.push(current);
        current = "";
        justClosedQuote = false;
      }
    } else {
      current += ch;
      justClosedQuote = false;
    }
  }
  if (current.length > 0 || justClosedQuote) args.push(current);
  return args;
}

describe("parseCommand", () => {
  it("splits simple space-separated arguments", () => {
    expect(parseCommand("foo bar baz")).toEqual(["foo", "bar", "baz"]);
  });

  it("respects double-quoted arguments with spaces", () => {
    expect(parseCommand('foo "bar baz" qux')).toEqual(["foo", "bar baz", "qux"]);
  });

  it("respects single-quoted arguments with spaces", () => {
    expect(parseCommand("foo 'bar baz' qux")).toEqual(["foo", "bar baz", "qux"]);
  });

  it("handles paths with spaces", () => {
    expect(parseCommand('"/home/user/My Games/game.exe" --fullscreen')).toEqual([
      "/home/user/My Games/game.exe",
      "--fullscreen",
    ]);
  });

  it("handles empty quotes", () => {
    expect(parseCommand('foo "" bar')).toEqual(["foo", "", "bar"]);
  });

  it("returns a single element for a bare command", () => {
    expect(parseCommand("steam")).toEqual(["steam"]);
  });
});
