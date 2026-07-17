import { z } from "zod";

/**
 * The feed-URL token as rotate_feed_token() mints it: exactly 64 lowercase
 * hex chars (32 random bytes). The route 404s anything else BEFORE any DB
 * call — same status as a wrong token, no token-space oracle.
 */
export const feedTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * Client-side FORMAT check for a pasted external-calendar URL (M16) — a
 * fast "that's not a URL" before the round trip. The authoritative gate is
 * server-side (set_external_calendar's https shape-check + the full SSRF
 * layer in lib/feed/fetch-ics at fetch time); this only spares the user an
 * obviously-doomed submit. Accepts webcal:// since the server normalizes it.
 */
export const externalCalendarUrlSchema = z
  .string()
  .trim()
  .min(1, "Paste your calendar's secret ICS URL.")
  .refine(
    (v) => /^(https|webcal):\/\//i.test(v),
    "Use the secret address in iCal format (starts with https:// or webcal://).",
  );
