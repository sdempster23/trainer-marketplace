"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { hrefWithNext } from "@/lib/auth/safe-internal-path";

/**
 * The logged-out half of the app-shell nav: "Log in" / "Sign up".
 *
 * A CLIENT leaf for one reason: the header renders from the (app) LAYOUT,
 * and Next.js layouts never receive `searchParams` — so the only way the
 * shell can see a `?next=` destination is to read the URL in the browser.
 * The auth pages themselves validate the param on the server; here the
 * SAME single function does it (hrefWithNext → safeInternalPath): a
 * same-origin path is forwarded, anything else yields the bare href.
 *
 * Where a `next` legitimately exists: only /login, /sign-up and
 * /sign-up/check-email — the trainer page's "Log in to message" / "Book"
 * CTAs are the sole producers, and those three pages forward it between
 * themselves. On every other route the URL carries no `next`, so these
 * links stay bare; the header never attaches a stale or invented value.
 *
 * No Suspense boundary is needed: the (app) layout reads cookies (auth
 * claims), so every route under it is dynamically rendered and
 * useSearchParams resolves on the server. If a static route ever joins
 * the group, `next build` fails loudly with "Missing Suspense boundary
 * with useSearchParams" rather than silently degrading.
 */
export function AuthNavLinks({ className }: { className: string }) {
  const next = useSearchParams().get("next");
  return (
    <>
      <Link href={hrefWithNext("/login", next)} className={className}>
        Log in
      </Link>
      <Link href={hrefWithNext("/sign-up", next)} className={className}>
        Sign up
      </Link>
    </>
  );
}
