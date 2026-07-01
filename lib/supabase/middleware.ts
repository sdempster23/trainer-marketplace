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
  await supabase.auth.getClaims();

  // Auth-gating (redirect unauthenticated users away from protected routes)
  // will live here once auth pages exist — read the claims from `getClaims()`
  // and branch on `request.nextUrl.pathname`. Intentionally a no-op for now:
  // this is the client layer only, with no protected routes yet.

  // IMPORTANT: return the SAME object whose cookies were synced above.
  return supabaseResponse;
}
