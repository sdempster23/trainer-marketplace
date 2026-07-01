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

export const signUpSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    ),
  role: z.enum(SIGNUP_ROLES, "Choose whether you're a dog owner or a trainer."),
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
