import "server-only";
// ^ the `server-only` package is a runtime no-op whose package.json export
// conditions make any CLIENT-bundle import fail AT BUILD TIME — the loud
// guard this module demands.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/**
 * THE APP'S SERVICE-ROLE SURFACE — first and only usage. The service-role
 * key BYPASSES ALL RLS: anything exported from this module runs with total
 * database authority, so this module's exports ARE the app's entire
 * service-role blast radius. Keep them narrow, named for exactly what they
 * answer, and never export the raw client.
 *
 * WHY EMAIL LOOKUP LIVES HERE AND NOT IN A profiles.email COLUMN (the
 * rejected M13): profiles policies are ROW-level — a column rides EVERY
 * existing read path for any visible row. An email column would make
 * trainer emails ANON-READABLE (the public directory policy publishes
 * trainer rows to the internet) and hand owner emails to trainers via the
 * M11 counterparty policy. Email in profiles is a leak BY CONSTRUCTION;
 * the admin client is the security-correct vehicle, not merely the
 * convenient one. Addresses stay in auth.users, fetched one at a time,
 * server-only, for exactly one purpose (transition mail).
 */

let adminClient: SupabaseClient<Database> | null = null;

function getAdminClient(): SupabaseClient<Database> {
  if (!adminClient) {
    adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      // No sessions, no refresh — this is a key, not a user.
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return adminClient;
}

/** The one export: a user's email address, or null (unknown id, missing
 * env, or any auth-API failure — callers are mail code; null means "skip
 * the send", never "crash the request"). */
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await getAdminClient().auth.admin.getUserById(
      userId,
    );
    if (error) {
      console.error(`[MAIL] email lookup failed for ${userId}:`, error.message);
      return null;
    }
    return data.user?.email ?? null;
  } catch (e) {
    console.error(`[MAIL] email lookup threw for ${userId}:`, e);
    return null;
  }
}

// Type-only import: the widened row type (owner_display_name: string|null —
// gen-types is optimistic about RETURNS TABLE nullability) has ONE home so
// callers can't disagree about it. No runtime coupling to lib/feed.
import type { FeedEventRow } from "@/lib/feed/ics";

/** getUserEmail's first sibling — the ICS feed's read (M15).
 *
 * WHY THIS LIVES HERE: the feed route is unauthenticated by nature (a
 * calendar app polls with no JWT; the secret URL token is the whole
 * credential), so its reads cannot ride a user session. Both RPCs below
 * are SECURITY DEFINER functions whose EXECUTE is granted to service_role
 * ONLY (the M15 §5/§6 lane) — the service key never touches a table here;
 * the functions fix the question shape.
 *
 * Return contract mirrors the M15 §6 fork the route needs:
 *   { valid: false }                 → no such token (route: 404)
 *   { valid: true, events: [] }      → real feed, nothing in window
 *                                      (route: 200, EMPTY calendar — a new
 *                                      trainer's day-one feed must not
 *                                      present as broken)
 *   { valid: true, events: [...] }   → the feed
 *
 * Unlike getUserEmail, failures here THROW (the route maps them to 500):
 * a DB outage must not masquerade as { valid: false } — that would 404 a
 * working subscription into "deleted" in the calendar app, when the right
 * signal is "temporarily unavailable, poll again later". */
export async function getFeedEvents(
  feedToken: string,
): Promise<{ valid: boolean; events: FeedEventRow[] }> {
  const admin = getAdminClient();

  // EVENTS FIRST, existence only to fork the empty case: non-empty events
  // prove the token by themselves, so the common poll costs ONE round trip
  // (this is the unauthenticated hot path — every subscribed calendar's
  // poller). It also closes the rotate race the exists-first order had: a
  // token rotated between two calls can no longer read as valid-but-empty
  // (Google would wipe the trainer's events for that cycle); with this
  // order the stale token's empty read re-checks existence, finds the row
  // gone, and serves the designed 404.
  const { data, error } = await admin.rpc("trainer_feed_events", {
    feed_token: feedToken,
  });
  if (error) {
    throw new Error(`[FEED] events read failed: ${error.message}`);
  }
  if (data && data.length > 0) {
    return { valid: true, events: data };
  }

  const { data: exists, error: existsError } = await admin.rpc(
    "feed_token_exists",
    { feed_token: feedToken },
  );
  if (existsError) {
    throw new Error(
      `[FEED] token existence check failed: ${existsError.message}`,
    );
  }
  return { valid: Boolean(exists), events: [] };
}

/** The import half's url-retrieval lane (M16 §5) — the ONLY read path to
 * the url column anywhere. Returns null when the trainer has no
 * subscription (row absence is the first-class "not subscribed" state).
 * The url must never be logged or surfaced; callers get it to fetch it. */
export async function getExternalCalendarToFetch(trainerId: string): Promise<{
  url: string;
  last_fetched_at: string | null;
  last_attempted_at: string | null;
  failing_since: string | null;
} | null> {
  const { data, error } = await getAdminClient().rpc(
    "external_calendar_to_fetch",
    { t_id: trainerId },
  );
  if (error) {
    throw new Error(`[EXTCAL] to-fetch read failed: ${error.message}`);
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    url: row.url,
    // gen-types marks RETURNS TABLE columns non-nullable; these timestamps
    // are genuinely nullable (never-fetched / never-attempted / not-failing)
    // — same optimistic-types finding as M15, handled at the one boundary.
    last_fetched_at: (row.last_fetched_at as string | null) ?? null,
    last_attempted_at: (row.last_attempted_at as string | null) ?? null,
    failing_since: (row.failing_since as string | null) ?? null,
  };
}

/** The import half's write lane (M16 §6). fetch_ok=false is bookkeeping
 * only — the DB is structurally unable to touch blocks on that path
 * (stale beats none). blocks=null is only meaningful with fetch_ok=false. */
export async function applyExternalRefresh(
  trainerId: string,
  blocks: { starts_at: string; ends_at: string }[] | null,
  fetchOk: boolean,
): Promise<void> {
  const { error } = await getAdminClient().rpc("refresh_external_blocks", {
    t_id: trainerId,
    blocks: blocks ?? [],
    fetch_ok: fetchOk,
  });
  if (error) {
    throw new Error(`[EXTCAL] refresh apply failed: ${error.message}`);
  }
}
