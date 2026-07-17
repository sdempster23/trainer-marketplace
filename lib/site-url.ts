/**
 * The ONE place that answers "what is our public origin." Every user-facing
 * absolute URL (the ICS feed subscribe URL, the in-feed Manage link, every
 * transactional email deep link, the email-confirmation redirect) builds
 * from this — no more ad-hoc `process.env.NEXT_PUBLIC_SITE_URL` reads, no
 * more `?? ""` fallbacks that emit bare relative links into email.
 *
 * PRECEDENCE (ruled, unit-tested below by lib/site-url.test.ts):
 *   1. NEXT_PUBLIC_SITE_URL — the explicit, authoritative origin. Set it to
 *      the real domain in production (a Vercel env var); locally it is
 *      http://localhost:3000.
 *   2. VERCEL_URL — set automatically on every Vercel deployment/preview
 *      (host only, no scheme), so preview deployments Just Work without
 *      anyone configuring a per-preview origin.
 *   3. http://localhost:3000 — the last-resort local default; the result is
 *      NEVER empty, so no code path can build a bare relative link.
 *
 * Returns an origin with NO trailing slash; callers append `/path`.
 */
export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  // VERCEL_URL is a bare host ("my-app-abc123.vercel.app") — add https.
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${stripTrailingSlash(vercel)}`;

  // Falling back to localhost in PRODUCTION means neither origin var is set —
  // a real misconfiguration that would ship dead localhost links into emails
  // and calendar feeds. Fail LOUD (the alarm the pre-helper code had), even
  // though we still return a value rather than crash a render.
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[SITE-URL] neither NEXT_PUBLIC_SITE_URL nor VERCEL_URL is set in production — user-facing links will point at localhost. Set NEXT_PUBLIC_SITE_URL to the deployed domain.",
    );
  }
  return "http://localhost:3000";
}

/** Build an absolute app URL from a path. `path` should start with "/". */
export function siteUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}${suffix}`;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
