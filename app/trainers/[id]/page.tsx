import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getActiveServices } from "@/lib/trainer/services";
import {
  formatPrice,
  METERS_PER_MILE,
  SESSION_TYPE_LABELS,
  SPECIALTY_LABELS,
} from "@/lib/validators/trainer";

/**
 * Trainer detail — the directory cards' click-through. PUBLIC on purpose:
 * no auth guard, no redirect; everything rendered is anon-readable (M3/M7
 * public-read RLS + the services public-read policy). Same front-door rule
 * as /trainers: this page must never bounce a logged-out visitor to /login.
 *
 * THE LISTABLE FLOOR applies to direct URLs exactly as it does to cards —
 * display_name IS NOT NULL AND service_point IS NOT NULL, in-query. If the
 * directory hides you, a guessable URL doesn't un-hide you: a floored-out id
 * (nameless/locationless trainer) and a nonexistent id are the same 404.
 * Partial trainers (no specialties, no services) render honestly, same as
 * the directory decision.
 *
 * Each service links to /trainers/[id]/book?service=… — the booking flow's
 * entry (the informational-only forward item died with Arc C).
 */

// z.guid(), NOT z.uuid(): zod's uuid() enforces RFC-4122 version/variant
// bits, but the gate's job is to match what the Postgres uuid COLUMN accepts
// (any 8-4-4-4-12 hex) — the seed's readable anchors (5eed0001-…) are valid
// column values with a "version 0", and z.uuid() would 404 every seed
// trainer at the gate instead of letting the floor judge them.
const uuidSchema = z.guid();

/**
 * React cache() so generateMetadata and the page render share ONE fetch per
 * request (supabase-js calls don't dedupe the way fetch() does). The select
 * string stays literal — supabase-js infers row types from it.
 */
const getListableTrainer = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trainers")
    .select(
      "id, bio, years_experience, service_radius_meters, profiles!inner(display_name), pills:trainer_specialty_assignments(specialty)",
    )
    .eq("id", id)
    // The listable floor, both predicates explicit (see header).
    .not("profiles.display_name", "is", null)
    .not("service_point", "is", null)
    // Pills in canonical enum order, matching the directory cards.
    .order("specialty", { referencedTable: "pills", ascending: true })
    .maybeSingle();
  return data;
});

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return {}; // the render will 404; default metadata is fine for junk URLs
  }
  const trainer = await getListableTrainer(id);
  if (!trainer || trainer.profiles.display_name === null) {
    return {};
  }
  return {
    title: `${trainer.profiles.display_name} — PawMatch`,
    description: trainer.bio ?? undefined,
  };
}

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;

  // Malformed uuid → 404 BEFORE any query: junk URLs cost zero DB round-trips
  // (and PostgREST would error on a non-uuid eq value anyway).
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const trainer = await getListableTrainer(id);
  // null covers both "no such trainer" and "floored out" — deliberately the
  // same 404 (see header). The display_name null-check narrows the type; the
  // in-query floor already guarantees it.
  if (!trainer || trainer.profiles.display_name === null) {
    notFound();
  }

  // The single services read path — the deleted_at IS NULL view-spec rides
  // free (this page is exactly the one the access-floor catch was about:
  // a trainer viewing their OWN detail page while logged in).
  const { services } = await getActiveServices(await createClient(), id);

  const radiusMiles =
    trainer.service_radius_meters !== null
      ? Math.round(trainer.service_radius_meters / METERS_PER_MILE)
      : null;

  return (
    <main className="bg-muted min-h-screen px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">
            {trainer.profiles.display_name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {trainer.years_experience !== null
              ? `${trainer.years_experience} years experience`
              : null}
            {trainer.years_experience !== null && radiusMiles !== null
              ? " · "
              : null}
            {radiusMiles !== null ? `Travels up to ${radiusMiles} miles` : null}
          </p>
        </header>

        {trainer.bio ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-medium">About</h2>
            <p className="text-sm whitespace-pre-line">{trainer.bio}</p>
          </section>
        ) : null}

        {trainer.pills.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-medium">
              Specialties
            </h2>
            <div className="flex flex-wrap gap-2">
              {trainer.pills.map(({ specialty }) => (
                <span
                  key={specialty}
                  className="bg-accent text-accent-foreground inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                >
                  {SPECIALTY_LABELS[specialty]}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium">
            Services
          </h2>
          {services.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No services listed yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {services.map((service) => (
                <li
                  key={service.id}
                  className="bg-card border-border flex flex-col gap-1 rounded-lg border p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{service.name}</span>
                    <span className="shrink-0 font-medium">
                      {formatPrice(service.price_cents)}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {service.duration_minutes} min ·{" "}
                    {SESSION_TYPE_LABELS[service.session_type]}
                  </span>
                  {service.description ? (
                    <p className="text-muted-foreground text-sm">
                      {service.description}
                    </p>
                  ) : null}
                  <Link
                    href={`/trainers/${trainer.id}/book?service=${service.id}`}
                    className="text-primary mt-1 text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Book this service
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
