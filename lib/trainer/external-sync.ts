import "server-only";

import { after } from "next/server";

import {
  getExternalCalendarToFetch,
  applyExternalRefresh,
} from "@/lib/supabase/admin";

// node-ical pulls in temporal-polyfill, which runs BigInt work at
// module-load and breaks Next's page-data collection for any page whose
// module graph statically reaches it (every consumer of (owner)/actions,
// e.g. /owner/dogs, does). The parser + fetcher are needed ONLY when a
// fetch actually runs, so they are dynamically imported inside
// fetchParseApply — kept out of the static graph entirely.

/**
 * Fetch-on-read (M16 gate ruling 3 AS AMENDED): freshness is delivered at
 * the moment it matters — someone is reading bookable slots.
 *
 *   no subscription        → nothing to do
 *   never fetched (null)   → SYNCHRONOUS fetch (5s cap): the trainer just
 *                            pasted; her calendar must block before the
 *                            first slot render, or the feature looks broken
 *                            exactly once — at the moment she tests it
 *   fresh (< TTL)          → nothing to do
 *   stale (≥ TTL)          → serve the CURRENT blocks instantly and
 *                            refresh in after() — the mail-seam pattern:
 *                            the reader never pays for a poll; the NEXT
 *                            reader sees the newer calendar
 *
 * Failures are reported through applyExternalRefresh(fetch_ok=false),
 * where the DB's structural stale-beats-none takes over (a failed fetch
 * cannot touch blocks — M16 §6). Errors here never break a slot read.
 */

/** 15 minutes (gate ruling 3). The trainer-facing copy states this. */
export const EXTERNAL_REFRESH_TTL_MS = 15 * 60 * 1000;

/**
 * In-process in-flight dedup (review P4): when several readers hit a
 * trainer's book page at once with a stale/never-fetched calendar, only ONE
 * outbound fetch + block rewrite runs per trainer per instance; the rest
 * await the same promise. Cross-instance herds are bounded by the TTL once
 * the first completes. Keyed by trainerId; the entry clears when the fetch
 * settles.
 */
const inFlight = new Map<string, Promise<void>>();

function fetchParseApply(
  trainerId: string,
  url: string,
  fallbackTimezone: string,
): Promise<void> {
  const existing = inFlight.get(trainerId);
  if (existing) return existing;

  const run = (async () => {
    const [{ fetchIcsSafely }, { parseIcsToBusyBlocks }] = await Promise.all([
      import("@/lib/feed/fetch-ics"),
      import("@/lib/feed/import"),
    ]);
    const fetched = await fetchIcsSafely(url);
    if (!fetched.ok) {
      // The error string can embed the calendar HOST (part of the secret
      // URL) — log only that a fetch failed, never the reason verbatim.
      console.error(`[EXTCAL] fetch failed for trainer ${trainerId}`);
      await applyExternalRefresh(trainerId, null, false);
      return;
    }
    let blocks;
    try {
      blocks = parseIcsToBusyBlocks(fetched.body, {
        now: new Date(),
        fallbackTimezone,
      });
    } catch (e) {
      // A body that passed BEGIN:VCALENDAR but won't parse is a failed
      // fetch, not an empty calendar — never replace blocks with garbage.
      console.error(`[EXTCAL] parse failed for trainer ${trainerId}:`, e);
      await applyExternalRefresh(trainerId, null, false);
      return;
    }
    await applyExternalRefresh(trainerId, blocks, true);
  })().finally(() => {
    inFlight.delete(trainerId);
  });

  inFlight.set(trainerId, run);
  return run;
}

/**
 * Called at both slot-read sites (book page render + createBooking's
 * revalidation), BEFORE the busy-ranges read. Await it: in the common
 * case it does nothing or schedules background work and returns
 * immediately; only the never-attempted case pays the capped fetch.
 *
 * COST NOTE (review): this pays one service-role RPC per book-page render
 * even for the ~all trainers with no subscription (returns null). That RPC
 * is unavoidable at this seam — the reader is the OWNER, whose session
 * cannot see the trainer's subscription row under RLS (own-row only), so
 * the existence check must go through the DEFINER lane. It is a single
 * PK-indexed lookup; a future optimization if it ever matters is to
 * denormalize a "has_external_calendar" flag onto the public trainers row
 * the book page already reads. Accepted for v1.
 */
export async function ensureExternalCalendarFresh(
  trainerId: string,
  trainerTimezone: string,
): Promise<void> {
  try {
    const sub = await getExternalCalendarToFetch(trainerId);
    if (!sub) return; // not subscribed — the overwhelmingly common case

    // The TTL gate reads last_ATTEMPTED_at, not last_fetched_at: a feed
    // that never succeeds still advances it (M16 refresh failure branch),
    // so a permanently-failing feed backs off to the TTL cadence instead
    // of re-blocking every read with a fresh ≤5s fetch (the review's
    // DoS-amplification finding).
    if (sub.last_attempted_at === null) {
      // Never ATTEMPTED: synchronous once, so the paste→first-render moment
      // works. Every later read — even if this attempt fails — takes the
      // TTL path below.
      await fetchParseApply(trainerId, sub.url, trainerTimezone);
      return;
    }

    const ageMs = Date.now() - Date.parse(sub.last_attempted_at);
    if (ageMs < EXTERNAL_REFRESH_TTL_MS) return;

    // Stale: this reader gets the current blocks instantly; the refresh
    // rides after() (the transition-mail pattern) for the next reader.
    after(() => fetchParseApply(trainerId, sub.url, trainerTimezone));
  } catch (e) {
    // A sync hiccup must never break a booking page; stale blocks are
    // still being served by the RPC either way.
    console.error(`[EXTCAL] ensure-fresh failed for ${trainerId}:`, e);
  }
}
