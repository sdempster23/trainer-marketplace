import { describe, expect, test } from "vitest";

import { truncatePreview } from "@/lib/utils/truncate";

/**
 * Code-point-safe preview truncation. The trap under test: String.slice cuts
 * at UTF-16 code UNITS, so a boundary landing inside a surrogate pair (any
 * emoji) leaves a lone high surrogate that renders as U+FFFD. The cap is
 * counted in code POINTS.
 */
describe("truncatePreview", () => {
  test("short text passes through untouched — no ellipsis", () => {
    expect(truncatePreview("where do we meet?", 90)).toBe("where do we meet?");
  });

  test("text exactly at the cap passes through untouched", () => {
    expect(truncatePreview("a".repeat(90), 90)).toBe("a".repeat(90));
  });

  test("long text truncates at the cap with an ellipsis", () => {
    expect(truncatePreview("a".repeat(91), 90)).toBe("a".repeat(90) + "…");
  });

  test("never splits a surrogate pair — the emoji at the boundary survives whole or not at all", () => {
    // 89 ASCII chars + 🐶 (2 UTF-16 units): a unit-based slice(0, 90) would
    // cut the dog in half. Code-point counting keeps it whole (90th point).
    const input = "a".repeat(89) + "🐶" + "b".repeat(10);
    const result = truncatePreview(input, 90);
    expect(result).toBe("a".repeat(89) + "🐶" + "…");
    expect(result).not.toContain("�");
    // And no LONE HIGH surrogate hiding before the ellipsis (a low surrogate
    // there is the intact pair's second half — that's the correct outcome):
    const beforeEllipsis = result.charCodeAt(result.length - 2);
    const isLoneHighSurrogate =
      beforeEllipsis >= 0xd800 && beforeEllipsis <= 0xdbff;
    expect(isLoneHighSurrogate).toBe(false);
  });

  test("counts code points, not units: emoji-heavy text truncates by visible characters", () => {
    const input = "🐶".repeat(95); // 190 UTF-16 units, 95 code points
    expect(truncatePreview(input, 90)).toBe("🐶".repeat(90) + "…");
  });
});
