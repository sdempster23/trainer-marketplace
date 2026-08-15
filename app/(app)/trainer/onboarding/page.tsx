import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/trainer/onboarding-form";
import { getOnboardingState } from "@/lib/trainer/onboarding";
import { createClient } from "@/lib/supabase/server";

/**
 * Trainer onboarding — the guard runs server-side, THEN renders the client form.
 * The completion-aware guard is what makes the upsert self-heal coherent:
 *   - not signed in        → /login
 *   - not a trainer        → /account (owners can't onboard)
 *   - already complete     → /trainer/listing (nothing to do)
 *   - none | partial       → show the form (partial = finish; upsert re-runs safely)
 *
 * Note: a `partial` re-entry shows a BLANK form — we don't persist the ZIP
 * (only the derived geo point), so the ZIP field can't be prefilled. Rare case;
 * a full re-submit is safe via the upserts.
 */
export default async function TrainerOnboardingPage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();
  if (profile?.role !== "trainer") {
    redirect("/account");
  }

  const state = await getOnboardingState(supabase, claims.sub);
  if (state === "complete") {
    redirect("/trainer/listing");
  }

  return <OnboardingForm />;
}
