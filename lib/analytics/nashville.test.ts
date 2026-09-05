import { describe, expect, test } from "vitest";

import { isNashvilleBeachhead } from "./nashville";

describe("isNashvilleBeachhead", () => {
  test("37203 (downtown, the directory placeholder) is in", () => {
    expect(isNashvilleBeachhead("37203")).toBe(true);
  });

  test("37221 (USPS Nashville) is in even on the west side", () => {
    expect(isNashvilleBeachhead("37221")).toBe(true);
  });

  test("Greater Nashville suburbs within ~50mi of downtown are in", () => {
    expect(isNashvilleBeachhead("37027")).toBe(true); // Brentwood (~11 mi)
    expect(isNashvilleBeachhead("37064")).toBe(true); // Franklin (~17 mi)
    expect(isNashvilleBeachhead("37129")).toBe(true); // Murfreesboro (~29 mi)
    expect(isNashvilleBeachhead("37130")).toBe(true); // Murfreesboro (~31 mi)
    expect(isNashvilleBeachhead("37075")).toBe(true); // Hendersonville (~14 mi)
  });

  test("Clarksville is out (separate MSA; not Greater Nashville)", () => {
    expect(isNashvilleBeachhead("37040")).toBe(false);
  });

  test("out-of-market and junk ZIPs are false", () => {
    expect(isNashvilleBeachhead("10001")).toBe(false);
    expect(isNashvilleBeachhead("3720")).toBe(false);
    expect(isNashvilleBeachhead("abcde")).toBe(false);
    expect(isNashvilleBeachhead("")).toBe(false);
  });
});
