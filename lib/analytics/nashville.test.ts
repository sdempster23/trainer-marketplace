import { describe, expect, test } from "vitest";

import { isNashvilleBeachhead } from "./nashville";

describe("isNashvilleBeachhead", () => {
  test("37203 (downtown, the directory placeholder) is in", () => {
    expect(isNashvilleBeachhead("37203")).toBe(true);
  });

  test("37221 (USPS Nashville) is in even on the west side", () => {
    expect(isNashvilleBeachhead("37221")).toBe(true);
  });

  test("Brentwood / Franklin / Madison / Clarksville are out of the beachhead", () => {
    expect(isNashvilleBeachhead("37027")).toBe(false);
    expect(isNashvilleBeachhead("37064")).toBe(false);
    expect(isNashvilleBeachhead("37115")).toBe(false);
    expect(isNashvilleBeachhead("37040")).toBe(false);
  });

  test("out-of-market and junk ZIPs are false", () => {
    expect(isNashvilleBeachhead("10001")).toBe(false);
    expect(isNashvilleBeachhead("3720")).toBe(false);
    expect(isNashvilleBeachhead("abcde")).toBe(false);
    expect(isNashvilleBeachhead("")).toBe(false);
  });
});
