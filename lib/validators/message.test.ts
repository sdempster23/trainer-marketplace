import { describe, expect, test } from "vitest";

import {
  MESSAGE_BODY_MAX_LENGTH,
  messageBodySchema,
} from "@/lib/validators/message";

/**
 * The compose gate mirrors the M8 CHECK verbatim —
 * `length(trim(body)) > 0 and length(body) <= 4000` — on the value we SEND:
 * trim first, then bound. The friendly rejection happens here; the CHECK is
 * the backstop, never the UX.
 */
describe("messageBodySchema", () => {
  test("trims surrounding whitespace", () => {
    const result = messageBodySchema.parse("  where do we meet?  ");
    expect(result).toBe("where do we meet?");
  });

  test("rejects an empty body", () => {
    const result = messageBodySchema.safeParse("");
    expect(result.success).toBe(false);
  });

  test("rejects a whitespace-only body (the trim-nonempty CHECK)", () => {
    const result = messageBodySchema.safeParse("   \n\t  ");
    expect(result.success).toBe(false);
  });

  test("accepts a body of exactly the max length", () => {
    const result = messageBodySchema.safeParse("a".repeat(MESSAGE_BODY_MAX_LENGTH));
    expect(result.success).toBe(true);
  });

  test("rejects a body one char over the max length", () => {
    const result = messageBodySchema.safeParse(
      "a".repeat(MESSAGE_BODY_MAX_LENGTH + 1),
    );
    expect(result.success).toBe(false);
  });

  test("max length is the M8 CHECK's 4000", () => {
    expect(MESSAGE_BODY_MAX_LENGTH).toBe(4000);
  });
});
