import { describe, expect, test } from "vitest";

import {
  passwordResetRequestSchema,
  newPasswordSchema,
  signUpSchema,
} from "@/lib/validators/auth";

/**
 * Boundary tests for the auth schemas — focused on the launch-gate additions:
 * the consent checkbox (ruling 5: unchecked by default, must be checked to
 * sign up) and the forgot-password schemas (ruling 3).
 */

const VALID_SIGNUP = {
  email: "owner@example.com",
  password: "longenough",
  role: "owner",
  consent: "on",
};

describe("signUpSchema consent (ruling 5)", () => {
  test("accepts a submission with the consent box checked", () => {
    const result = signUpSchema.safeParse(VALID_SIGNUP);
    expect(result.success).toBe(true);
  });

  test("rejects a submission with consent missing (box unchecked)", () => {
    // An unchecked HTML checkbox is simply ABSENT from FormData — via
    // formData.get() that's `null`; on a raw object the key is missing
    // entirely. The server must treat BOTH as refusal, not a default yes.
    const nullResult = signUpSchema.safeParse({ ...VALID_SIGNUP, consent: null });
    expect(nullResult.success).toBe(false);
    if (!nullResult.success) {
      expect(nullResult.error.issues[0]?.message).toMatch(/18|agree/i);
    }

    const { consent, ...withoutConsent } = VALID_SIGNUP;
    void consent;
    expect(signUpSchema.safeParse(withoutConsent).success).toBe(false);
  });

  test("rejects a tampered consent value", () => {
    const result = signUpSchema.safeParse({
      ...VALID_SIGNUP,
      consent: "definitely",
    });
    expect(result.success).toBe(false);
  });
});

describe("passwordResetRequestSchema (ruling 3)", () => {
  test("accepts a valid email and trims whitespace", () => {
    const result = passwordResetRequestSchema.safeParse({
      email: "  owner@example.com  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("owner@example.com");
    }
  });

  test("rejects a non-email", () => {
    const result = passwordResetRequestSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("newPasswordSchema (ruling 3)", () => {
  test("accepts a password meeting the signup minimum", () => {
    const result = newPasswordSchema.safeParse({ password: "longenough" });
    expect(result.success).toBe(true);
  });

  test("rejects a password below the signup minimum", () => {
    // The reset path must not become a side door around the signup rule.
    const result = newPasswordSchema.safeParse({ password: "short" });
    expect(result.success).toBe(false);
  });
});
