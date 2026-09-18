export const COUNTRIES = ["US", "CA", "GB"] as const;
export type Country = (typeof COUNTRIES)[number];

export const COUNTRY_LABELS: Record<Country, string> = {
  US: "United States", CA: "Canada", GB: "United Kingdom",
};
export const POSTAL_LABELS: Record<Country, string> = {
  US: "ZIP code", CA: "Postal code", GB: "Postcode",
};
export const POSTAL_EXAMPLES: Record<Country, string> = {
  US: "37203", CA: "M5V 3A8", GB: "SW1A 1AA",
};

export function isCountry(value: unknown): value is Country {
  return typeof value === "string" && (COUNTRIES as readonly string[]).includes(value);
}

/** Validate the entire input before reducing it to an approximate postal area. */
export function postalArea(input: string, country: Country): string | null {
  const value = input.trim().toUpperCase();
  if (country === "US") return /^\d{5}$/.test(value) ? value : null;
  if (country === "CA") {
    return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z](?: ?\d[ABCEGHJ-NPRSTV-Z]\d)?$/.test(value)
      ? value.slice(0, 3) : null;
  }
  // Royal Mail outward forms, optionally followed by a complete inward code.
  const match = /^([A-PR-UWYZ](?:\d{1,2}|[A-HK-Y]\d{1,2}|\d[A-HJKPSTUW]|[A-HK-Y]\d[ABEHMNPRVWXY]))(?: ?\d[ABD-HJLNP-UW-Z]{2})?$/.exec(value);
  return match?.[1] ?? null;
}

export function postalError(country: Country): string {
  return `Enter a valid ${POSTAL_LABELS[country].toLowerCase()} for ${COUNTRY_LABELS[country]}.`;
}

export function distanceLabel(meters: number, country: string, fractionDigits = 0): string {
  const metric = country === "CA";
  const value = meters / (metric ? 1000 : 1609.344);
  return `${value.toFixed(fractionDigits)} ${metric ? "km" : "miles"}`;
}
