import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import type { ExternalCalendarStatus } from "@/components/account/external-calendar-manager";
import { BOOKING_WINDOW_DAYS } from "@/lib/validators/booking";

const MS_PER_DAY = 86_400_000;

export type ExternalCalendarStatusResult = {
  status: ExternalCalendarStatus;
  lastFetchedAt: string | null;
  failingSince: string | null;
  // null = the count couldn't be read (NOT zero). The card must not render
  // "no busy times" on a failed count — that is a false all-clear.
  blockCount: number | null;
};

/**
 * The /account import card's read (M16): subscription METADATA + a count of
 * blocks in the bookable horizon. RLS scopes both to the caller's own row;
 * the url column is never selected (granted to no api role regardless).
 *
 * Tri-state on error (the M15 lesson): a FAILED read is "unknown", NOT
 * "none" — the card must never offer paste-over (a destructive replace)
 * against a subscription that might exist. Row absence is the genuine
 * "none". Errors are logged, never swallowed.
 */
export async function getExternalCalendarStatus(
  supabase: SupabaseClient<Database>,
  trainerId: string,
): Promise<ExternalCalendarStatusResult> {
  const none: ExternalCalendarStatusResult = {
    status: "none",
    lastFetchedAt: null,
    failingSince: null,
    blockCount: 0,
  };

  const { data, error } = await supabase
    .from("trainer_external_calendars")
    .select("last_fetched_at, failing_since")
    .eq("trainer_id", trainerId)
    .maybeSingle();

  if (error) {
    console.error("[EXTCAL] status read failed:", error.message);
    return { ...none, status: "unknown" };
  }
  if (!data) return none;

  // Count blocks in the SAME horizon the copy claims ("next two weeks" =
  // BOOKING_WINDOW_DAYS) and that actually gate bookable slots — not the
  // full 21-day expansion window, and not past-but-not-yet-refreshed blocks
  // (ends_at > now). Otherwise the number overstates what's blocking.
  const nowIso = new Date().toISOString();
  const horizonIso = new Date(
    Date.now() + BOOKING_WINDOW_DAYS * MS_PER_DAY,
  ).toISOString();
  const { count, error: countError } = await supabase
    .from("trainer_external_busy_blocks")
    .select("trainer_id", { count: "exact", head: true })
    .eq("trainer_id", trainerId)
    .gt("ends_at", nowIso)
    .lt("starts_at", horizonIso);
  if (countError) {
    // null, NOT 0 — the card omits the count line rather than claiming
    // "no busy times" when it simply couldn't read them.
    console.error("[EXTCAL] block count failed:", countError.message);
  }

  return {
    status: "subscribed",
    lastFetchedAt: data.last_fetched_at,
    failingSince: data.failing_since,
    blockCount: countError ? null : (count ?? 0),
  };
}
