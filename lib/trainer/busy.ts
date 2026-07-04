import type { SupabaseClient } from "@supabase/supabase-js";

import type { BlockingBooking } from "@/lib/trainer/schedule";
import type { Database } from "@/types/supabase";

/**
 * The one read path for M12's trainer_busy_ranges RPC — the slot picker's
 * busy-times feed.
 *
 * This is the DEFINER function (the codebase's one access-side DEFINER):
 * the caller cannot see other clients' bookings, but the ANSWER — future
 * (starts_at, ends_at) ranges, nothing else — is booking-inherent
 * information. authenticated-only grant, so THE CALLER MUST BE SIGNED IN;
 * v1's picker lives behind the owner guard, which is upstream of every call
 * site (an anon call would fail on EXECUTE, not RLS).
 *
 * SHAPE CHOICE: returns computeBookableSlots' own BlockingBooking type
 * (wire-format strings + a status field), so the caller passes the result
 * straight in with zero conversion. The RPC deliberately returns no status
 * (ranges only — the M12 disclosure argument); every returned range IS
 * blocking by construction, so a synthetic 'CONFIRMED' satisfies the
 * module's own status filter without weakening it.
 */
export async function getBusyRanges(
  supabase: SupabaseClient<Database>,
  trainerId: string,
): Promise<{ busy: BlockingBooking[]; error: string | null }> {
  const { data, error } = await supabase.rpc("trainer_busy_ranges", {
    t_id: trainerId,
  });

  if (error) {
    return { busy: [], error: error.message };
  }
  return {
    busy: data.map((r) => ({
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      status: "CONFIRMED", // synthetic — see the shape-choice note above
    })),
    error: null,
  };
}
