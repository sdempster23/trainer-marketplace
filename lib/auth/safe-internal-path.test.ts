import { describe, expect, test } from "vitest";

import { hrefWithNext, safeInternalPath } from "./safe-internal-path";

describe("safeInternalPath", () => {
  test("accepts a same-origin path", () => {
    expect(safeInternalPath("/trainers/abc")).toBe("/trainers/abc");
  });

  test.each([
    ["absent", null],
    ["empty", ""],
    ["absolute URL", "https://evil.example/x"],
    ["protocol-relative", "//evil.example/x"],
    ["backslash trick", "/\\evil.example"],
    ["no leading slash", "trainers/abc"],
  ])("rejects %s", (_label, value) => {
    expect(safeInternalPath(value)).toBeNull();
  });
});

describe("hrefWithNext", () => {
  test("appends an encoded next for a valid destination", () => {
    expect(hrefWithNext("/sign-up", "/trainers/abc?x=1")).toBe(
      "/sign-up?next=%2Ftrainers%2Fabc%3Fx%3D1",
    );
  });

  test.each([
    ["absent", undefined],
    ["null", null],
    ["empty", ""],
    ["open redirect", "https://evil.example"],
    ["protocol-relative", "//evil.example"],
  ])("returns the bare href for %s", (_label, value) => {
    expect(hrefWithNext("/sign-up", value)).toBe("/sign-up");
  });
});
