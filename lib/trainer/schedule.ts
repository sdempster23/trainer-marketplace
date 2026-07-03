/**
 * Slot math — turns a trainer's availability into concrete bookable slots.
 *
 * PURE: no I/O, no Supabase, no Date.now() — `now` is a parameter
 * (determinism is what makes the test table possible). Callers fetch the
 * rows; this module computes.
 *
 * DB-parity anchors (both cited from the LIVE DDL, not recollection):
 *
 * 1. BLOCKING STATUSES — the M6 EXCLUDE constraint, verbatim:
 *      EXCLUDE USING gist (trainer_id WITH =,
 *        tstzrange(starts_at, ends_at, '[)') WITH &&)
 *      WHERE (status = ANY (ARRAY['PENDING','CONFIRMED']))
 *    The module's blocking set is that list AS WRITTEN — PENDING holds the
 *    slot (the DB rejects an overlapping INSERT while a PENDING exists), and
 *    the range is HALF-OPEN [), so a slot ending exactly when a booking
 *    starts does not collide.
 *
 * 2. TIME FLOOR — bookings_validate_insert, verbatim:
 *      if NEW.starts_at <= now() + interval '15 minutes' then raise ...
 *    MIN_LEAD_MINUTES = 15 is DB PARITY (the trigger enforces it), not a
 *    product choice. Any additional BUSINESS lead time (24-h notice etc.)
 *    would be a separate, larger constant layered on top — v1 has none.
 */

export const MIN_LEAD_MINUTES = 15;

/** The EXCLUDE constraint's WHERE list, as written (anchor #1 above). */
const BLOCKING_STATUSES: ReadonlySet<string> = new Set([
  "PENDING",
  "CONFIRMED",
]);

export type PatternRow = {
  /** 0 = Sunday … 6 = Saturday — the Postgres DOW convention the M4 CHECK
   * (0..6) implies; JS Date#getUTCDay() uses the SAME convention, which is
   * why toWeekday() below needs no mapping table. */
  day_of_week: number;
  start_time: string; // "HH:MM:SS" (Postgres time wire format; "HH:MM" accepted)
  end_time: string;
};

export type ExceptionRow = {
  exception_date: string; // "YYYY-MM-DD"
  is_blocked: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type BlockingBooking = {
  starts_at: string; // UTC ISO (timestamptz wire format)
  ends_at: string;
  status: string; // module filters to BLOCKING_STATUSES itself — single point of truth
};

export type BookableSlot = {
  startUtc: string; // ISO instant — exactly what a booking INSERT stores
  endUtc: string; // start + durationMinutes ABSOLUTE minutes (matches _bookings_ends_at)
  dateLocal: string; // trainer-zone calendar date
  labelLocal: string; // trainer-zone wall-clock label, e.g. "9:00 AM"
};

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Timezone core — built-in Intl (ICU tzdata), no dependency.
// ---------------------------------------------------------------------------

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

type WallParts = { y: number; m: number; d: number; hh: number; mm: number; ss: number };

/** The wall clock showing in `timeZone` at the absolute instant `epochMs`. */
function wallPartsAt(epochMs: number, timeZone: string): WallParts {
  const parts = getFormatter(timeZone).formatToParts(epochMs);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hh: get("hour") % 24, // h23 still yields "24" for midnight in some ICU versions
    mm: get("minute"),
    ss: get("second"),
  };
}

/** A wall clock reading re-encoded as a comparable number: the epoch it
 * would be IF the wall time were UTC ("naive epoch"). */
const naiveEpochOf = (w: WallParts): number =>
  Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss);

/**
 * Trainer-local wall time on a local date → the ABSOLUTE instants that show
 * that wall time. The candidate-offset + round-trip algorithm:
 *
 *   1. Probe the zone's offset a day before, at, and a day after the naive
 *      epoch — any DST transition near the target changes one of them, so
 *      the true offset is always among the probes.
 *   2. For each distinct probed offset o, candidate = naive - o. Keep the
 *      candidate iff projecting it BACK to wall clock reproduces the
 *      requested wall time exactly (the round-trip check).
 *
 * Nonexistence and ambiguity are not special-cased — they FALL OUT of the
 * round-trip check: a spring-forward gap time round-trips under NO offset
 * (0 survivors → skip); a fall-back repeat round-trips under BOTH (2
 * survivors → ambiguous). Returned sorted ascending, so [0] is the FIRST
 * instant (the B5 ambiguity decision).
 */
function wallTimeCandidates(
  dateLocal: string,
  secondsOfDay: number,
  timeZone: string,
): number[] {
  const [y = 0, m = 1, d = 1] = dateLocal.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d) + secondsOfDay * 1000;

  const offsetAt = (epochMs: number) =>
    naiveEpochOf(wallPartsAt(epochMs, timeZone)) - epochMs;

  const offsets = new Set([
    offsetAt(naive - MS_PER_DAY),
    offsetAt(naive),
    offsetAt(naive + MS_PER_DAY),
  ]);

  const survivors: number[] = [];
  for (const o of offsets) {
    const candidate = naive - o;
    if (naiveEpochOf(wallPartsAt(candidate, timeZone)) === naive) {
      survivors.push(candidate);
    }
  }
  return survivors.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Small parsers / calendar helpers (zone-independent).
// ---------------------------------------------------------------------------

/** "HH:MM:SS" or "HH:MM" → seconds of day. */
function timeToSeconds(time: string): number {
  const [hh = 0, mm = 0, ss = 0] = time.split(":").map(Number);
  return hh * 3600 + mm * 60 + ss;
}

/** A calendar date's weekday is zone-independent; getUTCDay() is 0=Sunday —
 * the same convention as the day_of_week column (see PatternRow). */
function toWeekday(dateLocal: string): number {
  const [y = 0, m = 1, d = 1] = dateLocal.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function* localDates(fromDateLocal: string, toDateLocal: string): Generator<string> {
  const [y = 0, m = 1, d = 1] = fromDateLocal.split("-").map(Number);
  for (let t = Date.UTC(y, m - 1, d); ; t += MS_PER_DAY) {
    const cur = new Date(t).toISOString().slice(0, 10);
    if (cur > toDateLocal) return;
    yield cur;
  }
}

type Window = { startSec: number; endSec: number };

/** Union overlapping/adjacent windows. The schema ALLOWS same-day pattern
 * overlap (UNIQUE is on start_time only — design surprise #1); without the
 * union, overlapping windows would emit duplicate or overlapping slots. */
function unionWindows(windows: Window[]): Window[] {
  const sorted = [...windows].sort((a, b) => a.startSec - b.startSec);
  const merged: Window[] = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && w.startSec <= last.endSec) {
      last.endSec = Math.max(last.endSec, w.endSec);
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

function formatLabel(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(epochMs);
}

// ---------------------------------------------------------------------------
// The module's one export beyond types/constants.
// ---------------------------------------------------------------------------

export function computeBookableSlots(input: {
  pattern: PatternRow[];
  exceptions: ExceptionRow[];
  bookings: BlockingBooking[];
  timezone: string;
  durationMinutes: number;
  fromDateLocal: string; // inclusive, trainer-zone calendar dates —
  toDateLocal: string; //   the pattern/exceptions only exist in that frame
  now: Date;
}): BookableSlot[] {
  const {
    pattern,
    exceptions,
    bookings,
    timezone,
    durationMinutes,
    fromDateLocal,
    toDateLocal,
    now,
  } = input;

  const durationMs = durationMinutes * MS_PER_MINUTE;
  const floorMs = now.getTime() + MIN_LEAD_MINUTES * MS_PER_MINUTE;

  const blocking = bookings
    .filter((b) => BLOCKING_STATUSES.has(b.status))
    .map((b) => ({ start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) }));

  const exceptionByDate = new Map(exceptions.map((e) => [e.exception_date, e]));

  const slots: BookableSlot[] = [];

  for (const dateLocal of localDates(fromDateLocal, toDateLocal)) {
    // B2: a blocked exception suppresses the day; a replace exception IS the
    // day's whole availability; otherwise the weekly pattern applies.
    const exception = exceptionByDate.get(dateLocal);
    const rawWindows: Window[] = exception
      ? exception.is_blocked
        ? []
        : [
            {
              startSec: timeToSeconds(exception.start_time ?? "00:00:00"),
              endSec: timeToSeconds(exception.end_time ?? "00:00:00"),
            },
          ]
      : pattern
          .filter((p) => p.day_of_week === toWeekday(dateLocal))
          .map((p) => ({
            startSec: timeToSeconds(p.start_time),
            endSec: timeToSeconds(p.end_time),
          }));

    for (const window of unionWindows(rawWindows)) {
      // B1: discrete duration-sized WALL-CLOCK grid anchored at the window
      // start. The nominal bound (start + duration fits the window) defines
      // the grid; the absolute-end containment check below re-judges DST days.
      for (
        let s = window.startSec;
        s + durationMinutes * 60 <= window.endSec;
        s += durationMinutes * 60
      ) {
        const candidates = wallTimeCandidates(dateLocal, s, timezone);
        if (candidates.length === 0) {
          continue; // B5: nonexistent wall time (spring-forward gap) → SKIP, never shift
        }
        const startMs = candidates[0]!; // B5: ambiguous (fall-back) → FIRST instant

        // B5.3: duration is ABSOLUTE minutes (matches _bookings_ends_at);
        // window containment is judged on the WALL projection of that
        // absolute end — the trainer wrote wall-clock hours.
        const endMs = startMs + durationMs;
        const endWall = wallPartsAt(endMs, timezone);
        const endWallDate = `${endWall.y}-${String(endWall.m).padStart(2, "0")}-${String(endWall.d).padStart(2, "0")}`;
        const endWallSec = endWall.hh * 3600 + endWall.mm * 60 + endWall.ss;
        if (endWallDate !== dateLocal || endWallSec > window.endSec) {
          continue;
        }

        // Anchor #2: strict floor, trigger parity.
        if (!(startMs > floorMs)) {
          continue;
        }

        // Anchor #1: half-open [) overlap — end==start does not collide.
        if (blocking.some((b) => startMs < b.end && b.start < endMs)) {
          continue;
        }

        slots.push({
          startUtc: new Date(startMs).toISOString(),
          endUtc: new Date(endMs).toISOString(),
          dateLocal,
          labelLocal: formatLabel(startMs, timezone),
        });
      }
    }
  }

  return slots.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}
