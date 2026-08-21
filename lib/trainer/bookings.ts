import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/**
 * The trainer's bookings-list read — the surface M11's counterparty policy
 * has been waiting for. The embed shape was proven live in the Arc-D
 * investigation (real GoTrue token, one REST query): owner display_name via
 * the M11 counterparty read (`profiles(...)` resolves unambiguously —
 * bookings has exactly ONE direct FK to profiles, owner_id), dog name via
 * the M6 category-I policy, service name via the public read.
 *
 * ALL statuses, deliberately: the trainer's list shows the lifecycle, not
 * just actionable rows — PENDING awaits a verb, CONFIRMED awaits the
 * session, COMPLETED and CANCELLED are the record. Soonest first.
 *
 * Renderer note: owner display_name MAY BE NULL (owners are never forced
 * through the /account name field) — fall back, don't blank.
 */
export type TrainerBooking = {
  id: string;
  /** The counterparty id — the Message button's find-or-create target. */
  owner_id: string;
  status: Database["public"]["Enums"]["booking_status"];
  /** Attribution for CANCELLED rows ("by you" / "by the other party"). */
  cancelled_by: Database["public"]["Enums"]["cancelled_by"] | null;
  starts_at: string;
  ends_at: string | null;
  duration_minutes: number;
  price_cents: number;
  trainer_services: { name: string } | null;
  profiles: { display_name: string | null } | null;
  dogs: { name: string } | null;
};

export async function getTrainerBookings(
  supabase: SupabaseClient<Database>,
  trainerId: string,
): Promise<{ bookings: TrainerBooking[]; error: string | null }> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, owner_id, status, cancelled_by, starts_at, ends_at, duration_minutes, price_cents, trainer_services(name), profiles(display_name), dogs(name)",
    )
    .eq("trainer_id", trainerId)
    .order("starts_at", { ascending: true });

  if (error) {
    return { bookings: [], error: error.message };
  }
  return { bookings: data, error: null };
}

/**
 * PENDING-request count for the hub's bookings link (interior-polish flow
 * ruling #4: a request should be visible from /account the way unread
 * messages are). Same contract as getUnreadThreadCount: head-count only
 * (no rows), 0 on error — the link degrades to countless, never breaks.
 * cache()-wrapped for per-request dedupe if a second surface ever asks.
 */
export const getPendingRequestCount = cache(async function getPendingRequestCount(
  supabase: SupabaseClient<Database>,
  trainerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("trainer_id", trainerId)
    .eq("status", "PENDING");

  if (error) {
    console.error("[BOOKINGS] pending count failed:", error.message);
    return 0;
  }
  return count ?? 0;
});
