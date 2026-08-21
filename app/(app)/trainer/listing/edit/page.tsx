import { redirect } from "next/navigation";

import { updateTrainerListing } from "@/app/(trainer)/actions";
import { PageHeader } from "@/components/shared/page-header";
import { ListingForm } from "@/components/trainer/listing-form";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/supabase/server";
import {
  METERS_PER_MILE,
  type ServiceRadiusMiles,
  type Specialty,
  type TrainerTimezone,
} from "@/lib/validators/trainer";

export const metadata = { title: "Edit your listing — PawMatch" };

/**
 * Listing edit (flow ruling #1) — the page that makes onboarding's
 * "You can edit it later." true: bio, specialties, radius, and timezone
 * are all reachable here after onboarding. The display name is edited on
 * /account (one field, one home); ZIP is optional — blank keeps the
 * current service area.
 */
export default async function EditListingPage() {
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

  const { data: trainer, error: trainerError } = await supabase
    .from("trainers")
    .select("bio, service_radius_meters, timezone")
    .eq("id", claims.sub)
    .maybeSingle();
  const { data: assignments, error: assignmentsError } = await supabase
    .from("trainer_specialty_assignments")
    .select("specialty")
    .eq("trainer_id", claims.sub);

  // Failed read ≠ not onboarded — same discipline as the listing page.
  if (trainerError || assignmentsError) {
    return (
      <main className="bg-muted flex-1 px-6 py-12">
        <div className="mx-auto w-full max-w-2xl">
          <ErrorState>
            Your listing couldn&apos;t be loaded. Please refresh to try again.
          </ErrorState>
        </div>
      </main>
    );
  }
  if (!trainer) {
    redirect("/trainer/onboarding");
  }

  return (
    <main className="bg-muted flex-1 px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Edit your listing">
          Changes go live as soon as you save. Your name is edited from your
          account page.
        </PageHeader>

        <Card>
          <CardContent className="pt-6">
            <ListingForm
              action={updateTrainerListing}
              submitLabel="Save changes"
              pendingLabel="Saving…"
              zipOptional
              initial={{
                bio: trainer.bio,
                specialties: (assignments ?? []).map(
                  (a) => a.specialty as Specialty,
                ),
                serviceRadiusMiles: trainer.service_radius_meters
                  ? (Math.round(
                      trainer.service_radius_meters / METERS_PER_MILE,
                    ) as ServiceRadiusMiles)
                  : null,
                timezone: trainer.timezone as TrainerTimezone,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
