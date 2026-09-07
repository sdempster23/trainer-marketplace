import { describe, expect, test } from "vitest";

import {
  parseSignupRoleParam,
  passwordResetRequestSchema,
  newPasswordSchema,
  ROLE_REQUIRED_ERROR,
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

describe("signUpSchema role (no positional default)", () => {
  test("rejects a submission with no role chosen, with the choose message", () => {
    // No radio checked → the field is absent from FormData → null via
    // formData.get(). The server must refuse, not fall back to owner.
    const result = signUpSchema.safeParse({ ...VALID_SIGNUP, role: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(ROLE_REQUIRED_ERROR);
    }
  });

  test("accepts each allowlisted role exactly", () => {
    expect(signUpSchema.safeParse({ ...VALID_SIGNUP, role: "owner" }).success).toBe(true);
    expect(signUpSchema.safeParse({ ...VALID_SIGNUP, role: "trainer" }).success).toBe(true);
    expect(signUpSchema.safeParse({ ...VALID_SIGNUP, role: "admin" }).success).toBe(false);
  });
});

describe("parseSignupRoleParam (the ?role= preset allowlist)", () => {
  test("returns the role for an exact allowlisted value", () => {
    expect(parseSignupRoleParam("trainer")).toBe("trainer");
    expect(parseSignupRoleParam("owner")).toBe("owner");
  });

  test.each([
    ["absent", undefined],
    ["empty", ""],
    ["unknown value", "admin"],
    ["wrong case", "Trainer"],
    ["padded", " trainer"],
    ["array-style repeated param", ["trainer", "owner"]],
    ["single-element array", ["trainer"]],
    ["non-string", 1],
  ])("returns null for %s → nothing preselected", (_label, value) => {
    expect(parseSignupRoleParam(value)).toBeNull();
  });
});
