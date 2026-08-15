import Link from "next/link";
import { lookup } from "zipcodes";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/shared/site-footer";

import { DirectoryFilters } from "@/components/trainer/directory-filters";
import {
  TrainerCard,
  type TrainerCardData,
} from "@/components/trainer/trainer-card";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_DIRECTORY_RADIUS,
  DIRECTORY_RADIUS_MILES,
  SPECIALTIES,
  type Specialty,
} from "@/lib/validators/trainer";

export const metadata = {
  title: "Find a dog trainer — PawMatch",
  description:
    "Browse dog trainers by specialty, or search near your ZIP code.",
};

/**
 * The trainer directory — the marketplace's front door. PUBLIC on purpose:
 * no auth guard, no redirect; everything it reads is anon-readable by design
 * (M3/M7 public-read RLS, M10's nearby_trainers RPC — verified as anon in the
 * pre-build investigation). This is the one route that must never bounce a
 * logged-out visitor to /login.
 *
 * Two read modes, chosen by the URL (GET-form semantics — searches are
 * shareable and bookmarkable):
 *   BROWSE     (no zip): PostgREST over trainers + profiles + assignments,
 *               newest first — deterministic and honest before location enters.
 *   PROXIMITY  (zip present): server-side zipcodes lookup → nearby_trainers
 *               RPC, nearest first, with a distance badge per card.
 *
 * THE LISTABLE FLOOR — applied uniformly at the QUERY layer in both modes:
 * listable = display_name IS NOT NULL AND service_point IS NOT NULL. Browse
 * states both predicates explicitly; proximity chains the name predicate onto
 * the RPC (whose WHERE already excludes NULL locations). Rows failing the
 * floor (a nameless or location-less trainer) never reach the page.
 * PARTIAL trainers (named + located, zero specialties — a WRITE-2 failure
 * state) PASS the floor deliberately: a no-pills card is honest, they stay
 * findable mid-onboarding, and the /account CTA self-heals them. Chosen, not
 * overlooked.
 *
 * NO PAGINATION this group (the population is a dozen trainers). Forward item:
 * browse mode paginates with .range(); proximity mode needs limit/offset
 * params ON THE RPC — an M11 item alongside the service_role EXECUTE grants.
 */

type SearchParams = Record<string, string | string[] | undefined>;

/** First value wins when a param repeats — except specialties, which is
 * legitimately repeated (one checkbox each). */
const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

const toArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * URL params are a user-editable boundary, but unlike a form POST they arrive
 * from shared/bookmarked/hand-edited links — so invalid values NORMALIZE
 * silently (drop the junk, keep the search working) rather than erroring.
 * The one exception is the ZIP, where "you typed something unresolvable" is
 * the user's signal to fix it — that renders an inline message instead.
 */
function parseSearch(params: SearchParams) {
  const zip = first(params.zip);

  const radiusRaw = Number(first(params.radius));
  const radiusMiles = (
    DIRECTORY_RADIUS_MILES as readonly number[]
  ).includes(radiusRaw)
    ? radiusRaw
    : DEFAULT_DIRECTORY_RADIUS;

  const specialties = toArray(params.specialties).filter(
    (s): s is Specialty => (SPECIALTIES as readonly string[]).includes(s),
  );

  return { zip, radiusMiles, specialties };
}

/** The browse-mode row shape both select variants share (the filtered variant
 * carries an extra `match` embed the mapper ignores). */
type BrowseRow = {
  id: string;
  bio: string | null;
  service_radius_meters: number | null;
  profiles: { display_name: string | null };
  pills: { specialty: Specialty }[];
};

export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { zip, radiusMiles, specialties } = parseSearch(await searchParams);
  const supabase = await createClient();

  const isProximity = zip !== "";
  let trainers: TrainerCardData[] = [];
  let zipInvalid = false;

  if (isProximity) {
    // Resolve the ZIP server-side (the same local-lookup seam onboarding
    // uses — no external call). Format junk and unknown ZIPs take the same
    // inline-message path: either way the user must fix the ZIP.
    const place = /^\d{5}$/.test(zip) ? lookup(zip) : undefined;
    if (!place) {
      zipInvalid = true;
    } else {
      // TYPES CAVEAT (load-bearing): the generated Functions return type marks
      // display_name (and friends) NON-NULLABLE, which is only true BECAUSE of
      // the floor chained below — the RPC itself can return a NULL name. Never
      // call this RPC unfloored and trust the generated type.
      let query = supabase
        .rpc("nearby_trainers", {
          search_lat: place.latitude,
          search_lng: place.longitude,
          radius_miles: radiusMiles,
        })
        .not("display_name", "is", null);
      if (specialties.length > 0) {
        // OR-semantics (contains-ANY, PostgREST `ov`) — see DirectoryFilters.
        query = query.overlaps("specialties", specialties);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`Trainer search failed: ${error.message}`);
      }
      // RPC rows arrive nearest-first (ORDER BY inside the function) and the
      // chained filters preserve that order — no re-sort here.
      trainers = data.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        bio: row.bio,
        specialties: row.specialties,
        serviceRadiusMeters: row.service_radius_meters,
        distanceMeters: row.distance_meters,
      }));
    }
  } else {
    // BROWSE. Two constructions because the specialty filter needs an ALIASED
    // second embed: `match` (inner) filters the parent rows, while `pills`
    // stays unfiltered so cards show a trainer's FULL specialty list — a
    // single filtered embed would narrow the visible pills to the ones
    // searched for (the PostgREST embedded-filter gotcha, probed pre-build).
    // Always-embedding `match` is not an option either: !inner would drop
    // trainers with zero assignments from the unfiltered browse.
    // The select strings are spelled out twice (not built from a shared
    // constant): supabase-js infers row types from the LITERAL select string,
    // and concatenating fragments degrades it to `string`, killing inference.
    // Shared pieces of both variants: the listable floor (both predicates
    // explicit), newest-first ordering, and pills in canonical enum order
    // (enum columns sort by ordinal) so cards match the RPC's array_agg
    // ordering across modes.
    let rows: BrowseRow[];
    if (specialties.length > 0) {
      const { data, error } = await supabase
        .from("trainers")
        .select(
          "id, bio, service_radius_meters, profiles!inner(display_name), pills:trainer_specialty_assignments(specialty), match:trainer_specialty_assignments!inner(specialty)",
        )
        // OR-semantics — any selected specialty qualifies (see above).
        .in("match.specialty", specialties)
        .not("profiles.display_name", "is", null)
        .not("service_point", "is", null)
        .order("created_at", { ascending: false })
        .order("specialty", { referencedTable: "pills", ascending: true });
      if (error) {
        throw new Error(`Trainer directory failed to load: ${error.message}`);
      }
      rows = data;
    } else {
      const { data, error } = await supabase
        .from("trainers")
        .select(
          "id, bio, service_radius_meters, profiles!inner(display_name), pills:trainer_specialty_assignments(specialty)",
        )
        .not("profiles.display_name", "is", null)
        .not("service_point", "is", null)
        .order("created_at", { ascending: false })
        .order("specialty", { referencedTable: "pills", ascending: true });
      if (error) {
        throw new Error(`Trainer directory failed to load: ${error.message}`);
      }
      rows = data;
    }
    // flatMap narrows the nullable table type — the in-query floor already
    // guarantees a name, so this drops nothing; it just proves it to TS
    // without an assertion.
    trainers = rows.flatMap((row) =>
      row.profiles.display_name === null
        ? []
        : [
            {
              id: row.id,
              displayName: row.profiles.display_name,
              bio: row.bio,
              specialties: row.pills.map((p) => p.specialty),
              serviceRadiusMeters: row.service_radius_meters,
            },
          ],
    );
  }

  return (
    <>
    <main className="bg-muted min-h-screen px-6 py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title="Find a dog trainer">
            Browse everyone, filter by specialty, or search near a ZIP code.
        </PageHeader>

        <DirectoryFilters
          zip={zip}
          radiusMiles={radiusMiles}
          specialties={specialties}
        />

        {zipInvalid ? (
          <p role="alert" className="text-destructive text-sm">
            We couldn&apos;t find that ZIP — please check it and search again.
          </p>
        ) : trainers.length === 0 ? (
          isProximity || specialties.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              {isProximity
                ? `No trainers within ${radiusMiles} miles of ${zip}${
                    specialties.length > 0 ? " matching those specialties" : ""
                  } — try widening the radius.`
                : "No trainers match those specialties yet — try removing one."}
            </p>
          ) : (
            /* The launch-day state, re-drafted from the gate's cold dead
               end ("check back soon"). Action is OUTLINE, not amber — the
               view's one amber is Search (map ruling). */
            <EmptyState
              title="No trainers listed yet"
              action={
                <Button asChild variant="outline">
                  <Link href="/sign-up">Join as a trainer</Link>
                </Button>
              }
            >
              PawMatch is just opening its doors — if you train dogs, owners
              will find you here.
            </EmptyState>
          )
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {trainers.length}{" "}
              {trainers.length === 1 ? "trainer" : "trainers"}
              {isProximity
                ? ` within ${radiusMiles} miles of ${zip}, nearest first`
                : ", newest first"}
            </p>
            <div className="flex flex-col gap-4">
              {trainers.map((trainer) => (
                <TrainerCard key={trainer.id} trainer={trainer} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
    <SiteFooter />
    </>
  );
}
