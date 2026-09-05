import { lookup } from "zipcodes";

/**
 * Nashville beachhead — the launch market.
 *
 * True when the ZIP is Nashville proper:
 *   - USPS 372xx (Davidson County / Nashville), or
 *   - zipcodes city === "Nashville" (covers a few 370/371 ZIPs the
 *     package files as Nashville itself, e.g. some Antioch-adjacent).
 *
 * Franklin, Brentwood, Murfreesboro, Clarksville are out on purpose —
 * widen this helper (and its tests) if the beachhead grows. Invalid or
 * non-US ZIPs are false.
 */
export function isNashvilleBeachhead(zip: string): boolean {
  if (!/^\d{5}$/.test(zip)) return false;
  if (zip.startsWith("372")) return true;
  const place = lookup(zip);
  return place?.state === "TN" && place.city === "Nashville";
}
