/**
 * Post-auth return path guard. SECURITY: `next`-style values (query params,
 * hidden form fields) are attacker-suppliable and must never become an open
 * redirect — only a same-origin PATH is honored: leading "/", not "//"
 * (protocol-relative URL) and no "\" (browsers normalize "/\" to "//").
 * Anything else returns null so the caller falls back to its default.
 *
 * Shared by the login action AND /auth/confirm — the emailed-link route is
 * the higher-stakes consumer: an unvalidated `next` there is an open
 * redirect off a just-authenticated session (phishing + session fixation).
 */
export function safeInternalPath(
  value: FormDataEntryValue | string | null,
): string | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value;
}

/**
 * Build an auth-flow href that carries a return destination — ONLY when
 * that destination passes safeInternalPath. Used for the login ⇄ sign-up
 * links and the check-email "Log in" link, so a visitor who bounced from
 * "Log in to message" can switch between the two forms without losing
 * where they were going. An invalid or absent `next` yields the bare href;
 * the value is never trusted, only forwarded.
 */
export function hrefWithNext(
  href: string,
  next: FormDataEntryValue | string | null | undefined,
): string {
  const safe = safeInternalPath(next ?? null);
  return safe ? `${href}?next=${encodeURIComponent(safe)}` : href;
}
