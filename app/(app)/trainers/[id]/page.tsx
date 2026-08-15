import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MessageButton } from "@/components/messages/message-button";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { geistMono } from "@/lib/fonts";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import { getActiveServices } from "@/lib/trainer/services";
import { dbIdSchema } from "@/lib/validators/id";
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
 * The booking entry is ONE sticky Book bar (interior-polish map ruling —
 * never per-service links); the book page's service select handles choice,
 * defaulting to the first service when no ?service= param arrives.
 */

// The z.guid()-not-z.uuid() argument lives with the shared schema.
const uuidSchema = dbIdSchema();

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

/**
 * Pre-booking contact (the messaging arc's ruling 1): OWNERS get a Message
 * button — the M8 freestanding-thread contract makes an unbooked inquiry
 * legal, and M13 makes the inquirer's name visible to the trainer. NO
 * redirect anywhere in this probe — the page stays public (the front-door
 * rule); logged-out visitors get a login link instead, and a trainer or
 * admin viewing gets neither (they cannot be the owner side of a thread —
 * the DEFINER gate would reject the insert anyway). A failed role read is
 * LOGGED and degrades to no-button (the getUnreadThreadCount contract:
 * a probe failure must never break the page it decorates).
 */
async function getViewer(
  supabase: SupabaseClient<Database>,
): Promise<{ isLoggedIn: boolean; isOwner: boolean }> {
  const { data } = await supabase.auth.getClaims();
  const viewerId = data?.claims?.sub;
  if (!viewerId) {
    return { isLoggedIn: false, isOwner: false };
  }
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", viewerId)
    .maybeSingle();
  if (error) {
    console.error("[MESSAGES] viewer role probe failed:", error.message);
  }
  return { isLoggedIn: true, isOwner: profile?.role === "owner" };
}

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

  // One client for the render's remaining reads, run CONCURRENTLY — the
  // services read (the single read path; the deleted_at IS NULL view-spec
  // rides free) and the viewer probe are independent, and this is the
  // directory's click-through, the hottest public page: no stacked awaits.
  const supabase = await createClient();
  const [{ services, error: servicesError }, viewer] = await Promise.all([
    getActiveServices(supabase, id),
    getViewer(supabase),
  ]);

  const radiusMiles =
    trainer.service_radius_meters !== null
      ? Math.round(trainer.service_radius_meters / METERS_PER_MILE)
      : null;

  return (
    <main className={`bg-muted flex-1 px-6 py-12 ${geistMono.variable}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
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
          {viewer.isOwner ? (
            <div className="mt-1">
              <MessageButton counterpartyId={trainer.id} />
            </div>
          ) : !viewer.isLoggedIn ? (
            <div className="mt-1">
              <Button asChild variant="outline" size="sm">
                {/* ?next= brings them back here post-login (validated as a
                    same-origin path by the signIn action). */}
                <Link
                  href={`/login?next=${encodeURIComponent(`/trainers/${trainer.id}`)}`}
                >
                  Log in to message
                </Link>
              </Button>
            </div>
          ) : null}
        </header>

        {trainer.bio ? (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight">About</h2>
            <p className="text-sm whitespace-pre-line">{trainer.bio}</p>
          </section>
        ) : null}

        {trainer.pills.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight">
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
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Services
          </h2>
          {servicesError ? (
            // Failed read ≠ "No services listed yet." (bug-class fix):
            // never present a read failure as a fact about the trainer.
            <ErrorState>
              Services couldn&apos;t be loaded. Please refresh to try again.
            </ErrorState>
          ) : services.length === 0 ? (
            <EmptyState>No services listed yet.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {services.map((service) => (
                <li
                  key={service.id}
                  className="bg-card border-border flex flex-col gap-1 rounded-lg border p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{service.name}</span>
                    <span className="shrink-0 font-mono text-sm font-medium">
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
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* THE Book affordance (map ruling: ONE sticky button, never
          per-service). sticky-in-flow, not fixed — on a page too short to
          scroll it sits after the content and cannot cover anything (the
          390 watch item, satisfied by construction). Owners book; a
          logged-out visitor goes through login and lands back on the book
          page; trainers (including self-preview) get no bar. */}
      {viewer.isOwner || !viewer.isLoggedIn ? (
        <div className="bg-background/95 border-border sticky bottom-0 -mx-6 border-t px-6 py-3 backdrop-blur">
          <div className="mx-auto w-full max-w-2xl">
            <Button asChild variant="action" size="lg" className="w-full">
              <Link
                href={
                  viewer.isOwner
                    ? `/trainers/${trainer.id}/book`
                    : `/login?next=${encodeURIComponent(`/trainers/${trainer.id}/book`)}`
                }
              >
                Book a session
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
