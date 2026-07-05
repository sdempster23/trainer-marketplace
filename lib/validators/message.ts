import { z } from "zod";

/**
 * Compose validation (messaging domain). One field — the M8 messages CHECK
 * mirrored on the value we SEND: trim first, then bound, so the schema's
 * output is exactly what satisfies `length(trim(body)) > 0 and
 * length(body) <= 4000`. Friendly rejection here; the CHECK is the backstop.
 */

/** The M8 `messages_body_nonempty_bounded` CHECK's upper bound, verbatim. */
export const MESSAGE_BODY_MAX_LENGTH = 4000;

export const messageBodySchema = z
  .string("Write a message first.")
  .trim()
  .min(1, "Write a message first.")
  .max(
    MESSAGE_BODY_MAX_LENGTH,
    `Messages are limited to ${MESSAGE_BODY_MAX_LENGTH} characters.`,
  );
