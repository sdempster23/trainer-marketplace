import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/**
 * Availability read paths. NOTE THE DELIBERATE DEVIATION from the services/
 * dogs helpers: there is NO deleted_at floor here — these tables HARD-delete
 * (no deleted_at column exists; real DELETE grant + policies, M7-verified).
 * Availability is CONFIG, not record: removing a window is not an event
 * anyone audits, so the view-spec rule ("explicit deleted_at IS NULL at
 * every read") has nothing to apply to. The single-read-path discipline
 * still holds — every availability read goes through these two functions.
 */

export type WeeklySlot = {
  id: string;
  day_of_week: number; // 0 = Sunday … 6 = Saturday
  start_time: string; // "HH:MM:SS"
  end_time: string;
};

export type AvailabilityException = {
  id: string;
  exception_date: string; // "YYYY-MM-DD"
  is_blocked: boolean;
  start_time: string | null;
  end_time: string | null;
};

export async function getWeeklyPattern(
  supabase: SupabaseClient<Database>,
  trainerId: string,
): Promise<{ slots: WeeklySlot[]; error: string | null }> {
  const { data, error } = await supabase
    .from("trainer_availability")
    .select("id, day_of_week, start_time, end_time")
    .eq("trainer_id", trainerId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return { slots: [], error: error.message };
  }
  return { slots: data, error: null };
}

/**
 * Exceptions FROM a given local date FORWARD only. Past exceptions are inert
 * history — nothing reads them (the slot module only expands future ranges,
 * and a trainer reviewing "why was I off last month" is not a v1 surface),
 * so the management page doesn't grow an ever-longer dead list. The caller
 * supplies fromDateLocal (today in the TRAINER's zone — "today" is
 * zone-relative, and the caller knows the trainer's timezone).
 */
export async function getExceptions(
  supabase: SupabaseClient<Database>,
  trainerId: string,
  fromDateLocal: string,
): Promise<{ exceptions: AvailabilityException[]; error: string | null }> {
  const { data, error } = await supabase
    .from("trainer_availability_exceptions")
    .select("id, exception_date, is_blocked, start_time, end_time")
    .eq("trainer_id", trainerId)
    .gte("exception_date", fromDateLocal)
    .order("exception_date", { ascending: true });

  if (error) {
    return { exceptions: [], error: error.message };
  }
  return { exceptions: data, error: null };
}
