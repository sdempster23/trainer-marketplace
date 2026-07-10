import { z } from "zod";

/**
 * The feed-URL token as rotate_feed_token() mints it: exactly 64 lowercase
 * hex chars (32 random bytes). The route 404s anything else BEFORE any DB
 * call — same status as a wrong token, no token-space oracle.
 */
export const feedTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
