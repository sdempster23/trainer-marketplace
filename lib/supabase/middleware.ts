import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/supabase";

/**
 * Session-refresh helper, run from the root `middleware.ts` on every matched
 * request. It rotates the Supabase auth token and syncs the refreshed cookies
 * onto BOTH the request (so downstream Server Components read the new session)
 * and the response (so the browser receives the new cookies).
 *
 * Two invariants make this correct — both are load-bearing:
 *  1. No code runs between `createServerClient` and `getClaims()`. Inserting
 *     logic there is the classic cause of users being "randomly logged out".
 *  2. The SAME `supabaseResponse` object whose cookies were synced is returned.
 *     Returning a fresh `NextResponse` would drop the rotated auth cookies and
 *     desync the browser/server session.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Create a new client per request — do not hoist to a module-level singleton
  // (Fluid compute would share one request's auth with another).
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do NOT run any code between `createServerClient` above and
  // `getClaims()` below. This call refreshes the auth token and writes the
  // rotated cookies via `setAll`; it MUST be the first thing that touches the
  // client. Removing it (or delaying it) causes SSR users to be randomly
  // logged out. We use `getClaims()` per current Supabase guidance (`getUser()`
  // is the drop-in fallback if we ever hit JWT signing-key friction).
  const { data: claimsData } = await supabase.auth.getClaims();

  // BLOCKING NAME STEP (front-door arc): a signed-in user with no
  // display_name is redirected to /welcome before ANY in-app transact
  // surface — this is the real chokepoint that makes the step "no skip"
  // (a per-page /account bounce is bypassable by direct URL). Scoped to the
  // authed surfaces only (public browse, the auth flow, and /welcome itself
  // are exempt), so the profiles read happens only where a name is required.
  const userId = claimsData?.claims?.sub;
  const path = request.nextUrl.pathname;
  if (userId && requiresName(path)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    // Only redirect on a definite NULL name (a failed/absent read must not
    // trap the user in a bounce — let the page handle it).
    if (profile && profile.display_name === null) {
      const url = request.nextUrl.clone();
      url.pathname = "/welcome";
      const redirectResponse = NextResponse.redirect(url);
      // Carry the rotated auth cookies onto the redirect (the same-object
      // invariant, extended to the redirect case).
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectResponse.cookies.set(c.name, c.value);
      });
      return redirectResponse;
    }
  }

  // IMPORTANT: return the SAME object whose cookies were synced above.
  return supabaseResponse;
}

/** The authed surfaces that require a display_name. Public pages
 * (/, /trainers — note the trailing-slash prefixes below EXCLUDE the public
 * /trainers directory), the auth flow (/login, /sign-up, /auth), /welcome,
 * and /api are all exempt — a nameless user may browse and complete the name
 * step, but not transact. */
function requiresName(pathname: string): boolean {
  return (
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/owner" ||
    pathname.startsWith("/owner/") ||
    pathname === "/trainer" ||
    pathname.startsWith("/trainer/") || // NOT /trainers (public directory)
    pathname === "/messages" ||
    pathname.startsWith("/messages/")
  );
}
