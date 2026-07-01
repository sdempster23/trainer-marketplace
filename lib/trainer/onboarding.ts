import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/**
 * A trainer's onboarding progress. This is the shared truth the completion-aware
 * guard and the onboarding flow both key off:
 *   - none     → no trainers row yet (show the create form)
 *   - partial  → trainers row exists but 0 specialties (let them FINISH — this
 *                is the self-heal for a write-2 failure under the upsert path)
 *   - complete → trainers row + ≥1 specialty (they're listable; redirect away)
 *
 * Defined here (a plain server util, NOT a "use server" module) because it takes
 * a non-serializable SupabaseClient — it can't be a Server Action. The onboarding
 * action and the Group-2 guard both import it, so "what's their state" lives in
 * exactly one place.
 */
export type OnboardingState = "none" | "partial" | "complete";

export async function getOnboardingState(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<OnboardingState> {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!trainer) {
    return "none";
  }

  // head + exact count: asks Postgres for the count only, no rows transferred.
  const { count } = await supabase
    .from("trainer_specialty_assignments")
    .select("*", { count: "exact", head: true })
    .eq("trainer_id", userId);

  return (count ?? 0) > 0 ? "complete" : "partial";
}
