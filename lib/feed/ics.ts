import ical, {
  ICalCalendarMethod,
  ICalEventStatus,
} from "ical-generator";

import type { Database } from "@/types/supabase";

/**
 * One row from the M15 trainer_feed_events RPC — the feed's entire input.
 * The 60-day window lives in the function (a named constant there); this
 * module renders whatever it is given and filters NOTHING, so the window
 * has exactly one owner.
 *
 * owner_display_name is widened to `| null`: supabase gen types marks
 * every RETURNS TABLE column non-nullable, but the column mirrors
 * profiles.display_name, which IS nullable — the generated type is
 * optimistic and the fallback below is load-bearing, not decorative.
 */
export type FeedEventRow = Omit<
  Database["public"]["Functions"]["trainer_feed_events"]["Returns"][number],
  "owner_display_name"
> & { owner_display_name: string | null };

/**
 * booking.status → VEVENT STATUS (ruling 1, investigation QA 2026-07-09):
 * PENDING blocks the trainer's slot math, so it shows TENTATIVE (and reads
 * as "answer this request"); COMPLETED is history — the session happened,
 * it renders as a normal past event; CANCELLED is emitted EXPLICITLY while
 * in-window, never silently omitted — an event vanishing from the calendar
 * is not how a trainer should learn a slot freed up.
 */
const STATUS_MAP: Record<FeedEventRow["status"], ICalEventStatus> = {
  PENDING: ICalEventStatus.TENTATIVE,
  CONFIRMED: ICalEventStatus.CONFIRMED,
  COMPLETED: ICalEventStatus.CONFIRMED,
  CANCELLED: ICalEventStatus.CANCELLED,
};

/**
 * The established fallback for a NULL display_name (profiles.display_name
 * is nullable; the messaging surface lodged this exact string).
 */
const OWNER_FALLBACK = "An owner";

/**
 * Build the ICS document for one trainer's feed.
 *
 * Determinism contract (the golden tests depend on it): every byte of the
 * output derives from the rows passed in — UID from the immutable booking
 * id, DTSTAMP from updated_at (NOT render time; a now() stamp would make
 * every poll look like a full rewrite and every golden test flake).
 *
 * UID stability is the ghost-prevention anchor: `<booking_id>@pawmatch`
 * survives every status transition, so calendar apps update the one event
 * in place instead of multiplying it.
 */
export function buildTrainerFeedCalendar(
  events: FeedEventRow[],
  // null = origin unknown (misconfigured env). The Manage line is OMITTED
  // rather than emitted as a dead relative path — the caller is responsible
  // for logging the misconfiguration loudly.
  siteUrl: string | null,
): string {
  const calendar = ical({
    // Static on purpose: a per-trainer name would need a profiles read the
    // feed's DEFINER surface deliberately does not expose (M15 header).
    name: "PawMatch — Bookings",
    prodId: { company: "pawmatch", product: "calendar-feed", language: "EN" },
  });
  calendar.method(ICalCalendarMethod.PUBLISH);

  for (const event of events) {
    const owner = event.owner_display_name ?? OWNER_FALLBACK;
    calendar.createEvent({
      id: `${event.booking_id}@pawmatch`,
      start: new Date(event.starts_at),
      end: new Date(event.ends_at),
      stamp: new Date(event.updated_at),
      summary: `${owner} (${event.dog_name}) — ${event.service_name}`,
      description: [
        `Status: ${event.status}`,
        `Dog: ${event.dog_name}`,
        `Service: ${event.service_name}`,
        ...(siteUrl ? [`Manage: ${siteUrl}/trainer/bookings`] : []),
      ].join("\n"),
      status: STATUS_MAP[event.status],
    });
  }

  return calendar.toString();
}
