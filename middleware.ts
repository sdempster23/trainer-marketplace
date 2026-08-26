import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Root middleware — runs on every matched request to keep the Supabase session
 * fresh (see `updateSession`). On Next 15.5 the file convention is
 * `middleware.ts` / `export function middleware`; Next 16 renames this to
 * `proxy.ts` / `proxy`, but on our version that file would be unrecognized and
 * silently never run.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all request paths EXCEPT:
     *  - _next/static  (build assets)
     *  - _next/image   (image optimizer)
     *  - _vercel       (Vercel Analytics script + beacon POSTs — session
     *                   refresh on those would double edge invocations per
     *                   pageview for zero benefit, and future redirect logic
     *                   here could silently break collection)
     *  - favicon.ico
     *  - image files   (svg, png, jpg, jpeg, gif, webp)
     * Skipping these avoids pointless auth work on static assets. Add public
     * routes to the negative lookahead as they appear.
     */
    "/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
