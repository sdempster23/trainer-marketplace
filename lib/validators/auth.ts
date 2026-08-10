import { z } from "zod";

/**
 * Auth input schemas — the single source of truth for what the signup/login
 * forms accept, shared by the client forms (pre-submit UX) and the server
 * actions (the real, trusted validation boundary).
 */

/**
 * Signup roles. Matches the DB `user_role` enum EXACTLY (lowercase) — the value
 * is passed as `options.data.role` and the M1 `handle_new_user` trigger reads
 * it verbatim. `admin` is intentionally excluded: the trigger downgrades any
 * non-{owner,trainer} role to `owner`, so offering it here would be a lie.
 */
export const SIGNUP_ROLES = ["owner", "trainer"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

/** Minimum password length. Deliberately modest for dev; tighten before prod. */
export const PASSWORD_MIN_LENGTH = 8;

/** Shown when the consent box isn't checked (or the value was tampered). */
export const CONSENT_ERROR =
  "Please confirm you're 18 or older and agree to the Terms of Service and Privacy Policy.";

export const signUpSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    ),
  role: z.enum(SIGNUP_ROLES, "Choose whether you're a dog owner or a trainer."),
  // The 18+/ToS/Privacy checkbox (launch-gate ruling 5: checkbox, unchecked
  // by default). An unchecked HTML checkbox is ABSENT from FormData, so the
  // literal "on" requirement makes absence — and any tampered value — fail
  // at the trusted boundary, not just in browser UI.
  consent: z.literal("on", CONSENT_ERROR),
});

/** Forgot-password request (ruling 3). Trimmed — email fields collect stray
 * whitespace from mobile keyboards. */
export const passwordResetRequestSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
});

/** The new password chosen on the reset page. Same minimum as signup — the
 * reset path must not become a side door around the signup rule. */
export const newPasswordSchema = z.object({
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    ),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  // Login only needs a non-empty password — the DB is the authority on whether
  // it's correct. Re-applying the signup length rule here would wrongly reject
  // valid older passwords if the rule ever changes.
  password: z.string().min(1, "Enter your password."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
