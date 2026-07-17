import { z } from "zod";

/**
 * Off-platform payment info (M17). Handles are stored as SLUGS, never urls —
 * the app builds the href from a fixed allowlisted host (paymentLinks below),
 * so there is never a user-supplied url to sanitize. The DB CHECK charsets
 * mirror these; keep them in sync.
 */
export const PAYMENT_INSTRUCTIONS_MAX_LENGTH = 280;
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,30}$/;
const HANDLE_MESSAGE =
  "Use just the username (letters, numbers, . _ - ), not a full link.";

/** A handle field: optional, trimmed, empty → undefined (clears the rail). */
const handleField = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .refine((v) => v === undefined || HANDLE_RE.test(v), HANDLE_MESSAGE);

export const paymentInfoSchema = z.object({
  instructions: z
    .string()
    .trim()
    .max(
      PAYMENT_INSTRUCTIONS_MAX_LENGTH,
      `Keep it under ${PAYMENT_INSTRUCTIONS_MAX_LENGTH} characters.`,
    )
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  venmo: handleField,
  paypal: handleField,
});

export type PaymentInfoInput = z.infer<typeof paymentInfoSchema>;

/**
 * Build clickable links from validated handles. THE HOST IS A FIXED CONSTANT;
 * the handle only fills the path, and it has already passed HANDLE_RE (and the
 * DB CHECK), so there is no way to inject a scheme, an @-userinfo trick, or a
 * lookalike host. Returns absolute https urls (or null when the rail is unset).
 */
export function paymentLinks(info: {
  venmo_handle: string | null;
  paypal_handle: string | null;
}): { venmo: string | null; paypal: string | null } {
  return {
    venmo: info.venmo_handle
      ? `https://venmo.com/u/${encodeURIComponent(info.venmo_handle)}`
      : null,
    paypal: info.paypal_handle
      ? `https://paypal.me/${encodeURIComponent(info.paypal_handle)}`
      : null,
  };
}
