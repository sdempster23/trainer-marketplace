import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { getUnreadThreadCount } from "@/lib/messages/threads";
import { createClient } from "@/lib/supabase/server";

/**
 * The slim app shell header (interior-polish ruling 5): wordmark → home,
 * plus HONEST auth-state nav — a logged-out visitor sees Log in / Sign
 * up, never Account/Messages; a signed-in user (either role — the
 * minimal shell's items are role-identical by design) sees Account +
 * Messages with the unread count.
 *
 * The unread badge rides the ALREADY-PRICED getUnreadThreadCount shape
 * (one slim indexed query; returns 0 on error by contract, so the nav
 * degrades to countless, never breaks). That contract is why it's
 * allowed here at all — a bespoke count would have stayed on the hub.
 *
 * The MARKETING homepage does not render this header: the hero's
 * overlay nav is part of that page's composed scene (its own laws in
 * docs/design/arc-notes.md), so `/` stays outside the (app) group.
 */
export async function AppHeader() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    // Degrading to the logged-out nav is right; degrading SILENTLY isn't.
    console.error("[HEADER] getClaims failed:", error.message);
  }
  const claims = data?.claims;
  const unread = claims
    ? await getUnreadThreadCount(supabase, claims.sub)
    : 0;

  const linkClasses =
    "text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors";

  return (
    <header className="bg-background border-border border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        {/* Same wordmark recipe as the hero's overlay nav (wide subset,
            display fallback) — one brand voice, two headers by design. */}
        <Link
          href="/"
          className="text-foreground text-base font-bold tracking-tight uppercase [font-family:var(--font-archivo-wide),var(--font-archivo),ui-sans-serif] [font-stretch:115%]"
        >
          PawMatch
        </Link>
        <nav className="flex items-center gap-1">
          {claims ? (
            <>
              <Link href="/account" className={linkClasses}>
                Account
              </Link>
              <Link
                href="/messages"
                className={`${linkClasses} flex items-center gap-1.5`}
              >
                Messages
                {unread > 0 ? (
                  <Badge variant="strong">{unread}</Badge>
                ) : null}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className={linkClasses}>
                Log in
              </Link>
              <Link href="/sign-up" className={linkClasses}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
