import type { SupabaseClient } from "@supabase/supabase-js";
import { isCountry, postalArea, type Country } from "@/lib/location/countries";

import {
  DEFAULT_DIRECTORY_RADIUS,
  DIRECTORY_RADIUS_MILES,
  METERS_PER_MILE,
  SPECIALTIES,
  type Specialty,
} from "@/lib/validators/trainer";
import type { Database } from "@/types/supabase";

/**
 * Shared parse for the directory URL and the Search form. Invalid values
 * NORMALIZE silently (drop the junk, keep the search working) — location
 * is the exception, and that signal lives at the call site (unresolvable
 * postal area → inline error, no search event).
 */
export function parseDirectorySearch(input: {
  country?: unknown;
  zip?: unknown;
  radius?: unknown;
  specialties?: unknown;
}): { country: Country; zip: string; radiusMiles: number; specialties: Specialty[] } {
  const countryRaw = Array.isArray(input.country) ? input.country[0] : input.country;
  const countryCode = typeof countryRaw === "string" ? countryRaw.trim().toUpperCase() : countryRaw;
  const country = isCountry(countryCode) ? countryCode : "US";
  const zipRaw = Array.isArray(input.zip) ? input.zip[0] : input.zip;
  const location = typeof zipRaw === "string" ? zipRaw.trim().toUpperCase() : "";
  // Only validated full input can become a coarse public area. Keep invalid
  // input intact so the page reports it instead of searching a valid prefix.
  const zip = postalArea(location, country) ?? location;

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

  return { country, zip, radiusMiles, specialties: specialtyList };
}

export function directorySearchQuery({
  country,
  zip,
  radiusMiles,
  specialties,
}: {
  country: Country;
  zip: string;
  radiusMiles: number;
  specialties: Specialty[];
}): string {
  const params = new URLSearchParams();
  // Existing US bookmarks keep their exact shape; other countries must
  // remain explicit even when the owner is browsing without a location.
  if (country !== "US") params.set("country", country);
  if (zip) {
    params.set("zip", zip);
    params.set("radius", String(radiusMiles));
  }
  for (const sp of specialties) params.append("specialties", sp);
  return params.toString();
}

/**
 * The proximity query both the directory page and the search-event action
 * run — listable floor (named) chained onto nearby_trainers_v2, optional
 * specialty overlaps. Shared so result_count cannot drift from the cards.
 */
export function nearbyTrainersQuery(
  supabase: SupabaseClient<Database>,
  {
    country,
    lat,
    lng,
    radiusMiles,
    specialties,
  }: {
    country: Country;
    lat: number;
    lng: number;
    radiusMiles: number;
    specialties: Specialty[];
  },
) {
  let query = supabase
    .rpc("nearby_trainers_v2", {
      search_country: country,
      search_lat: lat,
      search_lng: lng,
      radius_meters: Math.round(radiusMiles * METERS_PER_MILE),
    })
    .not("display_name", "is", null);
  if (specialties.length > 0) {
    query = query.overlaps("specialties", specialties);
  }
  return query;
}
