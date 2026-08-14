import { describe, expect, test } from "vitest";

import { formatBirthDate, formatPlainDate } from "@/lib/utils/format-date";

/**
 * Plain calendar dates (DATE columns: availability exceptions, dog DOB)
 * are zone-naive by design — formatting must be UTC-anchored so
 * "2026-08-20" never renders as Aug 19 in a western timezone.
 */

describe("formatPlainDate", () => {
  test("renders weekday, month, day, year", () => {
    expect(formatPlainDate("2026-08-20")).toBe("Thu, Aug 20, 2026");
  });

  test("is not shifted by the local timezone (UTC-anchored)", () => {
    // Jan 1 is the worst case for a negative-offset shift.
    expect(formatPlainDate("2026-01-01")).toBe("Thu, Jan 1, 2026");
  });

  test("falls back to the raw string on invalid input (never throws in render)", () => {
    expect(formatPlainDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatBirthDate", () => {
  test("renders month, day, year without weekday", () => {
    expect(formatBirthDate("2021-04-15")).toBe("Apr 15, 2021");
  });

  test("falls back to the raw string on invalid input", () => {
    expect(formatBirthDate("")).toBe("");
  });
});
