import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/**
 * An owner's ACTIVE dogs — THE one read path (the services-arc precedent).
 *
 * Access-floor rule: the owner's own-rows SELECT policy is a bare
 * `auth.uid() = owner_id` with NO deleted_at filter (verified live — same
 * shape as trainer_services), so an unfiltered read would resurface
 * soft-deleted dogs to their own owner. RLS is the access floor, not the
 * view spec: the explicit `deleted_at IS NULL` below is the view spec, and
 * every dogs read goes through this helper so there is exactly one place to
 * forget it — which doesn't.
 *
 * Ordered created_at ASC — the owner's authoring order.
 */
export type ActiveDog = {
  id: string;
  name: string;
  breed: string | null;
  date_of_birth: string | null;
  temperament_notes: string | null;
  photo_url: string | null;
};

export async function getActiveDogs(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<{ dogs: ActiveDog[]; error: string | null }> {
  const { data, error } = await supabase
    .from("dogs")
    .select("id, name, breed, date_of_birth, temperament_notes, photo_url")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return { dogs: [], error: error.message };
  }
  return { dogs: data, error: null };
}
