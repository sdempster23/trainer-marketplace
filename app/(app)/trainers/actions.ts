"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { lookup } from "zipcodes";

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
 * and the ZIP resolved) is a search event.
 *
 * Invalid / empty ZIP: redirect to the same URL the GET form used to
 * build so the page can show its existing inline error / browse mode.
 * A failed RPC skips the event (we will not invent a result_count) and
 * still redirects — the page will surface the failure on render.
 */
export async function recordTrainerSearch(formData: FormData): Promise<void> {
  const parsed = parseDirectorySearch({
    zip: formData.get("zip"),
    radius: formData.get("radius"),
    specialties: formData.getAll("specialties"),
  });
  const qs = directorySearchQuery(parsed);
  const dest = qs ? `/trainers?${qs}` : "/trainers";

  if (parsed.zip) {
    const place = /^\d{5}$/.test(parsed.zip) ? lookup(parsed.zip) : undefined;
    if (place) {
      const supabase = await createClient();
      const { data, error } = await nearbyTrainersQuery(supabase, {
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
              zip: parsed.zip,
              radius: parsed.radiusMiles,
              specialties: parsed.specialties,
              result_count: data.length,
              beachhead_nashville: isNashvilleBeachhead(parsed.zip),
            },
          }),
        );
      }
    }
  }

  redirect(dest);
}
