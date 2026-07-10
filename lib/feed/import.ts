import ical from "node-ical";

import { BOOKING_WINDOW_DAYS } from "@/lib/validators/booking";

/**
 * The import half's parser (M16): ICS text → busy instants, nothing else.
 * Titles, locations, attendees never leave this function — blocks are
 * (starts_at, ends_at) only (the third-party-PII ruling; the migration
 * header carries the argument in full).
 *
 * EXPANSION WINDOW (ruling 4): unbounded RRULEs are the NORM in Google
 * output; the window is what makes them finite. Derived from the booking
 * window — blocks beyond the bookable horizon cannot affect any slot, and
 * every refresh re-expands the rolling window.
 */
export const EXPANSION_WINDOW_DAYS = BOOKING_WINDOW_DAYS + 7;

const MS_PER_DAY = 86_400_000;

export type BusyBlock = { starts_at: string; ends_at: string };

/**
 * UTC instant of local midnight for a calendar date in a zone. Two-pass
 * offset correction handles DST-shifted days; ruling 5's golden case pins
 * the output range. Never consults the server timezone.
 */
export function zonedMidnightUtc(
  y: number,
  m: number, // 1-based
  d: number,
  timeZone: string,
): number {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetAt = (ms: number): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(ms);
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    return asUtc - ms; // zone offset in ms at that instant
  };
  let candidate = guess - offsetAt(guess);
  candidate = guess - offsetAt(candidate); // second pass for DST edges
  return candidate;
}

/** node-ical resolves DATE (all-day) values as midnight in the SERVER
 * timezone (verified empirically under TZ=UTC — it ignores
 * X-WR-TIMEZONE). Ruling 5 forbids the server zone, so we re-derive the
 * CALENDAR DATE from the server-zone Date's local components (safe: the
 * Date was constructed as server-local midnight of exactly that date) and
 * re-anchor it in the DECLARED zone ourselves. */
function calendarDateOf(serverLocalMidnight: Date): { y: number; m: number; d: number } {
  return {
    y: serverLocalMidnight.getFullYear(),
    m: serverLocalMidnight.getMonth() + 1,
    d: serverLocalMidnight.getDate(),
  };
}

type IcalEvent = {
  type: string;
  uid?: string;
  start?: Date & { dateOnly?: boolean };
  end?: Date & { dateOnly?: boolean };
  datetype?: string;
  status?: string;
  transparency?: string;
  rrule?: { between: (a: Date, b: Date, inc?: boolean) => Date[] };
  exdate?: Record<string, Date>;
  recurrences?: Record<string, IcalEvent>;
  recurrenceid?: Date;
};

export function parseIcsToBusyBlocks(
  icsText: string,
  opts: {
    now: Date;
    /** The trainer's zone — the all-day fallback when the calendar
     * declares no X-WR-TIMEZONE. Never the server's zone (ruling 5). */
    fallbackTimezone: string;
  },
): BusyBlock[] {
  const windowStart = opts.now;
  const windowEnd = new Date(
    opts.now.getTime() + EXPANSION_WINDOW_DAYS * MS_PER_DAY,
  );

  const parsed = ical.sync.parseICS(icsText);

  // The calendar's declared zone for all-day anchoring.
  let calendarTz: string | null = null;
  for (const component of Object.values(parsed) as Record<string, unknown>[]) {
    if (component["type"] === "VCALENDAR") {
      const wrTz = component["WR-TIMEZONE"];
      if (typeof wrTz === "string" && wrTz.length > 0) calendarTz = wrTz;
    }
  }
  const allDayZone = calendarTz ?? opts.fallbackTimezone;

  const blocks: BusyBlock[] = [];
  const push = (startMs: number, endMs: number) => {
    // Overlap-with-window, half-open — same convention as the slot math.
    if (endMs <= startMs) return;
    if (startMs >= windowEnd.getTime() || endMs <= windowStart.getTime()) return;
    blocks.push({
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endMs).toISOString(),
    });
  };

  for (const raw of Object.values(parsed)) {
    const event = raw as IcalEvent;
    if (event.type !== "VEVENT") continue;

    // One malformed event must never void the calendar (the B4 mirror).
    try {
      // An override instance ALSO appears as its own top-level entry in
      // node-ical's output (verified: it is BOTH merged into the master's
      // .recurrences AND kept standalone). The master's recurrences loop
      // below owns overrides; counting the standalone copy double-blocks
      // the moved instance. (An orphaned override without its master in
      // the feed would be dropped — Google always ships the master.)
      if (event.recurrenceid) continue;
      if ((event.status ?? "").toUpperCase() === "CANCELLED") continue;
      // OPAQUE is the default; only an explicit TRANSPARENT means "free".
      if ((event.transparency ?? "").toUpperCase() === "TRANSPARENT") continue;
      if (!event.start) continue;

      const isAllDay = event.datetype === "date" || event.start.dateOnly === true;

      // The master block's start instant + duration, resolved uniformly so
      // ALL-DAY events expand under RRULE exactly like timed ones (a
      // recurring all-day "Out of office" must block EVERY occurrence, not
      // just the first). For all-day we anchor midnight in the DECLARED
      // zone (ruling 5) and DTEND(DATE) is exclusive; for timed the Date is
      // already the absolute instant.
      const masterStartMs = isAllDay
        ? (() => {
            const s = calendarDateOf(event.start);
            return zonedMidnightUtc(s.y, s.m, s.d, allDayZone);
          })()
        : event.start.getTime();
      const masterEndMs = isAllDay
        ? event.end
          ? (() => {
              const e = calendarDateOf(event.end);
              return zonedMidnightUtc(e.y, e.m, e.d, allDayZone);
            })()
          : masterStartMs + MS_PER_DAY
        : event.end
          ? event.end.getTime()
          : masterStartMs;
      const durationMs = Math.max(0, masterEndMs - masterStartMs);

      // Map one recurrence occurrence (as node-ical yields it) to its start
      // instant: all-day occurrences come back as server-local midnight of
      // the occurrence DATE and must be re-anchored in the declared zone;
      // timed occurrences are already absolute.
      const occurrenceStartMs = (occurrence: Date): number => {
        if (!isAllDay) return occurrence.getTime();
        const od = calendarDateOf(occurrence);
        return zonedMidnightUtc(od.y, od.m, od.d, allDayZone);
      };

      if (!event.rrule) {
        push(masterStartMs, masterStartMs + durationMs);
        continue;
      }

      // Recurring: expand within the window. node-ical's between() does
      // NOT apply EXDATE (verified empirically) — exclusions and
      // RECURRENCE-ID overrides are ours to honor.
      const exdates = new Set(
        Object.values(event.exdate ?? {}).map((d) => d.getTime()),
      );
      const overridden = new Set(
        Object.values(event.recurrences ?? {})
          .map((o) => o.recurrenceid?.getTime())
          .filter((t): t is number => typeof t === "number"),
      );

      // Back the expansion start up by the event's OWN duration so an
      // occurrence that already started but is still in progress is
      // generated (between() is start-inclusive from its lower bound, and
      // would otherwise drop today's live class); push()'s endMs<=windowStart
      // filter discards genuinely-past occurrences.
      const expandFrom = new Date(windowStart.getTime() - durationMs);
      for (const occurrence of event.rrule.between(expandFrom, windowEnd, true)) {
        // EXDATE/override matching keys on the occurrence's OWN instant,
        // which for all-day is the raw server-local-midnight node-ical used
        // for exdate too — so compare on occurrence.getTime(), then push the
        // zone-anchored instant.
        const key = occurrence.getTime();
        if (exdates.has(key) || overridden.has(key)) continue;
        const startMs = occurrenceStartMs(occurrence);
        push(startMs, startMs + durationMs);
      }

      // Overrides stand on their own: a moved instance blocks at its NEW
      // time; a cancelled override blocks nothing. node-ical stores the
      // SAME override under TWO keys (date and full ISO instant — verified
      // empirically), so dedupe on the recurrence-id instant first.
      const uniqueOverrides = new Map<number, IcalEvent>();
      for (const override of Object.values(event.recurrences ?? {})) {
        const rid = override.recurrenceid?.getTime();
        if (typeof rid === "number" && !uniqueOverrides.has(rid)) {
          uniqueOverrides.set(rid, override);
        }
      }
      for (const override of uniqueOverrides.values()) {
        if ((override.status ?? "").toUpperCase() === "CANCELLED") continue;
        if ((override.transparency ?? "").toUpperCase() === "TRANSPARENT") continue;
        if (!override.start) continue;
        const oStart = override.start.getTime();
        const oEnd = override.end ? override.end.getTime() : oStart + durationMs;
        push(oStart, oEnd);
      }
    } catch {
      continue; // dropped, not fatal
    }
  }

  return blocks.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
