import { describe, expect, test } from "vitest";

import { isProfileComplete } from "./complete-profile";

const COMPLETE = {
  hasPhoto: true,
  hasBio: true,
  hasCredentials: true,
  hasSpecialties: true,
  hasPricedService: true,
  hasCalendar: true,
};

describe("isProfileComplete", () => {
  test("is true only when every Proof fact is true", () => {
    expect(isProfileComplete(COMPLETE)).toBe(true);
  });

  test.each([
    "hasPhoto",
    "hasBio",
    "hasCredentials",
    "hasSpecialties",
    "hasPricedService",
    "hasCalendar",
  ] as const)("is false when %s is missing", (flag) => {
    expect(isProfileComplete({ ...COMPLETE, [flag]: false })).toBe(false);
  });
});
