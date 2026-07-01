import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  SPECIALTY_LABELS,
  TIMEZONE_LABELS,
  type Specialty,
  type TrainerTimezone,
} from "@/lib/validators/trainer";

const METERS_PER_MILE = 1609.344;

/**
 * Post-onboarding landing — confirms what's PERSISTED (Flag C: no city/state,
 * only the geo point + radius + timezone + bio + specialties). Guarded like any
 * trainer route; fetches the row + specialties and derives onboarding state
 * inline (it needs the data anyway, so no separate getOnboardingState call):
 *   - no trainer row (none) or 0 specialties (partial) → back to onboarding
 *   - complete → render the confirmation
 */
export default async function TrainerListingPage() {
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

  const { data: trainer } = await supabase
    .from("trainers")
    .select("bio, service_radius_meters, timezone")
    .eq("id", claims.sub)
    .maybeSingle();
  const { data: assignments } = await supabase
    .from("trainer_specialty_assignments")
    .select("specialty")
    .eq("trainer_id", claims.sub);

  // Not onboarded (none) or unfinished (partial) → send them to finish.
  if (!trainer || !assignments || assignments.length === 0) {
    redirect("/trainer/onboarding");
  }

  const radiusMiles = trainer.service_radius_meters
    ? Math.round(trainer.service_radius_meters / METERS_PER_MILE)
    : null;

  return (
    <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">You&apos;re listed as a trainer</CardTitle>
          <CardDescription>
            Dog owners can now find you. Here&apos;s what your listing shows.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs font-medium">About</span>
            <p className="text-sm whitespace-pre-line">{trainer.bio}</p>
          </div>

          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs font-medium">
              Specialties
            </span>
            <div className="flex flex-wrap gap-2">
              {assignments.map(({ specialty }) => (
                <span
                  key={specialty}
                  className="bg-accent text-accent-foreground inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                >
                  {SPECIALTY_LABELS[specialty as Specialty]}
                </span>
              ))}
            </div>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Service radius</dt>
            <dd>{radiusMiles !== null ? `${radiusMiles} miles` : "—"}</dd>
            <dt className="text-muted-foreground">Timezone</dt>
            <dd>{TIMEZONE_LABELS[trainer.timezone as TrainerTimezone]}</dd>
          </dl>

          <Button asChild variant="outline" className="w-full">
            <Link href="/account">Back to account</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
