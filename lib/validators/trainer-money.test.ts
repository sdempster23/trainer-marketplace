import { describe, expect, test } from "vitest";

import { centsToDollarsInput, formatPrice, serviceSchema } from "@/lib/validators/trainer";

const SERVICE = {
  name: "Private training",
  description: "",
  priceDollars: "62.50",
  durationMinutes: 60,
  sessionType: "in_home",
};

describe("service money", () => {
  test.each(["USD", "CAD", "GBP"] as const)("states %s explicitly without converting the price", (currency) => {
    expect(formatPrice(6250, currency).replace(/\s/g, " ")).toBe(`${currency} 62.50`);
    expect(formatPrice(8500, currency).replace(/\s/g, " ")).toBe(`${currency} 85`);
  });

  test.each(["0.01", "1.09", "62.50", "1000000"])("round trips %s exactly through minor units and the edit field", (amount) => {
    const parsed = serviceSchema.parse({ ...SERVICE, priceDollars: amount });
    const savedAgain = serviceSchema.parse({ ...SERVICE, priceDollars: centsToDollarsInput(parsed.priceDollars) });
    expect(savedAgain.priceDollars).toBe(parsed.priceDollars);
    expect(Number.isInteger(parsed.priceDollars)).toBe(true);
  });

  test.each(["-1", "0", "1.001", "1e3", "NaN", "1000000.01"])("rejects invalid price %s", (amount) => {
    expect(serviceSchema.safeParse({ ...SERVICE, priceDollars: amount }).success).toBe(false);
  });

  test("the upper-limit message applies to every supported currency", () => {
    const parsed = serviceSchema.safeParse({ ...SERVICE, priceDollars: "1000000.01" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).not.toContain("$");
    }
  });
});
