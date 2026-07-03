import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/**
 * A trainer's ACTIVE services — THE one read path for both surfaces (the
 * /trainer/services management page and the public /trainers/[id] detail
 * page render the same fields; the caller's client supplies the privileges).
 *
 * ONE function, deliberately, because of the access-floor catch from the
 * pre-build investigation: the two SELECT policies on trainer_services are
 * OR'd, and the owner's "see all their own" policy has NO deleted_at filter —
 * so an authenticated trainer reading their own services (management page,
 * or viewing their own public detail page) would see soft-deleted rows
 * resurface if a query site forgot the filter. RLS is the access floor, not
 * the view spec: the explicit `deleted_at IS NULL` below is the view spec,
 * and keeping every services read on this helper means there is exactly one
 * place to forget it — this one, which doesn't.
 *
 * Ordered by created_at ASC: insertion order = the trainer's authoring order,
 * the only stable, meaningful ordering the table offers.
 */
export type ActiveService = {
  id: string;
  name: string;
  description: string | null;
  session_type: Database["public"]["Enums"]["session_type"];
  price_cents: number;
  duration_minutes: number;
};

export async function getActiveServices(
  supabase: SupabaseClient<Database>,
  trainerId: string,
): Promise<{ services: ActiveService[]; error: string | null }> {
  const { data, error } = await supabase
    .from("trainer_services")
    .select("id, name, description, session_type, price_cents, duration_minutes")
    .eq("trainer_id", trainerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return { services: [], error: error.message };
  }
  return { services: data, error: null };
}
