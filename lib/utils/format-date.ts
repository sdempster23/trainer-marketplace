/**
 * Formatting for PLAIN calendar dates (Postgres DATE columns:
 * availability exception dates, dog dates of birth). These are
 * zone-naive by design, so formatting is UTC-anchored — parsing
 * "2026-08-20" as a local Date would render Aug 19 in any
 * negative-offset timezone. Zoned timestamps (bookings) keep using
 * the trainer-zone formatter in lib/validators/booking.ts.
 *
 * Both fall back to the raw string on unparseable input — a render
 * helper must never throw over bad data.
 */

function formatUtc(isoDate: string, options: Intl.DateTimeFormatOptions): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    parsed,
  );
}

/** "2026-08-20" → "Thu, Aug 20, 2026" (schedule contexts). */
export function formatPlainDate(isoDate: string): string {
  return formatUtc(isoDate, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "2021-04-15" → "Apr 15, 2021" (dates of birth — no weekday). */
export function formatBirthDate(isoDate: string): string {
  return formatUtc(isoDate, { month: "short", day: "numeric", year: "numeric" });
}
