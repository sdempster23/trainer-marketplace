import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  EXPANSION_WINDOW_DAYS,
  parseIcsToBusyBlocks,
  zonedMidnightUtc,
} from "./import";

/** Structural tests on synthetic ICS. The captured REAL Google payload
 * (the arc's key test asset) gets its own golden block appended below the
 * moment it lands in tests/fixtures — these pin the semantics the capture
 * will then re-prove against real-world output. */

const NOW = new Date("2026-07-10T12:00:00Z");
const TZ = "America/Chicago";

function cal(lines: string[], wrTz = "America/Chicago"): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//EN",
    `X-WR-TIMEZONE:${wrTz}`,
    ...lines,
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("zonedMidnightUtc — ruling 5's UTC-range pin", () => {
  test("golden: Chicago local days map to exact UTC instants (CDT & CST)", () => {
    // Arrange / Act / Assert — July 15 (CDT, UTC-5): midnight = 05:00Z
    expect(new Date(zonedMidnightUtc(2026, 7, 15, TZ)).toISOString()).toBe(
      "2026-07-15T05:00:00.000Z",
    );
    // December 15 (CST, UTC-6): midnight = 06:00Z — the DST pin
    expect(new Date(zonedMidnightUtc(2026, 12, 15, TZ)).toISOString()).toBe(
      "2026-12-15T06:00:00.000Z",
    );
    // Tokyo (no DST, UTC+9): previous day 15:00Z
    expect(
      new Date(zonedMidnightUtc(2026, 7, 15, "Asia/Tokyo")).toISOString(),
    ).toBe("2026-07-14T15:00:00.000Z");
  });
});

describe("parseIcsToBusyBlocks", () => {
  test("all-day OPAQUE blocks the EVENT-declared zone's local day — never the server's", () => {
    // Arrange — X-WR-TIMEZONE says Chicago; the test RUNS in whatever zone
    // vitest's process has. If the implementation leaked the server zone,
    // this exact UTC range would only hold when the server zone happened
    // to be Chicago.
    const ics = cal([
      "BEGIN:VEVENT",
      "UID:vacation",
      "DTSTART;VALUE=DATE:20260715",
      "DTEND;VALUE=DATE:20260717", // exclusive — two full days
      "SUMMARY:Vacation",
      "END:VEVENT",
    ]);

    // Act
    const blocks = parseIcsToBusyBlocks(ics, { now: NOW, fallbackTimezone: "UTC" });

    // Assert — the golden UTC range (ruling 5)
    expect(blocks).toEqual([
      {
        starts_at: "2026-07-15T05:00:00.000Z",
        ends_at: "2026-07-17T05:00:00.000Z",
      },
    ]);
  });

  test("TRANSP:TRANSPARENT (Google's 'Free') never blocks", () => {
    // Arrange
    const ics = cal([
      "BEGIN:VEVENT",
      "UID:birthday",
      "DTSTART;VALUE=DATE:20260715",
      "DTEND;VALUE=DATE:20260716",
      "TRANSP:TRANSPARENT",
      "SUMMARY:Birthday",
      "END:VEVENT",
    ]);

    // Act / Assert
    expect(parseIcsToBusyBlocks(ics, { now: NOW, fallbackTimezone: TZ })).toEqual([]);
  });

  test("weekly RRULE expands inside the window only, honoring EXDATE", () => {
    // Arrange — Mondays 10:00 Chicago; July 20 excluded (a Google 'delete
    // this event only' emits EXDATE)
    const ics = cal([
      "BEGIN:VEVENT",
      "UID:weekly",
      "DTSTART;TZID=America/Chicago:20260713T100000",
      "DTEND;TZID=America/Chicago:20260713T110000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
      "EXDATE;TZID=America/Chicago:20260720T100000",
      "SUMMARY:Weekly class",
      "END:VEVENT",
    ]);

    // Act
    const blocks = parseIcsToBusyBlocks(ics, { now: NOW, fallbackTimezone: TZ });

    // Assert — window is now → +21d (2026-07-31): occurrences 7/13, 7/27
    // (7/20 EXDATE'd; 8/03 beyond the window; unbounded RRULE made finite)
    expect(blocks.map((b) => b.starts_at)).toEqual([
      "2026-07-13T15:00:00.000Z",
      "2026-07-27T15:00:00.000Z",
    ]);
    expect(blocks[0]!.ends_at).toBe("2026-07-13T16:00:00.000Z");
  });

  test("a moved instance (RECURRENCE-ID override) blocks at its NEW time only", () => {
    // Arrange — the 7/27 occurrence moved from 10:00 to 14:00
    const ics = cal([
      "BEGIN:VEVENT",
      "UID:weekly2",
      "DTSTART;TZID=America/Chicago:20260713T100000",
      "DTEND;TZID=America/Chicago:20260713T110000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
      "SUMMARY:Weekly class",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:weekly2",
      "RECURRENCE-ID;TZID=America/Chicago:20260727T100000",
      "DTSTART;TZID=America/Chicago:20260727T140000",
      "DTEND;TZID=America/Chicago:20260727T150000",
      "SUMMARY:Weekly class (moved)",
      "END:VEVENT",
    ]);

    // Act
    const starts = parseIcsToBusyBlocks(ics, { now: NOW, fallbackTimezone: TZ }).map(
      (b) => b.starts_at,
    );

    // Assert — 7/13 + 7/20 at 15:00Z; 7/27 ONLY at the new 19:00Z
    expect(starts).toEqual([
      "2026-07-13T15:00:00.000Z",
      "2026-07-20T15:00:00.000Z",
      "2026-07-27T19:00:00.000Z",
    ]);
  });

  test("a RECURRING all-day event blocks EVERY occurrence, not just the first", () => {
    // Arrange — weekly all-day "Out of office" every Monday (review bug P1:
    // the all-day branch used to push once and continue, skipping the RRULE)
    const ics = cal([
      "BEGIN:VEVENT",
      "UID:weekly-ooo",
      "DTSTART;VALUE=DATE:20260713",
      "DTEND;VALUE=DATE:20260714",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
      "SUMMARY:Out of office",
      "END:VEVENT",
    ]);

    // Act — window is now(07-10) → +21d (07-31): Mondays 7/13, 7/20, 7/27
    const blocks = parseIcsToBusyBlocks(ics, { now: NOW, fallbackTimezone: TZ });

    // Assert — each occurrence is a full Chicago-local day (CDT: 05:00Z→05:00Z)
    expect(blocks).toEqual([
      { starts_at: "2026-07-13T05:00:00.000Z", ends_at: "2026-07-14T05:00:00.000Z" },
      { starts_at: "2026-07-20T05:00:00.000Z", ends_at: "2026-07-21T05:00:00.000Z" },
      { starts_at: "2026-07-27T05:00:00.000Z", ends_at: "2026-07-28T05:00:00.000Z" },
    ]);
  });

  test("an IN-PROGRESS recurring occurrence still blocks (started before now, not yet ended)", () => {
    // Arrange — weekly Mon 10:00–14:00 Chicago. now = Mon 7/13 12:00 CDT =
    // 17:00Z, mid-class (15:00Z–19:00Z). Review bug P2: between(now) dropped
    // today's occurrence entirely.
    const ics = cal([
      "BEGIN:VEVENT",
      "UID:live-class",
      "DTSTART;TZID=America/Chicago:20260713T100000",
      "DTEND;TZID=America/Chicago:20260713T140000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
      "SUMMARY:Class",
      "END:VEVENT",
    ]);

    // Act
    const blocks = parseIcsToBusyBlocks(ics, {
      now: new Date("2026-07-13T17:00:00Z"),
      fallbackTimezone: TZ,
    });

    // Assert — today's in-progress block IS present (its tail still blocks;
    // the bug dropped it); the window from 7/13 spans Mondays through 8/03
    expect(blocks.map((b) => b.starts_at)).toEqual([
      "2026-07-13T15:00:00.000Z",
      "2026-07-20T15:00:00.000Z",
      "2026-07-27T15:00:00.000Z",
      "2026-08-03T15:00:00.000Z",
    ]);
    expect(blocks[0]!.ends_at).toBe("2026-07-13T19:00:00.000Z");
  });

  test("STATUS:CANCELLED events and cancelled overrides block nothing", () => {
    // Arrange
    const ics = cal([
      "BEGIN:VEVENT",
      "UID:cancelled-single",
      "DTSTART;TZID=America/Chicago:20260714T100000",
      "DTEND;TZID=America/Chicago:20260714T110000",
      "STATUS:CANCELLED",
      "END:VEVENT",
    ]);

    // Act / Assert
    expect(parseIcsToBusyBlocks(ics, { now: NOW, fallbackTimezone: TZ })).toEqual([]);
  });

  test("past events and events beyond the expansion window are excluded", () => {
    // Arrange
    const ics = cal([
      "BEGIN:VEVENT",
      "UID:past",
      "DTSTART;TZID=America/Chicago:20260701T100000",
      "DTEND;TZID=America/Chicago:20260701T110000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:far-future",
      "DTSTART;TZID=America/Chicago:20261001T100000",
      "DTEND;TZID=America/Chicago:20261001T110000",
      "END:VEVENT",
    ]);

    // Act / Assert
    expect(parseIcsToBusyBlocks(ics, { now: NOW, fallbackTimezone: TZ })).toEqual([]);
    expect(EXPANSION_WINDOW_DAYS).toBe(21); // BOOKING_WINDOW_DAYS(14) + 7
  });

  test("one malformed event is dropped; the rest of the calendar survives (B4 mirror)", () => {
    // Arrange — an event with no DTSTART amid a valid one
    const ics = cal([
      "BEGIN:VEVENT",
      "UID:broken",
      "SUMMARY:no start",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:good",
      "DTSTART;TZID=America/Chicago:20260714T100000",
      "DTEND;TZID=America/Chicago:20260714T110000",
      "END:VEVENT",
    ]);

    // Act
    const blocks = parseIcsToBusyBlocks(ics, { now: NOW, fallbackTimezone: TZ });

    // Assert
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.starts_at).toBe("2026-07-14T15:00:00.000Z");
  });

  // The REAL Google payload golden (arc key asset, ruling 4) — captured
  // 2026-07-17 from a real Google test calendar into
  // tests/fixtures/google-proof-calendar.ics (Shane rotated the secret
  // address post-capture — the committed .ics body carries no secret).
  // The calendar: "Weekly Class" Mon 10:00–11:00 CDT from 7/20 (RRULE
  // weekly), the 7/27 occurrence deleted (EXDATE), the 8/03 occurrence
  // MOVED to 8/04 (RECURRENCE-ID override), plus an all-day 7/21. This is
  // the parser proving itself against actual Google output, not synthetic
  // ICS — the dual-key override dedup, EXDATE, all-day zone anchoring, and
  // TRANSP all exercised at once.
  test("REAL Google payload: recurring + all-day + EXDATE + moved instance", () => {
    // Arrange — window now(7/17) → +21d (8/07); moved 8/04 lands in it,
    // next base occurrence 8/10 does not
    const ics = readFileSync(
      "tests/fixtures/google-proof-calendar.ics",
      "utf8",
    );

    // Act
    const blocks = parseIcsToBusyBlocks(ics, {
      now: new Date("2026-07-17T12:00:00Z"),
      fallbackTimezone: "America/Chicago",
    });

    // Assert — exact busy instants, no titles ever
    expect(blocks).toEqual([
      // 7/20 Weekly Class (10:00 CDT = 15:00Z)
      { starts_at: "2026-07-20T15:00:00.000Z", ends_at: "2026-07-20T16:00:00.000Z" },
      // 7/21 all-day (Chicago local day: 05:00Z → next 05:00Z)
      { starts_at: "2026-07-21T05:00:00.000Z", ends_at: "2026-07-22T05:00:00.000Z" },
      // 7/27 is EXDATE'd → ABSENT (its slot survives); 8/03 moved → ABSENT
      // 8/04 the MOVED instance, blocking at its NEW time, exactly once
      { starts_at: "2026-08-04T15:00:00.000Z", ends_at: "2026-08-04T16:00:00.000Z" },
    ]);
    expect(JSON.stringify(blocks)).not.toMatch(/Weekly|Class|All Day|Event/);
  });

  test("no X-WR-TIMEZONE → all-day anchors in the trainer's zone (the fallback), never the server's", () => {
    // Arrange — calendar with no declared zone; trainer in Denver
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:allday-fallback",
      "DTSTART;VALUE=DATE:20260715",
      "DTEND;VALUE=DATE:20260716",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    // Act
    const blocks = parseIcsToBusyBlocks(ics, {
      now: NOW,
      fallbackTimezone: "America/Denver",
    });

    // Assert — Denver (MDT, UTC-6): midnight = 06:00Z
    expect(blocks).toEqual([
      { starts_at: "2026-07-15T06:00:00.000Z", ends_at: "2026-07-16T06:00:00.000Z" },
    ]);
  });
});
