import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins class names with spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("resolves conflicting tailwind utilities in favor of the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("ignores falsy values", () => {
    expect(cn("a", null, undefined, false, "b")).toBe("a b");
  });
});
