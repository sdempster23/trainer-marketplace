import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { geistMono } from "@/lib/fonts";
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
      <main className="bg-muted flex-1 px-6 py-12">
        <div className="mx-auto w-full max-w-2xl">
          <ErrorState>
            Your listing couldn&apos;t be loaded. Please refresh to try again.
          </ErrorState>
        </div>
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
    <main className={`bg-muted flex-1 px-6 py-12 ${geistMono.variable}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Your listing">
          Dog owners can find you — this is what they see.
        </PageHeader>

        <Card>
          <CardHeader>
            <CardTitle>What your listing shows</CardTitle>
            <CardDescription>
              Everything here shapes your public listing.
            </CardDescription>
          </CardHeader>
          {/* ONE data idiom (the investigation found three in this card):
              muted label over value, straight down the column. */}
          <CardContent className="flex flex-col gap-6">
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs font-medium">
                Listed as
              </span>
              <p className="text-sm font-medium">
                {profile.display_name ?? (
                  <span className="text-muted-foreground font-normal">
                    No name yet —{" "}
                    <Link href="/account" className="underline">
                      set it in your account
                    </Link>
                    .
                  </span>
                )}
              </p>
            </div>

            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs font-medium">
                About
              </span>
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

            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs font-medium">
                Service radius
              </span>
              <p className="text-sm">
                {radiusMiles !== null ? `${radiusMiles} miles` : "Not set"}
              </p>
            </div>

            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs font-medium">
                Timezone
              </span>
              <p className="text-sm">
                {TIMEZONE_LABELS[trainer.timezone as TrainerTimezone]}
              </p>
            </div>

            <div className="grid gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                Your services
              </span>
              {services.length === 0 ? (
                <EmptyState compact>
                  No services yet —{" "}
                  <Link href="/trainer/services" className="underline">
                    add your first
                  </Link>
                  .
                </EmptyState>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {services.map((service) => (
                    <li key={service.id}>
                      <span className="font-medium">{service.name}</span>{" "}
                      <span className="text-muted-foreground font-mono text-xs">
                        {formatPrice(service.price_cents)} ·{" "}
                        {service.duration_minutes} min ·{" "}
                        {SESSION_TYPE_LABELS[service.session_type]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* The page finally has an answer to "what do I do next": edit is
            the view's amber (flow ruling #1 made it exist); preview shows
            her exactly what an owner sees. */}
        <div className="flex flex-col gap-2">
          <Button asChild variant="action" className="w-full">
            <Link href="/trainer/listing/edit">Edit listing</Link>
          </Button>
          {/* The listable floor requires a display name — never offer a
              preview the page knows will 404 (review finding). */}
          {profile.display_name ? (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/trainers/${claims.sub}`}>
                Preview your public profile
              </Link>
            </Button>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild variant="outline" className="w-full">
              <Link href="/trainer/services">Manage services</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/trainer/availability">Manage availability</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
