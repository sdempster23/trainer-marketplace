import { describe, expect, test } from "vitest";

import { paymentInfoSchema, paymentLinks } from "./payment";

describe("paymentInfoSchema", () => {
  test("accepts plain handles + instructions, empties → undefined", () => {
    const r = paymentInfoSchema.safeParse({
      instructions: "Venmo or cash at the session",
      venmo: "casey-trains",
      paypal: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.venmo).toBe("casey-trains");
      expect(r.data.paypal).toBeUndefined();
    }
  });

  test("rejects a handle that is actually a URL or has bad chars", () => {
    for (const bad of [
      "https://venmo.com/casey",
      "casey trains",
      "casey@venmo",
      "a".repeat(31),
      "javascript:alert(1)",
    ]) {
      expect(paymentInfoSchema.safeParse({ venmo: bad }).success, bad).toBe(
        false,
      );
    }
  });

  test("rejects over-length instructions", () => {
    expect(
      paymentInfoSchema.safeParse({ instructions: "x".repeat(281) }).success,
    ).toBe(false);
  });
});

describe("paymentLinks — app-built hrefs from a fixed host", () => {
  test("builds venmo + paypal urls from handles", () => {
    expect(
      paymentLinks({ venmo_handle: "casey-trains", paypal_handle: "caseyt" }),
    ).toEqual({
      venmo: "https://venmo.com/u/casey-trains",
      paypal: "https://paypal.me/caseyt",
    });
  });

  test("null handles → null links (rail unset)", () => {
    expect(paymentLinks({ venmo_handle: null, paypal_handle: null })).toEqual({
      venmo: null,
      paypal: null,
    });
  });

  test("the host is fixed — a handle can never change the origin", () => {
    // Even if a malformed handle slipped past validation, it only fills the
    // path segment (encoded), never the host/scheme.
    const { venmo } = paymentLinks({
      venmo_handle: "evil.com/x",
      paypal_handle: null,
    });
    expect(venmo?.startsWith("https://venmo.com/u/")).toBe(true);
    expect(venmo).not.toContain("evil.com/x/"); // slash is percent-encoded
  });
});
