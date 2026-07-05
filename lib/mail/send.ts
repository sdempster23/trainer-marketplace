import "server-only";

/**
 * The mail seam — ONE function, one POST endpoint, no SDK (ruled at scoping:
 * a dependency hidden behind our own abstraction is supply-chain surface
 * without capability; widening later is cheap).
 *
 * MODES:
 *  - Real key configured → POST https://api.resend.com/emails (bearer key,
 *    EMAIL_FROM/EMAIL_FROM_NAME identity).
 *  - No key / the Phase-0 placeholder → LOG-MODE: print the fully-rendered
 *    email. Local dev is free, and live proofs assert the logs.
 *
 * NEVER THROWS — returns { sent } and logs failures. Every caller sits
 * inside after() (post-response); nothing upstream can or should care.
 *
 * DEV/PROD STORY: without a verified domain, Resend permits the test-only
 * from `onboarding@resend.dev`, the `*@resend.dev` test recipients
 * (delivered@/bounced@/complained@/suppressed@, +labels), and real delivery
 * only to the Resend account owner's own address. Production needs a
 * verified domain (SPF/DKIM) and EMAIL_FROM=noreply@<domain> — the hosted
 * manual steps live in docs/manual-steps.md.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** A usable key is present and isn't the Phase-0 template placeholder. */
function usableKey(): string | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes("<")) {
    return null;
  }
  return key;
}

export async function sendMail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ sent: boolean }> {
  const key = usableKey();
  const from = `${process.env.EMAIL_FROM_NAME ?? "PawMatch"} <${process.env.EMAIL_FROM ?? "onboarding@resend.dev"}>`;

  if (!key) {
    console.log(
      `[MAIL:LOG-MODE] to=${to}\n[MAIL:LOG-MODE] subject=${subject}\n${text}`,
    );
    return { sent: false };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) {
      console.error(`[MAIL] send failed ${res.status}: ${await res.text()}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (e) {
    console.error("[MAIL] send threw:", e);
    return { sent: false };
  }
}
