import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_DIRECTORY_RADIUS,
  DIRECTORY_RADIUS_MILES,
  SPECIALTIES,
  type Specialty,
} from "@/lib/validators/trainer";
import type { Database } from "@/types/supabase";

/**
 * Shared parse for the directory URL and the Search form. Invalid values
 * NORMALIZE silently (drop the junk, keep the search working) — the ZIP
 * is the exception, and that signal lives at the call site (unresolvable
 * ZIP → inline error, no search event).
 */
export function parseDirectorySearch(input: {
  zip?: unknown;
  radius?: unknown;
  specialties?: unknown;
}): { zip: string; radiusMiles: number; specialties: Specialty[] } {
  const zipRaw = Array.isArray(input.zip) ? input.zip[0] : input.zip;
  const zip = typeof zipRaw === "string" ? zipRaw.trim() : "";

  const radiusRaw = Array.isArray(input.radius)
    ? input.radius[0]
    : input.radius;
  const radiusNumber = Number(
    typeof radiusRaw === "string" || typeof radiusRaw === "number"
      ? radiusRaw
      : "",
  );
  const radiusMiles = (
    DIRECTORY_RADIUS_MILES as readonly number[]
  ).includes(radiusNumber)
    ? radiusNumber
    : DEFAULT_DIRECTORY_RADIUS;

  const specialtyList = (
    input.specialties === undefined
      ? []
      : Array.isArray(input.specialties)
        ? input.specialties
        : [input.specialties]
  ).filter(
    (s): s is Specialty =>
      typeof s === "string" && (SPECIALTIES as readonly string[]).includes(s),
  );

  return { zip, radiusMiles, specialties: specialtyList };
}

export function directorySearchQuery({
  zip,
  radiusMiles,
  specialties,
}: {
  zip: string;
  radiusMiles: number;
  specialties: Specialty[];
}): string {
  const params = new URLSearchParams();
  if (zip) {
    params.set("zip", zip);
    params.set("radius", String(radiusMiles));
  }
  for (const sp of specialties) params.append("specialties", sp);
  return params.toString();
}

/**
 * The proximity query both the directory page and the search-event action
 * run — listable floor (named) chained onto nearby_trainers, optional
 * specialty overlaps. Shared so result_count cannot drift from the cards.
 */
export function nearbyTrainersQuery(
  supabase: SupabaseClient<Database>,
  {
    lat,
    lng,
    radiusMiles,
    specialties,
  }: {
    lat: number;
    lng: number;
    radiusMiles: number;
    specialties: Specialty[];
  },
) {
  let query = supabase
    .rpc("nearby_trainers", {
      search_lat: lat,
      search_lng: lng,
      radius_miles: radiusMiles,
    })
    .not("display_name", "is", null);
  if (specialties.length > 0) {
    query = query.overlaps("specialties", specialties);
  }
  return query;
}
