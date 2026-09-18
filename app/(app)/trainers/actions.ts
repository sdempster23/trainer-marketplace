"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { resolvePostalArea } from "@/lib/location/postal";
import { METERS_PER_MILE } from "@/lib/validators/trainer";

import { emitAnalyticsEvent } from "@/lib/analytics/events";
import { isNashvilleBeachhead } from "@/lib/analytics/nashville";
import {
  directorySearchQuery,
  nearbyTrainersQuery,
  parseDirectorySearch,
} from "@/lib/trainers/directory-search";
import { createClient } from "@/lib/supabase/server";

/**
 * The Search button's trusted path. GET /trainers?zip=… is a shareable
 * pageview and must NOT emit — only this POST (the user clicked Search
 * and the postal area resolved) is a search event.
 *
 * Invalid / empty location: redirect to the same URL the GET form used to
 * build so the page can show its existing inline error / browse mode.
 * A failed RPC skips the event (we will not invent a result_count) and
 * still redirects — the page will surface the failure on render.
 */
export async function recordTrainerSearch(formData: FormData): Promise<void> {
  const parsed = parseDirectorySearch({
    country: formData.get("country"),
    zip: formData.get("zip"),
    radius: formData.get("radius"),
    specialties: formData.getAll("specialties"),
  });
  const qs = directorySearchQuery(parsed);
  const dest = qs ? `/trainers?${qs}` : "/trainers";

  if (parsed.zip) {
    const place = await resolvePostalArea(parsed.country, parsed.zip);
    if (place) {
      const supabase = await createClient();
      const { data, error } = await nearbyTrainersQuery(supabase, {
        country: parsed.country,
        lat: place.latitude,
        lng: place.longitude,
        radiusMiles: parsed.radiusMiles,
        specialties: parsed.specialties,
      });
      if (!error && data) {
        const { data: claimsData } = await supabase.auth.getClaims();
        const userId = claimsData?.claims?.sub ?? null;
        after(() =>
          emitAnalyticsEvent({
            eventName: "search",
            userId,
            props: {
              country: parsed.country,
              postal_area: place.postalArea,
              radius_meters: Math.round(parsed.radiusMiles * METERS_PER_MILE),
              ...(parsed.country === "US" ? { zip: place.postalArea } : {}),
              radius: parsed.radiusMiles,
              specialties: parsed.specialties,
              result_count: data.length,
              beachhead_nashville: parsed.country === "US" && isNashvilleBeachhead(place.postalArea),
            },
          }),
        );
      }
    }
  }

  redirect(dest);
}
