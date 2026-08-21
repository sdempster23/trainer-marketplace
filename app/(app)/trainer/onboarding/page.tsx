import { redirect } from "next/navigation";

import { completeOnboarding } from "@/app/(trainer)/actions";
import { PageHeader } from "@/components/shared/page-header";
import {
  ListingForm,
  type ListingFormInitial,
} from "@/components/trainer/listing-form";
import { Card, CardContent } from "@/components/ui/card";
import { getOnboardingState } from "@/lib/trainer/onboarding";
import { createClient } from "@/lib/supabase/server";
import type {
  ServiceRadiusMiles,
  TrainerTimezone,
  Specialty,
} from "@/lib/validators/trainer";
import { METERS_PER_MILE } from "@/lib/validators/trainer";

/**
 * Trainer onboarding — the guard runs server-side, THEN renders the form.
 * The completion-aware guard is what makes the upsert self-heal coherent:
 *   - not signed in        → /login
 *   - not a trainer        → /account (owners can't onboard)
 *   - already complete     → /trainer/listing (nothing to do)
 *   - none | partial       → show the form (partial = finish; upsert re-runs safely)
 *
 * A `partial` re-entry PREFILLS from the saved row (investigation flag: the
 * blank form silently discarded a trainer's saved bio/radius/timezone —
 * only the ZIP genuinely can't prefill, since just the derived geo point is
 * stored) and says so honestly.
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
    .select("role, display_name")
    .eq("id", claims.sub)
    .maybeSingle();
  if (profile?.role !== "trainer") {
    redirect("/account");
  }

  const state = await getOnboardingState(supabase, claims.sub);
  if (state === "complete") {
    redirect("/trainer/listing");
  }

  // Partial = the trainers row exists (bio/radius/timezone saved) but no
  // specialties yet. Prefill what's real; never render saved work as blank.
  let initial: ListingFormInitial | undefined;
  if (state === "partial") {
    const { data: trainer } = await supabase
      .from("trainers")
      .select("bio, service_radius_meters, timezone")
      .eq("id", claims.sub)
      .maybeSingle();
    if (trainer) {
      initial = {
        displayName: profile.display_name,
        bio: trainer.bio,
        serviceRadiusMiles: trainer.service_radius_meters
          ? (Math.round(
              trainer.service_radius_meters / METERS_PER_MILE,
            ) as ServiceRadiusMiles)
          : null,
        timezone: trainer.timezone as TrainerTimezone,
        specialties: [] as Specialty[],
      };
    }
  }

  return (
    <main className="bg-muted flex-1 px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Create your trainer listing">
          This is what dog owners see when they find you. You can edit it
          later.
        </PageHeader>

        {initial ? (
          <p className="text-muted-foreground text-sm">
            Welcome back — your earlier answers are filled in below. Pick your
            specialties and re-enter your ZIP to go live.
          </p>
        ) : null}

        <Card>
          <CardContent className="pt-6">
            <ListingForm
              action={completeOnboarding}
              submitLabel="Create listing"
              pendingLabel="Creating your listing…"
              showName
              initial={initial}
            />
          </CardContent>
        </Card>

        <p className="text-muted-foreground text-sm">
          Next: add your services and hours — owners can book once those
          exist.
        </p>
      </div>
    </main>
  );
}
