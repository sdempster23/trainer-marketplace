import { buildTrainerFeedCalendar } from "@/lib/feed/ics";
import { getFeedEvents } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import { feedTokenSchema } from "@/lib/validators/feed";

/**
 * GET /api/calendar/[token] — the ICS feed (M15, calendar-export arc).
 *
 * The repo's first route handler. Unauthenticated by design: calendar apps
 * (Google/Apple/Outlook) poll with no JWT — the 64-hex secret token in the
 * path is the entire credential. The auth-check-first convention is
 * satisfied by token validation: shape here (Zod, before any DB call),
 * existence via the M15 DEFINER surface.
 */

/** Ruling 5 at the HTTP layer: wrong, nonexistent, and malformed tokens are
 * INDISTINGUISHABLE — one shared Response builder so status, headers, and
 * body cannot drift apart between the branches. No token-space oracle. */
function tokenNotFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  const parsed = feedTokenSchema.safeParse(token);
  if (!parsed.success) {
    return tokenNotFound();
  }

  let feed: Awaited<ReturnType<typeof getFeedEvents>>;
  try {
    feed = await getFeedEvents(parsed.data);
  } catch (e) {
    // A DB failure is NOT a bad token: 404 would read as "subscription
    // deleted" to a calendar app; 500 reads as "try again later".
    console.error("[FEED] events fetch failed:", e);
    return new Response("Feed temporarily unavailable", { status: 500 });
  }

  if (!feed.valid) {
    return tokenNotFound();
  }

  // A missing origin is a LOUD misconfiguration, not a silent one — but it
  // siteOrigin() is never empty (precedence: SITE_URL > VERCEL_URL >
  // localhost), so the Manage link always resolves to a real origin.
  const ics = buildTrainerFeedCalendar(feed.events, siteOrigin());

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // no-store, argued: the pollers ARE the cache — Google re-fetches
      // every ~12-24h on its own schedule, so any CDN/browser layer on top
      // only ADDS staleness to an already hours-stale medium, and caching
      // a secret URL's response buys nothing a poller needs. Rotation
      // must also kill the old URL at the NEXT poll, not at cache expiry.
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="pawmatch.ics"',
    },
  });
}
