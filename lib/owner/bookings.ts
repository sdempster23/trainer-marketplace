import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/**
 * The owner's bookings-list read (Arc C: the read-only list; transitions are
 * Arc D). CONTRAST WITH lib/trainer/busy.ts: no DEFINER needed here — the
 * owner reads their OWN rows through the parties-only RLS, exactly what the
 * policy exists for.
 *
 * Embeds, all pre-M11 public reads (an OWNER reading a TRAINER's profile was
 * always the trainer-public policy — no M11 counterparty dependency in this
 * direction): trainer name via bookings→trainers→profiles, service name via
 * the service FK, dog name via the dog FK (the owner's own row).
 *
 * NOTE service name CAN be null after the fact: if the trainer later
 * soft-deletes the service, the public SELECT policy hides it and the embed
 * returns null — the booking row itself is untouched (price/duration are
 * SNAPSHOTS on the booking). Renderers cope with a fallback label.
 *
 * NO deleted_at concept on bookings — the deviation from the services/dogs
 * helpers: STATUS is the lifecycle (CANCELLED is a state to display, not a
 * row to hide), so there is no view-spec filter here at all.
 *
 * Order: soonest first (starts_at asc) — a bookings list is a calendar,
 * not a feed.
 */
export type OwnerBooking = {
  id: string;
  status: Database["public"]["Enums"]["booking_status"];
  starts_at: string;
  ends_at: string | null; // GENERATED column — non-null in practice
  duration_minutes: number;
  price_cents: number;
  trainer_services: { name: string } | null;
    /** timezone rides along for display: booking times render in the
   *  TRAINER's zone (consistency with the picker). */
  trainers: {
    timezone: string;
    profiles: { display_name: string | null };
  } | null;
  dogs: { name: string } | null;
};

export async function getOwnerBookings(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<{ bookings: OwnerBooking[]; error: string | null }> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, duration_minutes, price_cents, trainer_services(name), trainers(timezone, profiles(display_name)), dogs(name)",
    )
    .eq("owner_id", ownerId)
    .order("starts_at", { ascending: true });

  if (error) {
    return { bookings: [], error: error.message };
  }
  return { bookings: data, error: null };
}
