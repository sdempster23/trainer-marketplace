import "server-only";

/**
 * Server-side Cloudflare Turnstile verification (the bot gate on signup).
 *
 * FAIL VISIBLE, FAIL CLOSED: any failure — missing token, invalid token,
 * Cloudflare unreachable, secret unset — returns { ok: false } with a
 * user-actionable message. The caller surfaces it on the form; the submit is
 * never a silent dead button, and a Cloudflare outage BLOCKS signup (a bot
 * gate that fails open is not a bot gate).
 *
 * Keys (Shane provisions real ones at Cloudflare; local dev uses Cloudflare's
 * public always-pass TEST keys):
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY — the widget (client)
 *   TURNSTILE_SECRET_KEY           — this verification (server)
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;

export type TurnstileResult = { ok: true } | { ok: false; error: string };

const HUMAN_ERROR =
  "We couldn't verify you're human. Please complete the check and try again.";

export async function verifyTurnstile(
  token: FormDataEntryValue | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Misconfiguration is our fault, not the user's — but it must still FAIL
    // CLOSED (never let signup through with no bot gate) and loudly.
    console.error("[TURNSTILE] TURNSTILE_SECRET_KEY is not set — blocking signup");
    return { ok: false, error: "Signup is temporarily unavailable. Please try again shortly." };
  }
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, error: HUMAN_ERROR };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[TURNSTILE] siteverify HTTP", res.status);
      return { ok: false, error: HUMAN_ERROR };
    }
    const data = (await res.json()) as { success?: boolean };
    if (data.success === true) return { ok: true };
    return { ok: false, error: HUMAN_ERROR };
  } catch (e) {
    // Timeout / network — Cloudflare unreachable. Fail closed + visible.
    console.error("[TURNSTILE] verify threw:", e);
    return { ok: false, error: HUMAN_ERROR };
  }
}
