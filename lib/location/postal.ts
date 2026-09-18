import "server-only";

import { lookup } from "zipcodes";
import { postalArea, type Country } from "./countries";
import ukAreas from "./data/gb-postal-areas.json";

/** Offline approximate-area lookup. Full postal addresses are never stored. */
export function resolvePostalArea(country: Country, input: string): {
  latitude: number; longitude: number; postalArea: string;
} | null {
  const area = postalArea(input, country);
  if (!area) return null;
  const ukPoint = country === "GB" ? (ukAreas as Record<string, number[]>)[area] : undefined;
  const place = country === "GB" ? undefined : lookup(area);
  const latitude = country === "GB" ? ukPoint?.[0] : place?.latitude;
  const longitude = country === "GB" ? ukPoint?.[1] : place?.longitude;
  if (typeof latitude !== "number" || typeof longitude !== "number" ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, postalArea: area };
}
