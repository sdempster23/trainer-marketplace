import { lookup } from "zipcodes";

/**
 * Proof Greater Nashville beachhead — same intent as the listed-trainer
 * launch market: downtown Nashville ± ~50 miles.
 *
 * Downtown pin is the seed / nearby_trainers search point
 * (36.1627, -86.7816). A 5-digit ZIP is in when:
 *   - USPS 372xx, or zipcodes city === "Nashville" (the cheap Davidson
 *     County path — same set the distance rule would include), or
 *   - its zipcodes centroid is within 50 statute miles (haversine).
 *
 * Clarksville is a separate MSA. 37040's centroid is ~40 mi, so a raw
 * 50-mile circle would swallow it; we exclude city === "Clarksville"
 * after the distance check rather than maintaining a suburb allowlist.
 *
 * Invalid / unknown ZIPs are false. Prop name remains beachhead_nashville.
 */
const DOWNTOWN_NASHVILLE = { lat: 36.1627, lng: -86.7816 };
const BEACHHEAD_MILES = 50;

/** Mean Earth radius in statute miles (IUGG). */
const EARTH_RADIUS_MILES = 3958.7613;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      sinHalfLng *
      sinHalfLng;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isNashvilleBeachhead(zip: string): boolean {
  if (!/^\d{5}$/.test(zip)) return false;
  if (zip.startsWith("372")) return true;

  const place = lookup(zip);
  if (!place) return false;
  if (place.state === "TN" && place.city === "Nashville") return true;
  if (place.city === "Clarksville") return false;

  return (
    haversineMiles(DOWNTOWN_NASHVILLE, {
      lat: place.latitude,
      lng: place.longitude,
    }) <= BEACHHEAD_MILES
  );
}
