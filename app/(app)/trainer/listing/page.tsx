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
import { getActiveServices } from "@/lib/trainer/services";
import {
  formatPrice,
  METERS_PER_MILE,
  SESSION_TYPE_LABELS,
  SPECIALTY_LABELS,
  TIMEZONE_LABELS,
  type Specialty,
  type TrainerTimezone,
} from "@/lib/validators/trainer";

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
    .select("role, display_name")
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

  // Failed read ≠ not onboarded (investigation bug-class fix): a transient
  // read failure previously redirected a COMPLETE trainer into the
  // onboarding form — the exact "failed read ≠ absence" discipline the
  // calendar cards are hardened with. Degrade honestly instead.
  if (trainerError || assignmentsError) {
    return (
      <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
        <p role="alert" className="text-destructive text-sm">
          Your listing couldn&apos;t be loaded. Please refresh to try again.
        </p>
      </main>
    );
  }

  // Not onboarded (none) or unfinished (partial) → send them to finish.
  if (!trainer || !assignments || assignments.length === 0) {
    redirect("/trainer/onboarding");
  }

  // Read-only services summary — same single read path as everywhere
  // (getActiveServices holds the view-spec rule); management lives at
  // /trainer/services, this page stays the confirmation card.
  const { services } = await getActiveServices(supabase, claims.sub);

  const radiusMiles = trainer.service_radius_meters
    ? Math.round(trainer.service_radius_meters / METERS_PER_MILE)
    : null;

  return (
    <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>You&apos;re listed as a trainer</CardTitle>
          <CardDescription>
            Dog owners can now find you. Here&apos;s what your listing shows.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Listed name — falls back visibly rather than rendering an empty
              headline, so a pre-name account notices and re-onboards. */}
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs font-medium">
              Listed as
            </span>
            <p className="text-sm font-medium">
              {profile.display_name ?? "No name yet — edit your listing to add one"}
            </p>
          </div>

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

          <div className="grid gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              Your services
            </span>
            {services.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No services yet —{" "}
                <Link href="/trainer/services" className="underline">
                  add your first
                </Link>
                .
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {services.map((service) => (
                  <li key={service.id}>
                    <span className="font-medium">{service.name}</span>{" "}
                    <span className="text-muted-foreground">
                      — {formatPrice(service.price_cents)} ·{" "}
                      {service.duration_minutes} min ·{" "}
                      {SESSION_TYPE_LABELS[service.session_type]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link href="/trainer/services">Manage services</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/trainer/availability">Manage availability</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/account">Back to account</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
